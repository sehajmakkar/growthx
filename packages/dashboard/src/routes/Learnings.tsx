import { api } from "../api.js";
import { useApi } from "../useApi.js";
import { PageHeader, Empty, Thinking, ErrorNote } from "../components/ui.js";

/**
 * The learning log, with back-references.
 *
 * A learning that nothing ever cites is a note in a file. What makes this the
 * memory rather than a changelog is the last line of each card: which later
 * hypotheses actually used it. That is the difference between accumulating
 * records and accumulating knowledge.
 */
export function Learnings() {
  const learnings = useApi(() => api.learnings(), []);
  const experiments = useApi(() => api.experiments(), []);

  if (learnings.error) return <><PageHeader title="Learnings" /><ErrorNote error={learnings.error} /></>;
  if (learnings.loading) return <><PageHeader title="Learnings" /><Thinking label="Loading" /></>;

  const items = learnings.data?.learnings ?? [];
  if (!items.length) {
    return (
      <>
        <PageHeader title="Learnings" />
        <Empty title="Nothing proved yet"
               body="Every concluded experiment writes a one-sentence generalisation here, and the agent retrieves them before proposing anything new." />
      </>
    );
  }

  const exps = experiments.data?.experiments ?? [];

  return (
    <>
      <PageHeader title="Learnings"
                  subtitle="What previous experiments proved — and which hypotheses have used it since." />
      <div className="flex flex-col gap-3">
        {items.map((l) => {
          const tone = l.outcome === "won" ? "positive"
            : l.outcome === "lost" ? "negative"
            : l.outcome === "guardrail_breach" ? "negative" : "caution";
          // A hypothesis counts as citing a learning when it reuses its wording;
          // the experiment record also stores the ids it cited.
          const cited = exps.filter((e) =>
            String(e.hypothesis ?? "").toLowerCase().includes(
              String(l.generalisation).toLowerCase().split(" ").slice(0, 4).join(" ")
            ));
          return (
            <article key={l.id} className="card px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="max-w-measure text-sm font-medium leading-relaxed">
                  {l.generalisation}
                </p>
                <span className="chip shrink-0" style={{
                  color: `var(--${tone})`,
                  background: `color-mix(in srgb, var(--${tone}) 10%, transparent)`,
                }}>{String(l.outcome).replace("_", " ")}</span>
              </div>

              <p className="mt-2 text-xs text-muted">{l.hypothesis}</p>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-mono text-[0.6875rem] text-muted">{l.segment}</span>
                {(l.tags ?? []).map((t: string) => (
                  <span key={t} className="font-mono text-[0.625rem] text-muted">#{t}</span>
                ))}
                <span className="font-mono text-[0.6875rem] text-muted">
                  {l.confidence} confidence
                </span>
              </div>

              {cited.length > 0 && (
                <p className="mt-3 border-t border-border pt-2 text-[0.75rem] text-accent">
                  Cited by {cited.length} later hypothesis
                  {cited.length === 1 ? "" : "es"}:{" "}
                  <span className="font-mono text-[0.6875rem]">
                    {cited.map((e) => e.id).join(", ")}
                  </span>
                </p>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}
