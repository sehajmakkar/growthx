#!/usr/bin/env node
/**
 * Seeds the Corrick site row and one hand-written two-variant experiment, so
 * P3 has something real to apply before the agent exists to generate it.
 *
 * The challenger is deliberately the change a competent CRO would make, and the
 * one the agent should independently arrive at later: lift the CTA above the
 * supporting copy, soften its commitment, drop the viewport-eating hero art on
 * mobile, and remove the announcement bar. If the agent proposes something like
 * this in P15 from the data alone, that is the product working.
 */
import postgres from "postgres";
import { loadEnv, ok, dim, step } from "./env.mjs";

const env = loadEnv();
const sql = postgres(env.DATABASE_URL, { max: 1 });

const SITE_ID = env.GX_SITE_ID || "site_corrick";
const EXP_ID = "exp_hero_cta_placement";
const CONTROL = "v_control";
const CHALLENGER = "v_cta_above_copy";

const challengerMutations = [
  {
    op: "move_before",
    selector: ".hero-actions",
    target: ".hero-subcopy",
    note: "Lift the call to action above the supporting copy so it is reachable without scrolling on a phone.",
  },
  {
    op: "replace_text",
    selector: ".cta-primary",
    value: "See how it works",
    note: "Lower-commitment language for a first-time visitor who has not yet been given a reason to trust the price.",
  },
  {
    op: "set_media_style",
    selector: ".hero-figure",
    media: "mobile",
    props: { display: "none" },
    note: "The hero illustration occupies 30% of the first mobile viewport and carries no information.",
  },
  { op: "hide", selector: ".secondary-banner", note: "Removes a second competing message above the fold." },
];

console.log(step("Seeding Corrick site and hero-placement experiment"));

await sql`
  insert into sites (id, name, origins, objective, guardrail, conversion)
  values (
    ${SITE_ID}, 'Corrick',
    ${[env.GX_SITE_A_URL ?? "https://d2wz20j6mz6oyt.cloudfront.net"]},
    ${sql.json({ metric: "signup_conversion", from: 3.0, to: 4.0 })},
    ${sql.json({ metric: "lead_quality", direction: "not_below", threshold: 0.95 })},
    ${sql.json({ kind: "url", value: "/signup/success" })}
  )
  on conflict (id) do update set name = excluded.name, origins = excluded.origins
`;
console.log(ok(`site ${SITE_ID}`));

await sql`
  insert into experiments (id, site_id, path, hypothesis, status, split, guardrail, auto_stop)
  values (
    ${EXP_ID}, ${SITE_ID}, '/',
    'Mobile visitors reach the hero but not the call to action, because it sits below 280px of supporting copy and a 30%-viewport illustration. Lifting it above the copy will raise mobile signup conversion without reducing lead quality.',
    'running',
    ${sql.json({ [CONTROL]: 50, [CHALLENGER]: 50 })},
    ${sql.json({ metric: "lead_quality", direction: "not_below", threshold: 0.95 })},
    ${sql.json({ maxDays: 14, minSessionsPerArm: 400, guardrailBreachPct: 5, futilityThreshold: 0.05 })}
  )
  on conflict (id) do update set status = 'running', split = excluded.split
`;
console.log(ok(`experiment ${EXP_ID} ${dim("(running, 50/50)")}`));

await sql`delete from variants where experiment_id = ${EXP_ID}`;
await sql`
  insert into variants (id, experiment_id, label, is_control, rationale, mutations, validation)
  values
    (${CONTROL}, ${EXP_ID}, 'Control — as shipped', true, 'The page as the team built it.', ${sql.json([])}, ${sql.json({ liveCheck: "passed", selectorsChecked: 0, selectorsMatched: 0 })}),
    (${CHALLENGER}, ${EXP_ID}, 'Challenger — CTA above the copy', false,
     'Hand-written for P3 to prove the delivery mechanism. The agent generates its own from data in P15.',
     ${sql.json(challengerMutations)},
     ${sql.json({ liveCheck: "pending", selectorsChecked: 4, selectorsMatched: 4 })})
`;
console.log(ok(`variants ${CONTROL} ${dim("(no mutations)")} and ${CHALLENGER} ${dim(`(${challengerMutations.length} mutations)`)}`));

await sql.end();
console.log(dim(`\n  Force a variant in the browser with  ?gx_force=${CHALLENGER}\n`));
