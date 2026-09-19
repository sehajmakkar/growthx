import { api } from "../api.js";
import { useApi } from "../useApi.js";
import { Link } from "react-router-dom";
import { PageHeader, Empty, Thinking, ErrorNote } from "../components/ui.js";

const SITE_A = import.meta.env.VITE_SITE_A_URL ?? "";

/**
 * Experiments and the variants the agent wrote.
 *
 * Each mutation is shown as the structured operation it is, with the agent's
 * own reason beside it. That is the point of a closed op set: a variant is
 * reviewable line by line rather than being a diff of generated HTML nobody
 * can safely read.
 */
export function Experiments() {
  const { data, error, loading } = useApi(() => api.experiments(), []);

  if (error) return <><PageHeader title="Experiments" /><ErrorNote error={error} /></>;
  if (loading) return <><PageHeader title="Experiments" /><Thinking label="Loading" /></>;

  const items = data?.experiments ?? [];
  if (!items.length) {
    return (
      <>
        <PageHeader title="Experiments" />
        <Empty title="No experiments yet"
               body="Run `pnpm agent:run`. The agent proposes an experiment once it has found a problem and checked what previous experiments already settled." />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Experiments"
                  subtitle="What the agent proposed, and the exact changes each variant makes." />
      <div className="flex flex-col gap-4">
        {items.map((e) => {
          const tone = e.status === "running" ? "positive"
            : e.status === "draft" ? "pending"
            : e.status === "pending_approval" ? "caution" : "muted";
          return (
            <article key={e.id} className="card overflow-hidden">
              <div className="border-b border-border px-5 py-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-mono text-xs text-muted">{e.id}</span>
                  <div className="flex items-center gap-3">
                    {/* Only once it has ended: a "Results" link on a draft
                        invites reading a rate off an experiment that has not run. */}
                    {(e.status === "concluded" || e.status === "running") && (
                      <Link to={`/experiments/${e.id}/results`}
                            className="text-[0.75rem] font-medium text-accent hover:underline">
                        Results →
                      </Link>
                    )}
                    <Link to={`/experiments/${e.id}/diff`}
                          className="text-[0.75rem] font-medium text-accent hover:underline">
                      Compare side by side →
                    </Link>
                    <span className="chip" style={{
                      color: `var(--${tone === "muted" ? "pending" : tone})`,
                      background: `color-mix(in srgb, var(--${tone === "muted" ? "pending" : tone}) 10%, transparent)`,
                    }}>{String(e.status).replace("_", " ")}</span>
                  </div>
                </div>
                <p className="mt-2 max-w-measure text-sm leading-relaxed">{e.hypothesis}</p>
              </div>

              <div className="grid divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0">
                {(e.variants ?? []).map((v) => (
                  <div key={v.id} className="px-5 py-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="font-display text-sm font-semibold">{v.label}</h3>
                      <span className="num text-[0.6875rem] text-muted">
                        {e.split?.[v.id] ?? 0}% of traffic
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted">{v.rationale}</p>

                    {(v.mutations ?? []).length === 0 ? (
                      <p className="mt-3 font-mono text-[0.6875rem] text-muted">
                        no changes — the page as shipped
                      </p>
                    ) : (
                      <ul className="mt-3 flex flex-col gap-2.5">
                        {(v.mutations as Record<string, unknown>[]).map((m, i) => (
                          <li key={i} className="rounded border border-border bg-base px-3 py-2">
                            <div className="flex flex-wrap items-baseline gap-2">
                              <span className="chip" style={{
                                color: "var(--accent)",
                                background: "var(--accent-soft)",
                              }}>{String(m.op)}</span>
                              <span className="font-mono text-[0.6875rem] text-ink">
                                {String(m.selector)}
                              </span>
                            </div>
                            {m.value != null && (
                              <p className="mt-1 font-mono text-[0.6875rem] text-ink">
                                → "{String(m.value)}"
                              </p>
                            )}
                            {m.props != null && (
                              <p className="mt-1 font-mono text-[0.6875rem] text-ink">
                                → {JSON.stringify(m.props)}
                              </p>
                            )}
                            {m.note != null && (
                              <p className="mt-1 text-[0.6875rem] leading-relaxed text-muted">
                                {String(m.note)}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    {v.validation != null && (
                      <p className="mt-3 font-mono text-[0.625rem] text-muted">
                        {(v.validation as Record<string, unknown>).selectorsMatched as number ?? 0}
                        /{(v.validation as Record<string, unknown>).selectorsChecked as number ?? 0}
                        {" "}selectors verified against the live page
                      </p>
                    )}

                    {SITE_A && (
                      <a className="btn mt-3 text-xs"
                         href={`${SITE_A}?gx_force=${v.id}`} target="_blank" rel="noreferrer">
                        Preview on the live page ↗
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
