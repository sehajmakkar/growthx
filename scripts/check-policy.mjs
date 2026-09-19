#!/usr/bin/env node
/**
 * Proves the policy gate refuses things, against the deployed API.
 *
 * The test that matters is not "an allowed action succeeded" — that looks
 * identical to having no gate at all. It is that specific actions are refused,
 * that the refusal names the policy responsible, and that a human approval
 * does not unlock the rules that are meant to be absolute.
 *
 * Every request here goes over HTTPS to the real Lambda, deliberately. A gate
 * that only holds in a unit test is a gate the agent can walk around by
 * calling the API, which is exactly what the agent does.
 *
 * Usage: node scripts/check-policy.mjs
 */
import { loadEnv, ok, bad, dim, step } from "./env.mjs";

const env = loadEnv();
const API = env.GX_API_BASE, SITE = env.GX_SITE_ID;

let failures = 0;
const check = (pass, msg, detail) => {
  console.log(pass ? ok(msg) : bad(msg));
  if (detail) console.log(dim("    " + detail));
  if (!pass) failures++;
};

const post = async (path, body) => {
  const res = await fetch(API + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ site: SITE, ...body }),
  });
  return { status: res.status, body: await res.json() };
};

const learnings = await (await fetch(`${API}/api/learnings?site=${SITE}`)).json();
const learningId = learnings.learnings?.[0]?.id;
if (!learningId) { console.error(bad("no learnings — run pnpm seed:learnings")); process.exit(1); }

const HYPOTHESIS =
  "Mobile visitors who stall before pricing will convert more often if the offer is restated above the fold; disproved if conversion does not move.";

console.log(step("The policy file is loaded and enforcing"));
const doc = await (await fetch(`${API}/api/policy?site=${SITE}`)).json();
check(Array.isArray(doc.ids) && doc.ids.length >= 7,
  `${doc.ids?.length ?? 0} policies loaded in the Lambda`,
  (doc.ids ?? []).join(", "));
check(String(doc.source ?? "").includes("forbid"),
  "the policy source is served to the dashboard, so the rules are readable");

console.log(step("The agent cannot touch pricing — the case that used to succeed"));
const pricing = await post("/api/experiments", {
  path: "/", hypothesis: HYPOTHESIS, citedLearnings: [learningId],
  variants: [{
    label: "undercut", rationale: "lower the price",
    mutations: [{ op: "replace_text", selector: "div.tier.tier-1 > p.tier-price", value: "$9", note: "undercut" }],
  }],
});
check(pricing.status === 403, "rewriting the price is refused with 403", `got ${pricing.status}`);
check(pricing.body.policyId === "forbid-pricing-and-checkout",
  "the refusal names the policy that caused it",
  `policyId: ${pricing.body.policyId}`);
check((pricing.body.deniedSelectors ?? []).includes("div.tier.tier-1 > p.tier-price"),
  "the refusal names the selector, so the agent can retry with something else");

console.log(step("Launching needs a human, and the approval is read from the database"));
const drafts = await (await fetch(`${API}/api/experiments?site=${SITE}`)).json();
const draft = (drafts.experiments ?? []).find((e) => e.status === "draft");
if (!draft) {
  check(false, "a draft experiment exists to try launching", "none found — run the agent's propose step");
} else {
  const launch = await post("/api/experiments/launch", { experimentId: draft.id });
  const denied = launch.status === 403;
  check(denied, `launching ${draft.id} is refused`, `got ${launch.status}`);
  check(["forbid-launch-without-approval", "forbid-concurrent-experiment-on-path"]
        .includes(launch.body.policyId),
    "the refusal names a launch policy",
    `policyId: ${launch.body.policyId} — ${launch.body.explain}`);
  // Forging approval in the request body must change nothing: the gate reads
  // the approval from the database, never from the caller.
  const forged = await post("/api/experiments/launch", {
    experimentId: draft.id, approvedBy: "definitely-a-human", approved: true,
  });
  check(forged.status === 403,
    "claiming approval in the request body does not launch it",
    `got ${forged.status} — approval is read from the approvals table, not the caller`);
}

console.log(step("Every decision was recorded, refusals included"));
const after = await (await fetch(`${API}/api/policy?site=${SITE}`)).json();
const denials = (after.decisions ?? []).filter((d) => d.decision === "deny");
check(denials.length > 0,
  `${denials.length} refusals are on the record and render in the dashboard`,
  denials.slice(0, 3).map((d) => `${d.policy_id} — ${d.action}`).join("  |  "));
check((after.decisions ?? []).every((d) => d.explain),
  "every decision carries a sentence explaining itself");

console.log(failures ? `\n${bad(`${failures} check(s) failed.`)}\n` : `\n${ok("The gate refuses, names its reason, and records it.")}\n`);
process.exit(failures ? 1 : 0);
