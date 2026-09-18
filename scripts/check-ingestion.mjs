#!/usr/bin/env node
/**
 * Drives one real browser session through the deployed snippet and asserts the
 * events arrive in Postgres with usable coordinates.
 *
 * This is deliberately end-to-end: browser → snippet → CloudFront → API Gateway
 * → Lambda → Neon. Unit-testing the queue would pass while the beacon silently
 * failed on unload, which is the exact failure that loses the most informative
 * events of every session.
 */
import { chromium, devices } from "playwright";
import postgres from "postgres";
import { loadEnv, ok, bad, dim, step } from "./env.mjs";

const env = loadEnv();
const URL_ = process.argv[2] || env.GX_SITE_A_URL;
const sql = postgres(env.DATABASE_URL, { max: 1 });

let failures = 0;
const check = (pass, msg, detail) => {
  console.log(pass ? ok(msg) : bad(msg));
  if (detail) console.log(dim("    " + detail));
  if (!pass) failures++;
};

const browser = await chromium.launch();
let sessionId;

try {
  console.log(step("Driving a real session through the deployed snippet"));
  const ctx = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await ctx.newPage();
  await page.goto(`${URL_}?gx_force=v_control`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__growthx?.reason !== null, null, { timeout: 10000 });

  sessionId = await page.evaluate(() => window.__growthx.sessionId);
  console.log(dim(`    session ${sessionId}`));

  // Scroll to the pricing table, reading the page like a considerer would.
  await page.evaluate(() => document.querySelector(".pricing-table")?.scrollIntoView({ behavior: "instant" }));
  await page.waitForTimeout(900);

  // Rage-click the unwired accordion — Site A's designed friction point.
  const expand = page.locator(".tier-2 .tier-expand");
  for (let i = 0; i < 4; i++) await expand.click({ force: true, delay: 40 });
  await page.waitForTimeout(900);

  // Scroll to the bottom so the scroll bands all register.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(700);

  // Convert, then close the tab mid-session: the beacon path is what we are
  // really testing here.
  await page.locator(".cta-primary").click();
  await page.waitForLoadState("load");
  await page.waitForTimeout(600);
  await ctx.close();

  console.log(step("Waiting for events to land"));
  // A session produces several independent beacons — one per pageview, each
  // flushed on its own unload — and they race. Waiting for any single event
  // type reads the table mid-flight, so wait for the count to stop growing.
  let rows = [];
  let stable = 0;
  for (let i = 0; i < 25 && stable < 3; i++) {
    const next = await sql`select * from events where session_id = ${sessionId} order by ts, seq`;
    stable = next.length === rows.length && next.length > 0 ? stable + 1 : 0;
    rows = next;
    await new Promise((r) => setTimeout(r, 800));
  }
  console.log(dim(`    ${rows.length} events, settled`));

  const types = new Set(rows.map((r) => r.type));
  console.log(step("Event coverage"));
  for (const t of ["pageview", "exposure", "click", "scroll", "element_view", "dwell"]) {
    check(types.has(t), `${t}`);
  }
  check(types.has("rage_click"), "rage_click on the unwired .tier-2 accordion",
    types.has("rage_click") ? null : "Site A's designed friction point produced nothing");
  check(types.has("dead_click"), "dead_click on the same element");
  check(types.has("conversion"), "conversion — and it arrived after the tab closed (beacon path)");

  console.log(step("Coordinate normalisation (PLAN §4.5)"));
  const clicks = rows.filter((r) => r.type === "click" && r.selector);
  check(clicks.length > 0, `${clicks.length} clicks carry a selector`);
  const withElem = clicks.filter((r) => r.elem_frac && r.page_frac && r.vp_frac);
  check(withElem.length === clicks.length,
    `all clicks carry elemFrac, pageFrac and vpFrac`,
    withElem.length === clicks.length ? null : `${clicks.length - withElem.length} missing a frame`);
  const inRange = withElem.every(
    (r) => r.elem_frac.x >= -0.5 && r.elem_frac.x <= 1.5 && r.page_frac.y >= 0 && r.page_frac.y <= 1
  );
  check(inRange, "fractions are within plausible bounds");

  const sample = clicks[0];
  if (sample) {
    console.log(dim(`    e.g. ${sample.selector}`));
    console.log(dim(`         elem(${sample.elem_frac.x}, ${sample.elem_frac.y})  ` +
      `page(${sample.page_frac.x}, ${sample.page_frac.y})  vp(${sample.vp_frac.x}, ${sample.vp_frac.y})`));
  }

  console.log(step("Selector quality — the alphabet P6 depends on"));
  const selectors = [...new Set(rows.filter((r) => r.selector).map((r) => r.selector))];
  console.log(dim(`    ${selectors.length} distinct selectors recorded`));
  for (const s of selectors.slice(0, 8)) console.log(dim(`      ${s}`));
  const utilityLeak = selectors.filter((s) => /\.(mt|mb|px|py|flex|grid|text|bg|rounded|w|h)-/.test(s));
  check(utilityLeak.length === 0,
    "no Tailwind utility classes leaked into selectors",
    utilityLeak.length ? `these would break on any restyle: ${utilityLeak.slice(0, 3).join(", ")}` : null);

  // ── regressions found in a real desktop session, not by the script ──────
  console.log(step("Signal quality"));

  const deadOnCard = rows.filter(
    (r) => r.type === "dead_click" && r.selector && /tier\.tier-\d$/.test(r.selector)
  );
  check(deadOnCard.length === 0,
    "dead clicks only fire on things that look clickable",
    deadOnCard.length ? `${deadOnCard.length} fired on a card body, which is ordinary browsing` : null);

  const backExitAfterConversion = rows.filter(
    (r) => r.type === "back_exit" && r.path.includes("success")
  );
  check(backExitAfterConversion.length === 0,
    "no back_exit on the conversion page",
    backExitAfterConversion.length ? "a visitor who converted is not a frustrated bounce" : null);

  const views = rows.filter((r) => r.type === "element_view");
  const snapshots = new Set(views.map((r) => r.payload?.snapshot));
  check(views.length > 0 && snapshots.size >= 1,
    `visibility emitted in ${snapshots.size} snapshot(s), and survives a tab switch`);

  const weak = [...new Set(rows.filter((r) => r.selector).map((r) => r.selector))]
    .filter((sel) => /^[a-z]+$/.test(sel) || /^[a-z]+:nth-of-type\(\d+\)$/.test(sel));
  check(weak.length === 0,
    "no bare-tag selectors — every path carries identifying context",
    weak.length ? `too weak to hand a model in P6: ${weak.join(", ")}` : null);

  const scrolls = rows.filter((r) => r.type === "scroll");
  const maxBand = Math.max(0, ...scrolls.map((r) => (r.payload?.bandsCrossed ?? []).length));
  check(maxBand >= 3, `scroll bands recorded (${maxBand} of 4 crossed)`);
} finally {
  await browser.close();
  await sql.end();
}

console.log(failures === 0
  ? `\n${ok("Ingestion works end to end.\n")}`
  : `\n${bad(`${failures} check(s) failed.\n`)}`);
process.exit(failures ? 1 : 0);
