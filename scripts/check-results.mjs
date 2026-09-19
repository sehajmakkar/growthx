#!/usr/bin/env node
/**
 * Proves the evaluator reads an experiment honestly.
 *
 * The failure this guards against is the one that would make the whole product
 * untrustworthy: declaring a winner that is not there. An A/B tool that says
 * "significant" too readily is worse than no tool, because the team acts on it
 * and ships noise.
 *
 * So the assertions are mostly about refusal — that an underpowered result is
 * not called, that early separation is not called, that a learning cannot be
 * written from an experiment somebody killed, and that the agent cannot set
 * its own outcome.
 *
 * The arithmetic is checked against known values rather than against itself.
 *
 * Usage: node scripts/check-results.mjs [experimentId]
 */
import { getDb, sql } from "../packages/db/src/index.ts";
import { wilson, differenceInterval, decide } from "../packages/api/src/stats.ts";
import { loadEnv, ok, bad, dim, step } from "./env.mjs";

const env = loadEnv();
const API = env.GX_API_BASE, SITE = env.GX_SITE_ID;
const db = getDb(env.DATABASE_URL);

let failures = 0;
const check = (pass, msg, detail) => {
  console.log(pass ? ok(msg) : bad(msg));
  if (detail) console.log(dim("    " + detail));
  if (!pass) failures++;
};
const near = (a, b, tol = 0.0005) => Math.abs(a - b) < tol;
const post = async (path, body) => {
  const res = await fetch(API + path, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ site: SITE, ...body }) });
  return { status: res.status, body: await res.json() };
};

console.log(step("The arithmetic, against known values"));
// Wilson interval for 81/263 is [0.2553, 0.3662] in the standard worked example.
const w = wilson(81, 263);
check(near(w.lo, 0.2553, 0.001) && near(w.hi, 0.3662, 0.001),
  "Wilson interval matches the published worked example",
  `[${w.lo.toFixed(4)}, ${w.hi.toFixed(4)}] vs [0.2553, 0.3662]`);
const zero = wilson(0, 20);
check(zero.lo === 0 && zero.hi > 0 && zero.hi < 1,
  "a zero-success arm stays inside [0,1]",
  `[${zero.lo}, ${zero.hi.toFixed(4)}] — the normal approximation would go negative here`);
const same = differenceInterval(50, 500, 50, 500);
check(same.lo < 0 && same.hi > 0, "two identical arms give an interval spanning zero");

console.log(step("It refuses to call what it cannot"));
const early = decide({ controlSuccess: 2, controlTrials: 50, challengerSuccess: 14,
  challengerTrials: 50, minPerArm: 400, guardrailBreached: false });
check(early.state === "not_yet_decisive",
  "a large early gap is NOT called a win",
  `2/50 vs 14/50 — p is tiny, but neither arm reached the planned size. Got: ${early.state}`);
const powered = decide({ controlSuccess: 100, controlTrials: 1000, challengerSuccess: 160,
  challengerTrials: 1000, minPerArm: 400, guardrailBreached: false });
check(powered.state === "challenger_won", "a properly powered separation IS called", powered.state);
const flat = decide({ controlSuccess: 100, controlTrials: 1000, challengerSuccess: 103,
  challengerTrials: 1000, minPerArm: 400, guardrailBreached: false });
check(flat.state === "no_difference",
  "reaching the planned size with no separation is a result, not 'not yet'", flat.state);
const breach = decide({ controlSuccess: 100, controlTrials: 1000, challengerSuccess: 200,
  challengerTrials: 1000, minPerArm: 400, guardrailBreached: true });
check(breach.state === "guardrail_breach",
  "a guardrail breach overrides a winning primary metric", breach.state);

console.log(step("The deployed endpoint"));
const EXP = process.argv[2] ?? (await db.execute(sql`
  select id from experiments where site_id = ${SITE} and status = 'concluded'
  order by concluded_at desc limit 1`)).rows?.[0]?.id;
if (!EXP) { console.error(bad("no concluded experiment to read")); process.exit(1); }

const r = await (await fetch(`${API}/api/results?site=${SITE}&experimentId=${EXP}`)).json();
check(Array.isArray(r.arms) && r.arms.length >= 2, `${EXP} returns its arms`, `${r.arms?.length} arms`);
check(typeof r.decision === "string" && r.decisionReason,
  "the decision comes with a reason in plain language", `${r.decision}`);
check(r.segments?.every((s) => typeof s.underpowered === "boolean"),
  "every segment row carries an explicit underpowered flag");
check(typeof r.text === "string" && r.text.includes(r.decision.toUpperCase().replace(/_/g, " ")),
  "the agent is handed the decision, already computed",
  "the model is never asked to work out a rate, a lift or a difference");
check(r.guardrail && typeof r.guardrail.breached === "boolean",
  "the guardrail is tracked separately from the primary metric",
  r.guardrail?.metric);

console.log(step("A learning cannot be written from nothing"));
const short = await post("/api/learnings", { experimentId: EXP, generalisation: "It went up." });
check(short.body.stored === false, "a one-liner is refused", short.body.errors?.[0]);
const dupe = await post("/api/learnings", {
  experimentId: EXP, tags: ["x"], changeSummary: "x", segment: "all",
  generalisation: "A second sentence, long enough to pass the length check, for one experiment." });
check(dupe.body.stored === false, "a second learning for the same experiment is refused",
  dupe.body.errors?.[0]);

const killed = (await db.execute(sql`
  select id from experiments where site_id = ${SITE} and status = 'killed' limit 1`)).rows?.[0];
if (killed) {
  const fromKilled = await post("/api/learnings", {
    experimentId: String(killed.id), tags: ["x"], changeSummary: "x", segment: "all",
    generalisation: "A sentence long enough to pass validation, from a killed experiment." });
  check(fromKilled.body.stored === false,
    "a killed experiment cannot produce a learning",
    "something a human pulled did not reach a result");
} else {
  console.log(dim("    (no killed experiment present to test that branch)"));
}

console.log(step("The agent does not get to set its own outcome"));
const stored = (await db.execute(sql`
  select outcome, confidence, effect from learnings
  where experiment_id = ${EXP} limit 1`)).rows?.[0];
if (stored) {
  const expected = r.decision === "challenger_won" ? "won"
    : r.decision === "control_won" ? "lost"
    : r.decision === "guardrail_breach" ? "guardrail_breach" : "inconclusive";
  check(String(stored.outcome) === expected,
    `the stored outcome (${stored.outcome}) was derived from the computed decision (${r.decision})`,
    "not from the sentence the model wrote");
  check(String(stored.confidence) === "low" || r.decision !== "not_yet_decisive",
    "an undecided experiment is recorded at low confidence", `confidence: ${stored.confidence}`);
} else {
  check(false, "a learning exists for the concluded experiment", "run: pnpm agent:evaluate " + EXP);
}

console.log(failures ? `\n${bad(`${failures} check(s) failed.`)}\n` : `\n${ok("It reports what happened, including when nothing did.")}\n`);
process.exit(failures ? 1 : 0);
