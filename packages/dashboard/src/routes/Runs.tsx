import { api } from "../api.js";
import { useApi } from "../useApi.js";
import { PageHeader, Empty, Thinking, ErrorNote } from "../components/ui.js";

/**
 * The agent's run log.
 *
 * This is how a human checks the agent's reasoning rather than trusting it:
 * which tool it called, with what arguments, what came back, and how long it
 * took. An agent that shows its working is auditable; one that only shows its
 * conclusion is a black box with good prose.
 */
export function Runs() {
  const { data, error, loading } = useApi(() => api.runs(), []);

  if (error) return <><PageHeader title="Run log" /><ErrorNote error={error} /></>;
  if (loading) return <><PageHeader title="Run log" /><Thinking label="Loading runs" /></>;

  const runs = data?.runs ?? [];
  if (!runs.length) {
    return (
      <>
        <PageHeader title="Run log" />
        <Empty title="The agent has not run yet"
               body="Run `pnpm agent:run` to have the orchestrator analyse the site. Every tool call it makes appears here." />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Run log"
                  subtitle="Every step the agent took, in order, with what each tool returned." />
      <div className="flex flex-col gap-4">
        {runs.map((run) => {
          const steps = Array.isArray(run.steps) ? run.steps : [];
          const tone = run.status === "succeeded" ? "positive"
            : run.status === "failed" ? "negative" : "caution";
          return (
            <div key={run.id} className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-xs text-ink">{run.id}</span>
                  <span className="chip" style={{
                    color: `var(--${tone})`,
                    background: `color-mix(in srgb, var(--${tone}) 9%, transparent)`,
                  }}>{run.status}</span>
                  <span className="text-xs text-muted">{run.trigger}</span>
                </div>
                <span className="num text-xs text-muted">
                  {steps.length} step{steps.length === 1 ? "" : "s"}
                </span>
              </div>

              {run.error && (
                <p className="border-b border-border px-5 py-2 font-mono text-xs text-negative">
                  {String(run.error).slice(0, 220)}
                </p>
              )}

              <ol className="divide-y divide-border">
                {steps.map((s: Record<string, unknown>, i: number) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-2">
                    <span className="num w-6 shrink-0 text-[0.6875rem] text-muted">{i + 1}</span>
                    <span className="font-mono text-xs font-medium text-accent">{String(s.tool)}</span>
                    {s.params != null && Object.keys(s.params as object).length > 0 && (
                      <span className="font-mono text-[0.6875rem] text-muted">
                        {Object.entries(s.params as Record<string, unknown>)
                          .filter(([k]) => k !== "site")
                          .map(([k, v]) => `${k}=${v}`).join(" ")}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-xs text-ink" title={String(s.summary ?? "")}>
                      {String(s.summary ?? "")}
                    </span>
                    <span className="num shrink-0 text-[0.6875rem] text-muted">{String(s.ms ?? "")}ms</span>
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </div>
    </>
  );
}
