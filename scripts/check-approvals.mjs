#!/usr/bin/env node
/**
 * Proves the human gate, both branches, against the deployed API.
 *
 * The claim being tested is not "there is an approvals screen". It is that
 * nothing reaches a visitor without a human name attached to it, that the
 * queue is produced by the policy rather than sitting beside it, and that a
 * rejection is feedback rather than a door closing.
 *
 * The most important assertion here is the negative one: a refusal a human
 * could never lift must NOT appear in the queue. An Approve button on a
 * pricing variant would be a lie about what that button does.
 *
 * This leaves the experiment running, which is the state the demo wants.
 *
 * Usage: node scripts/check-approvals.mjs [experimentId]
 */
import { getDb, sql } from "../packages/db/src/index.ts";
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
const post = async (path, body) => {
  const res = await fetch(API + path, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ site: SITE, ...body }),
  });
  return { status: res.status, body: await res.json() };
};
const get = async (path) => (await fetch(`${API}${path}${path.includes("?") ? "&" : "?"}site=${SITE}`)).json();

// Pick the experiment under test and put it back to square one, so the check
// can be run repeatedly rather than only against a lucky starting state.
const EXP = process.argv[2] ?? (await db.execute(sql`
  select id from experiments where site_id = ${SITE}
    and status in ('draft','pending_approval','rejected','running')
  order by created_at desc limit 1`)).rows?.[0]?.id;
if (!EXP) { console.error(bad("no experiment to test with")); process.exit(1); }

console.log(step(`Resetting ${EXP} and clearing the path`));
await db.execute(sql`delete from approvals where experiment_id = ${EXP}`);
await db.execute(sql`update experiments set status = 'draft', started_at = null where id = ${EXP}`);
// One experiment per path is policy (P17), so anything else live would refuse
// the launch for a different reason than the one under test here.
await db.execute(sql`
  update experiments set status = 'killed', concluded_at = now()
  where site_id = ${SITE} and status = 'running' and id <> ${EXP}`);
console.log(dim(`    ${EXP} is a draft, nothing else is running`));

console.log(step("The refusal becomes the request"));
const denied = await post("/api/experiments/launch", { experimentId: EXP });
check(denied.status === 403 && denied.body.launched === false,
  "the agent cannot launch on its own", `HTTP ${denied.status}`);
check(denied.body.policyId === "forbid-launch-without-approval",
  "refused for want of an approval", denied.body.policyId);
check(denied.body.approvalRequested === true && denied.body.approvalId,
  "that refusal created a pending request", denied.body.approvalId);

const again = await post("/api/experiments/launch", { experimentId: EXP });
check(again.body.approvalId === denied.body.approvalId && again.body.approvalRequested === false,
  "retrying does not pile up duplicate requests",
  "the agent retries within a run; the human should see one card");

const queue = (await get("/api/approvals")).approvals ?? [];
const item = queue.find((a) => a.id === denied.body.approvalId);
check(!!item, "it is in the queue");
check(item?.cedar_decision?.policyId === "forbid-launch-without-approval",
  "the card carries the decision that created it, not a paraphrase");
check((item?.variants ?? []).length >= 2,
  "the variants under review travel with it",
  `${item?.variants?.length ?? 0} variants — a human cannot judge a launch without seeing the change`);

console.log(step("A refusal no human could lift is never queued"));
const learnings = await get("/api/learnings");
const pricing = await post("/api/experiments", {
  path: "/",
  hypothesis: "Cutting the displayed price will raise conversion; disproved if conversion does not move at all.",
  citedLearnings: [learnings.learnings?.[0]?.id],
  variants: [{ label: "undercut", rationale: "lower the price", mutations: [
    { op: "replace_text", selector: "div.tier.tier-1 > p.tier-price", value: "$9", note: "undercut" }] }],
});
check(pricing.status === 403, "the pricing variant is still refused");
const queueAfter = (await get("/api/approvals")).approvals ?? [];
check(queueAfter.length === queue.length,
  "it did not appear in the approval queue",
  "offering an Approve button that cannot work would misrepresent the button");

console.log(step("A decision needs a name, and a rejection needs a reason"));
const noReason = await post("/api/approvals", { approvalId: item.id, decision: "reject", decidedBy: "sehaj" });
check(noReason.body.ok === false, "rejecting without a reason is refused", noReason.body.errors?.[0]);
const noName = await post("/api/approvals", { approvalId: item.id, decision: "approve", decidedBy: "" });
check(noName.body.ok === false, "approving without a name is refused", noName.body.errors?.[0]);

console.log(step("Rejecting teaches the agent"));
const REASON = "Promises a demo that page does not have.";
const rejected = await post("/api/approvals", {
  approvalId: item.id, decision: "reject", decidedBy: "sehaj@growthx", reason: REASON });
check(rejected.body.ok === true, "the rejection is recorded");
const fb = await get("/api/feedback");
check((fb.rejections ?? []).some((r) => r.rejection_reason === REASON),
  "the reason is on the endpoint the agent reads before proposing",
  "get_rejection_feedback — a rejection that never reaches the next run is just a door closing");
const st = (await db.execute(sql`select status from experiments where id = ${EXP}`)).rows?.[0];
check(String(st?.status) === "rejected",
  "the experiment is marked rejected, not deleted",
  "the agent needs what it proposed to still exist in order to learn from the refusal");

console.log(step("Approving puts it in front of real visitors"));
await db.execute(sql`delete from approvals where experiment_id = ${EXP}`);
await db.execute(sql`update experiments set status = 'draft' where id = ${EXP}`);
const re = await post("/api/experiments/launch", { experimentId: EXP });
const approved = await post("/api/approvals", {
  approvalId: re.body.approvalId, decision: "approve", decidedBy: "sehaj@growthx" });
check(approved.body.ok === true, "the approval is recorded against a name");

const launched = await post("/api/experiments/launch", { experimentId: EXP });
check(launched.body.launched === true, "it launches", `policy: ${launched.body.policyId}`);
check(launched.body.approvedBy === "sehaj@growthx",
  "the launch records who permitted it",
  "read from the approvals table, never from the caller");

const manifest = await (await fetch(`${env.GX_CDN_URL}/manifest?site=${SITE}&path=/`)).json();
check((manifest.experiments ?? []).some((e) => e.id === EXP),
  "it is in the manifest real visitors fetch",
  `edge-cached for 30s, so it is live within that`);

console.log(failures ? `\n${bad(`${failures} check(s) failed.`)}\n` : `\n${ok("Nothing reaches a visitor without a human name on it.")}\n`);
process.exit(failures ? 1 : 0);
