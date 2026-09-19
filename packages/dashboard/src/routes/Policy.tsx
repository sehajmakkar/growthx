import { useState } from "react";
import { api, type PolicyDecisionRow } from "../api.js";
import { useApi } from "../useApi.js";
import { PageHeader, Empty, Thinking, ErrorNote } from "../components/ui.js";

/**
 * The policy gate, made visible.
 *
 * A denial is the only evidence that a gate exists. An allow looks exactly like
 * no gate at all — the action simply happens — so a screen that showed only
 * successful actions would prove nothing, and this one leads with refusals.
 *
 * The policy source is shown in full, on purpose. "The agent is governed" is a
 * claim; eighty lines of Cedar anyone can read is a fact, and the policy id on
 * each decision below points at the exact rule that produced it.
 */

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Highlight the policy that decided the selected row, so the rule and its
 *  consequence can be read at the same time. */
function PolicySource({ source, highlight }: { source: string; highlight: string | null }) {
  const blocks = source.split(/\n(?=\/\/ ──)/);
  return (
    // Wrapped rather than side-scrolled: the comments carry the reasoning, and
    // a rule you have to drag a scrollbar to finish reading is one nobody reads.
    <pre className="max-h-[36rem] overflow-y-auto whitespace-pre-wrap break-words rounded bg-[var(--surface-2,rgba(0,0,0,0.03))] p-4 text-[0.72rem] leading-relaxed">
      {blocks.map((b, i) => {
        const isHit = highlight !== null && b.includes(`@id("${highlight}")`);
        return (
          <code
            key={i}
            className="block"
            style={isHit ? {
              background: "color-mix(in srgb, var(--negative) 12%, transparent)",
              boxShadow: "inset 3px 0 0 0 var(--negative)",
              display: "block",
            } : undefined}
          >{b}{"\n"}</code>
        );
      })}
    </pre>
  );
}

function DecisionRow({ d, selected, onSelect }: {
  d: PolicyDecisionRow; selected: boolean; onSelect: () => void;
}) {
  const denied = d.decision === "deny";
  const tone = denied ? "negative" : "positive";
  const attrs = d.resource_attrs ?? {};
  const regions = Array.isArray(attrs.regions) ? (attrs.regions as string[]) : [];

  return (
    <button
      onClick={onSelect}
      className="card w-full px-5 py-4 text-left transition-colors"
      style={selected ? { borderColor: `var(--${tone})` } : undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="chip shrink-0" style={{
            color: `var(--${tone})`,
            background: `color-mix(in srgb, var(--${tone}) 12%, transparent)`,
          }}>{denied ? "refused" : "allowed"}</span>
          <span className="font-mono text-xs">{d.action}</span>
        </div>
        <span className="text-xs text-muted">{timeAgo(d.created_at)}</span>
      </div>

      <p className="mt-2 max-w-measure text-sm leading-relaxed">{d.explain}</p>

      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[0.7rem] text-muted">
        {d.policy_id && (
          <span className="chip font-mono" style={{
            color: `var(--${tone})`,
            background: `color-mix(in srgb, var(--${tone}) 8%, transparent)`,
          }}>{d.policy_id}</span>
        )}
        <span className="font-mono">{d.resource}</span>
        {regions.map((r) => <span key={r} className="chip">region: {r}</span>)}
        {attrs.touchesProtected === true && <span className="chip">touches a protected element</span>}
        {attrs.pathHasRunning === true && <span className="chip">page already has a live test</span>}
      </div>

      {/* Every policy that matched, not just the deciding one — a request can
          break more than one rule, and hiding that would understate the case. */}
      {d.reasons.length > 1 && (
        <p className="mt-2 text-[0.7rem] text-muted">
          also matched: {d.reasons.slice(1).join(", ")}
        </p>
      )}
    </button>
  );
}

export function Policy() {
  const policy = useApi(() => api.policy(), []);
  const [selected, setSelected] = useState<string | null>(null);
  const [showAllows, setShowAllows] = useState(true);

  if (policy.error) return <><PageHeader title="Policy" /><ErrorNote error={policy.error} /></>;
  if (policy.loading) return <><PageHeader title="Policy" /><Thinking label="Reading policy" /></>;

  const all = policy.data?.decisions ?? [];
  const denials = all.filter((d) => d.decision === "deny");
  const shown = showAllows ? all : denials;
  const selectedRow = all.find((d) => d.id === selected) ?? null;

  return (
    <>
      <PageHeader
        title="Policy"
        subtitle="What the agent is permitted to do, and every time that was decided."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-muted">
        <span><strong className="text-ink">{policy.data?.ids.length ?? 0}</strong> policies in force</span>
        <span>·</span>
        <span><strong className="text-ink">{denials.length}</strong> refusals</span>
        <span>·</span>
        <span><strong className="text-ink">{all.length - denials.length}</strong> allowed</span>
        <button
          className="chip ml-auto"
          onClick={() => setShowAllows((v) => !v)}
        >{showAllows ? "Show refusals only" : "Show everything"}</button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="flex flex-col gap-3">
          {shown.length === 0 ? (
            <Empty
              title={showAllows ? "Nothing decided yet" : "Nothing has been refused yet"}
              body="Every state-changing action the agent attempts is evaluated against the policy on the right, and recorded here either way."
            />
          ) : shown.map((d) => (
            <DecisionRow
              key={d.id}
              d={d}
              selected={selected === d.id}
              onSelect={() => setSelected(selected === d.id ? null : d.id)}
            />
          ))}
        </section>

        <section className="card overflow-hidden px-5 py-4">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-medium">policies/growthx.cedar</h2>
            <span className="text-[0.7rem] text-muted">
              {selectedRow?.policy_id ? "highlighting the rule that decided it" : "evaluated by Cedar, in the API"}
            </span>
          </div>
          <PolicySource
            source={policy.data?.source ?? ""}
            highlight={selectedRow?.policy_id ?? null}
          />
        </section>
      </div>
    </>
  );
}
