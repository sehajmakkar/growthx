# GrowthX — Implementation Plan

> An AI growth engineer that continuously experiments on your website.
> WeMakeDevs × AWS hackathon. **Hard deadline: Sat 20 Sept 2026, 19:49.** Today is Thu 18 Sept. Solo build, implemented phase-by-phase with Claude Code. Target track: **Ship It** (primary), **Best UI** (secondary, free ride).

---

## 0. Read this first

### 0.1 The one claim we are proving on video

> The agent observed real behaviour on a live site, found a real conversion problem, showed the evidence, formed a falsifiable hypothesis informed by what it learned from a previous experiment, generated safe DOM-level variants, was blocked by policy from launching until a human approved, ran a governed test, read the result honestly, and proposed the next one.

Every phase below exists to make one link of that chain true. Anything that does not serve that sentence is a candidate for the cut list.

### 0.2 What we are explicitly NOT claiming

- Not claiming statistical significance on real human traffic. Two and a half days cannot produce it.
- Not claiming production multi-tenancy, auth, or GA4/Segment parity.
- Not claiming the agent is autonomous. It is deliberately gated. That is a feature, and we say so.

### 0.3 The real clock — 2.5 days, not 4

The deadline is **20 Sept at 19:49**. Working backwards from it:

| Block | Window | Usable hours | Phases |
|---|---|---|---|
| **Day 1** — Thu 18 Sept | now → ~22:00 | ~12h | P0 → P7 |
| **Day 2** — Fri 19 Sept | ~08:00 → ~22:00 | ~13h | P8 → P16 |
| **Day 3a** — Sat 20 Sept, build | 08:00 → **14:00** | ~6h | P17 → P21 |
| **Day 3b** — Sat 20 Sept, ship | 14:00 → 19:49 | ~5.5h | P22 → P23 |

**Three hard rules that come out of this clock:**

1. **At 14:00 on Saturday, feature work stops.** Not "mostly stops". Whatever state the product is in at 14:00 is what gets filmed. Recording, editing, README, architecture diagram and the submission form need every minute of the remaining 5.5 hours, and the submission form itself is a 30-minute task that people routinely discover at 19:30.
2. **Submit a first version by 18:00.** If the platform allows edits, submit something complete-but-imperfect at 18:00 and improve it until 19:40. Never let the first submission attempt be the one at 19:45.
3. **Anything not shot by the time the video is cut does not exist.** The shot list in §10 maps every shot to the phase that produces it, and nothing in the video depends on a phase later than P20.

This is ~31 hours of build against a feature list originally scoped for ~48. §1 handles that with pre-emptive cuts, made now rather than panic-cut on Saturday morning.

### 0.4 Non-negotiable sequencing rule

The two things that kill this project are **hallucinated selectors** (every mutation silently no-ops and there is no product) and **having no traffic to test against**. Both are validated on **Day 1**, before a single line of agent code or dashboard CSS exists. If the selector gate in P6 fails, the architecture changes that afternoon, not on Saturday.

### 0.5 How we work, phase by phase

Every phase below is sized to one Claude Code working session. The protocol is the same each time:

1. **You say "start P<n>".** I read the phase spec, build it, and deploy it where the phase calls for that.
2. **I update `GUIDE.md`** at the end of every phase — before I hand back — with that phase's verification block and the running state. That happens as part of the phase, not as a separate request.
3. **You verify** using the `GUIDE.md` block for that phase. It gives exact commands, exact URLs, what you should see, and how to tell a code bug from an environment problem.
4. **You report back** — "P<n> passed" or the specific symptom. On a failure I fix within the same phase; we do not carry a broken phase forward, because every later phase assumes the earlier ones hold.

Phases marked **⏸ NEEDS YOU FIRST** cannot start until you have completed a setup step. Those steps are listed in `GUIDE.md` §B and the earliest ones are flagged here so you can do them in parallel while I build something else.

Phases marked **⚠ GATE** stop the project if they fail. We change approach rather than push through.

---

## 1. Scope — cut now, not on Saturday

### 1.1 Ships (non-negotiable)

- `g.js` snippet: sticky visitor ID, manifest fetch, deterministic bucketing, DOM mutation application, anti-flicker, event capture, conversion firing, DOM snapshot upload.
- One deliberately-flawed hosted landing page (Site A) on its own domain.
- Ingestion API + event store with normalised coordinates.
- Heatmap aggregation → both the human overlay and the agent-facing JSON.
- Converted-vs-bounced segment filter. This is the differentiating filter; it does not get dropped.
- Playwright traffic swarm with layout-reactive personas.
- Strands agent: orchestrator + analyst + hypothesis writer + variant generator + evaluator, sub-agents as tools.
- Learning memory: written on conclusion, retrieved before hypothesis generation, **visible in the UI and visibly cited in a hypothesis**.
- Cedar policy gate evaluated before every state-changing agent action, decision surfaced in the UI.
- Experiment engine: sticky bucketing, exposure/conversion attribution, guardrail metric, auto-stop, manual kill switch.
- Step Functions lifecycle with a real human-approval wait state.
- Dashboard (Site B): heatmap overlay, opportunities with evidence, variant diff, approval queue, experiment status, results with attribution, learning log, report view.
- Honest-uncertainty display wherever numbers appear.
- Simulation labelling wherever synthetic traffic contributes.

### 1.2 Cut pre-emptively, today, because of the 2.5-day clock

These were optional-if-time items when the clock looked like four days. The shorter clock promotes them to decisions. **Do not relitigate these on Saturday morning.**

- ⚠️ **Vision / screenshot-to-model analysis — cut, but now cheap to restore.** Screenshots are still captured and still used as the heatmap backdrop; that use is non-negotiable. The image does not go to a vision model. The DOM snapshot already carries bounding boxes, font sizes and above-fold flags — the same information, read more reliably (§9.2). What changed: Gemini Flash is natively multimodal, so restoring this is now *one extra API call* rather than a headless-Chromium-in-Lambda project. It moves from "cut" to "stretch, if P9 finishes early".
- ❌ **Headless-Chromium-in-Lambda.** Screenshots come from a local Playwright script. Site A changes approximately never.
- ❌ **Attention/dwell heatmap mode.** Ship click + scroll. The dwell data is still collected and still reaches the agent as JSON; only the third overlay mode is cut.
- ❌ **Instrumenting our own project landing page** with real Discord traffic. Nice beat, zero dependencies on it, first thing to go.
- ❌ **Report export to file.** Reports render in the dashboard. No PDF, no download.
- ❌ **Third variant.** Control + one challenger. A second challenger is generated only if P15 finishes early.
- ❌ **Multi-page crawling.** One page, one path (`/`). The data model supports more; the product ships one.
- ❌ Session video replay, multivariate/bandit allocation, GA4/Segment/Shopify integrations, real auth and multi-tenancy, email/Slack notifications, dark mode, mobile-responsive dashboard, hand-editing variants in the UI, embedding-based learning retrieval.

### 1.3 Remaining cut ladder (checked at each day boundary)

1. Session digests as LLM narratives → deterministic cluster labels only.
2. Segment-level personalization proposal → keep the single-winner result.
3. Step Functions wrapper (P19 step 2) → the in-code lifecycle ships alone. **Identical UX**, weaker diagram. A no-regret drop now that the cheap path is built first (§3.3).
4. Agent deployed to Lambda → agent runs locally against deployed AWS resources, disclosed in the architecture slide.
5. Secondary dashboard screens (report view, run log) → the three hero screens plus the approval queue only.

Nothing in §1.1 is on this ladder. If we reach rung 5 and are still behind, we stop building and start editing video.

### 1.4 Checkpoints

| When | Must be true | If not |
|---|---|---|
| **Thu 22:00** | Site A live and instrumented, events flowing, snapshot captured, **P6 gate passed**, swarm producing traffic | Drop ladder rungs 1–2 Friday morning. If the P6 gate has not passed, take its escape route (§P6) before anything else. |
| **Fri 13:00** | Heatmap overlay screen rendering real swarm data | Drop rung 3 (Step Functions) now and build the in-code state machine instead. |
| **Fri 22:00** | Agent producing validated variants, variant diff screen working | Drop rungs 4–5. Shoot shots 1–6 Saturday morning regardless of what else is unfinished. |
| **Sat 12:00** | Approval gate + a concluded experiment with a result | Film what exists. The video must be cut from real footage, not from hope. |
| **Sat 14:00** | **Feature work stops. No exceptions.** | — |
| **Sat 18:00** | First submission filed | — |

---

## 2. Architecture

### 2.1 Shape

```
                            ┌──────────────────────────────────────────┐
  Site A (static, own URL)  │  CloudFront + S3                          │
  <script src=cdn/g.js>     │  g.js  (versioned, 60s TTL)               │
        │                   └──────────────────────────────────────────┘
        │  1. GET /manifest?site&path        (CloudFront-cached 30s)
        │  2. bucket locally: hash(visitorId+expId) % 100
        │  3. apply mutations, reveal page  (<300ms hard timeout)
        │  4. POST /collect  (batched + beforeunload keepalive)
        │  5. POST /snapshot (once per page version)
        ▼
  API Gateway (HTTP API) ──► Lambda: manifest | collect | snapshot | dashboard-api
        │                                     │
        │                                     ▼
        │                              Postgres / Neon (events, sessions, aggregates,
        │                                  experiments, variants, learnings,
        │                                  opportunities, digests, approvals, runs)
        │                                     │
        ▼                                     ▼
  Cedar policy eval  ◄──────────  Experiment lifecycle (in-code; a Step Functions
  (cedar-wasm, in-process)         wrapper is an optional upgrade — §3.3)
                                    ├─ generate  → Lambda(agent)
        ▲                           ├─ policy    → Cedar
        │                           ├─ WAIT FOR TASK TOKEN  ← human approval
        │                           ├─ run       → EventBridge schedule → evaluate
        │                           └─ conclude  → Lambda(evaluator) → learning record
        │
  Agent Lambda (Python, Strands Agents SDK) ──► Gemini (gemini-3.6-flash)
        Growth Orchestrator
          ├─ Analyst            (get_heatmap, get_funnel, get_session_digest, get_page_screenshot)
          ├─ Hypothesis writer  (get_experiment_history)
          ├─ Variant generator  (get_page_dom, create_variant)  ← selector validator in plain code
          ├─ Experiment manager (launch_experiment, get_experiment_results, stop_experiment)
          └─ Evaluator          (get_experiment_results, get_session_digest, write_learning)

  Site B dashboard (Vite + React SPA on CloudFront + S3) ──► dashboard-api
```

### 2.2 Hard rules

1. **Deterministic work never enters the model.** Bucketing, conversion counting, significance, confidence intervals, guardrail checks, auto-stop evaluation, coordinate normalisation, cluster assignment — all plain code exposed as tools. The agent decides *what* and *why*.
2. **Every selector the model emits is validated against the stored DOM snapshot before it is persisted**, and re-validated against the live page by a Playwright check before an experiment can leave `draft`. A variant with an unmatched selector is never storable.
3. **Cedar is consulted before every state-changing agent action**, not just before launch. The decision (allow/deny + the policy that decided it) is persisted on the action record and rendered in the UI.
4. **Aggregation happens in SQL, not in application code.** If a rollup is being
   assembled with a loop in TypeScript, it is in the wrong place. That is the
   entire reason for §3.2.
5. **Nothing in the dashboard is mocked.** Every number on screen comes from the real pipeline. If a panel has no data yet it shows an honest empty state.

### 2.3 Repo layout

```
growthx/
  PLAN.md
  GUIDE.md                  ← human-in-the-loop checklist, maintained every phase
  infra/                    ← AWS CDK (TypeScript), one `cdk deploy`
  packages/
    snippet/                ← g.js source (vanilla TS, esbuild → single IIFE, no deps)
    shared/                 ← zod schemas: events, mutations, heatmap JSON, experiment
    db/                     ← Drizzle schema + migrations + query helpers
    api/                    ← Lambda handlers (Node 20, TS): manifest, collect, snapshot, dashboard
    agent/                  ← Python 3.12, Strands SDK, tools, prompts, Cedar policies
    dashboard/              ← Vite + React + Tailwind (Site B)
  sites/
    site-a/                 ← static HTML + Tailwind CLI build (the "customer" page)
  swarm/                    ← Playwright persona traffic generator
  policies/                 ← *.cedar + entity/schema JSON
  scripts/                  ← seed, snapshot-capture, screenshot, e2e checks
```

### 2.4 Language split — a deliberate cost

Strands Agents SDK is Python; everything else is TypeScript. That is two toolchains against a 2.5-day clock. It is worth it because Strands *is* the AWS agent-framework story for this submission and rewriting its loop by hand would be both slower and weaker. Containment rule: **Python exists only inside `packages/agent`**, it talks to the rest of the system over Postgres and one HTTP entrypoint, and it owns no schema — `packages/shared` zod schemas are the source of truth, mirrored into Python as pydantic models written once by hand in P12 and never diverged.

---

## 3. Platform choices

### 3.0 The rule we are actually building to

The organisers confirmed on 18 Sept:

> "Bedrock is not mandatory. Access can take a while to come through, so don't hold
> your project up waiting for it. Use whatever other AI tools or open source
> projects you like, the only thing we ask is that you deploy on AWS."

So the hard requirement is **the deployed artefact lives on AWS and the judges get
a live AWS URL.** Everything else is an engineering choice we make on speed.

That does *not* mean AWS stops mattering. "Ship It" still scores architecture, and
the original brief still lists genuine use of AWS as a judging criterion. What it
means is: **we stop paying an AWS tax on components where a faster tool exists,
and we stop waiting on anything.** Bedrock is off the critical path permanently —
not deferred, not chased in the background. It is closed.

What stays on AWS, doing real work: **S3 + CloudFront** (Site A, the dashboard,
and `g.js` — this is the deployment requirement, and it is also genuinely the
right tool), **Lambda + API Gateway** (ingestion, manifest, dashboard API, agent),
**Step Functions** (experiment lifecycle, if it earns its slot — see §3.3),
**EventBridge** (scheduled re-evaluation), plus two AWS open-source projects doing
load-bearing work: **Strands Agents SDK** (the agent loop) and **Cedar** (the
policy gate). That is a substantive, honest AWS story that does not depend on a
model-access queue.

### 3.1 Models — verified by real calls on 18 Sept

**Gemini is the primary provider.** Not a fallback. Verified working on this key,
including function calling, which is the capability Strands' sub-agents-as-tools
pattern is built on.

| Model | Status on this key | Use |
|---|---|---|
| `gemini-3.6-flash` | ✅ callable, tools ✅ | **Workhorse.** Analyst, hypothesis writer, variant generator, evaluator. |
| `gemini-3.5-flash` | ✅ callable, tools ✅ | Spillover when 3.6 hits its per-model daily cap. |
| `gemini-3.1-flash-lite` | ✅ callable, tools ✅ | High-volume, low-stakes calls — session-digest narratives. |
| **Gemini Pro** (any) | ❌ **unusable** | — |
| Bedrock / Claude | ❌ access denied | Closed. Not on the critical path. |

**Gemini Pro is not available to us, and the plan must not assume it.** Every Pro
model (`gemini-3.1-pro-preview`, `gemini-pro-latest`) returns `429
RESOURCE_EXHAUSTED` on the *first* call of the day, with quota id
`GenerateRequestsPerDayPerProjectPerModel-FreeTier`. That is a zero free-tier
daily allowance, not a rate spike — retrying will not help. `gemini-2.5-pro` and
`gemini-2.5-flash` are additionally retired for new API keys (404, "no longer
available to new users"). **Do not hardcode a Gemini model ID from memory;
`pnpm check:models` probes the configured one.**

**Consequence: everything runs on a Flash-class model.** That is a real
constraint and it shapes the design rather than just the config:

- The **validator + repair loop is now load-bearing, not a safety net.** A smaller
  model adheres less reliably to a JSON schema, so the P6 gate's before-repair vs
  after-repair split matters more than ever. Budget for landing on the
  `data-gx-id` escape route (§P6 option b).
- **Tool output schemas must be tight enough that the model can only quote, never
  invent.** Already a hard rule (§2.2); now it is also the thing keeping a Flash
  model honest in the evidence trail.
- Prefer many small, well-scoped calls over one large reasoning call. This suits
  the sub-agents-as-tools architecture we already chose.

**Quota is per project *per model*,** which is genuinely useful: spreading calls
across `3.6-flash`, `3.5-flash` and `flash-lite` multiplies the effective daily
allowance. The provider layer in P12 does this automatically on quota exhaustion.

**Rate limits are the operational constraint** (~10 req/min/model on free tier).
Handled in P12: one serialized client with a token-bucket limiter, automatic
model spillover on 429, a file-backed response cache (`GX_MODEL_CACHE=1`) so
prompt iteration does not burn the daily quota, and a raised wall-clock cap
(300s) because rate-limit waiting is not the agent being stuck.

**Strands wiring** (`pip install 'strands-agents[gemini]'`):

```python
from strands.models.gemini import GeminiModel
model = GeminiModel(model_id="gemini-3.6-flash")   # reads GEMINI_API_KEY natively
```

### 3.2 Persistence — Postgres (Neon), not DynamoDB

**This is the biggest change the relaxation buys us, and it is worth taking.**

This product is analytics-shaped. Almost everything it does is *aggregate events,
grouped by segment*: per-element view and click rates across nine segments, scroll
bands, funnel steps, friction counts, session clustering, per-arm conversion
counts, per-segment attribution. In DynamoDB every one of those is a fan-out
across ten shards plus an in-memory reduce in a Lambda. In SQL each is one
`GROUP BY`.

| | DynamoDB | Postgres |
|---|---|---|
| P8 aggregation | fan-out over 10 shards, reduce in code | one query per aggregate |
| Session clustering | load all, group in code | `GROUP BY` on a signature expression |
| Per-arm stats | GSI query + count in code | `GROUP BY variant_id` |
| Nine segments | nine passes or one messy reduce | `GROUPING SETS` |
| Debugging at 2am | Dynamo console | `psql` |

P8 is budgeted 2h and is the phase most likely to overrun. SQL roughly halves it
and deletes a whole category of bug. **P8 drops from 2h to 1.25h** on this change.

**Neon specifically**, not RDS: Neon provisions in seconds, has a genuinely
generous free tier, and — the part that matters — its **serverless driver talks
HTTP, so Lambda needs no VPC.** RDS would drag in VPC config, NAT gateway costs
and VPC cold starts, which is one of the classic hackathon time sinks. Neon also
runs on AWS, so "deployed on AWS" is unaffected: all our compute and hosting is
AWS regardless.

Paired with **Drizzle ORM** for typed queries and one-command migrations.

**Sharding is deleted.** The ten-way event partition shard existed purely to avoid
a DynamoDB hot partition. Postgres does not have that problem. That is one less
concept, one less source of bugs, and a simpler aggregation story.

**Fallback:** if Neon is unreachable, `docker run postgres` locally for dev plus
an RDS instance for the deployed demo. Trip-wire: 20 minutes.

### 3.3 Step Functions — resequenced, not dropped

The original plan built Step Functions first with a 90-minute trip-wire to an
in-code fallback. On a 6-hour Saturday that is a bad trade: the failure path costs
90 minutes and yields nothing.

**Inverted: build the in-code lifecycle first (~45 min), then wrap it in Step
Functions if time remains.** The demo beat — Cedar denies → approval queue →
approve → experiment goes live — is identical either way and is *guaranteed* by
the cheap path. Step Functions then becomes an additive architecture upgrade
rather than a gamble. See P19.

### 3.4 Everything else

| Component | Choice | Why | Fallback / trip-wire |
|---|---|---|---|
| Static hosting | **S3 + CloudFront via CDK** | the deployment requirement, and genuinely right; three separate origins makes "paste the snippet into any site" visibly true | Cloudflare Pages for a site if CloudFront fights us — but the AWS URL must stay the primary. 45 min |
| API | **Lambda + API Gateway HTTP API** | one `cdk deploy`, no servers, correct for spiky ingestion | Lambda Function URLs if CORS fights us. 30 min |
| IaC | **AWS CDK (TypeScript)** | one language across infra and app | `aws` CLI + a deploy script. 90 min from P1 start |
| Agent runtime | **Python + Strands**, local in dev, Lambda container image in P21 | Strands is AWS OSS, model-agnostic, native Gemini, agents-as-tools, OTel | agent stays local and we disclose it in the architecture slide. 20 min in P21 |
| Policy | **Cedar via `@cedar-policy/cedar-wasm`, in-process** | AWS OSS, fast, real policy files on screen | hand-rolled evaluator over the same policy docs. 60 min |
| Screenshots | **local Playwright script** | Site A changes ~never; headless-Chromium-in-Lambda is a known time sink | none needed |
| Dashboard | **Vite + React + Tailwind**, hand-rolled SVG charts | fastest, and we need exactly three chart forms with full control over how uncertainty is drawn | none |
| Scheduling | **EventBridge Scheduler** | re-evaluate running experiments | a loop in the swarm runner + a "Re-evaluate now" button we want anyway. 30 min |

**The meta-rule still stands, and matters more now that nothing forces our hand:
no single infrastructure problem gets more than 90 minutes, ever.**

---

## 4. Data model

Postgres (Neon) via Drizzle. Deliberately boring: normalised where it helps,
`jsonb` where the shape is genuinely open, and no cleverness anywhere. Schema
lives in `packages/db/schema.ts`; wire-format zod schemas stay in
`packages/shared` and remain the source of truth for anything crossing the network.

### 4.1 Tables

**`sites`** — one row in the demo.
`id` pk · `name` · `origins text[]` · `objective jsonb` `{metric, from, to}` ·
`guardrail jsonb` `{metric, direction, threshold}` · `conversion jsonb`
`{kind: selector|url, value}` · `created_at`

**`events`** — the raw behavioural stream. The only high-volume table.
`id bigserial` pk · `site_id` fk · `session_id` · `visitor_id` · `ts timestamptz` ·
`seq int` · `type` (enum: pageview, exposure, click, dead_click, rage_click,
scroll, element_view, dwell, hover, back_exit, conversion, custom) · `path` ·
`experiment_id` null · `variant_id` null · `device` (mobile|tablet|desktop) ·
`is_returning bool` · `referrer` · `viewport jsonb` · `selector text` null ·
`elem_frac jsonb` null · `page_frac jsonb` · `vp_frac jsonb` · `scroll_y int` ·
`doc_h int` · `payload jsonb` · `simulated bool` · `persona text` null

Indices: `(site_id, path, ts)` for aggregation · `(session_id, ts, seq)` for
digests · `(experiment_id, variant_id)` partial `where experiment_id is not null`
for attribution · `(site_id, selector)` for per-element rollups.
Hot-path columns are promoted out of `payload` precisely because they are what we
`GROUP BY`; `payload` holds only the type-specific remainder.

**`sessions`** — derived, one row per session, written by the aggregation pass.
Exists so the converted-vs-bounced segment is a join rather than a subquery.
`id` pk · `site_id` · `visitor_id` · `started_at` · `ended_at` · `device` ·
`is_returning` · `converted bool` · `bounced bool` · `max_scroll_frac` ·
`event_count` · `experiment_id` null · `variant_id` null · `simulated` · `persona`

**`snapshots`** — the sanitised page outline the variant generator reads.
`id` pk · `site_id` · `path` · `content_hash` · `captured_at` · `viewport jsonb` ·
`elements jsonb` · `is_current bool`. Unique on `(site_id, path, content_hash)`.

**`aggregates`** — computed heatmap/funnel/friction per page per segment per window.
`id` pk · `site_id` · `path` · `segment_key` · `window_end` · `sessions int` ·
`elements jsonb` · `scroll_bands jsonb` · `friction jsonb` · `funnel jsonb` ·
`source_event_count` · `simulated_pct` · `computed_at`.
Unique on `(site_id, path, segment_key, window_end)`.
The nine segment keys are canonicalised by `segmentKey()` in
`packages/shared/src/runtime/segments.ts` — already written in P0.

**`experiments`**
`id` pk · `site_id` · `path` · `opportunity_id` null · `hypothesis text` ·
`status` (draft|pending_approval|rejected|running|stopping|concluded|killed) ·
`split jsonb` · `guardrail jsonb` · `auto_stop jsonb` · `sfn_execution_arn` null ·
`started_at` · `concluded_at` · `learning_id` null · `created_at`
Index `(site_id, path, status)` — the **manifest build path, must be fast.**

**`variants`** — own table, not embedded, because the diff screen and the live
check both address them directly.
`id` pk · `experiment_id` fk · `label` · `is_control bool` · `rationale text` ·
`mutations jsonb` · `validation jsonb` · `screenshot_desktop_key` ·
`screenshot_mobile_key`

**`learnings`** — the experiment memory. Give it a real UI; it is the product's soul.
`id` pk · `site_id` · `experiment_id` null · `hypothesis` · `change_summary` ·
`segment` · `outcome` (won|lost|inconclusive|guardrail_breach) · `effect jsonb`
`{lift, ciLow, ciHigh, n, pValue, significant}` · `generalisation text` (the one
sentence that gets retrieved) · `tags text[]` · `confidence` · `evidence_refs jsonb` ·
`created_at`
Retrieval: `select * from learnings where site_id = $1` — N will be under 20, so
the whole list goes into the hypothesis prompt. **No embeddings.** Tag filtering
becomes relevant past ~50 records; that is a roadmap line, not today's code.

**`opportunities`**
`id` pk · `site_id` · `title` · `body` · `confidence` · `rank int` ·
`evidence jsonb` (each item `{kind, label, value, source_ref}` — every claim
carries a pointer back to the `aggregates` or `digests` row it came from) ·
`segment_key` · `status` (open|hypothesised|tested|dismissed) · `detected_at`

**`digests`** — session cluster narratives.
`id` pk · `site_id` · `path` · `window_end` · `signature text` (the deterministic
behavioural fingerprint the clustering groups on) · `session_count` ·
`segment_key` · `stats jsonb` · `narrative text` · `example_session_ids text[]`

**`approvals`** — the human gate.
`id` pk · `experiment_id` · `action` (launch_experiment|deploy_winner) ·
`task_token text` null (populated only on the Step Functions path) ·
`cedar_decision jsonb` `{decision, policyId, reasons[]}` · `requested_at` ·
`requested_by` · `status` (pending|approved|rejected|expired) · `decided_at` ·
`decided_by` · `rejection_reason text`

**`reports`**
`id` pk · `site_id` · `kind` (analysis|experiment) · `title` · `body_md text` ·
`summary` · `related_ids jsonb` · `created_at`
Markdown lives in the column, not S3 — reports are small and a join beats a
round trip.

**`runs`** — agent run log, drives the live activity feed.
`id` pk · `site_id` · `trigger` · `status` · `steps jsonb` (`{agent, tool, input,
output, cedarDecision, model, tokens, ms}`) · `trace_id` · `error` · `started_at` ·
`finished_at`

### 4.2 Access patterns, and the query that does the work

The reason for the switch, concretely. The per-element heatmap rollup — nine
segments, every meaningful element — is one statement:

```sql
select e.selector,
       count(*) filter (where e.type = 'element_view')                as views,
       count(*) filter (where e.type = 'click')                       as clicks,
       count(*) filter (where e.type = 'rage_click')                  as rage,
       count(*) filter (where e.type = 'dead_click')                  as dead,
       percentile_cont(0.5) within group (
         order by (e.payload->>'timeToFirstViewMs')::numeric)         as median_ttfv
from events e
join sessions s on s.id = e.session_id
where e.site_id = $1 and e.path = $2 and e.ts >= $3
  and (s.device   = $4 or $4 is null)
  and (s.converted = $5 or $5 is null)
group by e.selector;
```

In DynamoDB that is ten shard queries, a manual reduce, and a hand-rolled median.

`click_rate_pct` is `clicks / views`, **not** clicks per session — stated as such
everywhere it is displayed, in the UI and in the JSON handed to the agent.

### 4.3 Variant record (`variants.mutations`)

```json
{
  "variantId": "v_b",
  "label": "Challenger B — lower-commitment CTA above the fold",
  "isControl": false,
  "rationale": "Learning L-002 says lower-commitment language beats direct-signup for first-time mobile visitors; the opportunity shows 18% of mobile users scroll past the CTA within 2s.",
  "mutations": [ /* see §4.4 */ ],
  "validation": { "selectorsChecked": 4, "selectorsMatched": 4, "liveCheck": "passed" }
}
```

### 4.4 Mutation schema

A closed set of operations. **No `set_html`, no `insert_html`, no freeform markup, ever.** This is what makes the agent's output safe, diffable, and impossible to render as visually broken garbage.

```jsonc
{
  "op": "replace_text",  // one of the ops below
  "selector": ".cta-primary",   // CSS selector, must resolve in the stored snapshot
  "value": "See how it works →",
  "note": "Lower-commitment framing"  // agent's per-mutation reason, shown in the diff UI
}
```

| op | fields | notes |
|---|---|---|
| `replace_text` | `selector`, `value` | text content only; max 160 chars; no HTML entities beyond a small allowlist |
| `set_attr` | `selector`, `name`, `value` | `name` allowlist: `href`, `alt`, `title`, `aria-label`, `placeholder` |
| `set_style` | `selector`, `props{}` | props allowlist: `display,width,max-width,margin,margin-top,margin-bottom,padding,font-size,font-weight,line-height,text-align,background-color,color,border-radius,order,position,top,gap,flex-direction,align-items,justify-content` |
| `add_class` / `remove_class` | `selector`, `value` | class must already exist in the page's stylesheet (validated against the snapshot's observed class list) |
| `hide` / `show` | `selector` | shorthand for `display:none` / restore |
| `move_before` / `move_after` | `selector`, `target` | DOM reparenting; both must resolve; target must not be a descendant of selector |
| `swap` | `selector`, `target` | exchange two siblings' positions |
| `set_media_style` | `selector`, `media` (`mobile|desktop`), `props{}` | injected as a scoped `@media` rule — needed because most of our diagnosis is mobile-specific |

**Validation pipeline (plain code, runs before persistence — no model involvement):**
1. Schema parse (zod). Unknown op → reject.
2. Every `selector`/`target` must match **exactly one** element in the stored DOM snapshot. Zero matches → reject with the list of valid nearby selectors and let the generator retry (max 2 retries). Multiple matches → reject.
3. Denylist: any selector resolving inside `form[data-gx-deny]`, `[data-gx-deny]`, `input`, `script`, `iframe`, or the element carrying the conversion selector's `href`/`action` → reject. (Cedar's "never touch checkout/pricing" rule is enforced here in code as well as in policy — belt and braces.)
4. Value/prop allowlists and length caps.
5. **Live check:** a Playwright pass loads the real page, applies the mutation set, asserts every selector matched at runtime and that the page did not throw. Stores before/after screenshots at 390px and 1440px. An experiment cannot leave `draft` without a passed live check.

### 4.5 Coordinate normalisation — get this right once

Raw pixel coordinates are useless across screen sizes. Every spatial event stores **element-relative** coordinates, and page-relative only as a secondary:

```jsonc
{
  "type": "click",
  "payload": {
    "selector": "header .cta-primary",     // stable DOM path, generated by a deterministic path builder
    "elemFrac": { "x": 0.62, "y": 0.44 },  // fraction of the element's own bounding box — THE primary signal
    "pageFrac": { "x": 0.51, "y": 0.18 },  // fraction of full document width/height, for the overlay fallback
    "vpFrac":   { "x": 0.51, "y": 0.72 },  // fraction of viewport, for above/below-fold reasoning
    "scrollY":  840,
    "docH":     4620,
    "vp":       { "w": 390, "h": 844 }
  }
}
```

Heatmap rendering re-projects `elemFrac` onto the element's bounding box **in the screenshot's own layout**, so a click from a 390px phone lands on the right button in a 1440px screenshot. Where the selector is missing or unresolvable, fall back to `pageFrac`. Scroll depth is stored as `maxScrollFrac` (0–1 of document height) plus banded reach at 25/50/75/100.

**DOM path builder rules** (deterministic, in `packages/snippet`): prefer `data-gx-id` if present → `#id` if stable-looking (no digits-heavy hashes) → tag + up to 2 non-utility classes + `:nth-of-type` → walk up max 4 ancestors. Same builder is used by the snapshot generator so paths in events and paths in snapshots are the same alphabet. **This shared alphabet is the thing that makes selector grounding work — it is tested at the P6 gate.**

---

---

## 5. Design decisions (settled before any UI work)

These are fixed now so no time is spent deciding later. Site A and Site B must look like they come from two different companies — that is what makes "paste the snippet into any site" read as true on video.

### 5.1 Banned outright

Purple/violet→blue gradients. Neon, glow, shadow-glow. Dark backgrounds with saturated accent bloom. Glassmorphism. Gradient blobs. Inter as the only typeface. Emoji used as icons. Animated gradient borders. Rounded-full pill buttons with a gradient fill. "✨ AI-powered" as copy. Any of these and we lose Best UI in the first two seconds of the video.

### 5.2 Site A — "Corrick" (the customer)

A plausible B2B SaaS marketing page: **Corrick — expense controls for agencies that bill by the hour.** Static HTML + Tailwind CLI (compiled CSS, not the CDN script — the CDN build delays paint and would pollute our own flicker measurements). Wordmark logo: the word set in the display face with a single geometric mark; no stock illustration, no 3D shapes.

- **Type:** `Fraunces` (variable optical serif) for headings — warm, editorial, has actual character; `Karla` for body and UI — a readable neutral grotesque with enough personality not to read as default. Both Google Fonts, subset and self-hosted so paint is fast.
- **Palette:** warm paper `#FBF8F3`, ink `#1B1A17`, muted `#6E675C`, hairline border `#E6DFD4`, single accent terracotta `#C2542B` used only on the primary CTA and one underline. Secondary sage `#5C6B5A` for one supporting element. That is the whole palette.
- **Scale:** 1.25 ratio, measure capped at 62ch, generous vertical rhythm, 1px hairline borders, radius 6px, no shadows except a single 1px-offset hairline on the pricing card.
- **The flaws — in hierarchy and placement, never in taste:**
  1. The primary CTA sits **below four lines of supporting copy** in the hero, pushing it under the fold at 390×844.
  2. The hero headline is a feature statement ("Automated receipt matching for agency finance teams"), not an outcome — high-commitment CTA copy ("Start free trial") follows it.
  3. The pricing table appears **above** the social-proof/logo band, so visitors hit price before trust.
  4. The mobile hero image eats 40% of the first viewport and carries no information.
  5. A `.tier-2` pricing card has a non-obvious click target that looks interactive but is not — this is what generates genuine rage/dead clicks.
  These are built as the page's natural design, not as planted bugs. A competent designer would ship this page and a CRO consultant would immediately have notes. That is exactly the tension we want.
- Conversion goal: `a.cta-primary` click → `/signup/success`. Both selector- and URL-based conversion are wired so we can demo either.

### 5.3 Site B — GrowthX dashboard (the operator's tool)

Dense, quiet, instrument-panel. Everything is muted so the heatmaps are the loudest thing on screen — that is a deliberate hierarchy decision, not an accident of taste.

- **Type:** `Archivo` (600/700, tight tracking) for headings and section labels — a characterful grotesque that reads as engineered; `Public Sans` for body and UI — highly readable, neutral, zero AI-demo association; `IBM Plex Mono` for **every number, metric, selector, ID, p-value, and the entire variant diff**. Numbers in mono is the single cheapest thing that makes a tool look real.
- **Palette:** base `#F7F7F5`, surface `#FFFFFF`, ink `#14161A`, secondary text `#61656C`, border `#E4E4E0`, accent slate-blue `#2B4B8C` (primary actions and active nav only — nowhere else). Semantics: positive `#2F6F4F`, negative `#A33A2B`, caution `#B0761F`, pending/neutral `#61656C`.
- **Heatmap ramps** (the only intense colour in the product; three visually distinct ramps so the modes are never confused):
  - Click density: magma-like — `#2C1A4A → #7B2A6B → #C74A45 → #E8853A → #F5D07A`
  - Scroll depth: single-hue sequential teal — `#EAF4F2 → #3E8E85 → #14413D`
  - Attention/dwell: cividis-like, colour-blind safe — `#00224E → #3B6B7D → #7E9A6E → #D3C164`
  Overlays composite at 0.65 alpha over a desaturated (60% grayscale) screenshot so the page reads as context, not as competing colour.
- **Grid & motion:** 8px spacing scale, radius 4px on controls / 8px on cards, 1px borders and no shadows above `0 1px 2px rgba(20,22,26,.06)`. One motion vocabulary: 140ms ease-out for state changes, 220ms for panel entry, and a single "agent is thinking" motif (a 3-dot step pulse in the run log). Nothing else animates.
- **Empty and uncertain states are designed, not default.** "n=340 — not yet decisive. ~6 more days at current traffic." gets real typographic treatment. This is a differentiator: most hackathon UIs have no empty state at all.
- **Simulation badge:** a small mono caps chip `SIMULATED TRAFFIC` in caution colour, pinned wherever swarm-sourced numbers appear. Honest, and it reads as rigour on camera.

### 5.4 The three screens designed first (everything else inherits from them)

1. **Heatmap overlay** — full-bleed screenshot canvas, left rail of segment filters (device / new-vs-returning / **converted-vs-bounced**), mode switcher (click / scroll / attention) as a segmented control, and a right rail listing the top elements with `viewed_pct`, `click_rate_pct`, `median_time_to_first_view` in mono. Hovering a row highlights its element bounding box on the canvas and vice versa. The converted-vs-bounced toggle animates the ramp between the two states — that single interaction is the most persuasive 4 seconds available to us on video.
2. **Variant diff** — control and challenger side by side as live iframes of Site A with the mutation set applied, above a mono list of the mutations with each one's `note`. Each mutation row highlights its target element in both frames on hover. A mobile/desktop width toggle. This screen is what proves the variants are structured, not freeform.
3. **Results & attribution** — per-arm conversion rate with confidence intervals drawn honestly (overlapping intervals must *look* overlapping), the guardrail metric tracked alongside and visually separated, a segment breakdown table showing where the lift actually came from, and the decision state in plain language ("Not yet decisive — n=412/arm, need ~1,900/arm for 80% power at the observed effect"). No big green "+15.9%" hero number anywhere.

### 5.5 Sequencing note

Design tokens land in P10; the three hero screens are P11, P16 and P20 — each built against real data. Every secondary screen (approval queue, learning log, report view, run log) inherits those components rather than inventing anything, and none is built before its hero screen exists.

---

---

## 6. Phases

24 phases, each sized to one Claude Code session. Every phase ends with something you can see working, and every phase ends with me writing its verification block into `GUIDE.md`.

Legend: **⏸ NEEDS YOU FIRST** — blocked on a setup step you must do. **⚠ GATE** — failure stops the project and changes the approach. **★ HERO** — a screen that appears in the demo video and gets disproportionate design attention.

---

### 6.1 · DAY 1 — Thursday 18 Sept (~12h) · P0 → P7

*Goal for the day: the delivery mechanism is real, data is flowing, and the riskiest assumption in the project has been tested.*

---

#### P0 — Repo, toolchain, and `GUIDE.md` (0.5h)

**Goal:** a working monorepo and a setup checklist you can start acting on immediately.

**I build:**
- pnpm workspaces, TypeScript base config, esbuild config for the snippet, Tailwind CLI wiring for Site A, `.gitignore`, `.env.example`.
- `packages/shared` with the first zod schemas (event, mutation, manifest) — schemas exist before anything that uses them.
- `GUIDE.md` with §A state, §B full setup checklist, §C empty, §D empty.
- `package.json` scripts: `dev:site-a`, `build:snippet`, `deploy:infra`, `swarm`, `e2e`.

**You do, in parallel with P1:** everything in `GUIDE.md` §B. ✅ Complete as of 18 Sept except §B9 (Neon), which is new and blocks P1.

**Exit criteria:** `pnpm install` succeeds from clean; `pnpm build:snippet` emits a JS file; `GUIDE.md` §B is complete and actionable.

**You verify:** read `GUIDE.md` §B top to bottom. If any step is ambiguous, tell me now — it will cost ten times more at 2am on Saturday.

---

#### P1 — AWS foundation deployed ⏸ NEEDS YOU FIRST (1h)

**Blocked on:** `GUIDE.md` §B1–§B4 (✅ done) plus **§B9 — a Neon project and its connection string** (new, ~5 minutes).

**Goal:** one command deploys real AWS infrastructure and two URLs respond.

**I build:**
- `packages/db`: Drizzle schema for every table in §4.1, created up front, plus `pnpm db:push` and `pnpm db:studio` for eyeballing rows.
- `infra/` CDK app (TypeScript): one `health` Lambda that **also proves its database connection**, so a bad `DATABASE_URL` surfaces here rather than at P4; an HTTP API; an S3 bucket + CloudFront distribution serving static assets and a placeholder `g.js` with correct CORS and cache headers.
- A second CloudFront distribution + bucket for Site A, and a third for the dashboard — separate origins so the "paste the snippet into any site" claim is visibly true.
- `scripts/outputs.ts` writing the deployed URLs into `.env.local` and into `GUIDE.md` §A automatically, so the URLs in the guide are never stale.

**Tech / fallback:** CDK → if `cdk deploy` cannot produce a working hello-world within **90 min**, fall back to a single Fastify service on App Runner plus S3 static hosting.

**Exit criteria:** `pnpm db:push` creates every table in Neon; `pnpm deploy:infra` succeeds from clean and prints three domains + an API base URL; `curl <api>/health` returns 200 **and reports `db: ok`**; `https://<cdn>/g.js` returns the placeholder with `access-control-allow-origin: *`.

**You verify:** open the API health URL in a browser and confirm it reports `db: ok` — that single check proves CDK, Lambda, API Gateway and Neon are all wired correctly. Then open the `g.js` URL and confirm the billing alarm exists in the console.

---

#### P2 — Site A: the "customer" landing page (1.5h)

**Goal:** a plausible, aesthetically competent, deliberately conversion-flawed SaaS page, live on its own domain.

**I build:** Site A per §5.2 — **Corrick**, expense controls for agencies. Static HTML + compiled Tailwind, self-hosted Fraunces + Karla, wordmark logo, hero, feature row, pricing table, social-proof band, footer, and a `/signup/success` page. The five designed flaws from §5.2 built in as the page's natural design, not as planted bugs. Responsive, and genuinely worse on mobile — which is the whole diagnosis.

**Exit criteria:** deployed and loading at its own CloudFront domain; at 390×844 the primary CTA is below the fold and the pricing table sits above social proof; at 1440px the page reads as a competent startup landing page; Lighthouse performance ≥90 with no snippet installed (so later flicker measurements are not contaminated by a slow page).

**You verify:** open it at 390px and 1440px. Two questions, and both answers matter: *(a)* does this look like a real company's page, or like a demo? *(b)* would a CRO consultant have obvious notes on the mobile hero? If (a) is "demo" the Best UI angle is already weakened; tell me and I will rework it before we move on, because Site A appears in the first 15 seconds of the video.

---

#### P3 — Snippet v1: bucketing, mutations, anti-flicker (1.75h)

**Goal:** the page visibly changes based on variant assignment, with no flash, and this is the day-one proof that the delivery mechanism works.

**I build:**
- `g.js`: sticky `visitorId` (localStorage) + `sessionId` (sessionStorage, 30-min idle window); manifest fetch; **deterministic local bucketing** `fnv1a(visitorId + ':' + experimentId) % 100` against the split (§9.1 explains why this differs from your brief); mutation applier covering the full op set in §4.3; one re-apply retry at 400ms for late-rendering nodes; `?gx_force=<variantId>` override.
- **Anti-flicker:** a synchronous inline pre-hide that sets `document.documentElement.style.visibility='hidden'` before the body parses; reveal on mutations-applied **or** on a hard 300ms timeout, whichever fires first; the timeout is registered *before* the fetch so a hung request can never leave a blank page; reveal is idempotent.
- `manifest` Lambda: reads running experiments for `(site, path)` via GSI2, returns `{experiments:[{id, split, variants:[{id, mutations}]}]}`, CloudFront-cached 30s with `stale-while-revalidate`.
- A hand-seeded two-variant experiment (`scripts/seed-experiment.ts`) so there is something to apply.

**Exit criteria:** snippet <8KB gzipped; two browser profiles get different CTA treatments and each stays sticky across reloads; **no visible flash** at Slow 4G + 4× CPU throttle; pointing the manifest at a dead host still renders the unmutated page within ~300ms; `?gx_force=v_b` reproduces the challenger.

**You verify — this is the most important manual check of Day 1:**
1. Open Site A with DevTools set to Slow 4G + 4× CPU, hard-reload five times, and watch for a flash. Record your screen and step through it frame by frame. A judge who knows CRO will look for exactly this.
2. Open a private window, note which variant you get, reload three times, confirm it does not change.
3. Follow the `GUIDE.md` step to break the manifest URL and confirm the page still appears, unmutated, without a blank beat.

---

#### P4 — Event capture and ingestion (1.5h)

**Goal:** real behaviour lands in Postgres with correctly normalised coordinates.

**I build:**
- Snippet capture for: `pageview`, `exposure` (fired the instant mutations apply), `click` (+ DOM path + all three coordinate frames per §4.4), `dead_click`, `rage_click`, `scroll` (throttled; `maxScrollFrac` + band crossings), `element_view` (IntersectionObserver; time-to-first-view and total visible ms), `dwell`, `back_exit`, `conversion` (selector-based and URL-based, both wired).
- Batching: flush every 5s or 25 events, plus `navigator.sendBeacon` on `beforeunload` and `visibilitychange:hidden`.
- `POST /collect` Lambda: zod validation, origin allowlist, batch insert into `events` (§4.1). No sharding — that concept existed purely to dodge a DynamoDB hot partition and is deleted (§3.2).
- The **shared DOM path builder** (§4.4) in `packages/snippet`, exported so P5's snapshot uses the identical alphabet. This shared alphabet is the thing that makes P6 pass.
- `scripts/query-events.ts` — a human-readable session dump, used by every later verification step. (You can also just open `pnpm db:studio`.)

**Exit criteria:** clicking around Site A produces events within 10s with `elemFrac`/`pageFrac`/`vpFrac` all populated and plausible; rage-clicking the fake-interactive `.tier-2` element produces a `rage_click`; closing the tab mid-session still delivers buffered events.

**You verify:** open Site A, click the CTA, scroll to the bottom, rage-click the pricing tier, then close the tab. Run the `GUIDE.md` query command and confirm your whole session is there **including the events from just before you closed the tab** — that last part is the beacon path and it is the one that silently fails.

---

#### P5 — DOM snapshot (0.75h)

**Goal:** the page's structure captured in the exact form the model will read.

**I build:**
- `POST /snapshot`: sent once per page content-hash. For each meaningful element (`a, button, h1–h4, p, img, section, [role], form`, plus anything >1% of viewport area): `{path, tag, classes[], textSample ≤120 chars, rect as page-fractions, fontSizePx, fontWeight, isInteractive, aboveFoldAt390, aboveFoldAt1440, childCount}`. Strips all input values and anything matching email/phone patterns.
- `scripts/dump-snapshot.ts` — prints the stored outline in the **exact text form the model will see**, nothing more, nothing less.

**Exit criteria:** exactly one current snapshot row for `/`, ≥25 elements, including every element Site A's five flaws live in.

**You verify:** run `dump-snapshot` and read the output *as if you were the model*. Can you personally write a correct CSS selector for the hero CTA from that text alone, without looking at the page? If not, the outline is under-specified and P6 will fail — tell me and I will enrich it before we spend the gate's budget.

---

#### P6 — Selector grounding spike ⚠ GATE (1.25h)

**Goal:** prove the highest-risk assumption in the project — that a model given our snapshot emits selectors that actually resolve on the live page.

**Unblocked:** runs on Gemini (`gemini-3.6-flash`), verified working 18 Sept. Bedrock access is still pending and must not block this phase.

**Provider caveat that matters:** the gate must be run against the provider we will actually demo on. Gemini Flash is a smaller model than Claude Sonnet, so a pass here is the *conservative* result — if Flash clears 95%, Sonnet will. A *failure* on Flash, however, is not automatically a failure of the architecture, so if the gate fails on Gemini and Bedrock has since landed, re-run on Claude before taking an escape route. Model calls are serialized and rate-limited (§3.1); 20 trials will take several minutes of wall clock, which is budgeted.

**I build:** `scripts/selector-spike.ts` — loads the stored snapshot, sends it with the real variant-generator prompt and mutation schema, receives a mutation set, runs it through the §4.3 validator, then opens Site A in Playwright, applies the set, and asserts every selector matched exactly one live element. 20 trials across 4 hypothesis prompts. Reports match rate **before** and **after** the repair loop separately (on a failed selector the validator returns the 8 nearest valid selectors and the model retries, max 2).

**Exit criteria (the gate):** ≥95% of selectors resolve after the repair loop, and ≥70% before it. Zero mutations that pass validation but visually break the page, judged from the 20 after-screenshots the spike saves.

**If the gate fails,** in preference order: (a) enrich the snapshot outline — usually more text samples and explicit role hints; (b) stamp `data-gx-id` attributes on Site A's meaningful elements at build time and restrict the generator to `[data-gx-id="..."]` selectors only — bulletproof, ~30 minutes, and honestly what a real product would do via first-party integration; (c) turn generation into *selection* from an enumerated selector list. **Option (b) is the likely landing spot. Budget for it rather than being surprised by it.**

**You verify:** read the spike report. Open three of the saved after-screenshots. If any variant looks *broken* rather than merely *different*, that is a P6 failure too — it means the op set or the prompt needs constraining today, not on Saturday when it is a demo problem.

---

#### P7 — Traffic swarm (1.75h)

**Goal:** thousands of realistic sessions on demand, so nothing downstream ever waits for data.

**I build:**
- `swarm/run.ts`: Playwright driving real browser contexts against the **live deployed Site A through the real snippet and the real ingestion endpoint**. No database writes, no fabricated rows.
- Six personas: `mobile-skimmer`, `mobile-considerer`, `desktop-researcher`, `desktop-decisive`, `returning-comparer`, `accidental`. Randomised parameters, device/viewport mix, referrer mix, new-vs-returning mix, arrival jitter, concurrency capped at 8, `--sessions` / `--rate` / `--headed` flags.
- **Layout-reactive behaviour — the critical design point.** Each persona reads the page *as rendered*: is the primary CTA inside the first viewport, how much copy sits above it, is the CTA visible where the user stops scrolling. Conversion probability is a declared function of those measurements plus noise. It is a behaviour model, not a fixed win rate. When the agent later moves the CTA above the fold, simulated visitors genuinely respond, and the experiment result is an emergent property of the simulation rather than something we typed in. The function lives in **one documented file** (`swarm/behaviour.ts`), and its existence is disclosed in the README and in the video.
- Every swarm event carries `simulated: true` and `persona`.

**Exit criteria:** `pnpm swarm --sessions 300` produces ~300 sessions distributed across personas and devices; mobile conversion is reproducibly worse than desktop **because of the layout**, not because it was hardcoded; a forced-variant run with the CTA above the fold produces a materially different conversion rate, confirming the loop can close.

**You verify:** watch `pnpm swarm --headed --sessions 10` for a minute. Do these look like plausible humans or like robots teleporting? Then run 300 headless and check the per-device conversion split with the `GUIDE.md` query. **If mobile and desktop convert identically, the behaviour function is wrong and everything downstream will be a lie** — that is a stop-and-fix, not a note-and-continue.

**✅ Thursday 22:00 checkpoint — see §1.4.**

---

### 6.2 · DAY 2 — Friday 19 Sept (~13h) · P8 → P16

*Goal for the day: the agent loop runs end to end, and two of the three hero screens exist. Still the densest day, but the Postgres switch (§3.2) takes P8 from 2h to 1.25h, which brings Friday from ~13.5h of work down to ~12.75h against ~13h available — the first time this plan has had slack rather than a deficit.*

---

#### P8 — Aggregation engine (1.25h)

**Goal:** raw events become the two artefacts everything downstream consumes.

**I build:**
- A `sessions` rollup pass (deriving `converted` / `bounced` / `max_scroll_frac` per session), then the aggregate queries of §4.2 writing `aggregates`. All SQL; no reduce loops in application code. **Nine segment keys, not the full cross product:** `all`, `device=mobile`, `device=desktop`, `visitor=new`, `visitor=returning`, `outcome=converted`, `outcome=bounced`, `device=mobile+outcome=bounced`, `device=mobile+visitor=new`.
- Per element: `viewed_pct`, `click_rate_pct` (clicks ÷ views — stated as such everywhere it is displayed), `median_time_to_first_view_s`, `median_visible_ms`, `dead_click_count`, `rage_click_count`, plus the element's snapshot rect and label.
- `scroll_bands` at 25/50/75/100, `friction[]`, `funnel[]` (arrive → CTA viewed → CTA clicked → conversion).
- `get_heatmap()`, `get_funnel()` as plain functions in `packages/api`, exposed to both the dashboard API and the agent tool endpoint.

**Fallback:** if the Lambda is slow over swarm volume, run aggregation as a local script writing identical rows. Consumers cannot tell the difference.

**Why this is 1.25h and not 2h:** §3.2. If it runs longer, the rollup is being done in TypeScript instead of SQL — stop and move it.

**Exit criteria:** `GET /api/heatmap?path=/&segment=device=mobile|outcome=bounced` returns the agreed JSON shape, populated, in <1.5s; mobile CTA `viewed_pct` is materially below desktop; `rage_click` shows up on `.tier-2`.

**You verify:** read the mobile-bounced heatmap JSON top to bottom. Every number should be one you could defend to a judge on camera. **If `click_rate_pct` is 0 everywhere, the selector alphabet between events and snapshot has diverged** — that is a P4/P5 bug surfacing here, and it must be fixed here rather than worked around.

---

#### P9 — Screenshots and session digests (1h)

**Goal:** the heatmap backdrop exists, and session behaviour is summarised into narratives the agent can read.

**I build:**
- `scripts/screenshot.ts`: local Playwright, full-page captures of Site A at 390px and 1440px, uploaded to S3 at known keys. Deliberately local, deliberately not a Lambda (§1.2).
- **Session digests, deterministic first:** each session gets a behavioural signature (`device | reached-pricing? | scroll-oscillations | dwell-band | exit-type | converted?`); sessions group by signature; clusters under 15 sessions merge into `other`. Only then does one model call per cluster write a short narrative **from the cluster's statistics, never from raw events** — on `gemini-3.1-flash-lite`, this being the highest-count lowest-stakes model use we have (§3.1). The LLM writes prose; it does not do the grouping. (§9.3)
- `get_session_digest()` tool function.

**Exit criteria:** screenshots at both widths in S3; ≥4 digest clusters with readable narratives and correct session counts; each narrative's claims traceable to the cluster's stats.

**You verify:** read the four narratives. Do they describe behaviour you actually saw the swarm perform in P7? If a narrative asserts something the stats do not contain, the prompt is too loose — tell me, because the same failure mode will show up in the agent's opportunity claims.

---

#### P10 — Dashboard scaffold and design system (1.5h)

**Goal:** the Best-UI surface exists, with the design decisions from §5.3 implemented as tokens rather than as ad-hoc classes.

**I build:** Vite + React + Tailwind; design tokens from §5.3 as CSS custom properties; self-hosted Archivo / Public Sans / IBM Plex Mono; app shell with left nav (Overview, Heatmaps, Opportunities, Experiments, Approvals, Learnings, Reports, Run log); the persistent objective/guardrail header showing *"Increase signup conversion 3% → 4% without reducing lead quality"*; the `SIMULATED TRAFFIC` chip system; designed empty states; deployed to its own CloudFront domain. Charts will be hand-rolled SVG — no chart library, because we need exactly three chart forms and full control over how uncertainty is drawn.

**Exit criteria:** deployed and loading at its own domain; every nav item routes to a designed empty state, not a blank page or a 404; no default Tailwind blue anywhere; fonts loading without layout shift.

**You verify:** open it on **the exact machine, monitor and browser zoom you will record the video at**. Look at the shell for 30 seconds. Does this look like a product or like a hackathon project? Every generic-looking element you flag now is cheap; on Saturday it is impossible.

---

#### P11 — ★ HERO 1: heatmap overlay screen (2h)

**Goal:** the single most persuasive screen in the product.

**I build:** §5.4.1 — full-bleed screenshot canvas with the overlay composited at 0.65 alpha over a 60%-desaturated screenshot; left rail of segment filters (device / new-vs-returning / **converted-vs-bounced**); mode switcher (click / scroll) as a segmented control; right rail listing top elements with `viewed_pct`, `click_rate_pct`, `median_time_to_first_view` in mono. Hovering an element row highlights its bounding box on the canvas and vice versa. The converted↔bounced toggle animates the ramp between states. Click density uses the magma-like ramp, scroll depth the teal sequential ramp, per §5.3.

**Exit criteria:** real swarm data rendering over the real screenshot; toggling converted↔bounced visibly changes the map; coordinate re-projection verified — a click recorded at 390px lands on the correct element in the 1440px render.

**You verify — the correctness check matters more than the looks here:** click a known element on Site A ten times at a known spot, re-aggregate, and confirm the heat lands on that element in **both** the 390px and 1440px renders. A heatmap that looks plausible but is wrong is worse than no heatmap, and this is the only moment we will catch it. Then judge the aesthetics: this screen is on camera for 20 seconds.

**✅ Friday 13:00 checkpoint — see §1.4.**

---

#### P12 — Agent skeleton: Strands, tools, run log (1.5h)

**Goal:** a Strands agent runs, calls real tools, and its reasoning is visible.

**I build:**
- `packages/agent`, Python 3.12, Strands Agents SDK. **Growth Orchestrator** holds the objective and guardrail in its system prompt and is the only component with a goal; specialists are exposed to it as tools.
- Tool implementations as thin HTTP calls into `packages/api` — all deterministic: `get_heatmap`, `get_funnel`, `get_session_digest`, `get_page_dom`, `get_experiment_history`, `create_variant`, `launch_experiment`, `get_experiment_results`, `stop_experiment`, `write_learning` (stubs where the phase has not landed yet).
- `runs` log written as the loop executes — per-step agent / tool / latency / tokens — and a run-log view in the dashboard polling every 2s.
- **Model client** (§3.1): one serialized call path with a token-bucket rate limiter, **automatic spillover `3.6-flash` → `3.5-flash` → `flash-lite` when a per-model daily quota trips**, and a file-backed response cache (`GX_MODEL_CACHE=1`) so prompt iteration does not burn quota. Model chosen per call site, not globally.
- Hard caps: `max_iterations`, per-run token ceiling, 300s wall clock (rate-limit waiting is not the agent being stuck).
- **Runs locally against the deployed database and API.** Lambda-container deployment is P21's problem, deliberately, so agent work is never blocked on a container build.

**Tech:** Strands + Gemini (§3.1), `pip install 'strands-agents[gemini]'`. Bedrock is closed and is not a dependency of anything.

**Exit criteria:** `pnpm agent:run` executes a loop that calls at least three real tools and writes a complete run record; the run log renders in the dashboard with the tool sequence visible.

**You verify:** trigger a run and watch the run log populate. You should be able to follow what the agent did without reading code. Note the wall-clock time — if a run takes over 90s, tell me, because that shapes how we film it.

---

#### P13 — Analyst → ranked opportunities with evidence (1.5h)

**Goal:** the agent surfaces problems and proves where each claim came from.

**I build:** the Analyst sub-agent, with an **enforced output schema**: every opportunity carries ≥3 evidence items, each `{kind, label, value, sourceRef}` pointing at the aggregate row or digest it came from. An opportunity containing an unbacked claim is rejected by the tool, not by the model's goodwill. Persisted to `opportunities`. Opportunities screen: ranked cards, confidence, expandable evidence with the source pointers rendered.

**Exit criteria:** a run produces ≥2 ranked opportunities; every numeric claim is traceable to a stored aggregate; the mobile CTA problem is among them (if it is not, the analyst prompt or the aggregation is wrong).

**You verify:** pick two evidence claims and check them by hand against the heatmap JSON. **If the agent asserts a number the data does not contain, that is a blocker, not a polish item** — tighten the tool output schema until the model can only quote, never invent. This is the difference between "evidence trail" and "LLM wrapper" in a judge's eyes.

---

#### P14 — Hypothesis writer + learning memory (1h)

**Goal:** the memory is load-bearing, and provably so.

**I build:** the Hypothesis writer, which calls `get_experiment_history` **first, always** — enforced by tool sequencing and asserted in the run log. Output must name which learnings it used and state a falsifiable prediction with a direction and a metric. `learnings` seeded with two plausible records from earlier manual runs (disclosed as such in the demo — they came from somewhere real, not from nowhere). Learning log screen showing each record, its source experiment, and **which later hypotheses cited it**, computed from the run log.

**Exit criteria:** a hypothesis explicitly cites at least one learning record and the back-reference renders in the learning log.

**You verify — this is the test that the memory is real:** run once, note the hypothesis. Delete a learning record. Run again. **The hypothesis must change.** Record the result of this experiment; it is the single strongest piece of evidence that this is not a prompt chain, and it is worth mentioning in the video voiceover.

---

#### P15 — Variant generator, validator, live check (1.5h)

**Goal:** safe, structured, verified variants.

**I build:** the Variant generator (`get_page_dom` → `create_variant`), the full §4.3 validation pipeline in plain code (schema parse → single-match selector resolution against the snapshot → denylist → value/prop allowlists → repair loop, max 2 retries), and the **live check**: Playwright loads the real page, applies the mutation set, asserts every selector matched at runtime and nothing threw, and saves before/after screenshots at 390px and 1440px. An experiment cannot leave `draft` without a passed live check. Control + one challenger; a second challenger only if this phase runs early.

**Exit criteria:** generated variants have 100% selector match after the pipeline; before/after screenshots exist for both widths; a deliberately malformed mutation (bad op, unknown selector, denylisted target) is rejected with a clear reason.

**You verify:** look at the generated after-screenshots at both widths. **The question is not "did it validate" but "would I ship this to my own homepage?"** If a variant is merely different rather than plausibly better, the generator prompt needs the opportunity's evidence bound in harder. A visually poor variant on camera undermines the entire premise, so this is the moment to be fussy.

---

#### P16 — ★ HERO 2: variant diff screen (1.5h)

**Goal:** prove the variants are structured, not freeform.

**I build:** §5.4.2 — control and challenger side by side as live iframes of Site A using `?gx_force=`, above a mono list of the mutations with each one's `note`. Hovering a mutation row highlights its target element in both frames. Mobile/desktop width toggle.

**Exit criteria:** both frames render the real live site with genuinely different DOM; every mutation is listed with its agent-written rationale; the width toggle works.

**You verify:** hover each mutation row and confirm the correct element highlights in both frames. Then read the mutation list as a site owner would — does each `note` explain *why*, in language a marketer would accept?

**✅ Friday 22:00 checkpoint — see §1.4.**

---

### 6.3 · DAY 3a — Saturday 20 Sept, 08:00 → 14:00 (~6h) · P17 → P21

*Goal: governance, a concluded experiment, and the third hero screen. This is a hard-stop block.*

---

#### P17 — Cedar policy gate (1.25h)

**Goal:** the agent is demonstrably not permitted to act freely, and the denial is visible.

**I build:**
- `policies/growthx.cedar` — real Cedar syntax, evaluated in-process via `@cedar-policy/cedar-wasm` before every state-changing agent action: `permit` read analytics / read heatmaps / create experiment / generate variants; `forbid` launch_experiment and deploy_winner **unless** an approved approval record exists (the gate expressed as policy, not as an `if`); unconditional `forbid` on anything targeting resources tagged `pricing` or `checkout`, and on publish/delete of pages. Entities: `Agent`, `Site`, `Experiment`, `PageRegion`.
- Every decision (allow/deny, matched policy ID, reasons) persisted on the run step and the experiment record, and **rendered in the UI — including denials.** A denial on screen is worth more than ten allows.

**Exit criteria:** the agent attempting to launch is denied with the blocking policy named; an attempt to mutate the pricing element is denied unconditionally; both denials render in the dashboard.

**You verify:** open `policies/growthx.cedar` and read it — it should be legible as policy, not as code. Then trigger the pricing-mutation denial and confirm the UI names the policy that blocked it.

---

#### P18 — Experiment engine and statistics (1.25h)

**Goal:** the deterministic machinery the agent is not allowed to reason about.

**I build:** split config → manifest; exposure and conversion counting via GSI2; the guardrail metric computed alongside the primary; auto-stop rules (`maxDays`, `minSessionsPerArm`, guardrail breach, futility); manual kill switch that removes the experiment from the manifest — and CloudFront's 30s TTL means it is gone from the live site within 30 seconds, which we demo. **Statistics in plain code, never in the model:** two-proportion z-test, Wilson intervals per arm, required-sample-size for 80% power at the observed effect, and the computed "not yet decisive — n=X/arm, need ~Y/arm" string.

**Exit criteria:** a swarm run against a live experiment produces correct per-arm exposure and conversion counts; the statistics match an independent online calculator for the same inputs; the kill switch takes effect on the live site within 30s.

**You verify:** take the per-arm counts from the dashboard, put them into any online two-proportion calculator, and confirm the p-value and intervals agree. Then hit the kill switch, wait 30 seconds, and reload Site A in a clean profile to confirm the challenger is gone.

---

#### P19 — Approval queue + experiment lifecycle (1.5h)

**Goal:** the human gate, running on a real state machine.

**Order matters here — §3.3. Cheap path first.**

**Step 1 (~45 min, guarantees the demo beat):** the in-code lifecycle. `experiments.status` as the state, an `approvals` row carrying the Cedar decision, an EventBridge-scheduled `tick` Lambda driving `running → evaluate → conclude`, with rejection and kill as explicit transitions rather than error paths. Approval API and approval-queue screen: the pending request, the Cedar decision that created it, the variants under review, approve / reject-with-reason. The rejection reason feeds back to the agent as context on its next run.

**Step 2 (only if step 1 is done and the clock allows):** wrap those same transitions in a Step Functions `ExperimentLifecycle` — `ValidateVariants → CedarCheck → RequestApproval (waitForTaskToken) → Launch → Monitor → AutoStopCheck → Conclude` — with `approvals.task_token` carrying the token. Purely an architecture upgrade; user-visible behaviour is identical.

**Why this is inverted from the original plan:** on a 6-hour Saturday, a 90-minute failure path that yields nothing is a bad bet. This way the demo beat is guaranteed at 45 minutes and Step Functions becomes additive rather than a gamble.

**Exit criteria:** agent requests launch → Cedar denies → approval appears in the queue → approving resumes the execution → experiment goes `running` → the challenger is live on Site A within 30s, verified in a fresh browser profile. Rejecting instead produces a rejection whose reason reaches the next agent run.

**You verify:** run the whole gate by hand, both branches. **Screen-record the approve branch while you do it** — this is demo shot 7 and you may not get a cleaner take later in the day.

---

#### P20 — ★ HERO 3: evaluator, results, attribution, learning written (1.5h)

**Goal:** the loop closes.

**I build:**
- The Evaluator sub-agent: reads `get_experiment_results` (which returns **computed** statistics, never raw counts for the model to do arithmetic on) plus `get_session_digest` for the winning and losing segments, and writes what happened, which segment drove it, why (grounded in digests), and whether the guardrail held.
- Results & attribution screen (§5.4.3): per-arm rates with honestly-drawn confidence intervals (overlapping intervals must *look* overlapping), the guardrail tracked alongside and visually separated, a segment breakdown with an explicit "underpowered" marker on any cell below threshold, and the decision state in plain language. **No large green lift number anywhere.**
- `write_learning` → `learnings` with the one-sentence generalisation and tags; the new record appears in the learning log with its back-references.
- Report view: observation → diagnosed cause in plain language → evidence with figures → hypothesis → variants and their reasoning → outcome and attribution.

**Exit criteria:** a concluded experiment renders a full result with attribution and a plain-language explanation that matches what the digests actually say; a learning record is written and appears in the log; a deliberately under-powered experiment displays "not yet decisive" and refuses to declare a winner.

**You verify:** read the generated report end to end as if you were Corrick's founder. **The "diagnosed cause" paragraph is the sentence this entire product is judged on.** If it is vague or generic, tell me and I will tighten the prompt until it names specific elements and specific numbers. This is worth 15 minutes even on Saturday.

**✅ Saturday 12:00 checkpoint — see §1.4.**

---

#### P21 — E2E script, remaining screens, polish (1h, compressible)

**Goal:** everything a judge might click works, and the demo state is reproducible from cold.

**I build:** `scripts/e2e.ts` — seed → swarm 400 → aggregate → agent run → approve → swarm 800 → evaluate → conclude → learning written, as one command. Remaining screens inheriting P10's components (overview, experiment list, report view). A copy pass across every label, empty state and tooltip — generic copy is the most common tell. Error states for agent failure, no data, zero exposures. Agent deployed to a Lambda container **only if** it takes under 20 minutes; otherwise it runs locally and we disclose that in the architecture slide (§1.3 rung 4).

**Exit criteria:** `pnpm e2e` completes from an empty database and leaves the dashboard in exactly the state the demo needs. Run it twice.

**You verify:** wipe the tables, run `pnpm e2e`, then click every nav item looking for anything broken, empty or ugly. Last chance to find a screen we forgot.

**🛑 14:00 SATURDAY — FEATURE WORK STOPS HERE, whatever state P21 is in.**

---

### 6.4 · DAY 3b — Saturday 20 Sept, 14:00 → 19:49 (~5.5h) · P22 → P23

---

#### P22 — Demo state and rehearsal (1h, 14:00–15:00)

**I build:** the demo runbook in `GUIDE.md` §D — the exact sequence to put the system into demo state from cold, with timings; the `?gx_force=` URLs for each variant; the cached last-run fallback so no live model call is ever load-bearing on camera. Architecture diagram. README including the simulation disclosure and the behaviour-model file reference.

**You verify:** run the full demo sequence twice, timed, tabs pre-opened in the order you will use them. Get it under 3:00 with 15 seconds of slack. **Do not record until a rehearsal has gone clean.**

---

#### P23 — Record, edit, submit (4.5h, 15:00–19:30)

- 15:00–16:00 record screen captures per the §10 shot list. Capture more than you need; re-recording at 18:00 is not possible.
- 16:00–16:30 record voiceover from the written script.
- 16:30–17:45 edit to under 3:00.
- 17:45–18:00 upload, make the repo public, final README check.
- **18:00 file the first submission.** Complete-but-imperfect beats late-and-perfect.
- 18:00–19:30 improve and re-submit if the platform allows edits.
- **19:30 stop. Deadline is 19:49.**

---

## 7. `GUIDE.md` — your checklist

Created in P0, and **updated by me at the end of every single phase before I hand back to you.** It contains only what I cannot do myself: things needing your AWS console, your credentials, your browser, your eyes, your judgement.

Because this build is phase-by-phase with you testing each handoff, `GUIDE.md` is not a formality — it is the interface between us. It has four sections.

### §A — State (top of file, rewritten every phase)

- ✅ Phases passed, each with the timestamp it passed.
- ▶ The phase in progress and the exact next action.
- ⬜ Phases remaining, with their time budgets and the current running total against the §0.3 clock.
- **Live URLs**, written automatically by `scripts/outputs.ts` so they can never go stale: Site A, dashboard, API base, CDN, the Neon project dashboard, and the AWS console links for the Lambdas and CloudFront distributions.
- Known-broken list with severity, and anything currently on a fallback path rather than the AWS path.
- The next checkpoint from §1.4 and how far ahead or behind we are.

### §B — One-time setup you must perform

Written as numbered steps, each with the exact command or the exact console path, what success looks like, and what to do on failure.

1. **AWS account + region.** Pick one region and never deviate (cross-region inference profiles are the only exception). Create an IAM user or SSO profile named `growthx`, run `aws configure --profile growthx`, verify with `aws sts get-caller-identity --profile growthx` and the expected output shape.
2. **Bedrock model access — do this in your first 15 minutes.** Exact console path, exactly which models to enable (a Claude Sonnet 5 inference profile), which region, and where to paste the resulting profile ID. **Record the exact inference-profile ID from your own console into `.env`.** Do not trust any model ID written from memory, including one written by me — the guide will say this explicitly. Expected approval latency, and the §3 trip-wire for giving up on it.
3. **Hackathon AWS credits** redemption steps, plus a CloudWatch billing alarm at a threshold you choose. Agent loops can burn money if a retry loop misbehaves.
4. **`cdk bootstrap`** — a one-time per-account-per-region step that fails confusingly if skipped. The guide gives the command, the expected output, and the specific error text you see if you skipped it.
5. **Fallback provider key.** Create an Anthropic API key and store it **even if Bedrock is approved.** It is the insurance policy for Friday night, and P6 cannot wait on a pending Bedrock request.
6. **Local tooling.** pnpm; **Python 3.12 specifically** — this machine has 3.14 and several agent-stack dependencies will not have wheels for it yet, so install 3.12 via `uv` or `pyenv` and pin it in `packages/agent/.python-version`; `pnpm exec playwright install chromium`. Each with a verification command.
7. **Where every secret goes.** `.env` at repo root for local scripts; SSM parameters (set via one documented CLI command) for deployed Lambdas. **Nothing secret in the snippet, in Site A, or in the dashboard bundle** — the snippet is public by design and carries only a `siteId`.
8. **Custom domain: recommendation is no.** CloudFront domains are fine and a DNS propagation wait on Day 1 is a bad trade against this clock. Revisit only if everything else is done, which it will not be.

### §C — Per-phase verification

One block per phase, added as that phase completes. Every block follows the same template so you never have to hunt:

```
## P<n> — <title>          [status: ✅ passed 18 Sep 14:20]

### What this phase should have made true
<one sentence, in product terms>

### Run this
<exact commands and exact URLs, copy-pasteable, no placeholders except ones §A defines>

### You should see
<concrete expected output, with a real sample — not "should work">

### Failure looks like
<the two or three most likely symptoms, each with its likely cause>

### Code bug or environment problem?
<the distinguishing test — e.g. "403 from /collect is origin config (my bug);
500 with AccessDeniedException is IAM (your setup); ExpiredToken from the CLI
means re-login">

### Inspect the data by hand
<full, pasteable psql / curl commands for the tables this phase touches>
```

That "code bug or environment problem" line is the single most time-saving thing in the document, and it is why every phase gets one. At 2am the difference between "Claude broke it" and "my token expired" is twenty minutes.

### §D — Demo-day runbook (written in P22)

Cold-start sequence with timings, the `?gx_force=` URLs for each variant, the tab order for recording, and the cached-last-run fallback if a live call fails mid-take.

### What must never go in `GUIDE.md`

Build steps, code explanations, architecture description, API contracts, or TODOs for me. Those live in `PLAN.md`, the README, or the code. `GUIDE.md` is strictly the human-in-the-loop surface.

---

## 8. Risks

| # | Risk | Likelihood | Impact | Mitigation | Trip-wire / fallback |
|---|---|---|---|---|---|
| R1 | **Hallucinated selectors** — mutations silently no-op and there is no product | High | Fatal | Shared DOM-path alphabet (§4.4), rich snapshot outline, hard validator, repair loop, live Playwright check before any experiment leaves draft | P6 gate on Day 1. <95% post-repair → stamp `data-gx-id` on Site A and restrict the generator to those selectors (~30 min); <70% even then → generation becomes selection from an enumerated list |
| R2 | **Generated variants look visually broken on camera**, undermining the premise | High | Severe | Closed op set with no freeform HTML; style-prop allowlist; `set_media_style` for mobile-specific changes; automatic before/after screenshots at both widths, human-reviewed in P15 | If a variant looks bad in the P6 spike, constrain the op set **that day** — drop `set_style` to a handful of safe props and lean on `move_*` and `replace_text`, which are near-impossible to make ugly |
| R3 | **Scope overrun on a 2.5-day clock** | Very high | Fatal | Pre-emptive cuts already made (§1.2); six checkpoints (§1.4); 24 small phases with hard exit criteria; a 14:00 Saturday feature freeze | At each checkpoint, drop the next ladder rung immediately rather than negotiating with yourself |
| R4 | **Flicker** — a visible flash when the variant applies | Medium | Severe (the detail a CRO-literate judge looks for) | Synchronous inline pre-hide before body parse; single request; local deterministic bucketing so the manifest is edge-cacheable; 300ms hard-timeout reveal registered before the fetch | If flicker persists, cache the resolved mutation set in localStorage and apply it synchronously on repeat visits — correct, because bucketing is sticky — and demo on a repeat visit |
| R5 | **Heatmap coordinates wrong** — maps look plausible but are lies | Medium | Severe | Element-relative fractions as the primary signal (§4.4), re-projection onto the screenshot's own element rects | Caught by the explicit 10-click cross-width check in P11. If it fails there, fix before P12 — an incorrect heatmap poisons every agent conclusion downstream |
| R6 | **Insufficient sample size** — no result to show | Certain for real traffic | Medium | We do not pretend. Honest uncertainty is a designed state. The decided experiment in the demo comes from layout-reactive simulated traffic, disclosed as simulation | No mitigation needed — handled by design. The only real risk is forgetting to label it, which would be a credibility catastrophe |
| R7 | ~~Bedrock access not granted in time~~ **Closed 18 Sept** | — | — | Organisers confirmed Bedrock is not mandatory and the requirement is only to deploy on AWS (§3.0). Gemini is the primary provider and is verified working. | No action. Do not spend further time on Bedrock. |
| R8 | **AWS setup friction** (bootstrap, IAM, CORS, OAC, container Lambdas) | High | Medium | Every component in §3 has a named fallback and a stated trip-wire | **No single AWS config problem gets more than 90 minutes, ever.** On this clock that rule is the difference between shipping and not |
| R9 | **Agent run latency kills the video** | Medium | Medium | Hard caps on iterations/tokens/wall-clock; the run log makes waiting look intentional; a cached last-run always available | Record the agent run separately and cut to it. Never depend on a live cold start on camera |
| R10 | **Two-language split (TS + Python) costs half a day** | Medium | Severe | Python confined to `packages/agent`, single HTTP entrypoint, schemas owned by TS; the agent runs **locally** from P12 and is only containerised in P21, so agent work is never blocked on a deploy | If the container is not building in 20 minutes in P21, the agent stays local and we disclose it. The agent's logic is what is judged, not its hosting |
| R11 | **The swarm behaviour model is secretly a hardcoded win** — i.e. we fool ourselves | Medium | Fatal to credibility | Behaviour depends only on measured page geometry, lives in one documented file, and is disclosed in README and video | If a judge asks "did you just make the variant win?", the answer must be a file you can open on screen. Write it that way from the start |
| R12 | **Everything works but the video is rushed** | High on this clock | Severe | The 14:00 freeze; the shot list mapped to phases so nothing is discovered missing on Saturday; the 18:00 first-submission rule | If behind at Saturday 12:00, stop feature work early and film what exists |
| R15 | **Neon is an external dependency on demo day** | Low | Severe if it happens | Connection string in one place; the whole schema recreates with `pnpm db:push`; data regenerates with `pnpm e2e` in ~15 min | If Neon is down during recording, run Postgres locally via Docker and point the agent and dashboard at it; the video shows the deployed AWS URLs either way. Trip-wire: 20 min |
| R14 | **Gemini free-tier rate limits throttle the build or the demo** (~10 req/min/model; Pro unavailable) | High | Medium | Serialized client with a token-bucket limiter; **per-model spillover across the three Flash models, since quota is per-model** (§3.1); response cache so prompt iteration does not burn quota; raised wall-clock cap; never fan sub-agents out in parallel | If the daily cap is hit mid-build, switch to the cached-run path and continue on other phases; the video never depends on a live model call (P22) |
| R13 | **Day 2 is tight** — P8–P16 is ~12.75h against ~13h available | Medium (improved from High by §3.2) | Medium | P9 and P16 remain the compressible phases; digests can fall back to deterministic labels and the diff screen can ship without the hover-link interaction | If P12 has not started by 15:00 Friday, drop ladder rungs 1–2 on the spot |

---

## 9. Where I think you are wrong

Stated directly, as asked.

**9.1 The snippet should not ask the server which variant a visitor gets.**
The brief says the snippet asks an assignment endpoint. Do not. Make the snippet fetch a small, **edge-cacheable manifest** for `(site, path)` and compute the bucket locally with a deterministic hash of `visitorId + experimentId`. This is strictly better on every axis that matters here: a per-visitor request cannot be cached, so every first paint would wait on a Lambda cold start — exactly the thing that causes the flicker you correctly identified as a judged detail. With a cached manifest, the assignment decision costs ~20ms from an edge POP instead of ~600ms from a cold Lambda. It is also what real CRO snippets do. Server-side exposure logging still happens, asynchronously, after paint, so attribution is unaffected. The only thing lost is server-controlled reassignment, which we do not need.

**9.2 The vision/screenshot path is the weakest item on your list and should be treated as optional from the start.**
"The numbers say the CTA has a 3% click rate; the picture says why" is a great line, but in practice the DOM snapshot already carries bounding boxes, font sizes and above-fold flags — which is the *same information*, in a form the model reads more reliably than an image. Vision adds a headless-Chromium-in-Lambda dependency (a notorious time sink), image-payload debugging, and cost, for a marginal reasoning gain. Keep it as cut-ladder rung 1: build it if P5 runs early, drop it without a second thought otherwise. Screenshots are still needed as the *heatmap backdrop* — that use is non-negotiable and is satisfied by a local Playwright script.

**9.3 "Session digests summarised by the LLM" should be mostly deterministic.**
Letting a model cluster sessions is slow, expensive, non-reproducible, and the clustering is the part that must be trustworthy. Cluster deterministically on behavioural signatures; let the model write only the sentence. You get the same output quality at a fraction of the cost and you can defend the groupings.

**9.4 Amplify Hosting is the wrong default.**
It adds console clicking and git-branch wiring for something CDK-managed S3+CloudFront does in one deploy, with the same AWS-service credibility and fewer failure modes at 1am. Use CloudFront+S3 as the plan of record and keep Amplify as a fallback, not the other way round.

**9.5 DynamoDB was the wrong datastore for this product, and the constraint relaxation let us fix it.**
This is an analytics product: nearly every operation is *aggregate events grouped by segment*. Dynamo turns each of those into a fan-out plus a hand-rolled reduce. The original plan accepted that because AWS-nativeness seemed mandatory; once the organisers clarified that only deployment must be on AWS, Postgres became clearly correct. See §3.2. If you want the all-AWS diagram back, that is a real trade — say so and I will revert, but I would not.

**9.6 Your instinct that "one feature that works beats five that almost do" should be applied harder than the feature list implies.**
The feature list in the brief is large. The chain in §0.1 is what is judged. Heatmap modes, three variants, personalization proposals, report export — all of these are decoration on that chain. I have put them on the cut ladder rather than in the core, and I would drop them earlier than reluctantly.

**9.7 One thing I think you are right about that is worth reinforcing:** the honest-uncertainty decision. It is counter-intuitive for a hackathon and it is correct. An agent that says "n=340, not yet decisive" in front of judges is more credible than any "+15.9%" claim, and it inoculates you against the single most likely hostile question. Design that state properly; do not treat it as an error state.

---

## 10. Demo video shot list (3:00)

Recorded at 1440px, one browser profile, tabs pre-opened per the P22 runbook. Voiceover scripted and recorded separately, then cut to picture. Every shot names the phase that must have shipped for it to exist.

| # | Time | Shot | Voiceover beat | Needs |
|---|---|---|---|---|
| 1 | 0:00–0:15 | Site A loading at phone width, CTA below the fold | "Companies aren't short of A/B testing tools. They're short of the person who decides what to test." | P2 |
| 2 | 0:15–0:30 | The one script tag, then Site A live with it installed | "One script tag. No repo access, no deploys, no changes to the site's code." | P3 |
| 3 | 0:30–0:50 | Heatmap screen; toggle **converted → bounced** on the mobile segment | "Here's what visitors actually do. Bounced mobile visitors reach the CTA — and don't touch it." | P11 |
| 4 | 0:50–1:10 | Opportunity card with its evidence pointers expanded | "The agent doesn't assert. Every opportunity shows the data it reasoned from." | P13 |
| 5 | 1:10–1:30 | Learning log → hypothesis citing a learning, with the back-reference | "And it remembers. This hypothesis is built on what an earlier experiment already proved — so it doesn't re-test settled questions." | P14 |
| 6 | 1:30–1:50 | Variant diff, control vs challenger, mutation list in mono | "Variants are structured DOM changes, not generated HTML. Safe to apply, and reviewable." | P16 |
| 7 | 1:50–2:15 | Cedar **denial** → approval queue → approve → Site A in a fresh profile showing the challenger live | "It is not allowed to launch. Policy blocks it until a human approves — then it's live on the site in under thirty seconds." | P17, P19 |
| 8 | 2:15–2:35 | Results screen: intervals, guardrail, segment attribution, "not yet decisive" | "It reads the result honestly. n=412 per arm. Not decisive yet — and it says so." | P18, P20 |
| 9 | 2:35–2:50 | Learning record written → next proposed experiment | "Then it writes down what it learned, and proposes what to test next. That's the loop." | P20 |
| 10 | 2:50–3:00 | Architecture frame: Strands, Gemini, Lambda, API Gateway, S3/CloudFront, Postgres, Cedar | "A Strands agent governed by Cedar policy, deployed on AWS." | P22 |

**Deliberately not in the video:** any large lift percentage, any claim of significance on real traffic, and any shot where simulated traffic is unlabelled. Shots 3 and 8 must both carry the `SIMULATED TRAFFIC` chip on screen.

**Scheduling consequence:** shots 1–6 need P2–P16, all complete by Friday night. Shots 7–9 need P17–P20, complete by Saturday 12:00. **Nothing in the video depends on P21.** That is deliberate — the video is shootable even if Saturday morning goes badly.

---

## 11. Rejected approaches (on record, for judge Q&A)

**Browser extension.** Only the person who installs it sees the variants. A CRO tool must serve variants to the *site's* visitors, who will never install anything, which makes an extension architecturally incapable of running an experiment. It is viable only as an optional point-and-click authoring surface for the site owner — a roadmap item — never as the delivery mechanism.

**Agent opens a pull request against the customer's repo.** This is a different product. It edits real source, needs human code review, needs a deploy per variant, and fundamentally cannot split traffic — you would be shipping a change, not testing one. It also requires repo access, which multiplies the trust and security surface by an order of magnitude for a product whose entire adoption pitch is "paste one line".

**Edge proxy / Lambda@Edge HTML rewriting.** Technically the cleanest option: variants are applied server-side so there is zero flicker, and no client-side mutation is needed at all. Rejected because it requires the customer to route their DNS through us — an enterprise-grade integration decision, not a paste-one-line decision — and building it correctly is more than four days of work on its own. **This is the right answer to a judge who probes on flicker:** the client-side snippet is the self-serve tier; edge rendering is the enterprise tier, and the mutation schema is deliberately designed so the *same* variant definition can be applied either client-side or at the edge without change. That is a genuine architectural property of the design, not a talking point.

**DynamoDB as the datastore, LLM-driven session clustering, server-side per-visitor assignment, Amplify Hosting** — rejected for the reasons in §9 and §3.2.

---

---

## 12. Definition of done for the submission

- [ ] Site A live at its own URL, instrumented, deliberately flawed, aesthetically competent.
- [ ] Dashboard live at its own URL, every nav item functional, no placeholder content.
- [ ] `g.js` served from CloudFront, <8KB gzipped, no flicker at Slow 4G + 4× CPU.
- [ ] One complete chain visible in the UI: behaviour → opportunity with evidence → hypothesis citing a learning → validated variants → Cedar denial → human approval → live experiment → honest result → learning written → next experiment proposed.
- [ ] Cedar policies in the repo as real `.cedar` files, with a denial visible in the UI.
- [ ] Step Functions execution graph screenshot-able, or the documented fallback, disclosed.
- [ ] Every simulated number labelled, and `swarm/behaviour.ts` referenced in the README as the disclosed behaviour model.
- [ ] `GUIDE.md` current through the last completed phase.
- [ ] Video under 3:00, every claim in it true.
- [ ] Repo public, README with architecture diagram.
- [ ] **First submission filed by 18:00 Saturday.** Deadline 19:49.
