#!/usr/bin/env node
/**
 * Recomputes every segment for a page and prints what the agent will read.
 *
 * Runs the same functions the deployed Lambda runs — there is no second
 * implementation to drift.
 */
import { getDb } from "../packages/db/src/index.ts";
import { computeAll, getHeatmap } from "../packages/api/src/aggregate.ts";
import { loadEnv, ok, dim, step } from "./env.mjs";

const env = loadEnv();
const siteId = env.GX_SITE_ID || "site_corrick";
const path = process.argv[2] || "/";
const db = getDb(env.DATABASE_URL);

console.log(step(`Aggregating ${siteId} ${path}`));
const started = Date.now();
const written = await computeAll(db, siteId, path);
console.log(ok(`${written.length} segments in ${Date.now() - started}ms`));
for (const w of written) console.log(dim(`    ${w}`));

for (const seg of ["device=mobile", "device=desktop", "device=mobile|outcome=bounced"]) {
  const h = await getHeatmap(db, siteId, path, seg);
  console.log(step(`${seg} — ${h.sessions} sessions${h.simulated_pct ? dim(`  (${h.simulated_pct}% simulated)`) : ""}`));
  console.log(dim("    selector                                  viewed  click-rate  ttfv"));
  for (const e of h.elements.slice(0, 7)) {
    console.log(
      `    ${String(e.selector).slice(0, 40).padEnd(40)} ` +
      `${String(e.viewed_pct).padStart(5)}%  ${String(e.click_rate_pct).padStart(8)}%  ` +
      `${e.median_time_to_first_view_s ?? "—"}s`
    );
  }
  if (h.friction.length) {
    console.log(dim("    friction:"));
    for (const f of h.friction.slice(0, 3)) {
      console.log(dim(`      ${f.type} ×${f.count} on ${f.selector}`));
    }
  }
  console.log(dim(`    funnel: ${h.funnel.map((s) => `${s.step}=${s.sessions}`).join("  ")}`));
  console.log(dim(`    scroll: ${h.scroll_bands.map((b) => `${b.depth_pct}%→${b.reach_pct}%`).join("  ")}`));
}
process.exit(0);
