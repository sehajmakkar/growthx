const BASE = import.meta.env.VITE_API_BASE ?? "";
const SITE = import.meta.env.VITE_SITE_ID ?? "site_corrick";

export interface HeatmapElement {
  selector: string;
  views: number;
  clicks: number;
  rage_clicks: number;
  dead_clicks: number;
  viewed_pct: number;
  click_rate_pct: number;
  median_time_to_first_view_s: number | null;
  median_visible_ms: number | null;
}

export interface Heatmap {
  page: string;
  segment: string;
  sessions: number;
  simulated_pct: number;
  elements: HeatmapElement[];
  scroll_bands: { depth_pct: number; reach_pct: number }[];
  friction: { type: string; selector: string; count: number; sessions: number }[];
  funnel: { step: string; sessions: number }[];
}

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(BASE + path);
  url.searchParams.set("site", SITE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.json() as Promise<T>;
}

export interface Point { x: number; y: number; weight: number; type: string; selector: string }
export interface Summary {
  sessions: number; pageviews: number; clicks: number;
  avg_seconds: number | null; conversion_pct: number | null;
}

export interface Run {
  id: string; trigger: string; status: string;
  steps: Record<string, unknown>[]; error: string | null;
  started_at: string; finished_at: string | null;
}

export const api = {
  runs: () => get<{ runs: Run[] }>("/api/runs"),
  points: (segment: string, mode: "clicks" | "attention", path = "/") =>
    get<{ mode: string; points: Point[] }>("/api/points", { segment, mode, path }),
  summary: (segment: string, path = "/") => get<Summary>("/api/summary", { segment, path }),
  heatmap: (segment: string, path = "/") => get<Heatmap>("/api/heatmap", { segment, path }),
  funnel: (segment: string, path = "/") =>
    get<{ steps: { step: string; sessions: number }[] }>("/api/funnel", { segment, path }),
  digests: (path = "/") =>
    get<{ clusters: { signature: string; session_count: number; narrative: string; stats: Record<string, number> }[] }>(
      "/api/digests", { path }
    ),
};
