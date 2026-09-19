#!/usr/bin/env node
/**
 * Puts one experiment back into the approval queue, so shot 7 can be recorded
 * again after a take that already approved it.
 *
 * Deliberately goes through the API rather than writing `pending` into the
 * table: the request has to be *produced by the policy refusing the launch*,
 * which is the whole point of that beat. A row inserted by hand would look
 * identical on screen and would prove nothing.
 *
 * Usage: pnpm demo:queue [experimentId]
 */
import { getDb, sql } from "../packages/db/src/index.ts";
import { loadEnv, ok, bad, dim, step } from "./env.mjs";

const env = loadEnv();
const db = getDb(env.DATABASE_URL);

const EXP = process.argv[2] ?? (await db.execute(sql`
  select id from experiments where site_id = ${env.GX_SITE_ID}
    and status in ('running','pending_approval','rejected','draft')
  order by created_at desc limit 1`)).rows?.[0]?.id;

if (!EXP) { console.error(bad("no experiment found")); process.exit(1); }

console.log(step(`Returning ${EXP} to the queue`));
await db.execute(sql`delete from approvals where experiment_id = ${EXP}`);
await db.execute(sql`update experiments set status='draft', started_at=null where id=${EXP}`);
// One experiment per path is policy, so anything else live would make the
// launch refuse for the wrong reason and no request would be created.
await db.execute(sql`
  update experiments set status='killed', concluded_at=now()
  where site_id=${env.GX_SITE_ID} and status='running' and id <> ${EXP}`);

const res = await fetch(`${env.GX_API_BASE}/api/experiments/launch`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ site: env.GX_SITE_ID, experimentId: EXP }),
});
const body = await res.json();

if (!body.approvalId) {
  console.log(bad("no approval was created"));
  console.log(dim(`    refused by ${body.policyId}: ${body.explain}`));
  process.exit(1);
}
console.log(ok(`pending: ${body.approvalId}`));
console.log(dim(`    refused by ${body.policyId} — that refusal is the request`));
console.log(dim(`    open ${env.GX_DASHBOARD_URL}/approvals`));
