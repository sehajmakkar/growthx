import { useState } from "react";
import { api } from "../api.js";
import { useApi } from "../useApi.js";
import { PageHeader, Empty, Thinking, ErrorNote, SimulatedChip } from "../components/ui.js";

/**
 * Opportunities, each with the data it was reasoned from.
 *
 * The evidence is expandable and shows, for every citation, the value the agent
 * claimed *and* the value stored in the database. They match because an
 * opportunity whose figures do not resolve is rejected before it is ever
 * written — so this panel is a record of verification, not a promise of it.
 */
export function Opportunities() {
  const { data, error, loading } = useApi(() => api.opportunities(), []);
  const [open, setOpen] = useState<string | null>(null);

  if (error) return <><PageHeader title="Opportunities" /><ErrorNote error={error} /></>;
  if (loading) return <><PageHeader title="Opportunities" /><Thinking label="Loading" /></>;

  const items = data?.opportunities ?? [];
  if (!items.length) {
    return (
      <>
        <PageHeader title="Opportunities" />
        <Empty title="The agent has not found anything yet"
               body="Run `pnpm agent:run`. The analyst reads the heatmaps, funnel and session digests and records what it finds here — with every figure checked against stored data before it is accepted." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Opportunities"
        subtitle="What the agent found, and the data it reasoned from."
        right={<SimulatedChip />}
      />
      <div className="flex flex-col gap-3">
        {items.map((o) => {
          const evidence = Array.isArray(o.evidence) ? o.evidence : [];
          const expanded = open === o.id;
          const tone = o.confidence === "high" ? "negative"
            : o.confidence === "medium" ? "caution" : "pending";
          return (
            <article key={o.id} className="card overflow-hidden">
              <div className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="max-w-measure font-display text-[0.975rem] font-semibold leading-snug">
                    {o.title}
                  </h2>
                  <span className="chip shrink-0" style={{
                    color: `var(--${tone})`,
                    background: `color-mix(in srgb, var(--${tone}) 9%, transparent)`,
                  }}>
                    {o.confidence} confidence
                  </span>
                </div>
                <p className="mt-2 max-w-measure text-sm leading-relaxed text-muted">{o.body}</p>
                <div className="mt-3 flex items-center gap-3">
                  <span className="font-mono text-[0.6875rem] text-muted">{o.segment_key}</span>
                  <button onClick={() => setOpen(expanded ? null : o.id)}
                          className="text-[0.75rem] font-medium text-accent hover:underline">
                    {expanded ? "Hide evidence" : `Show evidence (${evidence.length})`}
                  </button>
                </div>
              </div>

              {expanded && (
                <div className="border-t border-border bg-base px-5 py-3">
                  <table className="w-full text-left">
                    <thead>
                      <tr>
                        <th className="label pb-1.5 font-medium">Claim</th>
                        <th className="label pb-1.5 text-right font-medium">Cited</th>
                        <th className="label pb-1.5 text-right font-medium">In the data</th>
                        <th className="label pb-1.5 pl-4 font-medium">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evidence.map((e: Record<string, unknown>, i: number) => (
                        <tr key={i} className="align-baseline">
                          <td className="py-1 pr-3 text-xs">{String(e.label)}</td>
                          <td className="num py-1 text-right text-xs">{String(e.value)}</td>
                          <td className={"num py-1 text-right text-xs " +
                                         (e.matched ? "text-positive" : "text-negative")}>
                            {String(e.actual ?? "—")}
                          </td>
                          <td className="py-1 pl-4 font-mono text-[0.625rem] text-muted">
                            {String(e.sourceRef)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-[0.6875rem] text-muted">
                    Every figure was resolved against the stored aggregate before this
                    opportunity was accepted. An unbacked claim is rejected by the tool.
                  </p>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}
