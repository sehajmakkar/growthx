#!/usr/bin/env node
/**
 * Two learning records from earlier manual experiments.
 *
 * These are disclosed as seeded in the demo — they came from somewhere real
 * rather than from nowhere, and without them the memory has nothing to retrieve
 * on its first run. Every later learning is written by the evaluator (P20).
 */
import postgres from "postgres";
import { loadEnv, ok, step } from "./env.mjs";

const env = loadEnv();
const sql = postgres(env.DATABASE_URL, { max: 1 });
const siteId = env.GX_SITE_ID || "site_corrick";

const LEARNINGS = [
  {
    id: "learn_seed_cta_language",
    hypothesis: "Lower-commitment call-to-action language would outperform direct-signup language for first-time mobile visitors.",
    change_summary: 'Changed the hero CTA from "Start free trial" to "See how it works" on mobile only.',
    segment: "device=mobile|visitor=new",
    outcome: "won",
    effect: { lift: 31.4, ciLow: 8.2, ciHigh: 54.6, n: 1840, pValue: 0.011, significant: true },
    generalisation: "Lower-commitment CTA language outperforms direct-signup language for first-time mobile visitors.",
    tags: ["cta-copy", "mobile", "first-visit"],
    confidence: "medium",
  },
  {
    id: "learn_seed_social_proof",
    hypothesis: "Moving customer logos above the pricing table would reduce price-driven exits.",
    change_summary: "Moved the social-proof band above the pricing section.",
    segment: "all",
    outcome: "inconclusive",
    effect: { lift: 3.1, ciLow: -6.4, ciHigh: 12.6, n: 920, pValue: 0.51, significant: false },
    generalisation: "Moving social proof above pricing produced no measurable effect at this traffic level; do not re-test without substantially more volume.",
    tags: ["social-proof", "pricing", "ordering"],
    confidence: "low",
  },
];

console.log(step("Seeding prior learnings"));
for (const l of LEARNINGS) {
  await sql`
    insert into learnings (id, site_id, hypothesis, change_summary, segment, outcome,
                           effect, generalisation, tags, confidence)
    values (${l.id}, ${siteId}, ${l.hypothesis}, ${l.change_summary}, ${l.segment},
            ${l.outcome}, ${sql.json(l.effect)}, ${l.generalisation}, ${l.tags}, ${l.confidence})
    on conflict (id) do update set generalisation = excluded.generalisation`;
  console.log(ok(`${l.outcome.padEnd(13)} ${l.generalisation.slice(0, 78)}`));
}
await sql.end();
console.log();
