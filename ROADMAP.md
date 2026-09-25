# What is left

Written after the hackathon build. Everything here was verified against the
code on 25 Sept 2026, not recalled — each item says how to check it yourself.

The product works end to end: watch → diagnose → propose → refuse → approve →
run → read → learn. What follows is what would have to be true before this ran
on somebody else's site without supervision.

---

## 1 · Never built

### 1.1 Auto-stop is stored but never enforced — **the biggest gap**

Every experiment carries an `auto_stop` record:

```json
{ "maxDays": 14, "minSessionsPerArm": 400, "guardrailBreachPct": 5, "futilityThreshold": 0.05 }
```

Only `minSessionsPerArm` is ever read — it sets the bar the decision must clear
in `results.ts`. **`maxDays`, `guardrailBreachPct` and `futilityThreshold` are
written to the database and read by nothing.**

```bash
grep -rn "maxDays\|guardrailBreachPct\|futility" packages/*/src
# → only the INSERT that writes them. No reader.
```

There is also no scheduler: `grep -n "Rule(\|Schedule\." infra/lib/growthx-stack.ts`
returns nothing. PLAN §P19 listed an EventBridge tick Lambda driving
`running → evaluate → conclude`; it was deferred to P20 on the grounds that a
tick with nothing to invoke is theatre, and P20 built the evaluator but not the
tick.

**What this means today:** an experiment runs until a human concludes it. A
guardrail breach is visible on the results screen but stops nothing, and a
variant that is actively hurting conversion keeps serving until somebody looks.

**To close it:** an EventBridge rule on a `tick` Lambda that, per running
experiment, reads `experimentResults`, and kills or concludes on breach,
expiry, or futility. The evaluation logic already exists — this is wiring plus
the three missing comparisons.

### 1.2 The memory-deletion test was never run

PLAN §P14 named the single strongest piece of evidence that the learning memory
is real, and it was never performed:

> Run once, note the hypothesis. Delete a learning record. Run again. **The
> hypothesis must change.**

What *was* proved is weaker but not nothing: a proposal was rejected for citing
a learning by its text rather than its id, and the agent re-read the log and
corrected itself. That shows the citation is enforced. It does not show the
memory changes what the agent proposes.

**To close it:** run `pnpm agent:run`, record the hypothesis, delete the cited
learning, run again, and record whether the hypothesis moved. Roughly 15
minutes, mostly waiting on model quota. Until then, "the memory is
load-bearing" is a reasonable inference, not a demonstrated fact — worth
phrasing carefully anywhere it is claimed.

### 1.3 Variant screenshots are never captured

`variants` has `screenshot_desktop_key` and `screenshot_mobile_key`. Both are
null on every row, `scripts/screenshot.mjs` never writes them, and neither the
API nor the dashboard reads them.

```
select count(*), count(screenshot_desktop_key) from variants;  → 4, 0
```

The variant diff screen works around this by rendering live iframes instead,
which is arguably better — it is the real snippet applying the real mutations.
So this is a dead column rather than a missing feature. **Either wire the
capture or drop the columns**; leaving them suggests a feature that does not
exist.

---

## 2 · Deliberately cut, and why

These were decisions, not oversights. Each is worth revisiting with more time,
none is worth pretending was finished.

| | Why it was cut | What it would buy |
|---|---|---|
| **Step Functions lifecycle** (PLAN §P19 step 2) | The in-code path was built first precisely so this could be additive rather than a gamble. The clock went first | Durable, inspectable state transitions and `waitForTaskToken` for approvals. User-visible behaviour identical |
| **Agent on a Lambda container** (PLAN §P21) | Budgeted at 20 minutes, would not have fit. It runs locally | Scheduled autonomous runs. Today somebody must run `pnpm agent:run` |
| **Bedrock** | Access takes time to come through and the organisers said not to wait. Gemini via Strands instead | One-line provider change. Strands and Cedar are both AWS open source, so nothing structural depends on this |

---

## 3 · Correctness gaps to close before real traffic

### 3.1 The write endpoints are unauthenticated

There is no authorizer on the API and no auth check in the handler:

```bash
grep -rn "authoriz\|Authorization\|apiKey" infra/lib/growthx-stack.ts \
  packages/api/src/handlers/dashboard.ts   # → nothing
```

An anonymous caller reaches `POST /api/approvals`, `/api/experiments/launch`
and `/api/experiments/conclude`. The Cedar gate still applies — it will not let
anyone launch something that touches pricing, and approvals are read from the
database rather than the request body — but **anyone who knows the API URL can
approve an experiment and put it in front of real visitors.**

This is fine for a demo on a site we own and unshippable otherwise. The policy
gate answers "what may the agent do"; it was never meant to answer "who is
calling". Those are different questions and only one of them is solved.

**To close it:** an authorizer on the mutating routes, and `decidedBy` taken
from the verified identity rather than the request body.

### 3.2 The guardrail measures friction, not lead quality

The experiments name `lead_quality`; the code measures the share of sessions
that rage- or dead-clicked, and the UI says so. That substitution is honest and
documented, but it is a different thing: a variant can raise signups while
lowering their quality, and nothing here would notice.

**To close it:** ingest a downstream quality signal (CRM stage, activation,
retention) keyed by the session that converted.

### 3.3 One experiment per page, permanently

`forbid-concurrent-experiment-on-path` exists for a good reason — the snippet
applies the first experiment it finds for a path, so a second would show as
running while reaching nobody. But it caps throughput at one test per page, and
a real programme needs several.

**To close it:** make the snippet apply all matching experiments, then relax the
policy to forbid only *overlapping selectors* rather than any concurrency.

### 3.4 The 30-second kill switch is claimed, not measured

The manifest is edge-cached for 30s, so killing an experiment should remove it
from the live site within 30 seconds. The endpoint is tested; **the end-to-end
timing never was.** PLAN §P18 asked for exactly this check.

**To close it:** kill a running experiment, poll Site A in a clean profile, and
assert the challenger is gone within 30s. Belongs in `check:approvals`.

---

## 4 · Traps for whoever touches this next

Both cost real time during the build and neither is obvious.

**`drizzle-kit push` is broken against this schema.** It tries to drop every
`NOT NULL` constraint in the database and then fails with `42P16`. The
`policy_decisions` table was created with explicit SQL instead. Do not run
`pnpm db:push` without reading what it plans to do.

**`text-base` is a colour utility, not a font size.** The theme defines a
`--base` colour variable, and Tailwind v4 generates `text-<colour>` utilities
from colour variables — so `text-base` sets `color: var(--base)`, the page
background, and renders white on white. Size headings explicitly.

---

## 5 · If there were one more day

In order, by how much each changes what the product actually *is*:

1. **Auto-stop (§1.1)** — without it the agent cannot be left alone, which is
   most of the pitch. The evaluator already exists; this is wiring.
2. **Auth (§3.1)** — the difference between a demo and something that could
   touch a real site.
3. **The memory-deletion test (§1.2)** — cheap, and it either confirms the
   central claim or tells us something important.
4. **Concurrency (§3.3)** — the first thing a real user would hit.

Everything in §2 is architecture polish. It would make the system nicer to
operate and would not change what it can do.
