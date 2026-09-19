#!/usr/bin/env node
/**
 * The whole story, as one command.
 *
 * Watch → diagnose → propose → refuse → approve → run → read → learn. Every
 * stage goes through the deployed system: real browsers on the real site, real
 * events to the real endpoint, the real policy gate, the real Lambda. Nothing
 * is written straight to the database.
 *
 * Two things shaped the design, both learned the hard way.
 *
 * The agent stages cost model quota, and the free tier is roughly 20 requests
 * a minute per model. So a quota failure is reported and *skipped*, never
 * fatal: the pipeline continues with what is already stored. An e2e that
 * cannot finish because a third party rate-limited you is not a safety net,
 * and the one time you need this script is the hour before recording.
 *
 * It therefore always ends with a readiness report — every screen, whether it
 * has the data it needs, and what to run if it does not. That report is the
 * actual deliverable. The pipeline is how you get there from cold.
 *
 * Usage:
 *   pnpm e2e                 full pipeline
 *   pnpm e2e --fast          skip traffic generation and agent calls
 *   pnpm e2e --check         readiness report only, changes nothing
 *   pnpm e2e --sessions 200  how much traffic to drive
 */
import { execFileSync } from "node:child_process";
import { getDb, sql } from "../packages/db/src/index.ts";
import { loadEnv, ok, bad, dim, step } from "./env.mjs";

const env = loadEnv();
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };

const FAST = has("--fast");
const CHECK_ONLY = has("--check");
const SESSIONS = Number(val("--sessions", "160"));
const db = getDb(env.DATABASE_URL);
const API = env.GX_API_BASE, SITE = env.GX_SITE_ID;

const started = Date.now();
const skipped = [];
let failures = 0;

const api = async (path, body) => {
  const res = await fetch(API + path, body ? {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ site: SITE, ...body }),
  } : undefined);
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const get = (p) => api(`${p}${p.includes("?") ? "&" : "?"}site=${SITE}`);

function run(label, cmd, cmdArgs) {
  console.log(dim(`    $ ${cmd} ${cmdArgs.join(" ")}`));
  try {
    execFileSync(cmd, cmdArgs, { stdio: "inherit", env: process.env });
    return true;
  } catch {
    console.log(bad(`    ${label} failed`));
    failures++;
    return false;
  }
}

/** Agent stages are allowed to be skipped; nothing else is. */
function runAgent(label, cmdArgs) {
  console.log(dim(`    $ ${cmdArgs.join(" ")}`));
  try {
    const out = execFileSync(cmdArgs[0], cmdArgs.slice(1), {
      env: process.env, encoding: "utf8", stdio: ["inherit", "pipe", "pipe"],
    });
    process.stdout.write(out.split("\n").slice(-14).join("\n") + "\n");
    return true;
  } catch (err) {
    const text = String(err.stdout ?? "") + String(err.stderr ?? "");
    const quota = /quota|exceeded|rate limit|high demand|RESOURCE_EXHAUSTED/i.test(text);
    console.log(quota
      ? dim(`    ${label}: every model is rate-limited — skipping, using what is stored`)
      : bad(`    ${label} failed: ${text.trim().split("\n").slice(-2).join(" ").slice(0, 160)}`));
    skipped.push(label + (quota ? " (model quota)" : " (error)"));
    return false;
  }
}

// ── the pipeline ─────────────────────────────────────────────────────────────

if (!CHECK_ONLY) {
  console.log(step("1 · The page as it is now"));
  run("capture:snapshot", "node", ["scripts/capture-snapshot.mjs"]);

  console.log(step("2 · What earlier experiments already proved"));
  // Seeded rather than invented at runtime: the agent has to have a memory to
  // consult before its first run, or "it checks what is settled" is untestable.
  run("seed:learnings", "node", ["scripts/seed-learnings.mjs"]);

  if (!FAST) {
    console.log(step(`3 · ${SESSIONS} visitors on the real site`));
    console.log(dim("    real browsers, real snippet, real ingestion — only the person is simulated"));
    run("swarm", "pnpm", ["exec", "tsx", "swarm/run.ts", "--sessions", String(SESSIONS)]);
  } else {
    skipped.push("traffic (--fast)");
  }

  console.log(step("4 · Roll the behaviour up"));
  run("aggregate", "pnpm", ["exec", "tsx", "scripts/aggregate.mjs"]);
  run("digests", "pnpm", ["exec", "tsx", "scripts/digests.mjs"]);

  if (!FAST) {
    console.log(step("5 · The agent diagnoses and proposes"));
    runAgent("agent:run", ["packages/agent/.venv/bin/python", "-m", "growthx_agent.orchestrator", "e2e"]);
  } else {
    skipped.push("agent:run (--fast)");
  }

  console.log(step("6 · The policy refuses, and that refusal becomes a request"));
  const draft = (await db.execute(sql`
    select id from experiments where site_id = ${SITE}
      and status in ('draft','pending_approval') order by created_at desc limit 1`)).rows?.[0];
  if (draft) {
    const denied = await api("/api/experiments/launch", { experimentId: String(draft.id) });
    console.log(denied.body.approvalId
      ? ok(`    refused by ${denied.body.policyId} → approval ${denied.body.approvalId}`)
      : dim(`    ${String(draft.id)}: ${denied.body.explain ?? denied.body.errors?.[0] ?? "already approved"}`));
  } else {
    console.log(dim("    no draft to launch — the agent did not propose one this run"));
  }

  console.log(step("7 · Concluding what has already run"));
  const running = (await db.execute(sql`
    select id from experiments where site_id = ${SITE} and status = 'running'`)).rows ?? [];
  for (const e of running) {
    // Only an experiment with enough traffic to read. Concluding an empty one
    // would produce a results screen with nothing on it.
    const n = (await db.execute(sql`
      select count(distinct session_id)::int as n from events
      where experiment_id = ${String(e.id)} and type = 'exposure'`)).rows?.[0]?.n ?? 0;
    if (Number(n) < 40) { console.log(dim(`    ${e.id}: only ${n} exposed sessions, leaving it running`)); continue; }
    const c = await api("/api/experiments/conclude", { experimentId: String(e.id) });
    console.log(c.body.ok ? ok(`    concluded ${e.id} (${n} sessions)`) : dim(`    ${e.id}: ${c.body.errors?.[0]}`));
  }

  if (!FAST) {
    const needsLearning = (await db.execute(sql`
      select id from experiments where site_id = ${SITE}
        and status = 'concluded' and learning_id is null limit 1`)).rows?.[0];
    if (needsLearning) {
      console.log(step("8 · The agent reads the result and writes what it proved"));
      runAgent("agent:evaluate", ["packages/agent/.venv/bin/python", "-m",
        "growthx_agent.orchestrator", "evaluate", String(needsLearning.id)]);
    }
  } else {
    skipped.push("agent:evaluate (--fast)");
  }

  console.log(step("9 · Leave a card in the approval queue"));
  console.log(dim("    shot 7 needs a pending request; approving it during a take consumes it"));
  run("demo:queue", "pnpm", ["exec", "tsx", "scripts/demo-queue.mjs"]);
}

// ── readiness ────────────────────────────────────────────────────────────────

console.log(step("Readiness — every screen a judge might click"));

const [summary, heat, opps, exps, learns, runs, policy, approvals] = await Promise.all([
  get("/api/summary"), get("/api/heatmap"), get("/api/opportunities"),
  get("/api/experiments"), get("/api/learnings"), get("/api/runs"),
  get("/api/policy"), get("/api/approvals"),
]);

const concluded = (exps.body.experiments ?? []).find((e) => e.status === "concluded");
const results = concluded
  ? (await get(`/api/results?experimentId=${concluded.id}`)).body : null;
const pending = (approvals.body.approvals ?? []).filter((a) => a.status === "pending");
const denials = (policy.body.decisions ?? []).filter((d) => d.decision === "deny");

const screens = [
  ["Overview", (summary.body.sessions ?? 0) > 0, `${summary.body.sessions ?? 0} sessions`, "pnpm swarm --sessions 160"],
  ["Heatmaps", (heat.body.elements ?? []).length > 0, `${(heat.body.elements ?? []).length} elements`, "pnpm aggregate"],
  ["Opportunities", (opps.body.opportunities ?? []).length > 0, `${(opps.body.opportunities ?? []).length} recorded`, "pnpm agent:run"],
  ["Experiments", (exps.body.experiments ?? []).length > 0, `${(exps.body.experiments ?? []).length} experiments`, "pnpm agent:run"],
  ["Variant diff", (exps.body.experiments ?? []).some((e) => (e.variants ?? []).some((v) => (v.mutations ?? []).length)), "a variant with mutations", "pnpm agent:run"],
  ["Approvals", pending.length > 0, `${pending.length} pending`, "pnpm demo:queue"],
  ["Policy", denials.length > 0, `${denials.length} refusals on record`, "pnpm check:policy"],
  ["Results", !!results?.arms?.length, results ? `${results.decision} · ${results.arms.length} arms` : "no concluded experiment", "pnpm e2e"],
  ["Learnings", (learns.body.learnings ?? []).length > 0, `${(learns.body.learnings ?? []).length} learnings`, "pnpm agent:evaluate <id>"],
  ["Run log", (runs.body.runs ?? []).length > 0, `${(runs.body.runs ?? []).length} runs`, "pnpm agent:run"],
];

let notReady = 0;
for (const [name, good, detail, fix] of screens) {
  console.log(good ? ok(`  ${name.padEnd(14)} ${detail}`) : bad(`  ${name.padEnd(14)} ${detail}`));
  if (!good) { console.log(dim(`    → ${fix}`)); notReady++; }
}

// The claim the video rests on, checked rather than assumed.
if (results) {
  console.log(step("The claim the video rests on"));
  const honest = results.decision !== "challenger_won" || results.arms.every((a) => a.exposed >= results.minSessionsPerArm);
  console.log(honest
    ? ok(`  the result is reported as "${results.decision}" and the screen does not overclaim`)
    : bad("  a win is being shown on an underpowered experiment"));
  if (results.divergence?.opposed) {
    console.log(ok("  the per-device divergence the average hides is surfaced"));
  }
  if (!honest) failures++;
}

if (skipped.length) {
  console.log(step("Skipped"));
  for (const s of skipped) console.log(dim(`  · ${s}`));
}

console.log("");
const mins = ((Date.now() - started) / 60000).toFixed(1);
if (failures || notReady) {
  console.log(bad(`${notReady} screen(s) not demo-ready, ${failures} stage(s) failed — ${mins} min`));
  console.log(dim(`  dashboard: ${env.GX_DASHBOARD_URL}`));
  process.exit(1);
}
console.log(ok(`Every screen has what it needs — ${mins} min`));
console.log(dim(`  dashboard: ${env.GX_DASHBOARD_URL}`));
console.log(dim(`  site A:    ${env.GX_SITE_A_URL}`));
