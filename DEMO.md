# DEMO.md — recording, presenting, and defending GrowthX

Everything you need to record the three-minute video and answer questions about
it. Read §1 and §2 once before you record; §3 is the shot list you follow with
the screen open; §4 is what to say if a judge probes.

> **Live URLs** are in `GUIDE.md` §A and are rewritten on every deploy. Open them
> before you start and leave them in tabs.

---

## 1. The project in one breath

**The pitch:** Companies are not short of A/B testing tools. They are short of
the person who decides what to test. GrowthX is an AI growth engineer that
watches real visitor behaviour, finds where conversions leak, forms a hypothesis
informed by what it has already proved, generates safe UI variants, runs a
governed experiment, reads the result honestly, and proposes the next one.

**The one claim we prove on camera:**

> The agent observed real behaviour on a live site, found a real problem, showed
> the evidence, formed a hypothesis informed by a previous experiment, generated
> safe DOM-level variants, was blocked by policy from launching until a human
> approved, and read the result honestly.

**What is genuinely novel.** The tooling is commodity — Optibase, VWO and Hotjar
all do A/B tests, heatmaps and session recordings. What none of them do is
collapse the analyst, the designer and the experiment owner into one agent that
runs continuously, holds an objective and a guardrail, and **accumulates learning
across experiments** so experiment #3 is informed by what #1 and #2 proved.

Today's tools give a marketer controls. **We built the operator of those
controls.**

**Three things must be visible or it reads as an LLM wrapper**, and all three
are on screen in the video:

1. **The learning memory** — a growing log of generalisations that demonstrably
   feeds the next hypothesis.
2. **The policy gate** — the agent is not permitted to act freely on a live site.
3. **The evidence trail** — every opportunity shows the data it reasoned from,
   verified, not asserted.

---

## 2. How it actually works

### 2.1 Delivery: one script tag, nothing else

```html
<script src="https://<cdn>/g.js" data-site="site_corrick"></script>
```

No browser extension, no repo access, no edits to the customer's source, no
deploy to their infrastructure. The snippet:

1. **Assigns a variant before paint.** Sticky anonymous visitor id in
   `localStorage`; fetches a small manifest; buckets **locally** with
   `fnv1a(visitorId + experimentId) % 100`.
2. **Applies DOM mutations** from a closed operation set.
3. **Records behaviour** — clicks, rage clicks, dead clicks, scroll depth,
   element visibility, dwell, back-exits — batched, with a `sendBeacon` flush on
   unload.
4. **Fires the conversion** on a selector or URL match.

**Why bucket locally instead of asking the server?** A per-visitor response
cannot be cached, so every first paint would wait on a cold Lambda. Because
assignment is computed client-side, the manifest is identical for every visitor
of a page and CloudFront caches it at the edge. The architecture decision and
the performance fix are the same decision.

**Anti-flicker is structural, not lucky.** The page is hidden synchronously
before `<body>` parses; both reveal timers are registered *before* the fetch, so
an unreachable API can never leave a blank page; and **once revealed, the snippet
refuses to mutate**. Either the change lands before anything is visible or it
does not land at all — there is no third case.

### 2.2 Variants are structured mutations, never generated HTML

```json
[{"op":"replace_text","selector":"a.cta-primary.btn-solid",
  "value":"See how it works","note":"lower-commitment language"}]
```

A closed set: `replace_text`, `set_attr`, `set_style`, `set_media_style`,
`add_class`, `remove_class`, `hide`, `show`, `move_before`, `move_after`, `swap`.
There is no `set_html` and there never will be.

This buys three things: variants are **safe** (nothing arbitrary is injected),
**reviewable** line by line, and **impossible to render as visually broken
garbage**. It is also why the same variant definition could be applied at the
edge for an enterprise tier without changing anything.

### 2.3 How the agent sees the page

A **DOM snapshot** — a sanitised outline of every meaningful element: its
selector, text, size, and whether it sits above the fold at 390px and at 1440px.
Captured at **both widths**, because the single most important fact about the
page — the CTA is above the fold on desktop and below it on mobile — is invisible
in a one-viewport capture.

The snapshot and the event capture **share one selector builder**. If they ever
diverged, the agent would read heatmaps in one alphabet and write mutations in
another; every mutation would silently no-op while the product appeared to work.

### 2.4 The hard rule

> **Deterministic work never enters the model.**

Bucketing, conversion counting, significance, aggregation, coordinate
normalisation — all plain SQL and plain code, exposed as tools. **The agent
decides what and why; the tools compute.** It may quote a figure, never
calculate one. That is the only reason the evidence trail means anything.

---

## 3. Where AWS is used, and why

The organisers confirmed Bedrock is not mandatory and the requirement is to
**deploy on AWS**. Here is what runs where and the reasoning behind each choice.

| Service | What it does here | Why this and not something else |
|---|---|---|
| **S3 + CloudFront** ×3 origins | Serves `g.js`, the customer site, and the dashboard — each on its own domain | Three separate origins make "paste one snippet into any site" visibly true rather than asserted. `g.js` has a **60s TTL**, which is also the kill-switch latency: stop an experiment and it is off the live site within a minute |
| **CloudFront behaviour on `/manifest`** | Edge-caches the experiment manifest on `(site, path)` | The fix for a measured bug: fetching from API Gateway directly cost ~500ms on throttled 4G and the experiment silently never ran for mobile visitors. Cacheable **only because** assignment is client-side |
| **API Gateway (HTTP API)** | Routes to every Lambda | One deploy, no servers, correct for spiky ingestion |
| **Lambda** ×5 (ARM64, Node 20) | `manifest`, `collect`, `snapshot`, `health`, `dashboard` | Ingestion is bursty and idle most of the time — exactly the shape Lambda is for. ARM64 for cost |
| **SSM Parameter Store** (SecureString) | Database URL and model key, read at cold start | Lambda environment variables are visible in the CloudFormation template and the console; SecureStrings are not |
| **CloudWatch Logs** | Every Lambda | Found a real data-loss bug: 1221 clean invocations while events vanished |
| **CDK (TypeScript)** | All of the above | One language across infrastructure and application; `pnpm deploy:infra` rebuilds everything from scratch |
| **Cedar** *(AWS open source)* | Permission policy evaluated before every state-changing agent action | Policy as real `.cedar` files you can read on screen, not an `if` statement buried in a handler |
| **Strands Agents SDK** *(AWS open source)* | The agent loop, sub-agents as tools | Model-agnostic, so the provider is a config value; native Gemini support |

**Two honest notes**, and say them plainly if asked:

- **Bedrock is not used.** Model access was denied on this account and the
  organisers said not to wait for it. The agent runs on Gemini through Strands,
  which is a one-line provider change. **Strands and Cedar are both AWS open
  source and are doing load-bearing work**, so the AWS story does not depend on
  Bedrock.
- **Postgres is Neon, not RDS.** This product is analytics-shaped — nearly every
  operation is *aggregate events grouped by segment*, which is one `GROUP BY`
  each in SQL. Neon provisions in seconds and its driver speaks HTTP, so **Lambda
  needs no VPC** — RDS would have dragged in VPC config, a NAT gateway and cold
  starts. Neon itself runs on AWS; all compute and hosting is AWS.

### Architecture, as one picture

Draw this on a slide, or screenshot the block from `PLAN.md` §2.1:

```
  Visitor's browser                          Site A (S3 + CloudFront)
        │  <script src="cdn/g.js" data-site="…">
        │
        ├── 1. GET /manifest        ← CloudFront edge (30s), assignment is local
        ├── 2. apply DOM mutations, reveal page
        ├── 3. POST /collect        → API Gateway → Lambda → Postgres
        └── 4. POST /snapshot       → page outline for the agent
                                                    │
   Dashboard (S3 + CloudFront) ──► /api/* Lambda ───┤
                                                    │
   Growth Orchestrator  (Strands, Python)           │
     ├─ reads  get_heatmap / get_funnel / get_session_digest / get_page_dom
     ├─ checks get_experiment_history      ← the learning memory
     ├─ writes record_opportunity          ← evidence verified against the DB
     └─ writes propose_experiment          ← selectors validated against the page
                     │
              Cedar policy ── forbids launch without an approval record
                     │
              Human approves ──► experiment goes live within 30s
```

---

## 4. The shot list — 3:00

**Before you hit record**

- [ ] `pnpm aggregate && pnpm digests` so the numbers are current
- [ ] Open these tabs in this order, all at 1440px, browser zoom 100%:
      1. Site A on a phone-width window · 2. Dashboard Overview ·
      3. Heatmaps · 4. Opportunities · 5. Learnings · 6. Variant diff ·
      7. Approvals · 8. Experiments
- [ ] Hide bookmarks bar, close notifications, use a clean profile
- [ ] Record at 1440×900 or 1920×1080, 30fps is plenty
- [ ] **Do not run the agent live on camera.** Quota is ~20 requests/minute per
      model and a run can pause 40 seconds. Show the stored result

**Timing.** Ten shots, roughly 18 seconds each. Record generously and cut down;
re-recording at the end is not possible.

| # | Time | Screen | What you do | What you say |
|---|---|---|---|---|
| 1 | 0:00–0:15 | **Site A**, phone width | Scroll slowly down the hero. Stop when the CTA appears | "Companies aren't short of A/B testing tools. They're short of the person who decides what to test. This is a real landing page — and on a phone, its call to action is a hundred pixels below the fold." |
| 2 | 0:15–0:28 | **The script tag** (show the one line in the HTML), then Site A loading | Point at the tag, then reload the page | "Installing us is one script tag. No repo access, no deploys, no changes to the site's code." |
| 3 | 0:28–0:48 | **Heatmaps** | Switch Outcome to **Bounced**. Let the overlay render. Point at the two hot spots | "Here's what visitors actually do. This is real click data on the real page. The hottest thing on it isn't the call to action — it's an accordion in the pricing table that was never wired up." |
| 4 | 0:48–1:08 | **Opportunities** → click *Show evidence* | Let the evidence table sit on screen | "The agent doesn't assert. Every figure it cites is resolved against the database before the opportunity is accepted — cited on the left, actual on the right. During this run, six citations were **rejected** until it quoted correctly." |
| 5 | 1:08–1:28 | **Learnings**, then **Experiments** | Show the learning, then the hypothesis that used it | "And it remembers. This is what a previous experiment proved. The agent can't propose anything until it's checked what's already settled — and its new hypothesis is that learning applied." |
| 6 | 1:28–1:50 | **Variant diff** | Both frames side by side, then hover a mutation row | "Both of these are the live page with the real snippet applying the real changes. Variants are structured DOM operations from a closed set — never generated HTML. Every one is reviewable, with the agent's own reason beside it." |
| 7 | 1:50–2:15 | **Approvals** | Show the Cedar denial, approve it, then reload Site A in a fresh window | "It is **not allowed** to launch. Cedar policy blocks it until a human approves. Then it's live on the site in under thirty seconds." |
| 8 | 2:15–2:35 | **Experiments / results** | Show per-arm rates and the uncertainty line | "It reads the result honestly. Not yet decisive — and it says so, instead of claiming a win." |
| 9 | 2:35–2:50 | **Learnings** (new record) | Show the new learning and the next proposal | "Then it writes down what it learned, and proposes what to test next. That's the loop." |
| 10 | 2:50–3:00 | **Architecture slide** | Hold still | "Strands and Cedar — both AWS open source — on Lambda, API Gateway, S3 and CloudFront. Deployed on AWS." |

**Shots that must carry the `SIMULATED TRAFFIC` chip on screen:** 3 and 8.

---

## 5. Answering questions

**"Is this real traffic?"**
No, and we say so on every screen that shows a number. It is simulated visitors
driving the **real** deployed site through the **real** snippet into the **real**
ingestion endpoint. Nothing is written to the database directly. What is
simulated is the person, and only the person.

**"Did you just make your variant win?"**
Open `swarm/behaviour.ts` on screen. Conversion probability is a function of
**measured page geometry** — how far below the fold the CTA sits, how much copy
precedes it, how much of the first screen the hero image occupies — plus persona
traits and noise. **It never sees which variant is running. Grep it for a variant
id; there isn't one.** When the agent moves the CTA, these visitors respond
because the geometry they read changed.

**"Why not just use Optimizely / VWO / Hotjar?"**
Those are the controls. We built the operator. They still require a human to
analyse the data, form a theory, brief a designer, configure the test, wait, and
decide what to test next. That cycle takes weeks, which is why most teams run a
handful of experiments a year instead of dozens.

**"What about flicker?"**
Measured, not asserted: we sample every animation frame under Slow 4G with 4×
CPU throttling and assert that the control is never painted and then replaced.
The guarantee is structural — once the page is revealed the snippet refuses to
mutate at all. For an enterprise tier the same mutation JSON could be applied at
the edge, which removes flicker entirely; that needs the customer to route DNS
through us, which is a bigger integration decision than pasting one line.

**"Can the agent break my site?"**
It cannot inject HTML — the operation set is closed. Every selector is validated
against the page before a variant is stored. Pricing and checkout are
unconditionally forbidden in Cedar policy **and** in the code denylist. And it
cannot launch anything at all without a human approving it.

**"Is the result statistically significant?"**
No, and the product says so. A weekend cannot produce a significant A/B result on
honest traffic, so we show confidence intervals, sample size, and how much more
traffic a decision would need. **An agent that knows it doesn't know yet is more
trustworthy than one claiming +15.9%.**

**"Why isn't this using Bedrock?"**
Model access was denied on this account, and the organisers told us not to wait
for it. Strands is model-agnostic so the provider is one line. Strands and Cedar
are both AWS open source and are doing real work here — the AWS story never
depended on Bedrock.

**"What did you learn?"**
Three things worth saying out loud, because they are all real:
- **Measure the thing you care about, not the thing that's easy to produce.**
  Three separate metrics were right for the sessions we happened to test and
  wrong for the ones that mattered — visibility that stopped recording after a
  tab switch, event delivery that only worked on tab-close, and a
  time-to-first-view that was measuring our own test harness rather than
  behaviour.
- **Test your own function before blaming the framework.** An agent that failed
  118 times in a loop turned out to be a Python argument collision in our code,
  not a model problem. Two plausible, confident, wrong diagnoses came first.
- **Constrain the model where correctness matters.** Every good property here
  comes from something the model *cannot* do: it cannot emit arbitrary HTML,
  cannot cite an unverifiable figure, cannot propose without consulting memory,
  and cannot launch anything.

---

## 6. If something breaks mid-recording

| Problem | Do this |
|---|---|
| Heatmap looks empty | The pane opens at the page top. Use the density rail on the right, or it auto-scrolls after a beat |
| A page shows a cold-start spinner | Reload once — the first request after a quiet spell wakes Neon and the Lambda |
| Variant preview frames look identical | Check the URL has `?gx_preview=<experimentId>`; a draft is not in the live manifest by design |
| The agent is slow or rate-limited | **Do not run it live.** Everything it produced is already stored and on screen |
| Site A shows the wrong variant | `?gx_force=<variantId>` forces either arm on demand |

**The golden rule:** nothing in the video depends on a live model call. Every
agent output is already in the database and rendered on a screen.
