#!/usr/bin/env node
/**
 * Captures the page outline at both a phone and a desktop width, merges them,
 * and stores the result.
 *
 * Two widths, because the single most important fact about Site A — "the call to
 * action is below the fold on a phone but not on a desktop" — is invisible in a
 * one-viewport capture. Guessing the mobile fold from a desktop layout would be
 * wrong: the layout reflows, so the answer has to be measured at each width.
 *
 * It runs the snippet's own `captureSnapshot()` through `window.__growthx`
 * rather than reimplementing extraction here. That guarantees the selectors in
 * the snapshot come from the same builder as the selectors in event capture,
 * which is the property the P6 gate depends on.
 *
 * The capture always forces the CONTROL arm. Without that, the browser is
 * bucketed like any visitor and may capture a page some experiment has already
 * rewritten — so the agent would reason about a mutated baseline and stack new
 * mutations on top of another variant's. The snapshot must describe the page as
 * it actually ships.
 *
 * Usage: pnpm capture:snapshot [url]
 */
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { loadEnv, ok, bad, dim, step } from "./env.mjs";

const env = loadEnv();
const URL_ = process.argv[2] || env.GX_SITE_A_URL;
const SITE_ID = env.GX_SITE_ID || "site_corrick";
const API = env.GX_API_BASE;

/** The control arm carries no mutations, so it is the page as shipped. */
const CONTROL_VARIANT = process.env.GX_CONTROL_VARIANT || "v_control";

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

const browser = await chromium.launch();

/** Opens a page at a viewport and leaves it open so folds can be re-measured. */
async function openAt(viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const url = new URL(URL_);
  url.searchParams.set("gx_force", CONTROL_VARIANT);
  await page.goto(url.toString(), { waitUntil: "networkidle" });
  await page.waitForFunction(() => typeof window.__growthx?.snapshot === "function", null, { timeout: 15000 });
  // Scroll the full page so lazy content and sticky elements settle, then return.
  await page.evaluate(async () => {
    const h = document.body.scrollHeight;
    for (let y = 0; y < h; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 120));
  });
  const state = await page.evaluate(() => window.__growthx);
  if (state?.applied && state?.result?.applied > 0) {
    throw new Error(
      `capture was mutated (variant ${state.variantId} applied ${state.result.applied} changes) — ` +
      `the snapshot would describe a variant, not the baseline`
    );
  }
  const snap = await page.evaluate(() => window.__growthx.snapshot());
  return { snap, page, ctx };
}

/**
 * Measures the fold for selectors a capture missed.
 *
 * The two passes do not see the same element set: the "≥1% of viewport area"
 * rule is roughly four times stricter at 1440×900 than at 390×844, so plenty of
 * small elements appear in the mobile pass only. Defaulting those to
 * `aboveFold: false` would assert a fact never measured — and it did, labelling
 * a banner at y=0% as below the desktop fold. Anything missing is measured
 * directly instead.
 */
async function measureFolds(page, selectors) {
  return page.evaluate((sels) => {
    const out = {};
    const vh = window.innerHeight;
    for (const sel of sels) {
      try {
        const nodes = document.querySelectorAll(sel);
        if (nodes.length !== 1) { out[sel] = null; continue; }
        const r = nodes[0].getBoundingClientRect();
        if (r.width === 0 && r.height === 0) { out[sel] = null; continue; }
        out[sel] = r.top + window.scrollY < vh;
      } catch { out[sel] = null; }
    }
    return out;
  }, selectors);
}

try {
  console.log(step(`Capturing ${URL_}`));
  const m = await openAt(MOBILE);
  const mobile = m.snap;
  console.log(ok(`mobile  ${MOBILE.width}×${MOBILE.height}  ${mobile.elements.length} elements  doc ${mobile.docH}px`));
  const d = await openAt(DESKTOP);
  const desktop = d.snap;
  console.log(ok(`desktop ${DESKTOP.width}×${DESKTOP.height}  ${desktop.elements.length} elements  doc ${desktop.docH}px`));

  // Cross-measure: whatever one pass missed, ask the other page directly.
  const mobilePaths = new Set(mobile.elements.map((e) => e.path));
  const desktopPathSet = new Set(desktop.elements.map((e) => e.path));
  const missingOnDesktop = [...mobilePaths].filter((p) => !desktopPathSet.has(p));
  const missingOnMobile = [...desktopPathSet].filter((p) => !mobilePaths.has(p));
  const desktopExtra = missingOnDesktop.length ? await measureFolds(d.page, missingOnDesktop) : {};
  const mobileExtra = missingOnMobile.length ? await measureFolds(m.page, missingOnMobile) : {};
  console.log(ok(`cross-measured ${missingOnDesktop.length} on desktop, ${missingOnMobile.length} on mobile`));
  await m.ctx.close();
  await d.ctx.close();

  // Desktop is the base because it exposes the most elements (nothing is hidden
  // behind a mobile breakpoint); the mobile pass contributes its fold flags.
  const mobileByPath = new Map(mobile.elements.map((e) => [e.path, e]));
  const merged = [];
  let unmeasured = 0;

  for (const el of desktop.elements) {
    const mob = mobileByPath.get(el.path);
    const at390 = mob ? mob.aboveFold : mobileExtra[el.path];
    if (at390 === null || at390 === undefined) unmeasured++;
    merged.push({
      path: el.path, tag: el.tag, classes: el.classes, textSample: el.textSample,
      rect: el.rect, fontSizePx: el.fontSizePx, fontWeight: el.fontWeight,
      isInteractive: el.isInteractive,
      aboveFoldAt390: at390 ?? false,
      aboveFoldAt1440: el.aboveFold,
      childCount: el.childCount,
    });
  }

  // Elements the desktop pass missed still matter — a mobile-only nav, or
  // anything small enough to fall under the desktop area threshold.
  for (const el of mobile.elements) {
    if (desktopPathSet.has(el.path)) continue;
    const at1440 = desktopExtra[el.path];
    if (at1440 === null || at1440 === undefined) unmeasured++;
    merged.push({
      path: el.path, tag: el.tag, classes: el.classes, textSample: el.textSample,
      rect: el.rect, fontSizePx: el.fontSizePx, fontWeight: el.fontWeight,
      isInteractive: el.isInteractive,
      aboveFoldAt390: el.aboveFold,
      aboveFoldAt1440: at1440 ?? false,
      childCount: el.childCount,
    });
  }
  if (unmeasured) console.log(dim(`  ${unmeasured} fold values could not be measured at one width`));

  // Hash the structure, not the capture: re-running on an unchanged page must
  // not produce a new "version" for the agent to reason about.
  const contentHash = createHash("sha256")
    .update(merged.map((e) => `${e.path}|${e.tag}|${e.textSample}`).join("\n"))
    .digest("hex")
    .slice(0, 16);

  const payload = {
    v: 1,
    siteId: SITE_ID,
    path: new URL(URL_).pathname || "/",
    contentHash,
    capturedAt: Date.now(),
    viewport: DESKTOP.width === 1440 ? { w: 1440, h: 900 } : DESKTOP,
    elements: merged,
  };

  console.log(step("Storing"));
  const res = await fetch(`${API}/snapshot`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const out = await res.json();
  if (!res.ok || out.error) {
    console.log(bad(`store failed: ${JSON.stringify(out).slice(0, 300)}`));
    process.exit(1);
  }
  console.log(out.stored
    ? ok(`stored ${out.id} — ${out.elements} elements, hash ${contentHash}`)
    : ok(`unchanged (hash ${contentHash}) — nothing to do`));

  const belowOnMobile = merged.filter((e) => !e.aboveFoldAt390 && e.aboveFoldAt1440);
  console.log(dim(`\n  ${belowOnMobile.length} elements are above the fold on desktop but below it on mobile.`));
  const cta = merged.find((e) => e.path.includes("cta-primary"));
  if (cta) {
    console.log(dim(`  .cta-primary → mobile:${cta.aboveFoldAt390 ? "above" : "BELOW"} desktop:${cta.aboveFoldAt1440 ? "above" : "BELOW"}\n`));
  }
} finally {
  await browser.close();
}
