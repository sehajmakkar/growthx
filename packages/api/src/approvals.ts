import { sql } from "drizzle-orm";
import type { Db } from "@growthx/db";
import { newId } from "@growthx/shared/runtime";
import type { PolicyDecision } from "./policy.js";

/**
 * The human gate.
 *
 * The queue is not a workflow bolted on beside the policy — it is what the
 * policy produces. When the agent tries to launch and Cedar refuses with
 * `forbid-launch-without-approval`, that refusal *is* the request for
 * approval, and it arrives here carrying the decision that created it.
 *
 * The distinction that makes this more than a rubber stamp: only a refusal a
 * human could lift becomes a request. A variant refused for touching pricing
 * is never queued, because there is no approval that would unlock it — putting
 * it in front of a human with an Approve button would be a lie about what that
 * button does.
 */

/** Refusals a human is permitted to overrule. Everything else is absolute. */
const APPROVABLE = new Set(["forbid-launch-without-approval"]);

export function isApprovable(d: PolicyDecision): boolean {
  if (d.decision === "allow") return false;
  // Every matched forbid must be approvable, not just the first. A launch that
  // lacks approval *and* touches pricing must not become a pending request.
  return d.reasons.length > 0 && d.reasons.every((r) => APPROVABLE.has(r));
}

/**
 * Turn a refusal into a pending request, unless one is already open.
 *
 * Idempotent on purpose: the agent may retry a launch several times in a run,
 * and a queue that grew a new card each time would bury the human in
 * duplicates of one decision.
 */
export async function requestApproval(
  db: Db, siteId: string, experimentId: string, decision: PolicyDecision
): Promise<{ approvalId: string; created: boolean } | null> {
  if (!isApprovable(decision)) return null;

  const open = (await db.execute<Record<string, unknown>>(sql`
    select id from approvals
    where experiment_id = ${experimentId} and action = 'launch_experiment'
      and status = 'pending' limit 1`)).rows?.[0];
  if (open) return { approvalId: String(open.id), created: false };

  const id = newId("apr");
  await db.execute(sql`
    insert into approvals (id, experiment_id, action, cedar_decision, requested_by, status)
    values (${id}, ${experimentId}, 'launch_experiment',
            ${JSON.stringify(decision)}::jsonb, 'agent:growth-orchestrator', 'pending')`);
  // The experiment's own status has to move too. "draft" means nobody has been
  // asked; "pending_approval" means somebody has and has not answered. A queue
  // that left the experiment in draft would be a to-do list nothing reflects.
  await db.execute(sql`
    update experiments set status = 'pending_approval'
    where id = ${experimentId} and status = 'draft'`);
  return { approvalId: id, created: true };
}

export async function listApprovals(db: Db, siteId: string) {
  const rows = (await db.execute<Record<string, unknown>>(sql`
    select a.id, a.experiment_id, a.action, a.status, a.cedar_decision,
           a.requested_at, a.requested_by, a.decided_at, a.decided_by,
           a.rejection_reason,
           e.hypothesis, e.path, e.status as experiment_status, e.split
    from approvals a
    join experiments e on e.id = a.experiment_id
    where e.site_id = ${siteId}
    order by (a.status = 'pending') desc, a.requested_at desc
    limit 40`)).rows ?? [];

  // The variants under review. A human cannot judge "approve this launch"
  // without seeing what would actually change on the page.
  const out = [];
  for (const r of rows) {
    const variants = (await db.execute<Record<string, unknown>>(sql`
      select id, label, is_control, rationale, mutations
      from variants where experiment_id = ${String(r.experiment_id)}
      order by is_control desc`)).rows ?? [];
    out.push({ ...r, variants });
  }
  return out;
}

/**
 * Approve or reject. Rejection requires a reason, and the reason is the point:
 * it is read back to the agent on its next run, so a rejection teaches rather
 * than merely blocks.
 */
export async function decideApproval(
  db: Db, siteId: string,
  input: { approvalId: string; decision: "approve" | "reject"; decidedBy: string; reason?: string }
) {
  const row = (await db.execute<Record<string, unknown>>(sql`
    select a.id, a.experiment_id, a.status
    from approvals a join experiments e on e.id = a.experiment_id
    where a.id = ${input.approvalId} and e.site_id = ${siteId} limit 1`)).rows?.[0];

  if (!row) return { ok: false, errors: [`no approval ${input.approvalId}`] };
  if (String(row.status) !== "pending") {
    return { ok: false, errors: [`approval ${input.approvalId} was already ${row.status}`] };
  }
  if (!input.decidedBy?.trim()) {
    return { ok: false, errors: ["decidedBy is required — an approval without a name attached is not an approval"] };
  }
  if (input.decision === "reject" && !input.reason?.trim()) {
    return { ok: false, errors: ["a rejection needs a reason; the agent reads it on its next run"] };
  }

  await db.execute(sql`
    update approvals
    set status = ${input.decision === "approve" ? "approved" : "rejected"}::approval_status,
        decided_at = now(),
        decided_by = ${input.decidedBy.trim()},
        rejection_reason = ${input.reason?.trim() ?? null}
    where id = ${input.approvalId}`);

  // A rejected experiment is marked rejected, not deleted. The agent needs the
  // thing it proposed to still exist in order to learn from why it was turned
  // down, and "rejected" is a different fact from "never finished".
  if (input.decision === "reject") {
    await db.execute(sql`
      update experiments set status = 'rejected' where id = ${String(row.experiment_id)}`);
  }

  return {
    ok: true,
    approvalId: input.approvalId,
    experimentId: String(row.experiment_id),
    decision: input.decision,
  };
}

/**
 * Stop a running experiment. `killed`, not `concluded`: an experiment somebody
 * pulled and one that ran its course are different facts, and a learning must
 * never be written from the first. The kill switch is an explicit transition
 * rather than an error path.
 *
 * The manifest is edge-cached for 30 seconds, which is therefore also the
 * upper bound on how long a killed variant can still be served.
 */
export async function stopExperiment(
  db: Db, siteId: string, input: { experimentId: string; reason?: string }
) {
  const res = await db.execute<Record<string, unknown>>(sql`
    update experiments set status = 'killed', concluded_at = now()
    where id = ${input.experimentId} and site_id = ${siteId} and status = 'running'
    returning id`);
  if (!res.rows?.length) return { ok: false, errors: [`${input.experimentId} is not running`] };
  return { ok: true, experimentId: input.experimentId, stoppedAt: new Date().toISOString() };
}

/**
 * What the agent is told about its rejected proposals.
 *
 * Read by the agent before it proposes anything, alongside the learnings. A
 * rejection that never reaches the next run is just a door closing; this is
 * what makes it feedback.
 */
export async function rejectionFeedback(db: Db, siteId: string) {
  const rows = (await db.execute<Record<string, unknown>>(sql`
    select a.experiment_id, a.rejection_reason, a.decided_by, a.decided_at,
           e.hypothesis
    from approvals a join experiments e on e.id = a.experiment_id
    where e.site_id = ${siteId} and a.status = 'rejected'
      and a.rejection_reason is not null
    order by a.decided_at desc limit 20`)).rows ?? [];
  return rows;
}
