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

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const url = new URL(BASE + path);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ site: SITE, ...body }),
  });
  const payload = await res.json();
  // A 403 here is the policy refusing, which is a real answer rather than a
  // failure — the caller renders it. Only unexpected statuses throw.
  if (!res.ok && res.status !== 403 && res.status !== 422) {
    throw new Error(`${path} returned ${res.status}`);
  }
  return payload as T;
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

export interface Opportunity {
  id: string; title: string; body: string; confidence: string;
  segment_key: string; status: string; evidence: Record<string, unknown>[];
}

export interface Experiment {
  id: string; hypothesis: string; status: string; split: Record<string, number>;
  variants: { id: string; label: string; is_control: boolean; rationale: string;
              mutations: unknown[]; validation: unknown }[];
}
export interface Learning {
  id: string; generalisation: string; hypothesis: string; segment: string;
  outcome: string; tags: string[]; confidence: string;
}

export interface PolicyDecisionRow {
  id: string;
  action: string;
  resource: string;
  decision: "allow" | "deny";
  policy_id: string | null;
  reasons: string[];
  explain: string;
  resource_attrs: Record<string, unknown> | null;
  context: Record<string, unknown> | null;
  run_id: string | null;
  created_at: string;
}
export interface PolicyDoc {
  source: string;
  ids: string[];
  decisions: PolicyDecisionRow[];
}

export interface ApprovalVariant {
  id: string; label: string; is_control: boolean;
  rationale: string; mutations: { op: string; selector: string; value?: string; note?: string }[];
}
export interface Approval {
  id: string;
  experiment_id: string;
  action: string;
  status: "pending" | "approved" | "rejected" | "expired";
  cedar_decision: { policyId: string | null; explain: string; reasons: string[] } | null;
  requested_at: string;
  requested_by: string;
  decided_at: string | null;
  decided_by: string | null;
  rejection_reason: string | null;
  hypothesis: string;
  path: string;
  experiment_status: string;
  variants: ApprovalVariant[];
}

export interface ArmResult {
  variantId: string; label: string; isControl: boolean;
  exposed: number; converted: number; rate: number;
  ci: { lo: number; hi: number };
  frictionSessions: number; frictionRate: number;
  diff: { point: number; lo: number; hi: number; p: number | null } | null;
}
export interface ExperimentResults {
  experimentId: string; path: string; hypothesis: string; status: string;
  startedAt: string | null; concludedAt: string | null;
  learningId: string | null; opportunityId: string | null;
  arms: ArmResult[];
  segments: { segment: string; underpowered: boolean;
              arms: { variantId: string; exposed: number; converted: number; rate: number }[] }[];
  divergence: { opposed: boolean; allUnderpowered: boolean;
                deltas: { segment: string; delta: number; exposed: number; underpowered: boolean }[] };
  guardrail: { metric: string; note: string; controlRate: number;
               tolerance: number; breached: boolean; breachedBy: string[] };
  decision: "not_yet_decisive" | "no_difference" | "challenger_won" | "control_won" | "guardrail_breach";
  decisionReason: string;
  minSessionsPerArm: number;
  requiredPerArm: number | null;
  totalExposed: number;
  text: string;
}

export const api = {
  policy: () => get<PolicyDoc>("/api/policy"),
  results: (experimentId: string) => get<ExperimentResults>("/api/results", { experimentId }),
  approvals: () => get<{ approvals: Approval[] }>("/api/approvals"),
  decide: (body: { approvalId: string; decision: "approve" | "reject"; decidedBy: string; reason?: string }) =>
    post<{ ok: boolean; errors?: string[] }>("/api/approvals", body),
  launch: (experimentId: string) =>
    post<{ launched: boolean; policyId?: string; explain?: string; approvalId?: string; errors?: string[] }>(
      "/api/experiments/launch", { experimentId }),
  stop: (experimentId: string) =>
    post<{ ok: boolean; errors?: string[] }>("/api/experiments/stop", { experimentId }),
  experiments: () => get<{ experiments: Experiment[] }>("/api/experiments"),
  learnings: () => get<{ learnings: Learning[] }>("/api/learnings"),
  opportunities: () => get<{ opportunities: Opportunity[] }>("/api/opportunities"),
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
