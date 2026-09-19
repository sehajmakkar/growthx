import { sql } from "drizzle-orm";
import type { Db } from "@growthx/db";
import { newId } from "@growthx/shared/runtime";
import { wilson, differenceInterval, pValue, requiredPerArm, decide, pct, type DecisionState } from "./stats.js";

/**
 * Reading an experiment.
 *
 * Every number here is computed in SQL and arithmetic in TypeScript. The agent
 * is handed the finished figures and asked to explain them. It is never asked
 * to work them out, because a statistic a language model calculated is a
 * statistic nobody can check.
 *
 * On the guardrail: the seeded experiments name `lead_quality`, which is not
 * observable from client-side behaviour — we can see what someone did on the
 * page, not whether the lead was any good weeks later. Rather than invent a
 * number for it, the guardrail tracks *friction*: the share of sessions that
 * rage-clicked or dead-clicked. It is a real measurement of a real risk. A
 * variant that wins conversions by confusing people is not a win, and that is
 * the failure friction catches.
 */

export interface ArmResult {
  variantId: string;
  label: string;
  isControl: boolean;
  exposed: number;
  converted: number;
  rate: number;
  ci: { lo: number; hi: number };
  frictionSessions: number;
  frictionRate: number;
  /** Against control. Null on the control arm itself. */
  diff: { point: number; lo: number; hi: number; p: number | null } | null;
}

export interface SegmentResult {
  segment: string;
  arms: { variantId: string; exposed: number; converted: number; rate: number }[];
  /** True when no arm in this row has enough sessions to say anything. */
  underpowered: boolean;
}

async function armCounts(db: Db, experimentId: string, variantIds: string[], extraWhere = sql``) {
  if (!variantIds.length) return [];
  // An explicit IN list rather than `= any($1)`: the Neon HTTP driver does not
  // bind a JS array as a Postgres array, and the query fails at parse time.
  const ids = sql.join(variantIds.map((v) => sql`${v}`), sql`, `);
  // Joining against the experiment's own variant list matters: a stale
  // assignment carried in session storage can attach a variant id from a
  // different experiment to these events, and counting it would quietly
  // inflate an arm.
  const res = await db.execute<Record<string, unknown>>(sql`
    with exposed as (
      select distinct variant_id, session_id
      from events
      where experiment_id = ${experimentId} and type = 'exposure'
        and variant_id in (${ids}) ${extraWhere}
    ),
    converted as (
      select distinct variant_id, session_id
      from events
      where experiment_id = ${experimentId} and type = 'conversion'
        and variant_id in (${ids}) ${extraWhere}
    ),
    friction as (
      select distinct variant_id, session_id
      from events
      where experiment_id = ${experimentId} and type in ('rage_click','dead_click')
        and variant_id in (${ids}) ${extraWhere}
    )
    select e.variant_id,
           count(distinct e.session_id)::int as exposed,
           count(distinct c.session_id)::int as converted,
           count(distinct f.session_id)::int as friction
    from exposed e
    left join converted c on c.variant_id = e.variant_id and c.session_id = e.session_id
    left join friction  f on f.variant_id = e.variant_id and f.session_id = e.session_id
    group by e.variant_id`);
  return res.rows ?? [];
}

export async function experimentResults(db: Db, siteId: string, experimentId: string) {
  const exp = (await db.execute<Record<string, unknown>>(sql`
    select id, path, hypothesis, status, split, guardrail, auto_stop,
           started_at, concluded_at, learning_id, opportunity_id
    from experiments where id = ${experimentId} and site_id = ${siteId} limit 1`)).rows?.[0];
  if (!exp) return null;

  const variantRows = (await db.execute<Record<string, unknown>>(sql`
    select id, label, is_control, rationale, mutations
    from variants where experiment_id = ${experimentId}
    order by is_control desc`)).rows ?? [];
  const variantIds = variantRows.map((v) => String(v.id));

  const counts = new Map<string, Record<string, unknown>>();
  for (const r of await armCounts(db, experimentId, variantIds)) {
    counts.set(String(r.variant_id), r);
  }

  const control = variantRows.find((v) => v.is_control === true);
  const controlId = control ? String(control.id) : variantIds[0];
  const cRow = counts.get(controlId ?? "");
  const cExposed = Number(cRow?.exposed ?? 0);
  const cConverted = Number(cRow?.converted ?? 0);
  const cFriction = Number(cRow?.friction ?? 0);

  const arms: ArmResult[] = variantRows.map((v) => {
    const id = String(v.id);
    const row = counts.get(id);
    const exposed = Number(row?.exposed ?? 0);
    const converted = Number(row?.converted ?? 0);
    const friction = Number(row?.friction ?? 0);
    const isControl = id === controlId;
    return {
      variantId: id,
      label: String(v.label),
      isControl,
      exposed,
      converted,
      rate: exposed ? converted / exposed : 0,
      ci: wilson(converted, exposed),
      frictionSessions: friction,
      frictionRate: exposed ? friction / exposed : 0,
      diff: isControl ? null : {
        point: (exposed ? converted / exposed : 0) - (cExposed ? cConverted / cExposed : 0),
        ...differenceInterval(cConverted, cExposed, converted, exposed),
        p: pValue(cConverted, cExposed, converted, exposed),
      },
    };
  });

  // Guardrail: friction must not rise materially against control.
  const guardrail = (exp.guardrail ?? {}) as { threshold?: number };
  const tolerance = 1 + (guardrail.threshold != null ? 1 - Number(guardrail.threshold) : 0.05);
  const controlFrictionRate = cExposed ? cFriction / cExposed : 0;
  const breaches = arms.filter((a) =>
    !a.isControl && controlFrictionRate > 0 && a.frictionRate > controlFrictionRate * tolerance);

  const autoStop = (exp.auto_stop ?? {}) as { minSessionsPerArm?: number };
  const minPerArm = Number(autoStop.minSessionsPerArm ?? 400);

  const challenger = arms.find((a) => !a.isControl);
  const decision = decide({
    controlSuccess: cConverted, controlTrials: cExposed,
    challengerSuccess: challenger?.converted ?? 0,
    challengerTrials: challenger?.exposed ?? 0,
    minPerArm,
    guardrailBreached: breaches.length > 0,
  });

  // What it would take to settle the question at the size difference observed.
  const observed = Math.abs(challenger?.diff?.point ?? 0);
  const needed = requiredPerArm(cExposed ? cConverted / cExposed : 0, observed || 0.02);

  // Per-device breakdown. A result that only holds on one device is a different
  // finding from one that holds everywhere, and the agent must not claim the
  // second when it has the first.
  const segments: SegmentResult[] = [];
  for (const device of ["mobile", "desktop"]) {
    const rows = await armCounts(db, experimentId, variantIds,
      sql` and session_id in (select id from sessions where device = ${device})`);
    const byId = new Map(rows.map((r) => [String(r.variant_id), r]));
    const segArms = variantIds.map((id) => {
      const exposed = Number(byId.get(id)?.exposed ?? 0);
      const converted = Number(byId.get(id)?.converted ?? 0);
      return { variantId: id, exposed, converted, rate: exposed ? converted / exposed : 0 };
    });
    segments.push({
      segment: `device=${device}`,
      arms: segArms,
      underpowered: segArms.some((a) => a.exposed < minPerArm),
    });
  }

  // Segments moving in opposite directions is the finding an overall average
  // hides, and it is the one a reader most needs. Computed here rather than
  // left for the agent to notice: it is arithmetic on numbers we already have,
  // and anything deterministic stays out of the model (PLAN §2.2).
  const divergence = (() => {
    const deltas = segments.map((s) => {
      const c = s.arms.find((a) => a.variantId === controlId);
      const v = s.arms.find((a) => a.variantId !== controlId);
      return {
        segment: s.segment,
        delta: (v?.rate ?? 0) - (c?.rate ?? 0),
        exposed: Math.min(c?.exposed ?? 0, v?.exposed ?? 0),
        underpowered: s.underpowered,
      };
    }).filter((d) => d.exposed > 0);
    const up = deltas.filter((d) => d.delta > 0.005);
    const down = deltas.filter((d) => d.delta < -0.005);
    return {
      opposed: up.length > 0 && down.length > 0,
      deltas,
      // Stated separately from `opposed` so a reader cannot take the direction
      // as proven. It is a direction worth testing, not a result.
      allUnderpowered: deltas.every((d) => d.underpowered),
    };
  })();

  return {
    experimentId,
    path: String(exp.path),
    hypothesis: String(exp.hypothesis),
    status: String(exp.status),
    startedAt: exp.started_at,
    concludedAt: exp.concluded_at,
    learningId: exp.learning_id ?? null,
    opportunityId: exp.opportunity_id ?? null,
    arms,
    segments,
    divergence,
    guardrail: {
      metric: "friction (rage or dead clicks per session)",
      note: "lead_quality is not observable from client-side behaviour, so the guardrail tracks friction instead",
      controlRate: controlFrictionRate,
      tolerance,
      breached: breaches.length > 0,
      breachedBy: breaches.map((b) => b.variantId),
    },
    decision: decision.state,
    decisionReason: decision.reason,
    minSessionsPerArm: minPerArm,
    requiredPerArm: needed,
    totalExposed: arms.reduce((n, a) => n + a.exposed, 0),
  };
}

/**
 * The figures the agent is given, already computed, as plain text.
 *
 * Formatted here rather than handed over as JSON so there is no arithmetic
 * left for the model to do — including the subtraction between two arms, which
 * is exactly the kind of "obvious" step that produces a confidently wrong
 * number in a report.
 */
export function resultsForModel(r: NonNullable<Awaited<ReturnType<typeof experimentResults>>>): string {
  const lines: string[] = [
    `experiment ${r.experimentId} on ${r.path} — status ${r.status}`,
    `hypothesis: ${r.hypothesis}`,
    `decision: ${r.decision.toUpperCase().replace(/_/g, " ")} — ${r.decisionReason}`,
    "",
    "arms (conversion rate, with 95% interval):",
  ];
  for (const a of r.arms) {
    lines.push(
      `  ${a.label}${a.isControl ? " [control]" : ""}: ` +
      `${a.converted}/${a.exposed} = ${pct(a.rate)}%  ` +
      `95% CI [${pct(a.ci.lo)}%, ${pct(a.ci.hi)}%]  ` +
      `friction ${pct(a.frictionRate)}% of sessions` +
      (a.diff ? `\n    vs control: ${a.diff.point >= 0 ? "+" : ""}${pct(a.diff.point)} percentage points, ` +
        `95% CI [${pct(a.diff.lo)}, ${pct(a.diff.hi)}] pp, p = ${a.diff.p?.toFixed(3) ?? "n/a"}` : "")
    );
  }
  lines.push("", `planned size: ${r.minSessionsPerArm} sessions per arm`);
  if (r.requiredPerArm) {
    lines.push(`to settle a difference this size would need about ${r.requiredPerArm} sessions per arm`);
  }
  lines.push("", "by device:");
  for (const s of r.segments) {
    const arms = s.arms.map((a) => `${a.converted}/${a.exposed} = ${pct(a.rate)}%`).join("  vs  ");
    lines.push(`  ${s.segment}: ${arms}${s.underpowered ? "   [UNDERPOWERED — do not draw a conclusion from this row]" : ""}`);
  }
  if (r.divergence.opposed) {
    const dirs = r.divergence.deltas
      .map((d) => `${d.segment} ${d.delta >= 0 ? "+" : ""}${pct(d.delta)}pp`).join(", ");
    lines.push(
      "",
      `NOTE — these segments moved in OPPOSITE directions: ${dirs}.`,
      r.divergence.allUnderpowered
        ? "  Neither row is powered enough to prove it, so this is a direction worth testing by device, not a result. Say so in the learning: it is more useful than the overall average, which hides it entirely."
        : "  This is the finding. The overall average hides it."
    );
  }
  lines.push("", `guardrail (${r.guardrail.metric}): ${r.guardrail.breached ? "BREACHED" : "held"}`);
  lines.push(`  note: ${r.guardrail.note}`);
  return lines.join("\n");
}

/**
 * End an experiment that ran its course.
 *
 * `concluded`, never from `killed`: something a human pulled did not produce a
 * result, and a learning written from it would record a conclusion nobody
 * reached. The distinction is enforced here rather than left to the caller.
 */
export async function concludeExperiment(db: Db, siteId: string, experimentId: string) {
  const exp = (await db.execute<Record<string, unknown>>(sql`
    select status from experiments where id = ${experimentId} and site_id = ${siteId} limit 1`)).rows?.[0];
  if (!exp) return { ok: false, errors: [`no experiment ${experimentId}`] };

  const status = String(exp.status);
  if (status === "concluded") return { ok: true, experimentId, alreadyConcluded: true };
  if (status !== "running") {
    return {
      ok: false,
      errors: [`${experimentId} is ${status}; only a running experiment can conclude. ` +
        `A killed experiment did not reach a result and must not produce a learning.`],
    };
  }
  await db.execute(sql`
    update experiments set status = 'concluded', concluded_at = now()
    where id = ${experimentId}`);
  return { ok: true, experimentId, concludedAt: new Date().toISOString() };
}

/** Maps the computed decision onto the learning's outcome. Done here, not by
 *  the model: the outcome is a fact about the statistics, not a judgement. */
const OUTCOME_FOR: Record<DecisionState, string> = {
  challenger_won: "won",
  control_won: "lost",
  no_difference: "inconclusive",
  not_yet_decisive: "inconclusive",
  guardrail_breach: "guardrail_breach",
};

/**
 * Write what the experiment proved.
 *
 * The generalisation is the agent's sentence — it is the one thing here a
 * model is genuinely better at than a query. Everything factual around it is
 * taken from the computed results rather than from what the agent says: the
 * outcome, the effect size, the interval, the sample. If the agent could set
 * those, it could write itself a win.
 */
export async function writeLearning(
  db: Db, siteId: string,
  input: { experimentId: string; generalisation: string; changeSummary?: string; segment?: string; tags?: string[] }
) {
  const errors: string[] = [];
  if (!input.generalisation || input.generalisation.trim().length < 30) {
    errors.push("the generalisation must be a full sentence someone could apply to a different page");
  }
  const results = await experimentResults(db, siteId, input.experimentId);
  if (!results) errors.push(`no experiment ${input.experimentId}`);
  if (errors.length) return { stored: false, errors };

  const r = results!;
  if (r.status !== "concluded") {
    return {
      stored: false,
      errors: [`${input.experimentId} is ${r.status}. A learning may only be written from a concluded experiment.`],
    };
  }
  const existing = (await db.execute<Record<string, unknown>>(sql`
    select id from learnings where experiment_id = ${input.experimentId} limit 1`)).rows?.[0];
  if (existing) {
    return { stored: false, errors: [`a learning already exists for this experiment (${existing.id})`] };
  }

  const challenger = r.arms.find((a) => !a.isControl);
  const outcome = OUTCOME_FOR[r.decision];
  // An inconclusive result is still knowledge — "this did not move the needle
  // at the size we could run" is worth not re-testing — but it must not be
  // recorded with high confidence.
  const confidence = r.decision === "challenger_won" || r.decision === "control_won"
    ? "high" : r.decision === "no_difference" ? "medium" : "low";

  // The Neon HTTP driver does not bind a JS array as a Postgres array, so the
  // literal is built explicitly. Same lesson as the variant id list in
  // armCounts above — it fails at parse time, not with a bad result.
  const tags = (input.tags ?? []).filter((t) => t && t.trim());
  const tagArray = tags.length
    ? sql`array[${sql.join(tags.map((t) => sql`${t.trim()}`), sql`, `)}]::text[]`
    : sql`'{}'::text[]`;

  const id = newId("learn");
  await db.execute(sql`
    insert into learnings
      (id, site_id, experiment_id, hypothesis, change_summary, segment, outcome,
       effect, generalisation, tags, confidence, evidence_refs)
    values (${id}, ${siteId}, ${input.experimentId}, ${r.hypothesis},
            ${input.changeSummary ?? ""}, ${input.segment ?? "all"},
            ${outcome}::learning_outcome,
            ${JSON.stringify({
              lift: challenger?.diff?.point ?? 0,
              ciLow: challenger?.diff?.lo ?? 0,
              ciHigh: challenger?.diff?.hi ?? 0,
              n: r.totalExposed,
              pValue: challenger?.diff?.p ?? null,
              significant: r.decision === "challenger_won" || r.decision === "control_won",
              decision: r.decision,
            })}::jsonb,
            ${input.generalisation.trim()},
            ${tagArray},
            ${confidence},
            ${JSON.stringify({ experimentId: input.experimentId, decision: r.decision })}::jsonb)`);

  await db.execute(sql`
    update experiments set learning_id = ${id} where id = ${input.experimentId}`);

  return {
    stored: true, learningId: id, outcome, confidence,
    decision: r.decision,
    note: "outcome, effect and confidence were taken from the computed result, not from the text you supplied",
  };
}
