import { useParams, Link } from "react-router-dom";
import { api, type ExperimentResults, type ArmResult } from "../api.js";
import { useApi } from "../useApi.js";
import { PageHeader, Empty, Thinking, ErrorNote } from "../components/ui.js";

/**
 * Reading the result.
 *
 * Every deliberate choice on this screen is a refusal to flatter the result.
 *
 * There is no large lift number, in green or otherwise. The biggest thing on
 * screen is the decision in words, because "+13% lift" printed at 48px is how
 * a team ends up shipping noise — the eye takes the point estimate and never
 * reaches the interval underneath it.
 *
 * The intervals are drawn to a shared scale, so two that overlap *look* like
 * they overlap. Drawing each arm to its own scale, or drawing bars instead of
 * intervals, would make an undecided result look decided, which is the one
 * lie an experiment tool must never tell.
 *
 * The guardrail sits in its own block rather than in the table of rates. It
 * answers a different question — not "did it win" but "did it cost us
 * something" — and putting it in the same row invites reading it as another
 * metric that moved.
 */

const STATE_LABEL: Record<ExperimentResults["decision"], string> = {
  not_yet_decisive: "Not yet decisive",
  no_difference: "No difference detected",
  challenger_won: "The challenger won",
  control_won: "The control won",
  guardrail_breach: "Guardrail breached",
};
const STATE_TONE: Record<ExperimentResults["decision"], string> = {
  not_yet_decisive: "caution",
  no_difference: "muted",
  challenger_won: "positive",
  control_won: "caution",
  guardrail_breach: "negative",
};

const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;
const pp = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}pp`;

/** All arms on one axis, so overlap is visible rather than inferred. */
function IntervalChart({ arms }: { arms: ArmResult[] }) {
  const hi = Math.max(0.01, ...arms.map((a) => a.ci.hi));
  const max = Math.min(1, hi * 1.15);
  const x = (v: number) => (v / max) * 100;

  return (
    <div className="mt-3 flex flex-col gap-3">
      {arms.map((a) => (
        <div key={a.variantId}>
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className={a.isControl ? "text-muted" : "font-medium"}>
              {a.label}{a.isControl && " (control)"}
            </span>
            <span className="font-mono text-[0.7rem] text-muted">
              {a.converted}/{a.exposed} · {pct1(a.rate)}
            </span>
          </div>
          <div className="relative mt-1.5 h-5">
            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2"
                 style={{ background: "var(--hairline, rgba(0,0,0,.12))" }} />
            {/* The interval, drawn to the shared scale above. */}
            <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full"
                 style={{
                   left: `${x(a.ci.lo)}%`,
                   width: `${Math.max(0.6, x(a.ci.hi) - x(a.ci.lo))}%`,
                   background: a.isControl
                     ? "color-mix(in srgb, var(--ink) 22%, transparent)"
                     : "color-mix(in srgb, var(--ink) 45%, transparent)",
                 }} />
            <div className="absolute top-1/2 h-2.5 w-0.5 -translate-x-1/2 -translate-y-1/2"
                 style={{ left: `${x(a.rate)}%`, background: "var(--ink)" }} />
          </div>
          <p className="text-[0.68rem] text-muted">
            95% CI {pct1(a.ci.lo)} – {pct1(a.ci.hi)}
            {a.diff && <> · vs control {pp(a.diff.point)}, CI {pp(a.diff.lo)} to {pp(a.diff.hi)}
              {a.diff.p != null && <> · p = {a.diff.p.toFixed(3)}</>}</>}
          </p>
        </div>
      ))}
      <p className="text-[0.68rem] text-muted">
        Drawn to one shared scale. Where the bars overlap, the difference is not established.
      </p>
    </div>
  );
}

export function Results() {
  const { experimentId } = useParams();
  const res = useApi(() => api.results(experimentId ?? ""), [experimentId]);

  if (res.error) return <><PageHeader title="Results" /><ErrorNote error={res.error} /></>;
  if (res.loading) return <><PageHeader title="Results" /><Thinking label="Reading the experiment" /></>;
  const r = res.data;
  if (!r) return <><PageHeader title="Results" /><Empty title="No such experiment" body="" /></>;

  const tone = STATE_TONE[r.decision];
  const control = r.arms.find((a) => a.isControl);

  return (
    <>
      <PageHeader title="Results" subtitle={r.hypothesis} />

      {/* The decision, in words, as the largest thing on the page. */}
      <section className="card px-5 py-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="chip" style={{
            color: `var(--${tone})`,
            background: `color-mix(in srgb, var(--${tone}) 12%, transparent)`,
          }}>{r.status}</span>
          <h2 className="text-lg font-medium">{STATE_LABEL[r.decision]}</h2>
        </div>
        <p className="mt-2 max-w-measure text-sm leading-relaxed text-muted">{r.decisionReason}</p>
        {r.requiredPerArm && r.decision === "not_yet_decisive" && (
          <p className="mt-2 text-xs text-muted">
            To settle a difference of this size would take roughly{" "}
            <strong className="text-ink">{r.requiredPerArm.toLocaleString()}</strong> sessions per arm.
            This experiment has {r.arms.map((a) => a.exposed).join(" and ")}.
          </p>
        )}
      </section>

      <section className="card mt-4 px-5 py-4">
        <h2 className="text-sm font-medium">Conversion rate, with uncertainty</h2>
        <IntervalChart arms={r.arms} />
      </section>

      {/* Separated from the rates above: a different question. */}
      <section className="card mt-4 px-5 py-4"
               style={r.guardrail.breached ? { borderColor: "var(--negative)" } : undefined}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium">Guardrail</h2>
          <span className="chip" style={{
            color: `var(--${r.guardrail.breached ? "negative" : "positive"})`,
            background: `color-mix(in srgb, var(--${r.guardrail.breached ? "negative" : "positive"}) 12%, transparent)`,
          }}>{r.guardrail.breached ? "breached" : "held"}</span>
        </div>
        <p className="mt-1 text-xs text-muted">{r.guardrail.metric}</p>
        <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1 text-xs">
          {r.arms.map((a) => (
            <span key={a.variantId}>
              {a.isControl ? "control" : a.label}: <strong>{pct1(a.frictionRate)}</strong> of sessions
            </span>
          ))}
        </div>
        <p className="mt-2 text-[0.68rem] text-muted">{r.guardrail.note}</p>
      </section>

      <section className="card mt-4 px-5 py-4">
        <h2 className="text-sm font-medium">By device</h2>
        {r.divergence.opposed && (
          <p className="mt-2 max-w-measure rounded px-3 py-2 text-xs leading-relaxed"
             style={{ background: "color-mix(in srgb, var(--caution) 10%, transparent)" }}>
            These segments moved in <strong>opposite directions</strong>
            {" — "}
            {r.divergence.deltas.map((d) => `${d.segment} ${pp(d.delta)}`).join(", ")}.
            {r.divergence.allUnderpowered
              ? " Neither row has the traffic to prove it, so this is a direction worth testing by device, not a result. The overall average hides it entirely."
              : " The overall average hides this."}
          </p>
        )}
        <table className="mt-3 w-full text-xs">
          <thead className="text-muted">
            <tr className="text-left">
              <th className="pb-1.5 font-normal">Segment</th>
              {r.arms.map((a) => (
                <th key={a.variantId} className="pb-1.5 font-normal">
                  {a.isControl ? "Control" : a.label}
                </th>
              ))}
              <th className="pb-1.5 font-normal" />
            </tr>
          </thead>
          <tbody>
            {r.segments.map((s) => (
              <tr key={s.segment} className="border-t border-hairline">
                <td className="py-2 font-mono text-[0.7rem]">{s.segment}</td>
                {s.arms.map((a) => (
                  <td key={a.variantId} className="py-2">
                    {a.exposed
                      ? <>{pct1(a.rate)} <span className="text-muted">({a.converted}/{a.exposed})</span></>
                      : <span className="text-muted">—</span>}
                  </td>
                ))}
                <td className="py-2 text-right">
                  {s.underpowered && (
                    <span className="chip text-[0.65rem]" title={`fewer than ${r.minSessionsPerArm} sessions in an arm`}>
                      underpowered
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2.5 text-[0.68rem] text-muted">
          A row marked underpowered has fewer than {r.minSessionsPerArm} sessions in at least one
          arm. It can suggest a direction; it cannot establish one.
        </p>
      </section>

      <div className="mt-4 flex flex-wrap gap-3 text-xs">
        <Link to={`/experiments/${r.experimentId}/diff`} className="underline">Compare the variants →</Link>
        {r.learningId && <Link to="/learnings" className="underline">What it taught →</Link>}
      </div>
    </>
  );
}
