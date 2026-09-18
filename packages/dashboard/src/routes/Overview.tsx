import { api, type Heatmap } from "../api.js";
import { useApi } from "../useApi.js";
import { PageHeader, Stat, SimulatedChip, Thinking, ErrorNote, Empty } from "../components/ui.js";

export function Overview() {
  const mobile = useApi(() => api.heatmap("device=mobile"), []);
  const desktop = useApi(() => api.heatmap("device=desktop"), []);

  if (mobile.error) return <><PageHeader title="Overview" /><ErrorNote error={mobile.error} /></>;
  if (mobile.loading || desktop.loading) {
    return <><PageHeader title="Overview" /><Thinking label="Loading behaviour" /></>;
  }
  if (!mobile.data?.sessions) {
    return (
      <>
        <PageHeader title="Overview" />
        <Empty title="No behaviour recorded yet"
               body="Install the snippet on a page and send it some traffic. Locally, `pnpm swarm --sessions 200` drives simulated visitors through the real snippet and the real ingestion endpoint." />
      </>
    );
  }

  const cta = (h: Heatmap | null) =>
    h?.elements.find((e) => e.selector.includes("cta-primary"));
  const m = cta(mobile.data);
  const d = cta(desktop.data);
  const gap = m && d ? d.click_rate_pct - m.click_rate_pct : 0;

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="What visitors did, and where the objective is leaking."
        right={<SimulatedChip pct={mobile.data.simulated_pct} />}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Sessions" value={mobile.data.sessions + (desktop.data?.sessions ?? 0)} />
        <Stat label="Mobile CTA click rate" value={m?.click_rate_pct ?? 0} unit="%"
              tone={gap > 5 ? "negative" : "ink"}
              hint={`of the ${m?.viewed_pct ?? 0}% who saw it`} />
        <Stat label="Desktop CTA click rate" value={d?.click_rate_pct ?? 0} unit="%"
              hint={`of the ${d?.viewed_pct ?? 0}% who saw it`} />
        <Stat label="Time to reach the CTA" value={m?.median_time_to_first_view_s ?? "—"} unit="s"
              hint="median, mobile" />
      </div>

      {m && d && gap > 5 && (
        <div className="card mt-4 px-5 py-4">
          <p className="label">Where the objective is leaking</p>
          <p className="mt-2 max-w-measure text-sm leading-relaxed">
            Mobile visitors see the call to action about as reliably as desktop visitors
            (<span className="num">{m.viewed_pct}%</span> against{" "}
            <span className="num">{d.viewed_pct}%</span>) and act on it{" "}
            <span className="num font-medium text-negative">
              {(d.click_rate_pct / Math.max(0.1, m.click_rate_pct)).toFixed(1)}×
            </span>{" "}
            less often. On desktop the button is on screen the moment the page paints; on
            mobile it takes a median of{" "}
            <span className="num">{m.median_time_to_first_view_s}s</span> of scrolling to reach.
          </p>
          <p className="mt-2 text-xs text-muted">
            Click rate is clicks divided by the visitors who actually saw the element, not by all sessions.
          </p>
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <FunnelCard title="Mobile" data={mobile.data} />
        <FunnelCard title="Desktop" data={desktop.data} />
      </div>
    </>
  );
}

function FunnelCard({ title, data }: { title: string; data: Heatmap | null }) {
  if (!data) return null;
  const top = data.funnel[0]?.sessions ?? 1;
  return (
    <div className="card px-5 py-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-sm font-semibold">{title}</h2>
        <span className="num text-xs text-muted">{data.sessions} sessions</span>
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        {data.funnel.map((s) => {
          const pct = top > 0 ? (s.sessions / top) * 100 : 0;
          return (
            <div key={s.step} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-xs text-muted">{s.step.replace(/_/g, " ")}</span>
              <div className="h-5 flex-1 overflow-hidden rounded bg-base">
                <div className="h-full rounded transition-[width]"
                     style={{ width: `${pct}%`, background: "var(--accent)", opacity: 0.85,
                              transitionDuration: "220ms" }} />
              </div>
              <span className="num w-10 shrink-0 text-right text-xs">{s.sessions}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
