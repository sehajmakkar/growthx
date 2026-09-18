# GUIDE.md — your checklist

Everything here needs your AWS console, your credentials, your browser, your eyes
or your judgement. Nothing that Claude Code can do itself belongs in this file.

Claude updates this file at the end of **every** phase, before handing back.
If something here is ambiguous, say so immediately — an unclear instruction costs
ten times more at 2am on Saturday than it does now.

- Plan of record: [PLAN.md](PLAN.md)
- **Deadline: Sat 20 Sept 2026, 19:49.** Feature work stops 14:00 Sat. First
  submission filed 18:00 Sat.

---

## §A — State

**Last updated:** P0 complete; **full setup verified end to end**; platform re-planned after the organisers' Bedrock clarification. Thu 18 Sept.

### Phases

| | Phase | Status |
|---|---|---|
| ✅ | **P0** — Repo, toolchain, `GUIDE.md` | passed Thu 18 Sept |
| ▶ | **P1** — AWS foundation deployed | **blocked on you: §B1–§B4 below** |
| ⬜ | P2 — Site A landing page (1.5h) | |
| ⬜ | P3 — Snippet: bucketing, mutations, anti-flicker (1.75h) | |
| ⬜ | P4 — Event capture and ingestion (1.5h) | |
| ⬜ | P5 — DOM snapshot (0.75h) | |
| ⬜ | P6 — Selector grounding spike ⚠ GATE (1.25h) | unblocked — runs on Gemini |
| ⬜ | P7 — Traffic swarm (1.75h) | |
| ⬜ | P8–P16 — Friday: aggregation, dashboard, agent | |
| ⬜ | P17–P21 — Saturday: governance, results, polish | |
| ⬜ | P22–P23 — Saturday: rehearse, record, submit | |

**Next checkpoint:** Thu 22:00 — Site A live and instrumented, events flowing,
snapshot captured, P6 gate passed, swarm producing traffic. (PLAN.md §1.4)

**Time used so far:** P0 ≈ 0.5h of the ~12h Thursday budget.

### Your next action

**Setup is complete and verified.** Nothing is outstanding.

| Step | Verified |
|---|---|
| §B1 AWS profile `growthx` | ✅ account `481048605728`, `us-east-1` |
| §B2 Bedrock | ⏹ closed by decision — not needed |
| §B3 Billing alarm | ✅ `growthx-billing-alarm`, threshold $1 |
| §B4 `cdk bootstrap` | ✅ `CDKToolkit` CREATE_COMPLETE, version 32 |
| §B5 Gemini | ✅ 3 Flash models callable, function calling confirmed |
| §B6 Python 3.12 | ✅ 3.12.13 via uv |
| §B6 Playwright | ✅ chromium-1243 installed |
| §B9 Neon Postgres | ✅ PostgreSQL 18.6, pooled endpoint, `us-east-1` |

Two notes worth keeping in mind:

- Your billing alarm threshold is **$1**, so it will fire on essentially the first
  cent of usage. That is a fine early tripwire — just do not be alarmed by it.
- `gemini-3.5-flash` occasionally answers in prose instead of calling the tool
  when the prompt does not force it. It is only the spillover model, so this does
  not matter, but it is a reminder that Flash-class models need the tight output
  schemas the plan already calls for (PLAN.md §3.1).

**Next: say "start P1".**

### Live URLs

_Nothing deployed yet. P1 writes the real URLs here automatically via
`scripts/outputs.ts`, so this table is never stale._

| What | URL |
|---|---|
| Site A (the "customer" page) | — |
| Dashboard (Site B) | — |
| API base | — |
| CDN (`g.js`) | — |

### Known broken / on a fallback path

| What | State | Impact |
|---|---|---|
| **Bedrock model access** | ❌ Denied — and now **closed by decision** (§B2) | None. Organisers confirmed Bedrock is not mandatory; only deployment on AWS is. Gemini is the primary provider. |
| **Gemini Pro** | ❌ Zero free-tier daily quota | None — the plan assumes Flash everywhere (§B5). |
| **Datastore** | 🔄 Changed from DynamoDB to Postgres/Neon | Needs §B9 before P1. No code written against Dynamo, so nothing is wasted. |

**Rate-limit note:** Gemini free tier is ~10 requests/minute. Agent runs will
pause between steps. That is expected, not a hang. (PLAN.md §3.1)

---

## §B — One-time setup you must perform

### §B2 first — it has a queue

Do §B2 before §B1 if you already have AWS credentials configured. Bedrock access
approval is the only step whose latency we do not control.

---

### §B1 — AWS account, region, and the `growthx` profile

**Pick one region and never deviate.** Use `us-east-1` unless you have a reason
not to; `us-west-2` is the only other region worth considering (both carry the
Claude models we need). Every later command assumes the region you pick here.

1. In the AWS console, create an IAM user (or an Identity Center user) with
   `AdministratorAccess`. This is a 2-day hackathon account, not production —
   scoping permissions finely is not a good use of the clock.
2. Create an access key for it.
3. Configure the profile locally:

```bash
aws configure --profile growthx
# AWS Access Key ID:     <paste>
# AWS Secret Access Key: <paste>
# Default region name:   us-east-1
# Default output format: json
```

4. Verify:

```bash
aws sts get-caller-identity --profile growthx
```

**You should see** JSON containing `UserId`, `Account` (a 12-digit number) and
`Arn`. Write the account number down — §B4 needs it.

**Failure looks like:**
- `Unable to locate credentials` → the profile name is misspelled, or you are in
  a different shell than the one where you ran `aws configure`.
- `InvalidClientTokenId` → the access key was mistyped or has been deactivated.

---

### §B2 — Bedrock model access ❌ CLOSED, no action needed

**The organisers settled this on 18 Sept:**

> "Bedrock is not mandatory. Access can take a while to come through, so don't
> hold your project up waiting for it. Use whatever other AI tools or open source
> projects you like, the only thing we ask is that you deploy on AWS."

Access on your account is denied and we are **no longer chasing it**. Gemini is
the primary provider (§B5) and is verified working. `GX_BEDROCK_INFERENCE_PROFILE_ID`
can stay in `.env`; nothing reads it.

**Do not spend any more time here.** If you happen to get an approval email, tell
Claude and we will decide whether it is worth switching — but the answer is
probably no, because prompts will already be tuned against Gemini by then.

The AWS requirement is satisfied by what we deploy: S3 + CloudFront (three
origins), Lambda + API Gateway, EventBridge, optionally Step Functions, plus two
AWS open-source projects doing load-bearing work — Strands and Cedar.

### §B3 — Credits and a billing alarm

1. Redeem any hackathon AWS credits: console → **Billing and Cost Management** →
   **Credits** → **Redeem credit**.
2. Set a billing alarm. Agent loops with retries can burn money quickly if
   something misbehaves, and we would rather find out from an email than from a
   statement:
   - Console → **CloudWatch** (in `us-east-1`, where billing metrics live) →
     **Alarms** → **Create alarm** → **Billing** → **Total Estimated Charge**.
   - Pick a threshold you are comfortable with and add your email.
   - Confirm the SNS subscription email.

**You should see** the alarm in `OK` or `Insufficient data` state. Billing
metrics can take a few hours to populate; `Insufficient data` on day one is
normal and not a failure.

---

### §B4 — `cdk bootstrap`

A one-time-per-account-per-region step. Skipping it makes P1 fail with an error
that does not obviously say "you skipped bootstrap", so do it now.

```bash
pnpm dlx aws-cdk@2 bootstrap aws://<YOUR-12-DIGIT-ACCOUNT>/us-east-1 --profile growthx
```

**You should see** `✅  Environment aws://…/us-east-1 bootstrapped.`

**Failure looks like:**
- `Need to perform AWS calls … but no credentials configured` → §B1 is incomplete.
- `User is not authorized to perform: cloudformation:CreateStack` → the IAM user
  does not have `AdministratorAccess`.
- If P1 later fails with `SSM parameter /cdk-bootstrap/hnb659fds/version not found`,
  that is precisely this step having been skipped or run in a different region.

---

### §B5 — Gemini ✅ DONE — this is the primary provider

**Status: verified working 18 Sept**, including function calling — the capability
that actually matters, because Strands' sub-agents-as-tools pattern is built on it.
With Bedrock closed (§B2), Gemini is simply **the** provider.

**Which models you can actually use** — probed directly against your key:

| Model | Status | Used for |
|---|---|---|
| `gemini-3.6-flash` | ✅ works, tools ✅ | the workhorse: analysis, hypotheses, variants, evaluation |
| `gemini-3.5-flash` | ✅ works, tools ✅ | spillover when 3.6 hits its daily cap |
| `gemini-3.1-flash-lite` | ✅ works, tools ✅ | session-digest narratives (high count, low stakes) |
| **any Gemini Pro** | ❌ **unusable** | — |

**Gemini Pro is not available on the free tier** — you asked, and the answer is a
firm no. Every Pro model returns `429 RESOURCE_EXHAUSTED` on the *first* call of
the day, with quota id `GenerateRequestsPerDayPerProjectPerModel-FreeTier`. That
is a zero daily allowance, not a rate spike; retrying will not help. The plan
therefore assumes Flash everywhere (PLAN.md §3.1).

Useful detail: **quota is per project _per model_**, so spreading calls across the
three Flash models multiplies our effective daily allowance. The agent does this
automatically on 429.

The Anthropic direct API was the original plan here; it requires a paid balance,
so we switched to Gemini, which has a free tier and no card requirement. Strands
has a **first-party Gemini provider** that reads `GEMINI_API_KEY` natively, so
this is a cleaner swap than the original.

Already in your `.env`:

```
GEMINI_API_KEY=…            # from https://aistudio.google.com/apikey
GX_GEMINI_MODEL=gemini-3.6-flash
```

> ⚠️ `gemini-2.5-flash` (what you first put in `.env`) is **retired for new API
> keys** — it 404s with "no longer available to new users". Claude corrected it to
> `gemini-3.6-flash`, which is verified working on your key. If a future model
> retires the same way, `pnpm check:models` will say so plainly.

**Free-tier rate limits are the real constraint, not capability** — roughly 10
requests per minute plus a daily cap. You will feel this as the agent pausing
between steps rather than as errors. It is handled in code (serialized calls, a
token-bucket limiter, and a response cache so prompt iteration does not burn
quota), so you should not need to do anything — but if you see the agent
apparently stalling in P12+, that is what it is.

---

### §B6 — Local tooling

Node 20 and pnpm 10 are already present on this machine and verified. Two things
remain:

**Python 3.12 — specifically 3.12, not 3.14.** This machine has 3.14, and several
agent-stack dependencies do not yet publish wheels for it. You have `uv`, so:

```bash
uv python install 3.12
uv python list | grep 3.12
```

**You should see** a 3.12.x entry in the list. Claude pins it in
`packages/agent/.python-version` in P12.

**Playwright browsers** (needed from P6 onward — the selector spike, the traffic
swarm, and every screenshot):

```bash
pnpm dlx playwright install chromium
```

**You should see** a download, then `chromium … downloaded to …`. This is a few
hundred MB; start it now rather than at the P6 gate.

---

### §B9 — Neon Postgres ⏸ **DO THIS — it blocks P1**

We switched the datastore from DynamoDB to Postgres (PLAN.md §3.2). This is the
only new setup step, and it takes about five minutes.

1. Sign up at <https://console.neon.tech> (GitHub login, free tier, no card).
2. Create a project. Name it `growthx`. **Pick the AWS region closest to your
   AWS region** (`us-east-1` if that is what you used in §B1) — same-region keeps
   Lambda→database latency low.
3. Copy the **pooled** connection string. It looks like:

   ```
   postgresql://<user>:<password>@ep-xxx-pooler.<region>.aws.neon.tech/neondb?sslmode=require
   ```

   Take the one with **`-pooler`** in the hostname. Lambda opens many short-lived
   connections and the non-pooled endpoint will exhaust connection slots under
   the traffic swarm.
4. Put it in `.env` as `DATABASE_URL`, **wrapped in double quotes**:

   ```
   DATABASE_URL="postgresql://…?sslmode=require&channel_binding=require"
   ```

   Neon's string contains `&`. Unquoted, every script that does `. ./.env` dies
   with `parse error near '&'`. Claude has already quoted yours — this note is
   here so a future re-paste does not reintroduce it.

**Verify:**

```bash
pnpm check:db
```

**You should see** `✓ connected — PostgreSQL 16.x` and the current table count
(zero until P1 runs migrations).

**Failure looks like:**

| Symptom | Cause |
|---|---|
| `password authentication failed` | connection string truncated on copy — re-copy the whole line |
| `no pg_hba.conf entry ... SSL off` | `?sslmode=require` got dropped from the end |
| `too many connections` later, under swarm load | you used the non-pooled endpoint — switch to the `-pooler` host |
| `ENOTFOUND` | typo in the hostname, or the project is still provisioning (wait ~30s) |

**Code bug or environment problem?** Anything in this list is environment. If
`check:db` connects but P1's `pnpm db:push` fails on a specific table, that is
code — tell Claude.

---

### §B7 — Where secrets go

| Secret | Lives in | Never goes in |
|---|---|---|
| AWS credentials | `~/.aws/credentials`, profile `growthx` | the repo |
| `GX_BEDROCK_INFERENCE_PROFILE_ID` | `.env` (gitignored) | the repo |
| `GEMINI_API_KEY` | `.env` (gitignored), and SSM for deployed Lambdas in P12 | the repo, the snippet, the dashboard bundle |
| `DATABASE_URL` | `.env` (gitignored), and SSM for deployed Lambdas in P1 | the repo, the snippet, the dashboard bundle |

```bash
cp .env.example .env    # then fill in
```

**`.env` is gitignored. Keep it that way.** The snippet (`g.js`), Site A and the
dashboard bundle are all fetched by any visitor's browser — they are public by
construction. The snippet carries only a `siteId`, which is a public identifier
exactly like a Google Analytics measurement ID.

---

### §B8 — Custom domain: recommendation is **no**

CloudFront domains are fine for this. A DNS propagation wait on Thursday is a bad
trade against a 2.5-day clock, and judges do not score domain names. Revisit only
if everything else is finished, which it will not be.

---

## §C — Per-phase verification

### P0 — Repo, toolchain, `GUIDE.md`  [status: ✅ passed Thu 18 Sept]

#### What this phase should have made true

The monorepo installs from clean, the snippet build pipeline works and enforces
its own size budget, and the data schemas everything else depends on exist before
anything uses them.

#### Run this

```bash
cd /Users/sehaj/Developer/Github/growthx
pnpm install
pnpm typecheck
pnpm build:snippet
pnpm build:site-a
```

#### You should see

- `pnpm install` → `Done in …` with no errors.
- `pnpm typecheck` → `packages/shared typecheck: Done` and
  `packages/snippet typecheck: Done`.
- `pnpm build:snippet` → a green line of the form:

  ```
  ✓ g.js  1068 B raw  ·  625 B gzipped  ·  8% of the 8KB budget
  ```

  The percentage is what matters. The real snippet arrives in P3/P4 and will grow;
  if it ever exceeds 100% the build fails on purpose.
- `pnpm build:site-a` → `Done in …ms`, and `sites/site-a/public/styles.css` exists.

Then confirm the placeholder scripts fail *usefully* rather than confusingly:

```bash
pnpm deploy:infra
```

**You should see** a yellow `✗ pnpm deploy:infra does not exist yet. It is built
in phase P1.` — that is correct behaviour for a script a later phase creates, not
a broken install.

#### Look at Site A in a browser (optional, 30 seconds)

```bash
pnpm dev:site-a     # then open http://localhost:4321  — Ctrl-C to stop
```

You will see a deliberately bare placeholder page. **The real Corrick landing
page is P2.** Nothing to judge here yet.

#### Failure looks like

| Symptom | Likely cause |
|---|---|
| `ERR_PNPM_UNSUPPORTED_ENGINE` | Node is not 20+. `node -v` should print v20.x. |
| `Ignored build scripts: esbuild` warning, then esbuild crashes | pnpm 10 blocked esbuild's postinstall. Already handled via `pnpm.onlyBuiltDependencies` in the root `package.json`; if it recurs, run `pnpm approve-builds`. |
| `✗ … OVER BUDGET` from `build:snippet` | Something imported the zod surface (`@growthx/shared`) into the browser bundle instead of `@growthx/shared/runtime`. The build guard catches this deliberately — tell Claude. |
| `snippet may not depend on "<pkg>"` | Same guard, earlier: the snippet must stay dependency-free. |

#### Code bug or environment problem?

- A **typecheck** or **budget** failure is a code problem → tell Claude.
- `command not found: pnpm` or a Node version error is an **environment** problem
  → your machine, fixable with `corepack enable pnpm`.
- Anything mentioning `aws`, credentials or a region in P0 is **wrong by
  definition** — P0 touches no AWS at all. If you see that, you are running a
  later phase's command.

#### Also available from P0 onward

```bash
pnpm check:models
```

Probes every model with a real call — including a **function-calling** test,
which is the capability Strands actually needs — and reports which are usable.
Use this rather than any "list models" command: listing tells you what exists,
not what your key may call. Expect three usable Flash models.

```bash
pnpm check:db
```

Verifies `DATABASE_URL` reaches a live Postgres and lists the tables (GUIDE §B9).

#### Inspect by hand

```bash
# the schemas everything downstream depends on
ls packages/shared/src packages/shared/src/runtime

# what actually ships to a visitor's browser
cat packages/snippet/dist/g.js
```

That last file is worth ten seconds of your time: it is the entire payload every
visitor of every customer site downloads, and it should stay small enough to read.

---

## §D — Demo-day runbook

_Written in P22 (Sat 14:00). Will contain: the cold-start sequence with timings,
the `?gx_force=` URLs for each variant, tab order for recording, and the
cached-last-run fallback if a live model call fails mid-take._
