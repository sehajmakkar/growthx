#!/usr/bin/env node
/**
 * Traffic swarm — simulated visitors, real everything else.
 *
 * Each session is a real browser driving the **deployed** Site A through the
 * **real** snippet, which sends **real** events to the **real** ingestion
 * endpoint. Nothing is written to the database directly; there are no fabricated
 * rows anywhere. What is simulated is the person, and only the person.
 *
 * Every event carries `simulated: true` and the persona that produced it, so the
 * dashboard can badge it and nothing downstream can mistake it for human
 * traffic.
 *
 * The decision each visitor makes lives in ./behaviour.ts and reads only page
 * geometry — never the variant. Read that file before trusting any number here.
 *
 * Usage:
 *   pnpm swarm --sessions 300
 *   pnpm swarm --sessions 20 --headed
 *   pnpm swarm --sessions 100 --force v_cta_above_copy
 */
import { chromium, type Browser, type BrowserContext } from "playwright";
import { conversionProbability, makeRandom, scrollReach, type PageReading } from "./behaviour.js";
import { PERSONAS, pickPersona, type Persona } from "./personas.js";
import { loadEnv, ok, bad, dim, step } from "../scripts/env.mjs";

const env = loadEnv() as Record<string, string | undefined>;
const args = process.argv.slice(2);
const flag = (n: string, d?: string) => {
  const i = args.indexOf(n);
  return i === -1 ? d : args[i + 1];
};
const has = (n: string) => args.includes(n);

const SESSIONS = Number(flag("--sessions", "60"));
const CONCURRENCY = Number(flag("--concurrency", "6"));
const FORCE = flag("--force");
const SEED = Number(flag("--seed", String(Date.now() % 100000)));
const BASE = flag("--url", env.GX_SITE_A_URL)!;

const rand = makeRandom(SEED);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);

interface Outcome {
  persona: string;
  device: string;
  variant: string | null;
  reach: number;
  prob: number;
  converted: boolean;
  error?: string;
}

/**
 * Measures the page as the visitor perceives it. Everything the behaviour model
 * consumes is read here, from the rendered DOM, after any variant has applied.
 */
async function readPage(page: any): Promise<PageReading> {
  return page.evaluate(() => {
    const q = (s: string) => document.querySelector(s) as HTMLElement | null;
    const cta = q(".cta-primary");
    const copy = q(".hero-subcopy");
    const fig = q(".hero-figure");
    const vh = window.innerHeight;
    const docH = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    const ctaRect = cta?.getBoundingClientRect();
    const ctaTop = ctaRect ? ctaRect.top + window.scrollY : docH;

    let figShare = 0;
    if (fig) {
      const r = fig.getBoundingClientRect();
      if (r.height > 0 && getComputedStyle(fig).display !== "none") {
        figShare = Math.min(1, (r.width * r.height) / (window.innerWidth * vh));
      }
    }

    // Anything visible above the CTA that competes for attention.
    let competing = 0;
    for (const sel of [".secondary-banner", ".site-header", ".hero-figure", ".eyebrow"]) {
      const el = q(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (getComputedStyle(el).display === "none") continue;
      if (r.top + window.scrollY < ctaTop) competing++;
    }

    let copyH = 0;
    if (copy && cta) {
      const cr = copy.getBoundingClientRect();
      if (getComputedStyle(copy).display !== "none" && cr.top + window.scrollY < ctaTop) copyH = cr.height;
    }

    return {
      viewportH: vh,
      ctaTopPx: ctaTop,
      ctaInFirstViewport: ctaTop < vh,
      copyAboveCtaPx: copyH,
      heroMediaShare: figShare,
      competingAboveCta: competing,
      docH,
    };
  });
}

async function runSession(browser: Browser, index: number): Promise<Outcome> {
  const persona: Persona = pickPersona(rand);
  let ctx: BrowserContext | null = null;

  try {
    ctx = await browser.newContext({
      viewport: persona.viewport,
      isMobile: persona.device === "mobile",
      hasTouch: persona.device === "mobile",
      deviceScaleFactor: persona.device === "mobile" ? 3 : 1,
      userAgent: persona.device === "mobile"
        ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        : undefined,
    });

    // tsx compiles through esbuild with keepNames, which emits a `__name`
    // helper into any function handed to page.evaluate — a helper that does not
    // exist in the browser. Shim it before anything else runs.
    await ctx.addInitScript({ content: "globalThis.__name = globalThis.__name || ((f) => f);" });

    const referrer = persona.referrers[Math.floor(rand() * persona.referrers.length)] ?? "";

    // Tag every event this session produces. The snippet reads these; a real
    // visitor's browser has no way to set them.
    await ctx.addInitScript(
      ({ p, returning, vid }: any) => {
        (window as any).__gxSimulated = true;
        (window as any).__gxPersona = p;
        if (returning && vid) {
          try { localStorage.setItem("_gx_v", vid); } catch { /* ignore */ }
        }
      },
      { p: persona.id, returning: persona.returning, vid: `vis_sim${index % 40}` }
    );

    const page = await ctx.newPage();
    const url = new URL(BASE);
    if (FORCE) url.searchParams.set("gx_force", FORCE);

    await page.goto(url.toString(), { waitUntil: "load", referer: referrer || undefined });
    await page.waitForFunction(() => (window as any).__growthx?.reason !== null, null, { timeout: 15000 })
      .catch(() => {});

    const variant = await page.evaluate(() => (window as any).__growthx?.variantId ?? null);
    const reading = await readPage(page);

    // How far this person gets, and how long they linger.
    const reach = scrollReach(persona, reading, rand);
    const dwellMs = between(persona.dwellRange[0], persona.dwellRange[1]) * 1000;
    const steps = Math.max(1, Math.round(reach * 6));

    for (let i = 1; i <= steps; i++) {
      await page.evaluate((y: number) => window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior }),
        (reading.docH * reach * i) / steps);
      await sleep(dwellMs / steps / 2);
    }

    // Researchers and considerers poke at the pricing accordion that does
    // nothing — the friction the agent is meant to discover.
    if (rand() < persona.pokesPricing) {
      const expand = page.locator(".tier-expand");
      if (await expand.count()) {
        await expand.scrollIntoViewIfNeeded().catch(() => {});
        const pokes = 1 + Math.floor(rand() * 4);
        for (let i = 0; i < pokes; i++) {
          await expand.click({ force: true, delay: 30 + rand() * 60 }).catch(() => {});
        }
        await sleep(400);
      }
    }

    const prob = conversionProbability(persona, reading, reach);
    const converts = rand() < prob;

    if (converts) {
      const cta = page.locator(".cta-primary");
      if (await cta.count()) {
        await cta.scrollIntoViewIfNeeded().catch(() => {});
        await sleep(between(300, 1200));
        await cta.click({ timeout: 5000 }).catch(() => {});
        await page.waitForLoadState("load").catch(() => {});
        await sleep(600);
      }
    } else {
      await sleep(between(200, 900));
    }

    // A human closing a tab gives the beacon time to leave; ctx.close() does
    // not. Without this, most sessions delivered no events at all — 300 runs
    // produced 68 sessions of data. Flush explicitly and wait for the network.
    await page.evaluate(() => (window as any).__growthx?.flush?.()).catch(() => {});
    await sleep(250);

    await ctx.close();
    ctx = null;
    return { persona: persona.id, device: persona.device, variant, reach, prob, converted: converts };
  } catch (e) {
    if (ctx) await ctx.close().catch(() => {});
    return {
      persona: persona.id, device: persona.device, variant: null,
      reach: 0, prob: 0, converted: false,
      error: String((e as Error).message ?? e).slice(0, 90),
    };
  }
}

// ── run ─────────────────────────────────────────────────────────────────────
console.log(step(`Traffic swarm — ${SESSIONS} sessions, concurrency ${CONCURRENCY}, seed ${SEED}`));
console.log(dim(`  target ${BASE}${FORCE ? `  (forcing ${FORCE})` : ""}`));
console.log(dim(`  simulated visitors, real snippet, real ingestion — see swarm/behaviour.ts\n`));

const browser = await chromium.launch({ headless: !has("--headed") });
const outcomes: Outcome[] = [];
let launched = 0;
const started = Date.now();

async function worker() {
  while (launched < SESSIONS) {
    const i = launched++;
    // Arrivals are jittered; real traffic does not come in lockstep.
    await sleep(rand() * 400);
    const o = await runSession(browser, i);
    outcomes.push(o);
    if (outcomes.length % 20 === 0 || outcomes.length === SESSIONS) {
      const conv = outcomes.filter((x) => x.converted).length;
      process.stdout.write(
        dim(`  ${outcomes.length}/${SESSIONS} sessions · ${conv} conversions · ${Math.round((Date.now() - started) / 1000)}s\n`)
      );
    }
  }
}

await Promise.all(Array.from({ length: Math.min(CONCURRENCY, SESSIONS) }, worker));
await browser.close();

// ── report ──────────────────────────────────────────────────────────────────
const errs = outcomes.filter((o) => o.error);
const rate = (rows: Outcome[]) =>
  rows.length ? `${((rows.filter((r) => r.converted).length / rows.length) * 100).toFixed(1)}%` : "—";

console.log(step("By device"));
for (const d of ["mobile", "desktop"]) {
  const rows = outcomes.filter((o) => o.device === d && !o.error);
  console.log(`  ${d.padEnd(9)} ${String(rows.length).padStart(4)} sessions   ${rate(rows).padStart(6)} converted`);
}

console.log(step("By persona"));
for (const p of PERSONAS) {
  const rows = outcomes.filter((o) => o.persona === p.id && !o.error);
  if (!rows.length) continue;
  console.log(`  ${p.id.padEnd(20)} ${String(rows.length).padStart(4)}   ${rate(rows).padStart(6)}   ${dim(p.label)}`);
}

const variants = [...new Set(outcomes.map((o) => o.variant).filter(Boolean))] as string[];
if (variants.length > 1) {
  console.log(step("By variant — emergent, not configured"));
  for (const v of variants) {
    for (const d of ["mobile", "desktop"]) {
      const rows = outcomes.filter((o) => o.variant === v && o.device === d && !o.error);
      if (!rows.length) continue;
      console.log(`  ${v.padEnd(20)} ${d.padEnd(8)} ${String(rows.length).padStart(4)}   ${rate(rows).padStart(6)}`);
    }
  }
}

if (errs.length) {
  console.log(step(`${errs.length} sessions errored`));
  console.log(dim(`  e.g. ${errs[0]!.error}`));
}
console.log(`\n${ok(`${outcomes.length - errs.length} sessions delivered in ${Math.round((Date.now() - started) / 1000)}s`)}\n`);
