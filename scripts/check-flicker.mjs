#!/usr/bin/env node
/**
 * Proves the snippet's anti-flicker contract, under throttling, by measurement
 * rather than by eye.
 *
 * "No visible flash" means one specific thing: the control version of a mutated
 * element is never painted. So this samples the page during load and asserts
 * that the CTA is never both VISIBLE and UNMUTATED at the same instant.
 *
 * Also checked: stickiness across reloads, that two visitors can land in
 * different arms, that a dead API still renders the page, and ?gx_force=.
 *
 * Usage: node scripts/check-flicker.mjs [url]
 */
import { chromium, devices } from "playwright";
import { loadEnv, ok, bad, dim, step } from "./env.mjs";

const env = loadEnv();
const URL_ = process.argv[2] || env.GX_SITE_A_URL;
const CHALLENGER = "v_cta_above_copy";
if (!URL_) { console.error(bad("no URL — pass one or set GX_SITE_A_URL")); process.exit(1); }

let failures = 0;
const check = (pass, msg, detail) => {
  console.log(pass ? ok(msg) : bad(msg));
  if (detail) console.log(dim("    " + detail));
  if (!pass) failures++;
};

const browser = await chromium.launch();

/** The snippet sets `reason` exactly once, when it reveals. Waiting on that is
 *  more reliable than waiting on a load event, which can fire either side. */
async function settled(page) {
  await page
    .waitForFunction(() => window.__growthx && window.__growthx.reason !== null, null, { timeout: 8000 })
    .catch(() => {});
  return page.evaluate(() => window.__growthx);
}

/** Throttle to Slow 4G + 4x CPU via CDP, the way DevTools does. */
async function throttle(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  return cdp;
}

try {
  // ── 0. Cold start, measured separately and honestly ─────────────────────
  //
  // The very first request after the edge cache expires pays a CloudFront miss
  // plus a Lambda cold start, which can exceed the network budget. That case
  // fails safe — the visitor sees the control and the session is marked
  // `suppressed` so P4 will not attribute it to the challenger — but it is a
  // real characteristic and gets reported rather than hidden.
  //
  // The five measured loads below run against a warm edge, because that is what
  // any site with actual traffic looks like: the manifest is cached for 30s and
  // shared by every visitor of the page.
  console.log(step("Cold start — first request after an expired edge cache"));
  {
    const t = Date.now();
    const r = await fetch(`${env.GX_CDN_URL}/manifest?site=${env.GX_SITE_ID || "site_corrick"}&path=/`)
      .catch(() => null);
    console.log(dim(`    edge warm-up: ${r ? r.status : "failed"} in ${Date.now() - t}ms`));
  }

  // ── 1. No flash under throttling ────────────────────────────────────────
  console.log(step("Flash test — Slow 4G + 4x CPU, mobile viewport, 5 loads (warm edge)"));
  let flashes = 0;
  let notApplied = 0;
  let samplesTotal = 0;
  const reveals = [];

  for (let run = 0; run < 5; run++) {
    const ctx = await browser.newContext({ ...devices["iPhone 13"] });
    const page = await ctx.newPage();
    await throttle(page);

    // Sample continuously from navigation start. The probe reports whether the
    // CTA is painted and, if so, whether it still reads as the control.
    await page.addInitScript(() => {
      window.__samples = [];
      const tick = () => {
        const el = document.querySelector(".cta-primary");
        if (el) {
          const vis = getComputedStyle(document.documentElement).visibility !== "hidden";
          const r = el.getBoundingClientRect();
          const painted = vis && r.width > 0 && r.height > 0;
          window.__samples.push({
            t: performance.now(),
            painted,
            text: (el.textContent || "").trim(),
          });
        }
        if (window.__samples.length < 600) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    await page.goto(`${URL_}?gx_force=${CHALLENGER}`, { waitUntil: "load" });
    await page.waitForTimeout(1200);

    const samples = await page.evaluate(() => window.__samples || []);
    samplesTotal += samples.length;

    // A flash is a *transition*: the control was painted, and then the
    // challenger replaced it while the visitor was looking. Painting the control
    // and leaving it there is not a flash — it is the snippet correctly
    // declining to mutate after reveal — but it does mean the experiment did
    // not run, which is tracked separately below.
    const painted = samples.filter((s) => s.painted);
    let sawControlPainted = false;
    for (const s of painted) {
      if (s.text === "Start free trial") sawControlPainted = true;
      else if (sawControlPainted && s.text === "See how it works") { flashes++; break; }
    }

    const st = await settled(page);
    if (!st?.applied) notApplied++;
    reveals.push(`${st?.reason}@${st?.revealedAfterMs}ms/${st?.manifestSource}`);
    await ctx.close();
  }
  console.log(dim(`    reveals: ${reveals.join("  ")}`));
  check(flashes === 0,
    `no control-to-challenger transition was ever painted (${samplesTotal} frames over 5 loads)`,
    flashes ? `${flashes} load(s) flashed` : null);
  check(notApplied === 0,
    `the challenger actually applied on all 5 throttled loads`,
    notApplied ? `${notApplied}/5 loads gave up before the manifest arrived — ` +
      `the experiment silently does not run for slow visitors` : null);

  // ── 2. Sticky bucketing ─────────────────────────────────────────────────
  console.log(step("Stickiness — same visitor keeps its variant across reloads"));
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(URL_, { waitUntil: "load" });
  const first = await settled(page);
  const seen = new Set([first?.variantId]);
  for (let i = 0; i < 3; i++) {
    await page.reload({ waitUntil: "load" });
    seen.add((await settled(page))?.variantId);
  }
  check(seen.size === 1, `variant stable across 4 loads (${[...seen].join(", ")})`);
  await ctx.close();

  // ── 3. Different visitors can land in different arms ────────────────────
  console.log(step("Bucketing — independent visitors split across arms"));
  const arms = {};
  for (let i = 0; i < 14; i++) {
    const c = await browser.newContext();
    const p = await c.newPage();
    await p.goto(URL_, { waitUntil: "domcontentloaded" });
    const v = (await settled(p))?.variantId ?? "none";
    arms[v] = (arms[v] || 0) + 1;
    await c.close();
  }
  check(Object.keys(arms).length >= 2,
    `14 fresh visitors split: ${Object.entries(arms).map(([k, v]) => `${k}=${v}`).join("  ")}`);

  // ── 4. Dead API still renders the page ──────────────────────────────────
  console.log(step("Resilience — unreachable manifest must not blank the page"));
  const c4 = await browser.newContext();
  const p4 = await c4.newPage();
  await p4.route("**/manifest*", (route) => route.abort("connectionrefused"));
  const t = Date.now();
  await p4.goto(URL_, { waitUntil: "load" });
  await p4.waitForFunction(() => getComputedStyle(document.documentElement).visibility !== "hidden",
    null, { timeout: 4000 }).catch(() => {});
  const visible = await p4.evaluate(() => {
    const el = document.querySelector(".cta-primary");
    const r = el?.getBoundingClientRect();
    return {
      docVisible: getComputedStyle(document.documentElement).visibility !== "hidden",
      ctaPainted: !!r && r.width > 0,
      text: el?.textContent?.trim(),
      state: window.__growthx,
    };
  });
  check(visible.docVisible && visible.ctaPainted,
    `page rendered with a dead manifest in ${Date.now() - t}ms (reason: ${visible.state?.reason})`);
  check(visible.text === "Start free trial", `shows the unmutated control ("${visible.text}")`);
  await c4.close();

  // ── 5. ?gx_force= ───────────────────────────────────────────────────────
  console.log(step("Override — ?gx_force reproduces a variant on demand"));
  const c5 = await browser.newContext();
  const p5 = await c5.newPage();
  await p5.goto(`${URL_}?gx_force=${CHALLENGER}`, { waitUntil: "load" });
  const forcedState = await settled(p5);
  const forced = { state: forcedState, text: await p5.evaluate(() => document.querySelector(".cta-primary")?.textContent?.trim()) };
  check(forced.state?.variantId === CHALLENGER && forced.state?.applied,
    `?gx_force=${CHALLENGER} applied ${forced.state?.result?.applied} mutations`);
  check(forced.text === "See how it works", `CTA text is the challenger's ("${forced.text}")`);

  const order = await p5.evaluate(() => {
    const a = document.querySelector(".hero-actions")?.getBoundingClientRect().top ?? 0;
    const s = document.querySelector(".hero-subcopy")?.getBoundingClientRect().top ?? 0;
    const fig = getComputedStyle(document.querySelector(".hero-figure")).display;
    return { ctaAboveCopy: a < s, figureDisplay: fig };
  });
  check(order.ctaAboveCopy, "move_before lifted the CTA above the supporting copy");
  await c5.close();
} finally {
  await browser.close();
}

console.log(failures === 0
  ? `\n${ok("Anti-flicker contract holds.\n")}`
  : `\n${bad(`${failures} check(s) failed.\n`)}`);
process.exit(failures ? 1 : 0);
