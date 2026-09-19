import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api.js";
import { useApi } from "../useApi.js";
import { PageHeader, Empty, Thinking, ErrorNote } from "../components/ui.js";

const SITE_A = import.meta.env.VITE_SITE_A_URL ?? "";

/**
 * Control and challenger, side by side, both live.
 *
 * These are real iframes of the real page with the real snippet applying the
 * real mutations — not mockups and not screenshots. That matters for the claim
 * being made: the variant a reviewer approves here is byte-for-byte the one
 * visitors will get, because it is produced by the same code path.
 *
 * A draft is fetched through ?gx_preview, which bypasses the edge cache and the
 * running-experiments filter. A draft must never reach an actual visitor.
 */
export function Diff() {
  const { experimentId } = useParams();
  const { data, error, loading } = useApi(() => api.experiments(), []);
  const [width, setWidth] = useState<"mobile" | "desktop">("mobile");
  const [hovered, setHovered] = useState<string | null>(null);

  const experiment = useMemo(
    () => (data?.experiments ?? []).find((e) => e.id === experimentId)
      ?? (data?.experiments ?? [])[0],
    [data, experimentId]
  );

  if (error) return <><PageHeader title="Variant diff" /><ErrorNote error={error} /></>;
  if (loading) return <><PageHeader title="Variant diff" /><Thinking label="Loading" /></>;
  if (!experiment) {
    return (
      <>
        <PageHeader title="Variant diff" />
        <Empty title="No experiment to compare"
               body="Run `pnpm agent:run` to have the agent propose one." />
      </>
    );
  }

  const control = experiment.variants.find((v) => v.is_control);
  const challenger = experiment.variants.find((v) => !v.is_control);
  const frameW = width === "mobile" ? 390 : 1100;
  const frameH = width === "mobile" ? 680 : 620;

  const src = (variantId: string) =>
    `${SITE_A}?gx_preview=${experiment.id}&gx_force=${variantId}`;

  return (
    <>
      <PageHeader
        title="Variant diff"
        subtitle="The control and the challenger, both running live on the real page."
        right={
          <div className="inline-flex rounded border border-border bg-surface p-0.5">
            {(["mobile", "desktop"] as const).map((w) => (
              <button key={w} onClick={() => setWidth(w)}
                      className={"rounded px-3 py-1 text-[0.8125rem] " +
                        (width === w ? "font-medium text-accent" : "text-muted hover:text-ink")}
                      style={{ background: width === w ? "var(--accent-soft)" : "transparent" }}>
                {w === "mobile" ? "390px" : "1100px"}
              </button>
            ))}
          </div>
        }
      />

      <div className="card mb-4 px-5 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-xs text-muted">{experiment.id}</span>
          <span className="chip" style={{
            color: "var(--pending)", background: "color-mix(in srgb, var(--pending) 10%, transparent)",
          }}>{String(experiment.status).replace("_", " ")}</span>
        </div>
        <p className="mt-2 max-w-measure text-sm leading-relaxed">{experiment.hypothesis}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {[control, challenger].filter(Boolean).map((v) => (
          <div key={v!.id} className="card overflow-hidden">
            <div className="flex items-baseline justify-between border-b border-border px-4 py-2.5">
              <h2 className="font-display text-sm font-semibold">{v!.label}</h2>
              <span className="num text-[0.6875rem] text-muted">
                {(v!.mutations ?? []).length} change{(v!.mutations ?? []).length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="flex justify-center overflow-hidden bg-base p-3">
              <iframe
                title={v!.label}
                src={src(v!.id)}
                width={frameW}
                height={frameH}
                className="rounded border border-border bg-surface"
                style={{
                  width: frameW, height: frameH,
                  transform: width === "desktop" ? "scale(0.52)" : "scale(0.92)",
                  transformOrigin: "top center",
                  marginBottom: width === "desktop" ? -frameH * 0.48 : -frameH * 0.08,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="card mt-4 overflow-hidden">
        <div className="border-b border-border px-5 py-2.5">
          <span className="label">What changes, and why</span>
        </div>
        {(challenger?.mutations ?? []).length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">This variant makes no changes.</p>
        ) : (
          <ul className="divide-y divide-border">
            {(challenger!.mutations as Record<string, unknown>[]).map((m, i) => (
              <li key={i}
                  onMouseEnter={() => setHovered(String(m.selector))}
                  onMouseLeave={() => setHovered(null)}
                  className="px-5 py-3 transition-colors"
                  style={{ background: hovered === String(m.selector) ? "var(--accent-soft)" : undefined }}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="chip" style={{ color: "var(--accent)", background: "var(--accent-soft)" }}>
                    {String(m.op)}
                  </span>
                  <span className="font-mono text-xs text-ink">{String(m.selector)}</span>
                  {m.target != null && (
                    <span className="font-mono text-xs text-muted">→ {String(m.target)}</span>
                  )}
                </div>
                {m.value != null && (
                  <p className="mt-1.5 font-mono text-xs">
                    <span className="text-muted">new text: </span>"{String(m.value)}"
                  </p>
                )}
                {m.props != null && (
                  <p className="mt-1.5 font-mono text-xs">
                    <span className="text-muted">style: </span>{JSON.stringify(m.props)}
                  </p>
                )}
                {m.note != null && (
                  <p className="mt-1.5 max-w-measure text-xs leading-relaxed text-muted">
                    {String(m.note)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-border px-5 py-2 text-[0.6875rem] text-muted">
          Structured operations from a closed set — never generated HTML. Each one
          is reviewable on its own, and every selector was verified against the live page.
        </p>
      </div>

      <p className="mt-4 text-xs text-muted">
        <Link to="/experiments" className="text-accent hover:underline">← All experiments</Link>
      </p>
    </>
  );
}
