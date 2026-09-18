import type { ReactNode } from "react";

/**
 * The simulation badge.
 *
 * Wherever a number came from the traffic swarm, it says so. This is not a
 * disclaimer bolted on at the end — a demo that shows conversion figures without
 * saying they are simulated is the single fastest way to lose a judge's trust,
 * and the honest version reads as rigour rather than as a caveat.
 */
export function SimulatedChip({ pct }: { pct?: number }) {
  if (pct !== undefined && pct === 0) return null;
  return (
    <span className="chip border border-[var(--caution)]/30 text-[var(--caution)]"
          style={{ background: "color-mix(in srgb, var(--caution) 8%, transparent)" }}>
      Simulated traffic
    </span>
  );
}

export function PageHeader({
  title, subtitle, right,
}: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-measure text-sm text-muted">{subtitle}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

/**
 * Empty states are designed, not defaulted.
 *
 * Most of these screens will be empty when a judge first sees them, and an
 * empty state that explains what will appear and what produces it is the
 * difference between "unfinished" and "not yet run".
 */
export function Empty({
  title, body, phase, action,
}: { title: string; body: string; phase?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-start gap-3 px-6 py-8">
      <div className="flex h-8 w-8 items-center justify-center rounded border border-border bg-base">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M2 11.5h10M3.5 9V5.5M7 9V2.5M10.5 9V7" stroke="var(--muted)"
                strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </div>
      <div>
        <h2 className="font-display text-[0.95rem] font-semibold">{title}</h2>
        <p className="mt-1 max-w-measure text-sm leading-relaxed text-muted">{body}</p>
      </div>
      {phase && (
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-muted">
          arrives in {phase}
        </p>
      )}
      {action}
    </div>
  );
}

export function Stat({
  label, value, unit, tone = "ink", hint,
}: { label: string; value: string | number; unit?: string; tone?: "ink" | "positive" | "negative" | "caution"; hint?: string }) {
  const colour = { ink: "text-ink", positive: "text-positive", negative: "text-negative", caution: "text-caution" }[tone];
  return (
    <div className="card px-4 py-3">
      <p className="label">{label}</p>
      <p className={`num mt-1.5 text-2xl font-medium ${colour}`}>
        {value}
        {unit && <span className="ml-0.5 text-sm font-normal text-muted">{unit}</span>}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Three dots stepping in sequence — the one motion motif in the product. */
export function Thinking({ label = "Working" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1 w-1 rounded-full bg-muted"
                style={{ animation: `gx-pulse 1.1s ${i * 0.16}s infinite ease-in-out` }} />
        ))}
      </span>
      {label}
      <style>{`@keyframes gx-pulse{0%,60%,100%{opacity:.25}30%{opacity:1}}`}</style>
    </span>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  return (
    <div className="card border-[var(--negative)]/30 px-5 py-4">
      <p className="label text-negative">Could not load</p>
      <p className="mt-1.5 font-mono text-xs text-ink">{String((error as Error)?.message ?? error)}</p>
      <p className="mt-2 text-xs text-muted">
        The API may be cold — the first request after a quiet spell takes a second or two.
      </p>
    </div>
  );
}
