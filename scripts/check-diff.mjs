#!/usr/bin/env node
/**
 * Proves the variant-diff screen shows a real difference.
 *
 * The screen renders control and challenger as two live iframes of the real
 * site, driven by ?gx_preview=<experimentId>&gx_force=<variantId>. That makes
 * it trustworthy — it is the shipping snippet applying the stored mutations,
 * not a mock — but it also means it can fail *silently*: if the preview
 * manifest does not arrive before the anti-flicker budget, the snippet
 * correctly refuses to mutate and both frames show the control, while the
 * screen still labels one of them the challenger. A reviewer would approve a
 * variant having never seen it.
 *
 * So the assertion is not "the page loaded". It is that the two arms differ,
 * and that the challenger's mutations actually applied.
 *
 * Also asserted: a draft cannot escape to a real visitor. Previews bypass the
 * CDN and are no-store, and the edge does not forward the preview parameter.
 *
 * Usage: node scripts/check-diff.mjs <experimentId>
 */
import { chromium } from "playwright";
import { loadEnv, ok, bad, dim, step } from "./env.mjs";

const env = loadEnv();
const expId = process.argv[2];
if (!expId) { console.error(bad("usage: node scripts/check-diff.mjs <experimentId>")); process.exit(1); }

let failures = 0;
const check = (pass, msg, detail) => {
  console.log(pass ? ok(msg) : bad(msg));
  if (detail) console.log(dim("    " + detail));
  if (!pass) failures++;
};

const api = env.GX_API_BASE, cdn = env.GX_CDN_URL, site = env.GX_SITE_ID;

console.log(step("Preview manifest carries the draft"));
const pm = await fetch(`${api}/manifest?site=${site}&path=/&preview=${expId}`);
const manifest = await pm.json();
const exp = (manifest.experiments || []).find((e) => e.id === expId);
check(!!exp, `the draft ${expId} is served even though it is not running`);
check(pm.headers.get("cache-control") === "no-store",
  "the preview response is no-store",
  `cache-control: ${pm.headers.get("cache-control")}`);

console.log(step("A draft cannot leak to a real visitor through the edge"));
const edge = await (await fetch(`${cdn}/manifest?site=${site}&path=/&preview=${expId}`)).json();
const leaked = (edge.experiments || []).some((e) => e.id === expId);
check(!leaked,
  "appending ?preview to the CDN URL does not return the draft",
  `edge returned: ${(edge.experiments || []).map((e) => e.id).join(", ") || "nothing"}`);

console.log(step("The two arms actually render differently"));
const browser = await chromium.launch();
const seen = {};
for (const v of exp?.variants ?? []) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${env.GX_SITE_A_URL}?gx_preview=${expId}&gx_force=${v.id}`, { waitUntil: "load" });
  await page
    .waitForFunction(() => window.__growthx && window.__growthx.reason !== null, null, { timeout: 15000 })
    .catch(() => {});
  const s = await page.evaluate(() => ({
    cta: document.querySelector(".cta-primary")?.textContent?.trim() ?? null,
    applied: window.__growthx?.result?.applied ?? 0,
    suppressed: !!window.__growthx?.suppressed,
    reason: window.__growthx?.reason,
  }));
  seen[v.id] = s;
  console.log(dim(`    ${v.id.padEnd(28)} cta="${s.cta}"  applied=${s.applied}  (${s.reason})`));
  check(!s.suppressed, `${v.id} was not suppressed by the reveal timer`,
    s.suppressed ? "the preview budget is too tight — the reviewer would see the control" : null);
  await page.close();
}
await browser.close();

const challengers = (exp?.variants ?? []).filter((v) => v.mutations.length);
for (const v of challengers) {
  check(seen[v.id]?.applied === v.mutations.length,
    `${v.id} applied all ${v.mutations.length} of its mutations`,
    `applied ${seen[v.id]?.applied}`);
}
const texts = new Set(Object.values(seen).map((s) => s.cta));
check(texts.size > 1 || challengers.every((v) => !v.mutations.some((m) => m.op === "replace_text")),
  "control and challenger are visibly different",
  [...texts].map((t) => `"${t}"`).join("  vs  "));

console.log(failures ? `\n${bad(`${failures} check(s) failed.`)}\n` : `\n${ok("The diff screen shows a real difference.")}\n`);
process.exit(failures ? 1 : 0);
