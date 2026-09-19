/**
 * GrowthX schema. PLAN.md §4.1.
 *
 * Deliberately boring: normalised where it helps, jsonb where the shape is
 * genuinely open, no cleverness anywhere. Hot-path columns are promoted out of
 * `payload` precisely because they are what we GROUP BY (§4.2).
 */
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ── enums ────────────────────────────────────────────────────────────────────

export const deviceEnum = pgEnum("device_class", ["mobile", "tablet", "desktop"]);

export const eventTypeEnum = pgEnum("event_type", [
  "pageview",
  "exposure",
  "click",
  "dead_click",
  "rage_click",
  "scroll",
  "element_view",
  "dwell",
  "hover",
  "back_exit",
  "conversion",
  "custom",
]);

export const experimentStatusEnum = pgEnum("experiment_status", [
  "draft",
  "pending_approval",
  "rejected",
  "running",
  "stopping",
  "concluded",
  "killed",
]);

export const outcomeEnum = pgEnum("learning_outcome", [
  "won",
  "lost",
  "inconclusive",
  "guardrail_breach",
]);

export const opportunityStatusEnum = pgEnum("opportunity_status", [
  "open",
  "hypothesised",
  "tested",
  "dismissed",
]);

export const approvalActionEnum = pgEnum("approval_action", [
  "launch_experiment",
  "deploy_winner",
]);

export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "approved",
  "rejected",
  "expired",
]);

export const reportKindEnum = pgEnum("report_kind", ["analysis", "experiment"]);

// ── sites ────────────────────────────────────────────────────────────────────

export const sites = pgTable("sites", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  origins: text("origins").array().notNull().default([]),
  /** {metric, from, to} — what the agent is trying to move. */
  objective: jsonb("objective").notNull(),
  /** {metric, direction, threshold} — what it may not trade away. */
  guardrail: jsonb("guardrail").notNull(),
  /** {kind: "selector"|"url", value} */
  conversion: jsonb("conversion").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── events ───────────────────────────────────────────────────────────────────
// The only high-volume table. No sharding: that concept existed purely to dodge
// a DynamoDB hot partition and does not apply here (PLAN.md §3.2).

export const events = pgTable(
  "events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    siteId: text("site_id").notNull(),
    /** Not a FK: sessions rows are derived later by the aggregation pass. */
    sessionId: text("session_id").notNull(),
    visitorId: text("visitor_id").notNull(),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    seq: integer("seq").notNull(),
    type: eventTypeEnum("type").notNull(),
    path: text("path").notNull(),
    experimentId: text("experiment_id"),
    variantId: text("variant_id"),
    device: deviceEnum("device").notNull(),
    isReturning: boolean("is_returning").notNull().default(false),
    referrer: text("referrer").notNull().default(""),
    viewport: jsonb("viewport").notNull(),
    // Promoted out of payload because these are what we GROUP BY (§4.2).
    selector: text("selector"),
    elemFrac: jsonb("elem_frac"),
    pageFrac: jsonb("page_frac"),
    vpFrac: jsonb("vp_frac"),
    scrollY: integer("scroll_y"),
    docH: integer("doc_h"),
    /** Type-specific remainder only. */
    payload: jsonb("payload"),
    simulated: boolean("simulated").notNull().default(false),
    persona: text("persona"),
  },
  (t) => [
    index("events_site_path_ts_idx").on(t.siteId, t.path, t.ts),
    index("events_session_idx").on(t.sessionId, t.ts, t.seq),
    index("events_experiment_idx").on(t.experimentId, t.variantId),
    index("events_site_selector_idx").on(t.siteId, t.selector),
  ]
);

// ── sessions (derived) ───────────────────────────────────────────────────────
// Exists so converted-vs-bounced is a join rather than a subquery.

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").notNull(),
    visitorId: text("visitor_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    device: deviceEnum("device").notNull(),
    isReturning: boolean("is_returning").notNull().default(false),
    converted: boolean("converted").notNull().default(false),
    bounced: boolean("bounced").notNull().default(false),
    maxScrollFrac: real("max_scroll_frac").notNull().default(0),
    eventCount: integer("event_count").notNull().default(0),
    experimentId: text("experiment_id"),
    variantId: text("variant_id"),
    simulated: boolean("simulated").notNull().default(false),
    persona: text("persona"),
  },
  (t) => [
    index("sessions_site_idx").on(t.siteId, t.startedAt),
    index("sessions_segment_idx").on(t.siteId, t.device, t.converted),
    index("sessions_experiment_idx").on(t.experimentId, t.variantId),
  ]
);

// ── snapshots ────────────────────────────────────────────────────────────────

export const snapshots = pgTable(
  "snapshots",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").notNull(),
    path: text("path").notNull(),
    contentHash: text("content_hash").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    viewport: jsonb("viewport").notNull(),
    elements: jsonb("elements").notNull(),
    isCurrent: boolean("is_current").notNull().default(true),
  },
  (t) => [
    uniqueIndex("snapshots_unique_idx").on(t.siteId, t.path, t.contentHash),
    index("snapshots_current_idx").on(t.siteId, t.path, t.isCurrent),
  ]
);

// ── aggregates ───────────────────────────────────────────────────────────────

export const aggregates = pgTable(
  "aggregates",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").notNull(),
    path: text("path").notNull(),
    /** Canonical key from segmentKey() in @growthx/shared. */
    segmentKey: text("segment_key").notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    sessions: integer("sessions").notNull().default(0),
    elements: jsonb("elements").notNull(),
    scrollBands: jsonb("scroll_bands").notNull(),
    friction: jsonb("friction").notNull(),
    funnel: jsonb("funnel").notNull(),
    sourceEventCount: integer("source_event_count").notNull().default(0),
    simulatedPct: real("simulated_pct").notNull().default(0),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("aggregates_unique_idx").on(t.siteId, t.path, t.segmentKey, t.windowEnd),
  ]
);

// ── experiments & variants ───────────────────────────────────────────────────

export const experiments = pgTable(
  "experiments",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").notNull(),
    path: text("path").notNull(),
    opportunityId: text("opportunity_id"),
    hypothesis: text("hypothesis").notNull().default(""),
    status: experimentStatusEnum("status").notNull().default("draft"),
    /** {variantId: pct} summing to 100. */
    split: jsonb("split").notNull(),
    guardrail: jsonb("guardrail"),
    autoStop: jsonb("auto_stop"),
    sfnExecutionArn: text("sfn_execution_arn"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    concludedAt: timestamp("concluded_at", { withTimezone: true }),
    learningId: text("learning_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // The manifest build path. Must be fast: every page view hits it.
  (t) => [index("experiments_manifest_idx").on(t.siteId, t.path, t.status)]
);

export const variants = pgTable(
  "variants",
  {
    id: text("id").primaryKey(),
    experimentId: text("experiment_id")
      .notNull()
      .references(() => experiments.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    isControl: boolean("is_control").notNull().default(false),
    rationale: text("rationale").notNull().default(""),
    /** Closed mutation op set — see @growthx/shared mutations schema. */
    mutations: jsonb("mutations").notNull().default([]),
    validation: jsonb("validation"),
    screenshotDesktopKey: text("screenshot_desktop_key"),
    screenshotMobileKey: text("screenshot_mobile_key"),
  },
  (t) => [index("variants_experiment_idx").on(t.experimentId)]
);

// ── learnings — the experiment memory ────────────────────────────────────────

export const learnings = pgTable(
  "learnings",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").notNull(),
    experimentId: text("experiment_id"),
    hypothesis: text("hypothesis").notNull().default(""),
    changeSummary: text("change_summary").notNull().default(""),
    segment: text("segment").notNull().default("all"),
    outcome: outcomeEnum("outcome").notNull(),
    /** {lift, ciLow, ciHigh, n, pValue, significant} */
    effect: jsonb("effect"),
    /** The one sentence that gets retrieved before the next hypothesis. */
    generalisation: text("generalisation").notNull(),
    tags: text("tags").array().notNull().default([]),
    confidence: text("confidence").notNull().default("medium"),
    evidenceRefs: jsonb("evidence_refs"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("learnings_site_idx").on(t.siteId, t.createdAt)]
);

// ── opportunities ────────────────────────────────────────────────────────────

export const opportunities = pgTable(
  "opportunities",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    confidence: text("confidence").notNull().default("medium"),
    rank: integer("rank").notNull().default(0),
    /** Each item {kind, label, value, sourceRef} — every claim points at a row. */
    evidence: jsonb("evidence").notNull().default([]),
    segmentKey: text("segment_key").notNull().default("all"),
    status: opportunityStatusEnum("status").notNull().default("open"),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("opportunities_site_idx").on(t.siteId, t.detectedAt)]
);

// ── digests ──────────────────────────────────────────────────────────────────

export const digests = pgTable(
  "digests",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").notNull(),
    path: text("path").notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    /** Deterministic behavioural fingerprint the clustering groups on. */
    signature: text("signature").notNull(),
    sessionCount: integer("session_count").notNull().default(0),
    segmentKey: text("segment_key").notNull().default("all"),
    stats: jsonb("stats").notNull(),
    narrative: text("narrative").notNull().default(""),
    exampleSessionIds: text("example_session_ids").array().notNull().default([]),
  },
  (t) => [index("digests_site_path_idx").on(t.siteId, t.path, t.windowEnd)]
);

// ── approvals — the human gate ───────────────────────────────────────────────

export const approvals = pgTable(
  "approvals",
  {
    id: text("id").primaryKey(),
    experimentId: text("experiment_id").notNull(),
    action: approvalActionEnum("action").notNull(),
    /** Populated only on the Step Functions path (PLAN.md §3.3). */
    taskToken: text("task_token"),
    /** {decision, policyId, reasons[]} — rendered in the UI, denials included. */
    cedarDecision: jsonb("cedar_decision"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    requestedBy: text("requested_by").notNull().default("agent:growth-orchestrator"),
    status: approvalStatusEnum("status").notNull().default("pending"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBy: text("decided_by"),
    rejectionReason: text("rejection_reason"),
  },
  (t) => [index("approvals_status_idx").on(t.status, t.requestedAt)]
);

// ── policy decisions — every Cedar evaluation, allows and denials alike ──────

/**
 * Written before the action happens, whichever way the decision goes.
 *
 * Denials are the reason this table exists. A refused action writes nothing
 * anywhere else — no experiment row, no approval — so without this the most
 * important thing the gate does would leave no trace at all, and "the agent is
 * governed" would be a claim rather than a record.
 */
export const policyDecisions = pgTable(
  "policy_decisions",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").notNull(),
    principal: text("principal").notNull().default("agent:growth-orchestrator"),
    action: text("action").notNull(),
    resource: text("resource").notNull(),
    decision: text("decision").notNull(),
    /** The @id from policies/growthx.cedar that decided it. */
    policyId: text("policy_id"),
    reasons: jsonb("reasons").notNull().default([]),
    /** Sentence shown in the dashboard next to the decision. */
    explain: text("explain").notNull().default(""),
    /** The attributes Cedar actually saw — the audit is worthless if you
     *  cannot tell what the engine was told. */
    resourceAttrs: jsonb("resource_attrs"),
    context: jsonb("context"),
    runId: text("run_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("policy_decisions_site_idx").on(t.siteId, t.createdAt)]
);

// ── reports ──────────────────────────────────────────────────────────────

export const reports = pgTable(
  "reports",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").notNull(),
    kind: reportKindEnum("kind").notNull(),
    title: text("title").notNull(),
    /** Markdown lives here, not S3: reports are small and a join beats a fetch. */
    bodyMd: text("body_md").notNull().default(""),
    summary: text("summary").notNull().default(""),
    relatedIds: jsonb("related_ids"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reports_site_idx").on(t.siteId, t.createdAt)]
);

// ── runs — agent run log, drives the live activity feed ──────────────────────

export const runs = pgTable(
  "runs",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").notNull(),
    trigger: text("trigger").notNull().default("manual"),
    status: text("status").notNull().default("running"),
    /** [{agent, tool, input, output, cedarDecision, model, tokens, ms}] */
    steps: jsonb("steps").notNull().default([]),
    traceId: text("trace_id"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("runs_site_idx").on(t.siteId, t.startedAt)]
);

export const allTables = {
  sites,
  events,
  sessions,
  snapshots,
  aggregates,
  experiments,
  variants,
  learnings,
  opportunities,
  digests,
  approvals,
  policyDecisions,
  reports,
  runs,
};
