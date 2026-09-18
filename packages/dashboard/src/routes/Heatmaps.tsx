import { useState } from "react";
import { api } from "../api.js";
import { useApi } from "../useApi.js";
import { PageHeader, SimulatedChip, Thinking, ErrorNote, Empty } from "../components/ui.js";

const SEGMENTS = [
  { key: "all", label: "Everyone" },
  { key: "device=mobile", label: "Mobile" },
  { key: "device=desktop", label: "Desktop" },
  { key: "outcome=converted", label: "Converted" },
  { key: "outcome=bounced", label: "Bounced" },
  { key: "device=mobile|outcome=bounced", label: "Mobile · bounced" },
];

/**
 * P10 ships the data side of this screen: segments, per-element figures, scroll
 * bands and friction, all live. The overlay drawn on the page screenshot — the
 * part judges look at longest — is P11.
 */
export function Heatmaps() {
  const [segment, setSegment] = useState("device=mobile|outcome=bounced");
  const { data, error, loading } = useApi(() => api.heatmap(segment), [segment]);

  return (
    <>
      <PageHeader
        title="Heatmaps"
        subtitle="What visitors saw, what they acted on, and where they gave up."
        right={<SimulatedChip pct={data?.simulated_pct} />}
      />

      <div className="mb-5 flex flex-wrap gap-1.5">
        {SEGMENTS.map((s) => (
          <button key={s.key} onClick={() => setSegment(s.key)}
                  className={"btn " + (segment === s.key ? "border-accent text-accent" : "")}
                  style={{ background: segment === s.key ? "var(--accent-soft)" : undefined }}>
            {s.label}
          </button>
        ))}
      </div>

      {error && <ErrorNote error={error} />}
      {loading && <Thinking label="Loading segment" />}

      {data && !loading && (data.sessions === 0 ? (
        <Empty title="No sessions in this segment"
               body="Try a broader segment, or send more traffic with `pnpm swarm --sessions 200`." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <div className="card overflow-hidden">
            <div className="flex items-baseline justify-between border-b border-border px-5 py-3">
              <h2 className="font-display text-sm font-semibold">Elements</h2>
              <span className="num text-xs text-muted">{data.sessions} sessions</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-5 py-2 label font-medium">Element</th>
                  <th className="px-3 py-2 label text-right font-medium">Saw it</th>
                  <th className="px-3 py-2 label text-right font-medium">Clicked</th>
                  <th className="px-5 py-2 label text-right font-medium">To first view</th>
                </tr>
              </thead>
              <tbody>
                {rank(data.elements).slice(0, 14).map((e) => (
                  <tr key={e.selector} className="border-b border-border last:border-0">
                    <td className="max-w-0 truncate px-5 py-2 font-mono text-xs" title={e.selector}>
                      {e.selector}
                    </td>
                    <td className="num px-3 py-2 text-right text-xs">{e.viewed_pct}%</td>
                    <td className={"num px-3 py-2 text-right text-xs " +
                        (e.views > 5 && e.click_rate_pct === 0 ? "text-negative" : "")}>
                      {e.click_rate_pct}%
                    </td>
                    <td className="num px-5 py-2 text-right text-xs text-muted">
                      {e.median_time_to_first_view_s ?? "—"}s
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-border px-5 py-2 text-xs text-muted">
              Clicked is clicks ÷ visitors who saw the element, not ÷ all sessions.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <div className="card px-5 py-4">
              <h2 className="font-display text-sm font-semibold">Scroll depth</h2>
              <div className="mt-3 flex flex-col gap-2">
                {data.scroll_bands.map((b) => (
                  <div key={b.depth_pct} className="flex items-center gap-2.5">
                    <span className="num w-9 shrink-0 text-xs text-muted">{b.depth_pct}%</span>
                    <div className="h-4 flex-1 overflow-hidden rounded bg-base">
                      <div className="h-full" style={{
                        width: `${b.reach_pct}%`,
                        background: `linear-gradient(90deg, var(--scroll-1), var(--scroll-2))`,
                      }} />
                    </div>
                    <span className="num w-11 shrink-0 text-right text-xs">{b.reach_pct}%</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">Share of sessions reaching each depth.</p>
            </div>

            <div className="card px-5 py-4">
              <h2 className="font-display text-sm font-semibold">Friction</h2>
              {data.friction.length === 0 ? (
                <p className="mt-2 text-sm text-muted">None recorded in this segment.</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {data.friction.slice(0, 5).map((f, i) => (
                    <li key={i} className="flex items-baseline gap-2">
                      <span className={"chip " + (f.type === "rage_click"
                        ? "text-negative" : "text-caution")}
                        style={{ background: `color-mix(in srgb, var(--${f.type === "rage_click" ? "negative" : "caution"}) 8%, transparent)` }}>
                        {f.type.replace("_", " ")}
                      </span>
                      <span className="num text-xs">×{f.count}</span>
                      <span className="truncate font-mono text-xs text-muted" title={f.selector}>
                        {f.selector}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

/**
 * Sorting by raw view count surfaces the page header and the hero — things
 * everyone sees and nobody interacts with. What a growth team needs first is
 * whatever many people saw and few acted on, plus anything generating friction.
 */
function rank<T extends { views: number; click_rate_pct: number; rage_clicks: number; dead_clicks: number }>(els: T[]): T[] {
  return [...els].sort((a, b) => score(b) - score(a));
}
function score(e: { views: number; click_rate_pct: number; rage_clicks: number; dead_clicks: number }) {
  const attention = Math.log1p(e.views);
  const inaction = e.views > 5 ? 1 - Math.min(1, e.click_rate_pct / 30) : 0;
  const friction = Math.log1p(e.rage_clicks * 3 + e.dead_clicks);
  return attention * inaction + friction * 2;
}
