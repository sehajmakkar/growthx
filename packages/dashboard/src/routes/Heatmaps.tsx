import { useEffect, useMemo, useRef, useState } from "react";
import { api, type Heatmap as HeatmapData } from "../api.js";
import { useApi } from "../useApi.js";
import { HeatCanvas, ScrollOverlay } from "../components/HeatCanvas.js";
import { PageHeader, SimulatedChip, Thinking, ErrorNote, Empty } from "../components/ui.js";

const CDN = import.meta.env.VITE_CDN_URL ?? "";

type Device = "mobile" | "desktop";
type Mode = "clicks" | "scroll" | "attention";

/** Real document dimensions, captured alongside the screenshots in P9. */
const SHOT = {
  mobile: { src: `${CDN}/shots/site-a-mobile.png`, w: 390, h: 4685 },
  desktop: { src: `${CDN}/shots/site-a-desktop.png`, w: 1440, h: 2960 },
};

const AUDIENCES = [
  { key: "", label: "Everyone" },
  { key: "outcome=converted", label: "Converted" },
  { key: "outcome=bounced", label: "Bounced" },
];
const VISITORS = [
  { key: "", label: "All visitors" },
  { key: "visitor=new", label: "New" },
  { key: "visitor=returning", label: "Returning" },
];

function segmentKey(device: Device, audience: string, visitor: string) {
  const parts = [`device=${device}`, audience, visitor].filter(Boolean);
  // Dimensions are sorted so the key matches what aggregation computed.
  const order = ["device", "visitor", "outcome"];
  return parts.sort((a, b) => order.indexOf(a.split("=")[0]!) - order.indexOf(b.split("=")[0]!)).join("|");
}

export function Heatmaps() {
  const [device, setDevice] = useState<Device>("mobile");
  const [mode, setMode] = useState<Mode>("clicks");
  const [audience, setAudience] = useState("outcome=bounced");
  const [visitor, setVisitor] = useState("");
  const segment = segmentKey(device, audience, visitor);

  const summary = useApi(() => api.summary(segment), [segment]);
  const heat = useApi(() => api.heatmap(segment), [segment]);
  const pts = useApi(
    () => api.points(segment, mode === "attention" ? "attention" : "clicks"),
    [segment, mode]
  );

  // The overlay is drawn at the rendered size of the screenshot, not its
  // intrinsic size, so it stays aligned as the panel resizes.
  const frameRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e!.contentRect;
      setBox({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [device]);

  const shot = SHOT[device];
  const hasData = (summary.data?.sessions ?? 0) > 0;
  const points = pts.data?.points ?? [];

  // Where the activity actually is, in twentieths of the page. A long page shown
  // in a short pane opens on the header, which is almost never where anything
  // happened — without this you see an empty overlay and assume it is broken.
  const density = useMemo(() => {
    const bins = new Array(20).fill(0);
    for (const p of points) {
      const i = Math.min(19, Math.max(0, Math.floor(p.y * 20)));
      bins[i] += p.weight;
    }
    const max = Math.max(1, ...bins);
    return { bins, max, peak: bins.indexOf(Math.max(...bins)) };
  }, [points]);

  // Open on the densest region rather than the top of the document.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !box.h || mode === "scroll" || points.length === 0) return;
    const target = ((density.peak + 0.5) / 20) * box.h - el.clientHeight / 2;
    el.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, [density.peak, box.h, mode, points.length]);

  return (
    <>
      <PageHeader
        title="Heatmaps"
        subtitle="Where visitors looked, what they acted on, and how far they got."
        right={<SimulatedChip pct={heat.data?.simulated_pct} />}
      />

      {/* Header figures, the way a CRO tool states the shape of the data. */}
      <div className="card mb-4 flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-3">
        <div>
          <p className="label">Page</p>
          <p className="mt-0.5 font-mono text-xs">corrick.example/</p>
        </div>
        {[
          ["Sessions", summary.data?.sessions],
          ["Pageviews", summary.data?.pageviews],
          ["Total clicks", summary.data?.clicks],
          ["Avg. time on page", summary.data?.avg_seconds != null ? `${summary.data.avg_seconds}s` : "—"],
          ["Conversion", summary.data?.conversion_pct != null ? `${summary.data.conversion_pct}%` : "—"],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <p className="label">{label}</p>
            <p className="num mt-0.5 text-sm font-medium">{value ?? "—"}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={device} onChange={(v) => setDevice(v as Device)}
                   options={[{ key: "mobile", label: "Mobile" }, { key: "desktop", label: "Desktop" }]} />
        <Segmented value={mode} onChange={(v) => setMode(v as Mode)}
                   options={[
                     { key: "clicks", label: "Clicks" },
                     { key: "scroll", label: "Scroll" },
                     { key: "attention", label: "Attention" },
                   ]} />
        <span className="mx-1 h-5 w-px bg-border" />
        <Select value={audience} onChange={setAudience} options={AUDIENCES} label="Outcome" />
        <Select value={visitor} onChange={setVisitor} options={VISITORS} label="Visitor" />
      </div>

      {heat.error && <ErrorNote error={heat.error} />}

      {!heat.error && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <span className="label">
                {mode === "clicks" ? "Click density" : mode === "scroll" ? "Scroll reach" : "Attention"}
              </span>
              <span className="num text-[0.6875rem] text-muted">
                {mode === "scroll"
                  ? `${heat.data?.sessions ?? 0} sessions`
                  : `${pts.data?.points.length ?? 0} points`}
              </span>
            </div>

            <div className="relative flex max-h-[38rem] gap-2 overflow-hidden bg-base">
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
              {!hasData && !summary.loading ? (
                <Empty title="No sessions in this segment"
                       body="Try a broader outcome filter, or send more traffic with `pnpm swarm --sessions 200`." />
              ) : (
                <div ref={frameRef} className="relative mx-auto w-full"
                     style={{ maxWidth: device === "mobile" ? 390 : 900 }}>
                  <img src={shot.src} alt="" width={shot.w} height={shot.h}
                       className="block w-full rounded border border-border"
                       style={{ filter: "grayscale(0.6) contrast(0.92) brightness(1.04)" }} />
                  {mode === "scroll" ? (
                    <ScrollOverlay bands={heat.data?.scroll_bands ?? []} height={box.h} />
                  ) : (
                    <HeatCanvas points={points} width={box.w} height={box.h}
                                kind={mode === "attention" ? "attention" : "clicks"}
                                // Radius scales with the rendered width, not a
                                // fixed pixel value: a fixed radius on a 4685px
                                // page renders as pinpricks, and on a short page
                                // as one indistinct smear.
                                radius={Math.max(18, box.w * 0.085)}
                                intensity={1.25} />
                  )}
                </div>
              )}
              </div>

              {/* Density rail: where on the page the activity is, so a long page
                  shown in a short pane never looks empty. */}
              {mode !== "scroll" && points.length > 0 && (
                <div className="w-7 shrink-0 border-l border-border py-4 pr-2">
                  <div className="flex h-full flex-col">
                    {density.bins.map((v, i) => (
                      <button
                        key={i}
                        title={`${Math.round((i / 20) * 100)}–${Math.round(((i + 1) / 20) * 100)}% down · ${v} interactions`}
                        onClick={() => scrollRef.current?.scrollTo({
                          top: Math.max(0, ((i + 0.5) / 20) * box.h - (scrollRef.current!.clientHeight / 2)),
                          behavior: "smooth",
                        })}
                        className="flex-1 rounded-sm transition-opacity hover:opacity-100"
                        style={{
                          background: v === 0 ? "var(--border)" : "var(--click-2)",
                          opacity: v === 0 ? 0.4 : 0.35 + (v / density.max) * 0.65,
                          marginBottom: 1,
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 border-t border-border px-4 py-2">
              <span className="label">Low</span>
              <div className="h-2 flex-1 rounded"
                   style={{ background: mode === "scroll"
                     ? "linear-gradient(90deg, var(--scroll-0), var(--scroll-1), var(--scroll-2))"
                     : mode === "attention"
                       ? "linear-gradient(90deg, var(--attn-0), var(--attn-1), var(--attn-2), var(--attn-3))"
                       : "linear-gradient(90deg, var(--click-0), var(--click-1), var(--click-2), var(--click-3), var(--click-4))" }} />
              <span className="label">High</span>
              <span className="ml-2 text-[0.6875rem] text-muted">
                The page is desaturated so the overlay is the only strong colour.
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {(heat.loading || pts.loading) && <Thinking label="Loading segment" />}
            {heat.data && <ElementsPanel data={heat.data} />}
            {heat.data && <FrictionPanel data={heat.data} />}
          </div>
        </div>
      )}
    </>
  );
}

function Segmented({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { key: string; label: string }[];
}) {
  return (
    <div className="inline-flex rounded border border-border bg-surface p-0.5">
      {options.map((o) => (
        <button key={o.key} onClick={() => onChange(o.key)}
                className={"rounded px-3 py-1 text-[0.8125rem] transition-colors " +
                  (value === o.key ? "font-medium text-accent" : "text-muted hover:text-ink")}
                style={{ background: value === o.key ? "var(--accent-soft)" : "transparent",
                         transitionDuration: "140ms" }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Select({ value, onChange, options, label }: {
  value: string; onChange: (v: string) => void;
  options: { key: string; label: string }[]; label: string;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 rounded border border-border bg-surface px-2.5 py-1">
      <span className="label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
              className="bg-transparent text-[0.8125rem] text-ink outline-none">
        {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
    </label>
  );
}

function ElementsPanel({ data }: { data: HeatmapData }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-border px-4 py-2.5">
        <span className="label">Elements — most seen, least acted on</span>
      </div>
      <ul className="divide-y divide-border">
        {rank(data.elements).slice(0, 8).map((e) => (
          <li key={e.selector} className="px-4 py-2.5">
            <p className="truncate font-mono text-[0.6875rem] text-ink" title={e.selector}>{e.selector}</p>
            <div className="mt-1 flex items-center gap-3 text-[0.6875rem] text-muted">
              <span className="num">{e.viewed_pct}% saw</span>
              <span className={"num " + (e.views > 5 && e.click_rate_pct === 0 ? "text-negative" : "")}>
                {e.click_rate_pct}% clicked
              </span>
              {e.median_time_to_first_view_s != null && (
                <span className="num">{e.median_time_to_first_view_s}s to see</span>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="border-t border-border px-4 py-2 text-[0.6875rem] text-muted">
        Clicked is clicks ÷ visitors who saw it, not ÷ all sessions.
      </p>
    </div>
  );
}

function FrictionPanel({ data }: { data: HeatmapData }) {
  return (
    <div className="card px-4 py-3">
      <span className="label">Friction</span>
      {data.friction.length === 0 ? (
        <p className="mt-2 text-sm text-muted">None recorded in this segment.</p>
      ) : (
        <ul className="mt-2.5 flex flex-col gap-2">
          {data.friction.slice(0, 5).map((f, i) => (
            <li key={i} className="flex items-baseline gap-2">
              <span className="chip"
                    style={{ color: `var(--${f.type === "rage_click" ? "negative" : "caution"})`,
                             background: `color-mix(in srgb, var(--${f.type === "rage_click" ? "negative" : "caution"}) 8%, transparent)` }}>
                {f.type.replace("_", " ")}
              </span>
              <span className="num text-xs">×{f.count}</span>
              <span className="truncate font-mono text-[0.6875rem] text-muted" title={f.selector}>
                {f.selector}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Popularity is the wrong sort. What matters is seen-but-not-acted-on. */
function rank<T extends { views: number; click_rate_pct: number; rage_clicks: number; dead_clicks: number }>(els: T[]) {
  return [...els].sort((a, b) => score(b) - score(a));
}
function score(e: { views: number; click_rate_pct: number; rage_clicks: number; dead_clicks: number }) {
  const attention = Math.log1p(e.views);
  const inaction = e.views > 5 ? 1 - Math.min(1, e.click_rate_pct / 30) : 0;
  const friction = Math.log1p(e.rage_clicks * 3 + e.dead_clicks);
  return attention * inaction + friction * 2;
}
