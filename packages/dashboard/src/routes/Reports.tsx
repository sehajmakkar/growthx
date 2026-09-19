import { Link } from "react-router-dom";
import { api, type Experiment, type Opportunity, type Learning, type ExperimentResults } from "../api.js";
import { useApi } from "../useApi.js";
import { PageHeader, Empty, Thinking, ErrorNote } from "../components/ui.js";

/**
 * The report.
 *
 * Composed entirely from what is already stored — the opportunity and its
 * verified evidence, the hypothesis, the variants, the computed result, the
 * learning. Nothing here calls a model. A report that re-narrated the work
 * through an LLM could drift from the figures on every other screen, and the
 * whole argument of this product is that it does not.
 *
 * The order is the argument: what we saw, what we think it means, the numbers
 * behind that, what we proposed to do, what we changed, what happened, what we
 * now believe. A reader who disagrees can stop at any line and check it.
 */

const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;
const pp = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}pp`;

const DECISION_WORDS: Record<string, string> = {
  not_yet_decisive: "Not yet decisive",
  no_difference: "No difference detected",
  challenger_won: "The challenger won",
  control_won: "The control won",
  guardrail_breach: "Guardrail breached",
};

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-hairline pt-4">
      <p className="label">{n} · {title}</p>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Report({ experiment, opportunity, learning, results }: {
  experiment: Experiment;
  opportunity: Opportunity | null;
  learning: Learning | null;
  results: ExperimentResults | null;
}) {
  const challengers = experiment.variants.filter((v) => !v.is_control);
  const verified = (opportunity?.evidence ?? []).filter((e) => (e as { matched?: boolean }).matched);

  return (
    <article className="card flex flex-col gap-4 px-6 py-5">
      <header>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-mono text-xs text-muted">{experiment.id}</span>
          <span className="chip">{String(experiment.status).replace("_", " ")}</span>
        </div>
        {/* Not `text-base`. The theme defines a --base colour variable, so
            Tailwind generates `text-base` as a COLOUR utility — it sets
            color: var(--base), the page background, and the heading renders
            white on white. Sized explicitly instead. */}
        <h2 className="mt-1.5 max-w-measure text-[1rem] font-medium leading-snug">
          {opportunity?.title ?? experiment.hypothesis}
        </h2>
      </header>

      {opportunity && (
        <Section n="1" title="What we observed">
          <p className="max-w-measure text-sm leading-relaxed">{opportunity.body}</p>
        </Section>
      )}

      {verified.length > 0 && (
        <Section n="2" title="The evidence, checked against the database">
          <table className="w-full text-xs">
            <thead className="text-muted">
              <tr className="text-left">
                <th className="pb-1.5 font-normal">Figure</th>
                <th className="pb-1.5 font-normal">Cited</th>
                <th className="pb-1.5 font-normal">Actual</th>
                <th className="pb-1.5 font-normal">Source</th>
              </tr>
            </thead>
            <tbody>
              {verified.map((e, i) => {
                const ev = e as { label: string; value: unknown; actual: unknown; sourceRef: string };
                return (
                  <tr key={i} className="border-t border-hairline">
                    <td className="py-1.5">{ev.label}</td>
                    <td className="py-1.5 font-mono">{String(ev.value)}</td>
                    <td className="py-1.5 font-mono">{String(ev.actual)}</td>
                    <td className="py-1.5 font-mono text-[0.68rem] text-muted">{ev.sourceRef}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[0.68rem] text-muted">
            Every figure the agent cited was resolved against stored aggregates before the
            opportunity was accepted. A citation that did not match was rejected and had to be
            corrected.
          </p>
        </Section>
      )}

      <Section n="3" title="What we proposed to test">
        <p className="max-w-measure text-sm leading-relaxed">{experiment.hypothesis}</p>
      </Section>

      <Section n="4" title="What actually changed on the page">
        {challengers.map((v) => (
          <div key={v.id} className="mb-3 last:mb-0">
            <p className="text-sm font-medium">{v.label}</p>
            <p className="mt-0.5 max-w-measure text-xs text-muted">{v.rationale}</p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {(v.mutations as { op: string; selector: string; value?: string; note?: string }[]).map((m, i) => (
                <li key={i} className="text-xs">
                  <span className="chip font-mono text-[0.65rem]">{m.op}</span>{" "}
                  <code className="text-[0.7rem] text-muted">{m.selector}</code>
                  {m.value && <> → “{m.value}”</>}
                  {m.note && <span className="block text-[0.68rem] text-muted">{m.note}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="mt-1 text-[0.68rem] text-muted">
          Structured operations from a closed set, never generated HTML. Every selector was
          resolved against the live page before the experiment was stored.
        </p>
      </Section>

      {results && (
        <Section n="5" title="What happened">
          <p className="text-sm font-medium">{DECISION_WORDS[results.decision] ?? results.decision}</p>
          <p className="mt-1 max-w-measure text-sm leading-relaxed text-muted">{results.decisionReason}</p>
          <div className="mt-2.5 flex flex-col gap-1 text-xs">
            {results.arms.map((a) => (
              <span key={a.variantId}>
                {a.label}{a.isControl && " (control)"}: <strong>{pct1(a.rate)}</strong>{" "}
                <span className="text-muted">({a.converted}/{a.exposed}, CI {pct1(a.ci.lo)}–{pct1(a.ci.hi)})</span>
              </span>
            ))}
          </div>
          {results.divergence?.opposed && (
            <p className="mt-2.5 max-w-measure rounded px-3 py-2 text-xs leading-relaxed"
               style={{ background: "color-mix(in srgb, var(--caution) 10%, transparent)" }}>
              <strong>Attribution.</strong> These segments moved in opposite directions —{" "}
              {results.divergence.deltas.map((d) => `${d.segment} ${pp(d.delta)}`).join(", ")}.
              {results.divergence.allUnderpowered
                ? " Neither row has the traffic to prove it, so this is a direction to test by device rather than a finding."
                : " The overall average hides this."}
            </p>
          )}
          <p className="mt-2 text-[0.68rem] text-muted">
            Guardrail ({results.guardrail.metric}): {results.guardrail.breached ? "breached" : "held"}.
          </p>
        </Section>
      )}

      {learning && (
        <Section n="6" title="What we now believe">
          <p className="max-w-measure text-sm leading-relaxed">{learning.generalisation}</p>
          <p className="mt-1.5 text-xs text-muted">
            Filed as <strong>{learning.outcome}</strong> at <strong>{learning.confidence}</strong> confidence —
            taken from the computed result, not from the sentence. The next run reads this before
            proposing anything.
          </p>
        </Section>
      )}

      <footer className="flex flex-wrap gap-3 border-t border-hairline pt-3 text-xs">
        <Link to={`/experiments/${experiment.id}/diff`} className="underline">Compare the variants →</Link>
        {results && <Link to={`/experiments/${experiment.id}/results`} className="underline">Full result →</Link>}
      </footer>
    </article>
  );
}

export function Reports() {
  const experiments = useApi(() => api.experiments(), []);
  const opportunities = useApi(() => api.opportunities(), []);
  const learnings = useApi(() => api.learnings(), []);

  const exps = experiments.data?.experiments ?? [];
  // Report on whatever has run. A draft has no result to report on yet.
  const reportable = exps.filter((e) => e.status === "concluded" || e.status === "running");
  const first = reportable[0];
  const results = useApi(
    () => (first ? api.results(first.id) : Promise.resolve(null)),
    [first?.id]
  );

  if (experiments.error) return <><PageHeader title="Reports" /><ErrorNote error={experiments.error} /></>;
  if (experiments.loading) return <><PageHeader title="Reports" /><Thinking label="Assembling" /></>;

  if (!reportable.length) {
    return (
      <>
        <PageHeader title="Reports" />
        <Empty
          title="Nothing has run yet"
          body="A report is written once an experiment has been in front of visitors: what was observed, the evidence behind it, what was changed, what happened, and what it taught."
        />
      </>
    );
  }

  const opps = opportunities.data?.opportunities ?? [];
  const learns = learnings.data?.learnings ?? [];

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="What was observed, why, the evidence, what changed, and what it proved."
      />
      <div className="flex flex-col gap-5">
        {reportable.map((e) => (
          <Report
            key={e.id}
            experiment={e}
            opportunity={opps.find((o) => o.id === e.opportunity_id) ?? opps[0] ?? null}
            learning={learns.find((l) => l.experiment_id === e.id) ?? null}
            results={e.id === first?.id ? results.data ?? null : null}
          />
        ))}
      </div>
    </>
  );
}
