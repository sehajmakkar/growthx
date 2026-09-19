import { sql } from "drizzle-orm";
import type { Db } from "@growthx/db";
import { newId } from "@growthx/shared/runtime";
import { validateMutations } from "@growthx/shared";
import { gate, describeTargets, refusal, type Mutation, type OutlineElement } from "./gate.js";

/**
 * Proposing an experiment.
 *
 * The variants are checked before anything is stored: every selector must
 * resolve to exactly one element in the current page outline, every op must be
 * in the closed set, and every value must pass its allowlist (PLAN §4.4). A
 * variant whose selectors do not resolve would apply cleanly and change
 * nothing — the dashboard would fill with experiments and the page would never
 * move, which is the failure mode the P6 gate existed to rule out.
 *
 * The hypothesis must also cite prior learnings. That is what stops the agent
 * re-testing settled questions, and it is the part of the product that is not
 * simply a variant generator.
 */
export async function proposeExperiment(
  db: Db, siteId: string, path: string,
  input: {
    hypothesis: string;
    citedLearnings: string[];
    variants: { label: string; rationale: string; mutations: unknown }[];
    opportunityId?: string;
    runId?: string;
  }
) {
  const snap = (await db.execute<Record<string, unknown>>(sql`
    select elements from snapshots
    where site_id = ${siteId} and path = ${path} and is_current = true limit 1`)).rows?.[0];

  if (!snap) return { stored: false, errors: ["no current page outline; run capture:snapshot"] };
  const elements = snap.elements as Parameters<typeof validateMutations>[1];

  if (!input.hypothesis || input.hypothesis.length < 40) {
    return { stored: false, errors: ["hypothesis must be a full falsifiable statement"] };
  }
  if (!input.citedLearnings?.length) {
    return {
      stored: false,
      errors: ["cite at least one prior learning by id, or state which you checked and why none applied"],
    };
  }

  const known = (await db.execute<Record<string, unknown>>(sql`
    select id from learnings where site_id = ${siteId}`)).rows ?? [];
  const knownIds = new Set(known.map((l) => String(l.id)));
  const unknownCited = input.citedLearnings.filter((id) => id !== "none" && !knownIds.has(id));
  if (unknownCited.length) {
    return { stored: false, errors: [`no learning with id ${unknownCited.join(", ")}`] };
  }

  // Validate every challenger before writing anything.
  const checked: { label: string; rationale: string; mutations: unknown[]; validation: unknown }[] = [];
  const errors: string[] = [];

  for (const v of input.variants ?? []) {
    const result = validateMutations(v.mutations, elements);
    if (!result.ok) {
      for (const e of result.errors.slice(0, 4)) {
        const hint = e.nearest?.length ? ` — did you mean: ${e.nearest.slice(0, 3).join(" , ")}` : "";
        errors.push(`${v.label}: ${e.op} "${e.selector}" ${e.reason}${hint}`);
      }
      continue;
    }
    checked.push({
      label: v.label,
      rationale: v.rationale,
      mutations: result.mutations,
      validation: {
        selectorsChecked: result.selectorsChecked,
        selectorsMatched: result.selectorsMatched,
        liveCheck: "pending",
        checkedAt: new Date().toISOString(),
      },
    });
  }

  if (errors.length || checked.length === 0) {
    return { stored: false, errors: errors.length ? errors : ["no valid variants"] };
  }

  // The policy gate. It runs after validation — a proposal must be well-formed
  // before it is worth asking whether it is permitted — and before any write,
  // so a refused proposal leaves no experiment behind.
  //
  // What Cedar is told comes from the page's own outline: which named regions
  // these selectors sit in, and whether any of them is marked data-gx-deny.
  // Deriving that here rather than in the policy is deliberate; the policy
  // should read as a rule, not as a selector parser.
  const targets = describeTargets(
    checked.flatMap((v) => v.mutations as Mutation[]),
    elements as unknown as OutlineElement[]
  );
  const decision = await gate(db, siteId, {
    action: "create_experiment",
    resource: {
      type: "Experiment",
      id: "proposed",
      attrs: {
        regions: targets.regions,
        touchesProtected: targets.touchesProtected,
        path,
      },
    },
    context: { citedLearnings: input.citedLearnings.join(",") },
  }, { runId: input.runId ?? null });

  if (decision.decision === "deny") {
    return {
      ...refusal(decision),
      // Naming the offending selectors turns a refusal into something the agent
      // can act on: it retries targeting something it is allowed to touch.
      deniedSelectors: targets.protectedSelectors.length
        ? targets.protectedSelectors
        : targets.selectors,
      regions: targets.regions,
    };
  }

  const experimentId = newId("exp");
  const controlId = `${experimentId}_control`;
  const split: Record<string, number> = { [controlId]: 50 };
  const share = Math.floor(50 / checked.length);
  checked.forEach((_, i) => { split[`${experimentId}_v${i + 1}`] = share; });

  await db.execute(sql`
    insert into experiments (id, site_id, path, opportunity_id, hypothesis, status, split, guardrail, auto_stop)
    values (${experimentId}, ${siteId}, ${path}, ${input.opportunityId ?? null}, ${input.hypothesis},
            'draft', ${JSON.stringify(split)}::jsonb,
            ${JSON.stringify({ metric: "lead_quality", direction: "not_below", threshold: 0.95 })}::jsonb,
            ${JSON.stringify({ maxDays: 14, minSessionsPerArm: 400, guardrailBreachPct: 5 })}::jsonb)`);

  await db.execute(sql`
    insert into variants (id, experiment_id, label, is_control, rationale, mutations, validation)
    values (${controlId}, ${experimentId}, 'Control — as shipped', true,
            'The page as the team built it.', ${JSON.stringify([])}::jsonb,
            ${JSON.stringify({ liveCheck: "passed", selectorsChecked: 0, selectorsMatched: 0 })}::jsonb)`);

  for (const [i, v] of checked.entries()) {
    await db.execute(sql`
      insert into variants (id, experiment_id, label, is_control, rationale, mutations, validation)
      values (${`${experimentId}_v${i + 1}`}, ${experimentId}, ${v.label}, false, ${v.rationale},
              ${JSON.stringify(v.mutations)}::jsonb, ${JSON.stringify(v.validation)}::jsonb)`);
  }

  return {
    stored: true,
    experimentId,
    variants: checked.map((v) => ({
      label: v.label,
      mutations: (v.mutations as unknown[]).length,
      selectorsMatched: (v.validation as { selectorsMatched: number }).selectorsMatched,
    })),
  };
}

export async function listExperiments(db: Db, siteId: string) {
  const exps = (await db.execute<Record<string, unknown>>(sql`
    select id, path, hypothesis, status, split, opportunity_id, created_at, started_at
    from experiments where site_id = ${siteId} order by created_at desc limit 20`)).rows ?? [];

  const out = [];
  for (const e of exps) {
    const variants = (await db.execute<Record<string, unknown>>(sql`
      select id, label, is_control, rationale, mutations, validation
      from variants where experiment_id = ${String(e.id)} order by is_control desc`)).rows ?? [];
    out.push({ ...e, variants });
  }
  return out;
}

/**
 * Putting an experiment in front of real visitors.
 *
 * This is the one action in the system that changes what a stranger sees, so
 * it is the one the gate exists for. The approval is not looked up by an `if`
 * and then acted on — it is passed to Cedar as request context, and
 * `forbid-launch-without-approval` is what refuses. The difference matters on
 * the day someone adds a second way to launch: the rule lives in one file, not
 * in each call site.
 */
export async function launchExperiment(
  db: Db, siteId: string, input: { experimentId: string; runId?: string }
) {
  const exp = (await db.execute<Record<string, unknown>>(sql`
    select id, status, path from experiments
    where id = ${input.experimentId} and site_id = ${siteId} limit 1`)).rows?.[0];
  if (!exp) return { launched: false, errors: [`no experiment ${input.experimentId}`] };

  // An approval the agent cannot forge: it is read from the database, written
  // by the human-facing approval route, never taken from the request body.
  const approval = (await db.execute<Record<string, unknown>>(sql`
    select id, decided_by, status from approvals
    where experiment_id = ${input.experimentId} and action = 'launch_experiment' and status = 'approved'
    order by decided_at desc limit 1`)).rows?.[0];

  const variants = (await db.execute<Record<string, unknown>>(sql`
    select mutations from variants where experiment_id = ${input.experimentId}`)).rows ?? [];
  const snap = (await db.execute<Record<string, unknown>>(sql`
    select elements from snapshots
    where site_id = ${siteId} and path = ${String(exp.path)} and is_current = true limit 1`)).rows?.[0];

  const targets = describeTargets(
    variants.flatMap((v) => (v.mutations as Mutation[]) ?? []),
    ((snap?.elements ?? []) as OutlineElement[])
  );

  // Is something already live on this page? Counted here rather than asserted
  // in the policy, for the same reason as the regions above: the policy states
  // the rule, the API supplies the facts.
  const concurrent = (await db.execute<Record<string, unknown>>(sql`
    select count(*)::int as n from experiments
    where site_id = ${siteId} and path = ${String(exp.path)}
      and status = 'running' and id <> ${input.experimentId}`)).rows?.[0];

  const decision = await gate(db, siteId, {
    action: "launch_experiment",
    resource: {
      type: "Experiment",
      id: input.experimentId,
      attrs: {
        regions: targets.regions,
        touchesProtected: targets.touchesProtected,
        status: String(exp.status),
        pathHasRunning: Number(concurrent?.n ?? 0) > 0,
      },
    },
    context: { approvedBy: approval ? String(approval.decided_by ?? "") : "" },
  }, { runId: input.runId ?? null });

  if (decision.decision === "deny") return { launched: false, ...refusal(decision) };

  await db.execute(sql`
    update experiments set status = 'running', started_at = now()
    where id = ${input.experimentId}`);

  return {
    launched: true,
    experimentId: input.experimentId,
    approvedBy: approval ? String(approval.decided_by) : null,
    policyId: decision.policyId,
    decisionId: decision.decisionId,
  };
}

/** Recent policy decisions, newest first. Denials included — especially. */
export async function listPolicyDecisions(db: Db, siteId: string, limit = 50) {
  const res = await db.execute<Record<string, unknown>>(sql`
    select id, action, resource, decision, policy_id, reasons, explain,
           resource_attrs, context, run_id, created_at
    from policy_decisions where site_id = ${siteId}
    order by created_at desc limit ${limit}`);
  return res.rows ?? [];
}
