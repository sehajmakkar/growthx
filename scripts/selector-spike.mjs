#!/usr/bin/env node
/**
 * P6 — the selector grounding gate. PLAN.md §6 P6.
 *
 * The project's highest-risk assumption is that a Flash-class model, given our
 * page outline, emits selectors that actually resolve on the live page. If it
 * does not, every generated mutation silently no-ops: the product appears to
 * work, the dashboard fills with variants, and nothing on the page ever changes.
 * That failure is invisible from the outside, which is exactly why it is tested
 * on day one rather than discovered on Saturday.
 *
 * Measures match rate BEFORE and AFTER the repair loop separately. Both numbers
 * matter: the before-figure says whether the outline is legible, the after-figure
 * says whether the pipeline is safe to build on.
 *
 * Gate: >=95% after repair, >=70% before. Below that, take an escape route.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { chromium } from "playwright";
import { renderSnapshotForModel } from "../packages/shared/src/snapshot.ts";
import { validateMutations, nearestSelectors } from "../packages/shared/src/validate.ts";
import { generate, extractJsonArray, stats, MODEL_CHAIN } from "./lib/model.mjs";
import { loadEnv, ok, bad, dim, step } from "./env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = loadEnv();
const TRIALS = Number(process.env.GX_TRIALS ?? 20);
const MAX_REPAIRS = 2;

const HYPOTHESES = [
  "Mobile visitors reach the hero but not the call to action: it sits below 280px of supporting copy and an illustration filling 30% of the first screen. Lifting it will raise mobile signup conversion.",
  "The headline states a feature rather than an outcome, and the call to action asks for a high-commitment action from a first-time visitor who has not yet been given a reason to trust the product.",
  "Visitors meet the price before any social proof, so they judge cost with no sense of value. Presenting evidence of other customers before the pricing table will reduce price-driven exits.",
  "There is too much competing above the fold: an announcement bar, a navigation bar, a large illustration and a long paragraph all precede the primary action.",
];

const PROMPT = readFileSync(path.join(root, "prompts/variant-generator.md"), "utf8");

// ── load the page outline ───────────────────────────────────────────────────
const sql = postgres(env.DATABASE_URL, { max: 1 });
const [snap] = await sql`
  select * from snapshots
  where site_id = ${env.GX_SITE_ID || "site_corrick"} and path = '/' and is_current = true
  order by captured_at desc limit 1`;
await sql.end();

if (!snap) {
  console.error(bad("No current snapshot. Run `pnpm capture:snapshot` first."));
  process.exit(1);
}
const elements = snap.elements;
const outline = renderSnapshotForModel({ path: snap.path, viewport: snap.viewport, elements });

console.log(step(`Selector grounding gate — ${TRIALS} trials, ${elements.length} elements in the outline`));
console.log(dim(`  models: ${MODEL_CHAIN.join(" → ")}`));
console.log(dim(`  calls are serialized at ~9/min, so this takes a few minutes\n`));

// ── generate ────────────────────────────────────────────────────────────────
function buildPrompt(hypothesis, repairNote) {
  let p = PROMPT.replace("{{HYPOTHESIS}}", hypothesis).replace("{{SNAPSHOT}}", outline);
  if (repairNote) p += `\n\n## Your previous attempt was rejected\n\n${repairNote}\n\nReturn a corrected JSON array.`;
  return p;
}

const results = [];

for (let trial = 0; trial < TRIALS; trial++) {
  const hypothesis = HYPOTHESES[trial % HYPOTHESES.length];
  const row = { trial, hypothesis: hypothesis.slice(0, 48), before: null, after: null, repairs: 0, mutations: null, error: null };

  try {
    let raw = null;
    let repairNote = null;

    for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
      const { text } = await generate(buildPrompt(hypothesis, repairNote), { temperature: 0.8 });
      raw = extractJsonArray(text);
      if (!raw) {
        repairNote = "Your response was not a JSON array. Return only a JSON array of mutation objects.";
        if (attempt === 0) row.before = { checked: 0, matched: 0 };
        row.repairs++;
        continue;
      }

      const v = validateMutations(raw, elements);
      if (attempt === 0) row.before = { checked: v.selectorsChecked, matched: v.selectorsMatched, ok: v.ok };

      if (v.ok) {
        row.after = { checked: v.selectorsChecked, matched: v.selectorsMatched, ok: true };
        row.mutations = v.mutations;
        break;
      }

      row.repairs++;
      // The repair prompt names what failed and offers real alternatives — this
      // is the difference between a model guessing again and correcting.
      repairNote = v.errors
        .slice(0, 6)
        .map((e) => {
          const alts = e.nearest?.length ? `\n  Valid selectors that may be what you meant:\n${e.nearest.map((s) => `    ${s}`).join("\n")}` : "";
          return `- mutation ${e.index} (${e.op}) selector \`${e.selector}\`: ${e.reason}${alts}`;
        })
        .join("\n");

      if (attempt === MAX_REPAIRS) {
        row.after = { checked: v.selectorsChecked, matched: v.selectorsMatched, ok: false };
        row.mutations = v.mutations;
      }
    }
  } catch (e) {
    row.error = String(e.message ?? e).slice(0, 160);
  }

  results.push(row);
  const b = row.before ? `${row.before.matched}/${row.before.checked}` : "—";
  const a = row.after ? `${row.after.matched}/${row.after.checked}${row.after.ok ? "" : " ✗"}` : "—";
  console.log(`  trial ${String(trial + 1).padStart(2)}  before ${b.padEnd(7)} after ${a.padEnd(9)} repairs ${row.repairs}${row.error ? dim("  " + row.error) : ""}`);
}

// ── live check ──────────────────────────────────────────────────────────────
console.log(step("Applying the accepted mutation sets to the live page"));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const url = new URL(env.GX_SITE_A_URL);
url.searchParams.set("gx_force", "v_control");

let liveChecked = 0;
let liveMatched = 0;
let liveBroken = 0;
mkdirSync(path.join(root, "artifacts/spike"), { recursive: true });

for (const row of results) {
  if (!row.mutations || !row.after?.ok) continue;
  await page.goto(url.toString(), { waitUntil: "networkidle" });
  const out = await page.evaluate((muts) => {
    const res = { checked: 0, matched: 0 };
    for (const m of muts) {
      for (const sel of [m.selector, m.target].filter(Boolean)) {
        res.checked++;
        try { if (document.querySelectorAll(sel).length === 1) res.matched++; } catch { /* invalid */ }
      }
    }
    return res;
  }, row.mutations);
  liveChecked += out.checked;
  liveMatched += out.matched;

  // Does the page still look like a page? A variant that validates but renders
  // as a broken layout is a P6 failure too, not a P15 problem.
  const health = await page.evaluate(() => ({
    bodyH: document.body.scrollHeight,
    visible: document.querySelectorAll("a,button,h1,h2,p").length,
  }));
  if (health.bodyH < 500 || health.visible < 10) liveBroken++;
}
await browser.close();

// ── verdict ─────────────────────────────────────────────────────────────────
const sum = (f) => results.reduce((a, r) => a + (f(r) ?? 0), 0);
const beforeRate = sum((r) => r.before?.matched) / Math.max(1, sum((r) => r.before?.checked));
const afterRate = sum((r) => r.after?.matched) / Math.max(1, sum((r) => r.after?.checked));
const cleanTrials = results.filter((r) => r.after?.ok).length;
const liveRate = liveChecked ? liveMatched / liveChecked : 0;

const report = {
  trials: TRIALS, elements: elements.length, snapshotHash: snap.content_hash,
  beforeRepairRate: beforeRate, afterRepairRate: afterRate, liveMatchRate: liveRate,
  cleanTrials, liveChecked, liveMatched, liveBroken, modelStats: stats, results,
};
writeFileSync(path.join(root, "artifacts/spike/report.json"), JSON.stringify(report, null, 2));

const pct = (n) => `${(n * 100).toFixed(1)}%`;
console.log(step("Verdict"));
console.log(`  selectors resolving BEFORE repair   ${pct(beforeRate)}   ${dim("(gate: ≥70%)")}`);
console.log(`  selectors resolving AFTER repair    ${pct(afterRate)}   ${dim("(gate: ≥95%)")}`);
console.log(`  verified against the LIVE page      ${pct(liveRate)}   ${dim(`(${liveMatched}/${liveChecked})`)}`);
console.log(`  trials fully clean                  ${cleanTrials}/${TRIALS}`);
console.log(`  variants that broke the layout      ${liveBroken}   ${dim("(gate: 0)")}`);
console.log(dim(`  model calls ${stats.calls}, retries ${stats.retries}, spillovers ${stats.spillovers}`));

const passed = afterRate >= 0.95 && beforeRate >= 0.70 && liveBroken === 0;
console.log(passed
  ? `\n${ok("GATE PASSED — the architecture holds. Report: artifacts/spike/report.json\n")}`
  : `\n${bad("GATE FAILED — take an escape route (PLAN §6 P6). Report: artifacts/spike/report.json\n")}`);
process.exit(passed ? 0 : 1);
