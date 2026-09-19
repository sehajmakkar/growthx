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

**Last updated:** P13 complete — opportunities with verified evidence. Sat 19 Sept.

### Phases

| | Phase | Status |
|---|---|---|
| ✅ | **P0** — Repo, toolchain, `GUIDE.md` | passed Thu 18 Sept |
| ✅ | **P1** — AWS foundation deployed | passed Thu 18 Sept |
| ✅ | **P2** — Site A landing page | passed Thu 18 Sept |
| ✅ | **P3** — Snippet: bucketing, mutations, anti-flicker | passed Thu 18 Sept |
| ✅ | **P4** — Event capture and ingestion | passed Thu 18 Sept |
| ✅ | **P5** — DOM snapshot | passed Thu 18 Sept |
| ✅ | **P6** — Selector grounding gate ⚠ | **PASSED** Thu 18 Sept |
| ✅ | **P7** — Traffic swarm | passed Thu 18 Sept |
| ✅ | **P8** — Aggregation engine | passed Fri 19 Sept |
| ✅ | **P9** — Screenshots + session digests | passed Fri 19 Sept |
| ✅ | **P10** — Dashboard scaffold + design system | passed Fri 19 Sept |
| ✅ | **P11** — ★ Heatmap overlay | passed Fri 19 Sept |
| ✅ | **P12** — Agent skeleton | passed Sat 20 Sept |
| ✅ | **P13** — Opportunities with verified evidence | passed Sat 19 Sept |
| ▶ | **P14** — Hypothesis + learning memory (1h) | next |
| ✅ | P10–P16 — dashboard, heatmaps, agent, variant diff | passed Sat 19 Sept |
| ✅ | P17, P19 — policy gate, approval queue | passed Sat 19 Sept |
| ⬜ | P17–P21 — Saturday: governance, results, polish | |
| ⬜ | P22–P23 — Saturday: rehearse, record, submit | |

**Next checkpoint:** Thu 22:00 — Site A live and instrumented, events flowing,
snapshot captured, P6 gate passed, swarm producing traffic. (PLAN.md §1.4)

**Time used so far:** P0–P7 ≈ 11h of the ~12h Thursday budget. **Thursday's checkpoint is met in full** (PLAN §1.4): Site A live and instrumented, events flowing, snapshot captured, gate passed, swarm producing traffic.

### Your next action

**Verify P7** using its block in §C below. Run `pnpm swarm --sessions 20 --headed`
and watch them for a minute — they should look like people, not robots. Then read
`swarm/behaviour.ts`, which is the file a judge would ask about.

Then merge the PR and say **"start P8"** — aggregation, which turns all this
behaviour into the heatmaps you have been waiting to see.

Setup from §B is complete and verified; nothing there is outstanding.

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

_Written automatically by `scripts/outputs.mjs` on every deploy._

| What | URL |
|---|---|
| Site A (the "customer" page) | https://d2wz20j6mz6oyt.cloudfront.net |
| Dashboard (Site B) | https://d1dxlipl3y71ai.cloudfront.net |
| API base | https://sr53qdjzxb.execute-api.us-east-1.amazonaws.com |
| CDN (`g.js`) | https://d1wo6i4tf1wdqb.cloudfront.net/g.js |

### Known broken / on a fallback path

| What | State | Impact |
|---|---|---|
| **Bedrock model access** | ❌ Denied — and now **closed by decision** (§B2) | None. Organisers confirmed Bedrock is not mandatory; only deployment on AWS is. Gemini is the primary provider. |
| **Gemini Pro** | ❌ Zero free-tier daily quota | None — the plan assumes Flash everywhere (§B5). |
| **Datastore** | ✅ Postgres/Neon, 13 tables live | — |
| **Neon free tier idles** | Project suspends after inactivity | The first request after a quiet spell wakes it and may take a second or two. Not a fault; call it twice. |

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

## §E — Git and GitHub workflow

`main` stays green. Every phase lands through a pull request that you merge.

### The loop, per phase

1. Claude branches from `main`: `phase/p01-aws-foundation`, `phase/p02-site-a`, …
2. Claude implements the phase, commits, pushes the branch, and opens a PR whose
   description is the phase's exit criteria plus how to verify it.
3. **You verify** using that phase's §C block — against the branch, before merging.
4. **You merge the PR on GitHub.** That is the gate: nothing reaches `main` that
   you have not personally seen working.
5. You say "P*n* passed, start P*n+1*". Claude pulls `main` and branches again.

If verification fails, Claude pushes fixes to the same branch — we do not carry a
broken phase forward, because every later phase assumes the earlier ones hold.

### One-time: authenticate gh

`gh` is installed (2.101.0). This step is interactive, so you must run it:

```bash
gh auth login
```

Choose: **GitHub.com** → **HTTPS** → **Yes** (authenticate Git with your GitHub
credentials) → **Login with a web browser**. Copy the one-time code, paste it in
the browser.

> ⚠️ **Choose "Login with a web browser", not "Paste an authentication token".**
> A **fine-grained** personal access token is scoped to repositories you have
> already selected and to explicit permissions, so it cannot create a new
> repository — `gh repo create` fails with
> `Resource not accessible by personal access token (createRepository)` — and it
> usually cannot push to a repo it was not granted. The browser flow issues an
> OAuth token with full `repo` scope, which is what this workflow needs.
>
> **If you are using a fine-grained token, it must be granted access to this
> repo explicitly.** Go to
> <https://github.com/settings/personal-access-tokens>, open the token, and set:
>
> | Setting | Value |
> |---|---|
> | Repository access | **Only select repositories** → add `growthx` (or *All repositories*) |
> | Permissions → **Contents** | **Read and write** — required to push |
> | Permissions → **Pull requests** | **Read and write** — required to open a PR per phase |
> | Permissions → Metadata | Read-only (added automatically) |
>
> Save, then re-run `gh auth login` and paste the same token. Changes to a
> fine-grained token take effect immediately; no new token is needed.
>
> **Diagnose it precisely** — this prints what the API demands versus what you
> have, rather than making you guess:
>
> ```bash
> curl -s -o /dev/null -D - -X PUT -H "Authorization: token $(gh auth token)" \
>   https://api.github.com/repos/sehajmakkar/growthx/contents/.permcheck \
>   -d '{"message":"x","content":"eA=="}' | grep -iE '^HTTP|x-accepted-github'
> ```
>
> `HTTP/2 403` with `x-accepted-github-permissions: contents=write` means the
> Contents permission is still missing. `HTTP/2 201` means it works (delete the
> `.permcheck` file afterwards, or just ignore it — Claude will not commit it).

**Verify:**

```bash
gh auth status
curl -s -I -H "Authorization: token $(gh auth token)" https://api.github.com/user | grep -i x-oauth-scopes
```

**You should see** `✓ Logged in to github.com account sehajmakkar`, and an
`x-oauth-scopes:` line that includes `repo`. **If that second command prints
nothing, you are still on a fine-grained token** and repo creation will fail.

Then tell Claude, and it will create the public `growthx` repo and push `main`.

### What Claude will never do

- Push directly to `main`.
- Merge its own PR.
- Force-push a branch you are reviewing.
- Commit `.env`, or anything else in `.gitignore`. Every commit is secret-scanned
  first; `.env` is ignored and was verified as such before the first commit.

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

### P1 — AWS foundation  [status: ✅ passed Thu 18 Sept]

#### What this phase should have made true

Three separate AWS origins are live, the API is deployed, and a single request
proves the whole chain: API Gateway → Lambda → SSM secret → Neon Postgres.

#### Run this

```bash
cd /Users/sehaj/Developer/Github/growthx
pnpm check:db
curl -s "$(grep GX_API_BASE .env.local | cut -d= -f2)/health" | python3 -m json.tool
```

Then open the three URLs from **§A Live URLs** in a browser.

#### You should see

- `pnpm check:db` → `✓ connected` and **`✓ 13 tables: aggregates, approvals,
  digests, events, experiments, learnings, opportunities, reports, runs,
  sessions, sites, snapshots, variants`**.
- The health call → JSON containing **`"db": "ok"`**, `"tables": 13`, a
  `"postgres"` version string, and a `latencyMs` (expect 300–900ms on a cold
  start, under 150ms warm).

  **`"db": "ok"` is the single most important string in this phase.** It proves
  four things at once: CDK deployed, API Gateway routed to Lambda, the Lambda
  read its encrypted secret from SSM, and it reached Neon over HTTPS with no VPC.
- **Site A** → the bare P0 placeholder page. The real Corrick page is P2.
- **Dashboard** → a placeholder saying the dashboard is built in P10. Expected.
- **CDN** → opening `<CDN>/g.js` downloads or displays the snippet source.

#### Check the CORS headers — this one matters later

```bash
source .env.local

# g.js — note the -H Origin. Without it you will NOT see the CORS header.
curl -sI -H "Origin: https://example.com" "$GX_CDN_URL/g.js" \
  | grep -iE 'access-control-allow-origin|cache-control'

# the API preflight the snippet performs before POST /collect in P4
curl -s -o /dev/null -D - -X OPTIONS \
  -H "Origin: https://example.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type" \
  "$GX_API_BASE/health" | grep -iE 'HTTP/|access-control'
```

**You should see** `access-control-allow-origin: *` and `cache-control:
public,max-age=60` for `g.js`, and `HTTP/2 204` plus
`access-control-allow-methods: GET,OPTIONS,POST` for the preflight.

> ⚠️ **`curl -sI` on its own will show no CORS header, and that is correct.**
> CloudFront only emits `access-control-allow-origin` when the request actually
> is a CORS request — that is, when it carries an `Origin` header. Checking
> without `-H "Origin: …"` looks like a failure and is not one. This cost time
> once already; do not re-diagnose it.
>
> Separately, `curl -I` sends **HEAD**, and the API's `/health` route is
> registered for GET only, so `curl -I "$GX_API_BASE/health"` returns 404. Use
> `curl -s -o /dev/null -D -` as above to see headers on a GET.

The 60s TTL on `g.js` is what makes the P18 kill switch take effect in under a
minute, so do not raise it.

#### Failure looks like

| Symptom | Cause | Whose problem |
|---|---|---|
| `"db": "error"` with `password authentication failed` | SSM has a stale `DATABASE_URL` | environment → re-run `pnpm secrets:push` |
| `"db": "error"` with `Secret DATABASE_URL is not available` | secrets were never pushed, or the Lambda lacks SSM permission | run `pnpm secrets:push`; if it persists, code |
| Health returns 500 with `database unreachable` | Neon project is suspended (free tier idles) — the first call wakes it | environment, self-healing: call it twice |
| `curl` returns `{"message":"Not Found"}` | wrong URL, or you dropped `/health` | environment |
| CloudFront returns 403 for a file you know exists | the upload ran but the invalidation has not landed yet | wait ~60s, or re-run `pnpm deploy:infra` |
| `cdk deploy` fails with `SSM parameter /cdk-bootstrap/... not found` | §B4 bootstrap was skipped, or run in another region | environment |

#### Code bug or environment problem?

- **`"db": "ok"` but a page 404s** → static upload/invalidation, not the API. Re-run `pnpm deploy:infra`.
- **Anything mentioning `ExpiredToken` or `InvalidClientTokenId`** → AWS credentials, environment.
- **`ERR_PNPM_INVALID_DEPLOY_TARGET`** → `pnpm deploy` is a *reserved pnpm command*; the script must say `pnpm --filter … run deploy`. Already fixed; flagged here because the error message never mentions the real cause.
- **A TypeScript or bundling error during deploy** → code, tell Claude.

#### Inspect by hand

```bash
# every table, with column counts
pnpm db:studio          # opens Drizzle Studio in the browser

# what the Lambda actually reads (decrypted — treat the output as secret)
aws ssm get-parameter --name /growthx/DATABASE_URL --with-decryption \
  --region us-east-1 --profile growthx --query 'Parameter.Type' --output text
# → SecureString

# the deployed stack's outputs
cat infra/cdk-outputs.json | python3 -m json.tool
```

#### Tearing it all down (only if you need to)

```bash
pnpm --filter @growthx/infra run destroy
```

Removes every AWS resource in the stack. It does **not** touch Neon — the tables
and data survive, and `pnpm deploy:infra` rebuilds the AWS side in ~5 minutes.

---

### P2 — Site A: the Corrick landing page  [status: ✅ passed Thu 18 Sept]

#### What this phase should have made true

A plausible, aesthetically competent SaaS marketing page exists on its own
domain, and it is **deliberately conversion-flawed in a way the agent can
actually diagnose** — flawed in hierarchy and placement, never in taste.

#### Run this

```bash
cd /Users/sehaj/Developer/Github/growthx
node scripts/check-site-a.mjs                       # measures the flaws locally
source .env.local && node scripts/check-site-a.mjs "$GX_SITE_A_URL"   # …and live
```

Then open **Site A** from §A on a phone-width window (390px) and at 1440px.

#### You should see

All checks green, with these measurements:

| Flaw | Assertion | Measured |
|---|---|---|
| 1. CTA below the fold on mobile | `.cta-primary` top > 844px | **953px — 109px below** |
| 1b. Copy pushes it down | `.hero-subcopy` above the CTA | 280px of copy |
| 3. Pricing before social proof | `.pricing-table` above `.social-proof` | 2080px vs 3233px |
| 4. Hero art eats the viewport | `.hero-figure` ≥30% of first screen | **30%** |
| 5. Fake-interactive element | `.tier-2 .tier-expand` is a `<div>`, `cursor:pointer`, no handler | ✓ |

Plus **selector hygiene**: every agent-facing hook (`.cta-primary`,
`.hero-subcopy`, `.pricing-table`, `.social-proof`, `.tier-2`) resolves to
**exactly one** element. This matters more than it looks: the P6 validator
rejects any mutation whose selector matches zero or multiple elements, so a
duplicate class here would silently break variant generation in P15.

Screenshots land in `artifacts/` — `site-a-390.png`, `site-a-1440.png`.

#### Judge it with your own eyes — this is the part a script cannot check

Two questions, and both answers matter:

1. **At 1440px: does this look like a real company's page, or like a demo?**
   It is on screen in the first 15 seconds of the video. If it reads as a demo,
   say so and I will rework it — that is cheap now and impossible on Saturday.
2. **At 390px: would a CRO consultant have obvious notes?** You should have to
   scroll past a large illustration and five lines of copy before any call to
   action appears. That is the problem the agent is supposed to find.

The flaw must live in **hierarchy and placement, not in taste**. If the page
looks *ugly* rather than *badly prioritised*, the premise breaks: judges will
read it as a strawman built to be beaten.

#### Failure looks like

| Symptom | Cause | Whose problem |
|---|---|---|
| `.cta-primary → 0 matches` | markup changed and a hook was dropped | code |
| CTA measures *above* the fold | copy or hero art got shorter; the flaw evaporated | code — tell me, this breaks P8 |
| `headline font resolves to …` not Fraunces | the woff2 files did not deploy | code |
| Fonts render but flash unstyled first | `font-display: swap` doing its job — expected, not a fault | neither |
| Live URL shows the old placeholder page | CloudFront has not finished invalidating | environment — wait ~60s |

#### Code bug or environment problem?

- **Local passes, deployed fails** → upload or CloudFront invalidation, not the
  page. Re-run `pnpm deploy:infra`.
- **`browserType.launch: Executable doesn't exist`** → Playwright browsers are
  missing; re-run `pnpm dlx playwright install chromium` (§B6).
- **Any assertion about px positions failing** → code. The flaws are measured,
  not eyeballed, precisely so this is unambiguous.

#### Inspect by hand

```bash
# the agent-facing hooks, as they appear in the markup
grep -oE 'class="[^"]*(cta-primary|hero-subcopy|pricing-table|social-proof|tier-2)[^"]*"' \
  sites/site-a/public/index.html

# what is deliberately protected from the agent (Cedar enforces this in P17,
# and the mutation denylist enforces it in code)
grep -c 'data-gx-deny' sites/site-a/public/index.html   # → 3, the price figures
```

#### A note on what is deliberately *not* here

There is no `data-gx-id` attribute on anything. Stamping stable ids on every
element is the **escape route** for the P6 selector gate, not the starting point
— using it now would make the gate pass trivially and tell us nothing about
whether the approach works on a real page. If P6 fails, we add them then.

---

### P3 — The snippet: bucketing, mutations, anti-flicker  [status: ✅ passed Thu 18 Sept]

#### What this phase should have made true

One `<script>` tag in Site A's `<head>` decides which variant a visitor gets,
rewrites the live DOM before anything is painted, and reveals. No flash, no
blank page if our API dies, and the same visitor keeps the same variant.

#### Run this

```bash
cd /Users/sehaj/Developer/Github/growthx
pnpm check:flicker          # the real test — throttled, measured, 5 loads
```

Then look at it yourself, which is the part that matters:

```bash
source .env.local
open "$GX_SITE_A_URL"                          # you get one arm or the other
open "$GX_SITE_A_URL?gx_force=v_cta_above_copy"  # forces the challenger
open "$GX_SITE_A_URL?gx_force=v_control"         # forces the control
```

#### You should see

`pnpm check:flicker` green on all seven checks:

| Check | What it proves |
|---|---|
| No control→challenger transition painted | **the flash does not happen** — this is the whole point |
| Challenger applied on all 5 throttled loads | the experiment actually runs for slow mobile visitors |
| Variant stable across 4 reloads | sticky bucketing works |
| 14 fresh visitors split across both arms | the hash distributes |
| Page renders with a dead manifest | our outage cannot break a customer's site |
| It shows the *unmutated* control in that case | we fail safe, not weird |
| `?gx_force=` applies 4 mutations and lifts the CTA | the override works for demos |

In the browser with `?gx_force=v_cta_above_copy`, on a phone-width window: the
announcement bar is gone, the hero illustration is gone, the CTA sits **above**
the supporting copy and reads "See how it works". Reload a few times — it should
never blink through the original first.

#### One honest caveat: cold starts

The very first request after the 30s edge cache expires pays a CloudFront miss
plus a Lambda cold start — **measured at ~1255ms**. That load exceeds the
snippet's 1000ms network budget, so the visitor sees the control and the session
is marked `suppressed`, which keeps it out of the challenger's numbers in P4.

This is reported by the script rather than hidden, and it is not a problem in
practice: the manifest is cached at the edge for 30s and shared by every visitor
of the page, so any site with real traffic keeps it warm. The five measured loads
run against a warm edge for exactly that reason. If you run `check:flicker` twice
in a row the second run is faster throughout.

#### Watch for the flash yourself

The script measures it, but do this once so you know what "clean" looks like:

1. DevTools → Network → **Slow 4G**, Performance → **4× CPU slowdown**.
2. Hard-reload `?gx_force=v_cta_above_copy` five times, watching the hero.
3. You should never see "Start free trial" appear and then change.

If you want to *see* the mechanism working, run with `NETWORK_BUDGET` exceeded —
block the CDN in DevTools and reload. The page appears as the plain control,
never blank. That is the designed failure mode.

#### Inspect the live state

Open the console on Site A:

```js
window.__growthx
// { variantId: "v_cta_above_copy", applied: true,
//   reason: "applied", revealedAfterMs: 120, manifestSource: "cache", ... }
```

- `reason: "applied"` — mutations landed before reveal. This is the good path.
- `reason: "network-timeout"` with `suppressed: true` — the manifest was too slow,
  so we revealed the original and **refused** to mutate afterwards. Safe, but the
  visitor saw the control. If you see this often, the edge cache is not working.
- `manifestSource: "cache"` — served from localStorage, no network at all. Expected
  on any repeat visit within 30s.

#### Failure looks like

| Symptom | Cause | Whose problem |
|---|---|---|
| `applied=false`, `reason=network-timeout` on every load | manifest is not being served from the CloudFront edge | code |
| A visible blink from "Start free trial" to "See how it works" | mutations applied after reveal — the ordering guarantee broke | code |
| Page stays blank for more than a second | the reveal timers did not fire; should be impossible, both are registered before the fetch | code |
| Every visitor gets the same arm | bucketing or the split is wrong | code |
| `window.__growthx` is undefined | the snippet tag is missing from the HTML — re-run `pnpm build:site-a` | code |
| Variant changes on every reload | localStorage is blocked (private window) — stickiness degrades by design | environment |

#### Code bug or environment problem?

- **Private/incognito windows** can block `localStorage`. The snippet falls back
  to a per-pageview id, so stickiness breaks but nothing errors. That is expected
  behaviour, not a bug — test stickiness in a normal window.
- **`x-cache: Error from cloudfront` on `/manifest`** → the CDN behaviour has not
  finished propagating (takes several minutes after a deploy). Wait, then retry.
- **Anything about `GX_CDN_URL not set`** → `.env.local` is missing; run
  `pnpm deploy:infra`.

#### Re-seeding the experiment

```bash
pnpm seed:experiment        # idempotent; resets the experiment to running, 50/50
```

The hand-written challenger lifts the CTA above the copy, softens its wording,
drops the hero art on mobile and hides the announcement bar. **The agent
generates its own from data in P15** — this one exists only so P3 has something
real to apply.

---

### P4 — Event capture and ingestion  [status: ✅ passed Thu 18 Sept]

#### What this phase should have made true

Real behaviour from a real browser lands in Postgres, labelled with selectors the
agent will later be asked to target, and with coordinates that survive a change
of screen size.

#### Run this

```bash
cd /Users/sehaj/Developer/Github/growthx
pnpm check:ingestion      # drives a real session end to end and asserts it landed
pnpm query:events         # the last 3 sessions, event by event
pnpm query:events --summary
```

Then do it yourself, which is the check that matters:

```bash
source .env.local && open "$GX_SITE_A_URL"
```

1. Click the CTA region, scroll to the bottom.
2. **Rage-click the "See what's included" row in the middle pricing card** — the
   unwired accordion. Hit it four or five times quickly.
3. **Close the tab.** Do not navigate away gently; close it.
4. Wait ten seconds, then run `pnpm query:events`.

#### You should see

Your whole session, in order, **including the events from just before you closed
the tab**. That last part is the `sendBeacon` path and it is the one that fails
silently — a plain `fetch` on unload loses exactly the events that matter most:
the rage click, the back-exit, the scroll that never reached the CTA.

A healthy session looks like this:

```
  0 pageview
  1 exposure      {applied: 0, failed: 0}
  2 click         div.tier-expand
  3 click         div.tier-expand
  4 click         div.tier-expand
  5 rage_click    div.tier-expand   {clickCount: 3, withinMs: 92}
  7 dead_click    div.tier-expand
 12 scroll        {bandsCrossed: [25,50,75,100], maxScrollFrac: 1}
 14 click         a.cta-primary.btn-solid
 15 element_view  div.tier.tier-1 > h3   {timeToFirstViewMs: 1, visibleMs: 1856}
 34 dwell         {ms: 2696, scope: "page"}
```

Then on the success page, a second pageview and a `conversion`.

#### The two things worth staring at

**1. Selectors must be semantic, never utility classes.** You should see
`a.cta-primary.btn-solid` and `div.tier.tier-2 > p.tier-price`. You must **not**
see anything like `div.mt-5.flex`. Utility classes describe how a thing looks;
they change the moment anyone restyles the page, and a heatmap keyed on them
would quietly rot. `check:ingestion` asserts this.

This matters more than it looks: **P5's DOM snapshot uses the same path builder**,
so the selectors the agent reads in a heatmap come from the same alphabet as the
selectors it is asked to target. That shared alphabet is the reason the P6 gate
can pass at all.

**2. Coordinates are fractions, never pixels.** Every click carries three frames:

```
elem(0.4995, 0.4993)   ← fraction of the clicked element's own box — the primary signal
page(0.2462, 0.2085)   ← fraction of the full document
vp(0.2462, 0.5)        ← fraction of the viewport, for above/below-fold reasoning
```

A click at raw `(195, 420)` means nothing across screen sizes. "Half-way across
the CTA" means the same thing on a phone and a 27-inch monitor. Getting this
wrong would make every heatmap plausible-looking **and wrong**, which is worse
than having no heatmap — so P11 re-checks it by projecting a known click across
two viewports.

#### Failure looks like

| Symptom | Cause | Whose problem |
|---|---|---|
| No events at all | snippet missing, or `/collect` unreachable — check the browser console | code |
| Events, but nothing after you closed the tab | the beacon path broke | code |
| Selectors contain `.mt-5`, `.flex`, `.text-muted` | the utility filter in `path.ts` needs the new prefix | code |
| `elem_frac` null on clicks | the click target had zero size | usually fine, e.g. clicking padding |
| Duplicate-looking `element_view` rows | expected — they are emitted once per element at session end | neither |
| `check:ingestion` reports missing types but `query:events` shows them | the test read the table mid-flight; it now waits for the count to settle | test, already fixed |
| `custom {kind: "suppressed"}` and **no** `exposure` | the anti-flicker contract working: a cold edge meant the variant could not be applied before reveal, so the pageview is deliberately **not** attributed to that arm | neither — by design |
| `timeToFirstViewMs: 0` on a whole batch | elements already in the first viewport are seen at t≈0 | neither — correct |

#### Code bug or environment problem?

- **`/collect` returns 202 with `origin not allowed`** → the site's `origins`
  column does not include the URL you are browsing. Re-run `pnpm seed:experiment`.
- **`/collect` returns 400 `invalid batch`** → the snippet and the zod schema
  disagree. Code, tell me.
- **Events land but `simulated` is true** → you are looking at traffic-swarm rows
  from P7, not your own session. Filter by your session id.

#### Three bugs your own browsing found that the script did not

Worth recording, because they are the reason this guide asks you to browse the
site yourself rather than only run the script. All three are now asserted in
`check:ingestion` so they cannot come back.

1. **Visibility stopped after the first tab switch.** `onEnd()` latched, so a
   79-second session recorded element visibility only for its first 484ms.
   `viewed_pct` and `median_time_to_first_view` are computed from exactly that
   data, so P8 would have been wrong and would have looked fine. Each hide now
   emits a cumulative snapshot and aggregation takes the last one per
   (session, selector).
2. **`back_exit` fired on the success page** — a visitor who converted and closed
   the tab was being counted as a frustrated bounce.
3. **`dead_click` fired on the pricing card's padding.** Only the unwired
   accordion should count. A dead click has to mean "I tried to use this and
   nothing happened", not "I clicked some whitespace" — otherwise it inflates the
   precise signal the agent exists to diagnose.

#### Inspect by hand

```bash
pnpm query:events --session <session_id>   # every event, in order
pnpm db:studio                             # or browse the events table directly
```

---

### P5 — DOM snapshot  [status: ✅ passed Thu 18 Sept]

#### What this phase should have made true

The page's structure is stored in the exact form the variant generator will read,
keyed by selectors from the **same builder** event capture uses.

#### Run this

```bash
pnpm capture:snapshot     # captures at 390px and 1440px, merges, stores
pnpm dump:snapshot        # prints exactly what the model will see
```

#### You should see

`capture:snapshot` reporting both widths, then a line that is the whole point of
Site A:

```
.cta-primary → mobile:BELOW desktop:above
```

That single fact — above the fold on a desktop, below it on a phone — is the
problem the agent has to find in P8, and it is **only** visible because the
capture runs at two widths. Guessing the mobile fold from a desktop layout would
be wrong, because the layout reflows.

#### Read the dump as if you were the model — this is the real check

```bash
pnpm dump:snapshot | head -40
```

Each line is one element:

```
SELECTOR | tag | interactive? | "visible text" | font | y=position | mobile fold | desktop fold

a.cta-primary.btn-solid | a | interactive | "Start free trial" | 18px/500 | y=12% | mobile:BELOW-FOLD | desktop:above-fold
```

**Now answer this honestly: from that text alone, without looking at the page,
could you write a correct CSS selector for the hero call to action?**

If yes, a Flash-class model probably can too, and the P6 gate has a chance. If
you find yourself guessing, say so — the outline is under-specified and I should
enrich it *before* we spend the gate's budget tomorrow morning. This is the
cheapest possible moment to catch that.

One thing that surprised me, worth knowing before you read it: a section with a
stable `id` is pathed by that id, so `section#customers.social-proof` appears as
`#customers` and the words "social proof" vanish. The renderer now appends
`named:.social-proof` for exactly this case — the class is still the page's own
vocabulary and the agent should have it, even though it targets by the selector.

Two faults were found by reading this dump as the agent rather than as its
author, and both are worth knowing because the same posture will be needed again
in P13 and P15:

- **Fold labels that were never measured.** The mobile pass finds more elements
  than the desktop pass, because the "≥1% of viewport area" rule is ~4× stricter
  at 1440×900 than at 390×844. Elements present in only one pass were defaulting
  to `false` for the other width, which labelled a banner at `y=0%` as below the
  desktop fold. Anything missing from a pass is now **measured on that page**
  rather than assumed.
- **Selectors with no identity.** `div > span:nth-of-type(6)` resolved uniquely
  only because no other div had six spans. It tells a model nothing and breaks on
  any added list item. A path must now carry an `#id` or a human-chosen class
  before it is accepted, even when a shorter positional one would resolve.

Things worth checking in the dump:
- Is `.cta-primary` there, with its real text?
- Is `.hero-subcopy` there, and does its `y=` position sit above the CTA's?
- Is `.pricing-table` above `.social-proof`? (the latter shows as `#customers … named:.social-proof`)
- Is `.tier-2 .tier-expand` present? That is the friction element.
- Are the selectors the same *shape* as the ones in `pnpm query:events`? They must
  be — same builder, same alphabet.
- Does any element at `y=0%`–`y=2%` claim `desktop:BELOW-FOLD`? It should not; that
  was the symptom of the unmeasured-fold bug.
- `main` is the one selector with no id or class. That is fine — it is a landmark
  element, unique by specification.

#### Failure looks like

| Symptom | Cause | Whose problem |
|---|---|---|
| Fewer than ~25 elements | the selector list or area threshold is too strict | code |
| `.cta-primary` missing | `domPath()` could not find a unique selector for it | code — this would fail P6 outright |
| Both fold columns identical | the capture ran at one width, or the merge dropped the mobile pass | code |
| `unchanged (hash …) — nothing to do` | correct: the page has not changed since the last capture | neither |
| `capture was mutated (variant … applied N changes)` | the capture browser got bucketed into a live experiment; it now forces the control arm and refuses rather than storing a mutated baseline | code, and it is guarding you |
| Selectors here differ in shape from `query:events` | the two builders have diverged — **stop, this breaks P6** | code |
| `waitForFunction` timeout on `__growthx.snapshot` | the deployed snippet is older than this code; re-run `pnpm deploy:infra` | environment |

#### Why capture runs through the browser, not a parser

The script calls the snippet's own `captureSnapshot()` via `window.__growthx`
rather than parsing the HTML server-side. That is deliberate: a parser would need
its own notion of what a selector looks like, and the moment it drifted from the
snippet's path builder, the agent would be reading heatmaps in one alphabet and
writing mutations in another. Every mutation would silently no-op and the
product would appear to work while doing nothing. Sharing one function makes that
failure impossible rather than unlikely.

#### Inspect by hand

```bash
pnpm dump:snapshot | grep -E 'cta-primary|hero-subcopy|pricing-table|tier-expand'
pnpm dump:snapshot | wc -l
```

---

### P6 — Selector grounding gate ⚠️  [status: ✅ PASSED Thu 18 Sept]

#### What this phase had to prove

That a Flash-class model, given our page outline, emits selectors that **actually
resolve on the live page**.

This is the project's highest-risk assumption. If it fails, every generated
mutation silently no-ops: the dashboard fills with variants, the agent looks
busy, and nothing on the page ever changes. That failure is invisible from the
outside — which is exactly why it was tested on day one rather than discovered
on Saturday.

#### Run this

```bash
pnpm spike:selectors            # 20 trials — takes several minutes
GX_TRIALS=3 pnpm spike:selectors   # quick smoke test
```

#### You should see

```
  selectors resolving BEFORE repair   100.0%   (gate: ≥70%)
  selectors resolving AFTER repair    100.0%   (gate: ≥95%)
  verified against the LIVE page      100.0%
  variants that broke the layout      0        (gate: 0)

✓ GATE PASSED
```

**Both percentages matter and they say different things.** The *before* figure is
whether the outline is legible enough to get it right first time. The *after*
figure is whether the pipeline is safe to build on. A high after-figure propped
up by a low before-figure would mean the repair loop is carrying the design — and
repairs cost a model call each, which on a ~9/min budget is expensive.

The full report, including every generated mutation set, lands in
`artifacts/spike/report.json`.

#### If it ever fails

Escape routes, in order of preference (PLAN §6 P6):

1. **Enrich the outline** — usually more text samples and explicit role hints.
2. **Stamp `data-gx-id` on Site A's meaningful elements** and restrict the
   generator to `[data-gx-id="..."]` selectors. Bulletproof, about 30 minutes,
   and honestly what a real product would do via a first-party integration.
3. **Turn generation into selection** — hand the model an enumerated list and let
   it choose rather than author.

Note that **none of these are currently in use**. Site A carries no `data-gx-id`
attributes, deliberately: using them from the start would have made the gate pass
trivially while proving nothing about real markup.

#### Failure looks like

| Symptom | Cause | Whose problem |
|---|---|---|
| `gave up after N attempts`, 0 calls | every model in the chain was unavailable | environment — retry in a few minutes |
| `503 high demand` on one model | that model is at capacity for large prompts; the client now spills to the next | neither, handled |
| Before-rate high, after-rate low | the repair loop is not helping; the outline is the problem | code |
| Both rates low | the outline is not legible to the model — escape route 1 or 2 | code |
| `variants that broke the layout > 0` | a mutation validates but renders badly; constrain the op set | code |
| `No current snapshot` | run `pnpm capture:snapshot` first | environment |

#### Code bug or environment problem?

- **Anything mentioning 429, 503 or "high demand"** is Gemini capacity, not us.
  The client serializes calls at ~9/min and spills across three models; if all
  three are busy it waits. Re-run later.
- **Match rates below the gate** are a code and prompt problem, and the escape
  routes above are the answer.

---

### P7 — Traffic swarm  [status: ✅ passed Thu 18 Sept]

#### What this phase should have made true

Thousands of realistic sessions on demand, so nothing downstream ever waits for
data — and, critically, sessions whose behaviour **responds to the page** rather
than to a number we chose.

#### Run this

```bash
pnpm swarm --sessions 20 --headed     # watch them, once
pnpm swarm --sessions 300             # the real volume, ~8-10 min
pnpm query:events --summary
```

#### You should see

Mobile converting **materially worse than desktop**, and the challenger
converting better than control — neither of which is configured anywhere.

```
▸ By device
  mobile      198 sessions    …% converted
  desktop     102 sessions    …% converted

▸ By variant — emergent, not configured
  v_control          mobile   …
  v_cta_above_copy   mobile   …
```

#### The thing to actually check — and it matters more than the numbers

Open **`swarm/behaviour.ts`** and read it. It is the honest centre of the demo.

Conversion probability is a function of **measured page geometry** — how far
below the fold the CTA sits, how much copy precedes it, how much of the first
screen the hero image eats — plus the persona's own traits. It never sees which
variant is running. **Grep it for a variant id; there isn't one.**

That is what makes the experiment result an emergent property of the simulation
rather than something we typed in. When the agent lifts the CTA above the fold,
these visitors respond because the geometry they read changed. If a judge asks
*"did you just make your variant win?"*, the answer is that file, on screen.

What the model does **not** claim: that these are real humans, or that the
absolute rates predict real traffic. What it claims is directional — that burying
a call to action under 280px of copy and a 30%-viewport illustration costs
conversions on a phone. That is uncontroversial CRO, and it is what the geometry
encodes.

#### Watch twenty of them

```bash
pnpm swarm --sessions 20 --headed
```

They should look like plausible people: different viewports, different scroll
depths, some stopping halfway, some poking repeatedly at the pricing accordion,
some leaving in two seconds. If they look like robots teleporting, the behaviour
model is wrong and everything downstream inherits that.

#### Failure looks like

| Symptom | Cause | Whose problem |
|---|---|---|
| Mobile and desktop convert the same | the behaviour model is not reading geometry — **stop, everything downstream becomes a lie** | code |
| 0 conversions across 100+ sessions | intent values too low, or `.cta-primary` is not clickable | code |
| `__name is not defined` | esbuild's keepNames helper leaking into `page.evaluate`; shimmed per context | code, fixed |
| All sessions error | Site A unreachable, or Playwright browsers missing | environment |
| Events arrive without `simulated: true` | the init script did not run before the snippet | code |
| Sessions run fine but most deliver no events | CORS preflight on `/collect` — see below | code, fixed |

#### Code bug or environment problem?

- **Sessions run but no events land** → ingestion, not the swarm. Check
  `pnpm query:events` and the `/collect` endpoint.
- **Everything errors identically** → environment; check `pnpm dlx playwright
  install chromium` and that Site A loads in your browser.
- **Conversion rates that look implausible** → read `swarm/behaviour.ts` and
  judge the model yourself. That is a design question, not a bug.

#### The bug this phase uncovered, and why it hid so well

Running sustained normal traffic for the first time exposed that **batched event
delivery had been broken since P4** — roughly 85% of events silently dropped.

The cause: the `/collect` route declared `OPTIONS` alongside `POST`. That
overrides the HTTP API's built-in CORS handling, so the browser's preflight was
routed to the Lambda, which found an empty body and replied **400**. A preflight
must be 2xx, so Chrome blocked every batched `fetch`.

Three things kept it invisible, and they are worth remembering because the same
blind spots apply elsewhere:

1. **`sendBeacon` uses `text/plain`**, which is a *simple* request and skips
   preflight entirely. So events sent on tab-close always worked — and P4's
   verification happened to test exactly that path.
2. **`curl` ignores CORS.** Every manual probe returned `{"accepted":1}`.
3. **The handler returned 202 on failure without logging.** CloudWatch showed
   1221 clean invocations while the data never arrived.

All three are fixed: the route is `POST` only, the handler answers `OPTIONS` with
204 as a belt-and-braces measure, and failures are now logged even though the
caller still gets a 202.

**The lesson for later phases:** a test that only exercises the unload path will
pass while normal browsing is broken. If you are ever verifying ingestion, browse
the site *without* closing the tab and confirm events arrive anyway.

#### Honesty rules this phase must keep

1. Every event carries `simulated: true` and its persona. A real visitor's
   browser cannot set those — they come from an init script the swarm injects.
2. Nothing is written to the database directly. Simulated visitors drive the
   **deployed** site through the **real** snippet into the **real** endpoint.
   What is simulated is the person, and only the person.
3. The dashboard badges simulated numbers (P10), and the video says so out loud.

---

### P8 — Aggregation engine  [status: ✅ passed Fri 19 Sept]

#### What this phase should have made true

Seven thousand raw events become the two artefacts everything downstream
consumes: the numbers a human reads as a heatmap, and the same numbers as
structure for the agent.

#### Run this

```bash
pnpm aggregate                    # recompute all nine segments and print a summary
source .env.local
curl -s "$GX_API_BASE/api/heatmap?path=/&segment=device=mobile|outcome=bounced" | python3 -m json.tool | head -40
```

#### You should see

Nine segments recomputed in well under a second, and — the point of the whole
phase — **mobile behaving measurably worse than desktop**:

```
device=mobile     scroll: 25%→89%  50%→50%  75%→21%  100%→3%
device=desktop    scroll: 25%→100% 50%→100% 75%→89%  100%→70%
```

Half of mobile visitors never reach the halfway point; nearly all desktop
visitors do. That is the flaw, in numbers, without anyone asserting it.

You should also see the friction Site A was built to produce:

```
dead_click ×85 on div.tier-expand
rage_click ×18 on div.tier-expand
```

#### The number that is easy to misread

`click_rate_pct` is **clicks ÷ views**, never clicks ÷ sessions. An element
nobody scrolled to has no click rate rather than a zero one. Every place this
figure appears — the dashboard, the JSON handed to the agent — says which
denominator it uses, because the two differ by a factor of three or more on a
long page and quietly swapping them would make every conclusion wrong.

#### Where the numbers come from

Every rollup is a SQL statement, not a loop. That is the reason the datastore is
Postgres (PLAN §3.2): nine segments over seven thousand events is one `GROUP BY`
each. If you ever find aggregation being assembled in TypeScript, it is in the
wrong place and it will be slow and wrong.

Two subtleties worth knowing, because both were bugs first:

- **`element_view` is a cumulative snapshot, not an increment.** The snippet
  re-emits totals each time the page is hidden (P4), so summing would
  multiply-count anyone who switched tabs. Aggregation takes the *last* snapshot
  per `(session, selector)`.
- **`bounced` is strict**: no conversion *and* the visitor either left within ten
  seconds or never reached halfway. A looser "did not convert" would make
  converted-vs-bounced a tidy binary split, but it would label a careful reader
  who simply was not ready to buy as a bounce. The remainder are neither — they
  browsed and left.

#### Failure looks like

| Symptom | Cause | Whose problem |
|---|---|---|
| A segment reports 0 viewed elements | visibility never emitted for those sessions — see below | code |
| `click_rate_pct` 0 everywhere | clicks and views disagree on selector spelling; the path builder has drifted | code |
| Mobile and desktop scroll identically | sessions rollup is wrong, or the swarm is not layout-reactive | code |
| `round(double precision, integer) does not exist` | a `percentile_cont` result needs `::numeric` before two-arg `round` | code |
| Aggregation takes more than a second | a rollup has been moved out of SQL into TypeScript | code |

#### A measurement that was an artefact

The first aggregation reported `median_time_to_first_view` of **0.02s** for the
CTA on mobile — an element that sits 109px *below* the mobile fold and therefore
cannot be seen without scrolling. Twenty milliseconds is not a person scrolling;
it was the swarm scrolling the instant the page loaded.

That number matters: "how long before they saw it" is one of the three clauses
the agent needs to write a credible opportunity. Fixed at the source — visitors
now pause before scrolling and read as they go — and it became the clearest
signal in the dataset:

```
desktop          CTA time-to-first-view  0.01s   (already on screen)
mobile           CTA time-to-first-view  1.18s   (must scroll to reach it)
mobile, bounced  CTA time-to-first-view  1.31s
```

The rule this illustrates: **a metric that looks impossibly good is usually
measuring your instrument rather than the world.**

#### The bug this phase surfaced

The first aggregation showed `device=mobile|outcome=bounced` with **143 sessions
and zero viewed elements** — obviously wrong, since those visitors plainly saw
the header.

`element_view` is emitted by the snippet's `pagehide` handler. A browser context
closed *without navigating* never fires it. Only converting visitors navigate, so
**`viewed_pct` was being measured exclusively for people who converted** — the
precise opposite of the segment the product exists to diagnose. The swarm now
navigates to `about:blank` before closing, which is what a real visitor leaving
actually does.

This is the third time a measurement has been right for the sessions that
happened to be tested and wrong for the ones that mattered. The pattern is worth
naming: **verify the segment you care about, not the one that is easiest to
produce.**

---

### P9 — Screenshots and session digests  [status: ✅ passed Fri 19 Sept]

#### What this phase should have made true

The heatmap has a backdrop to draw on, and the agent has short behavioural
narratives it can read instead of raw event streams.

#### Run this

```bash
pnpm screenshot     # captures both widths, uploads to the CDN
pnpm digests        # clusters sessions, then writes one sentence per cluster
source .env.local
curl -s "$GX_API_BASE/api/digests?path=/" | python3 -m json.tool | head -30
```

#### You should see

Seven or so clusters, each with a sentence whose every figure traces back to a
number in its `stats`. The one that matters:

```
54 sessions  mobile | stopped-before-pricing | brief | bounced
  "In 54 mobile sessions with a median duration of 5.4 seconds and 28% scroll
   depth, 100% of visitors saw the primary call to action but 0% clicked it."
```

Saw it. Did not act. That is the finding the whole product exists to surface, and
it is written from statistics rather than from a model's impression of some
events.

#### The division of labour, and why it is that way

**The clustering is deterministic SQL. The model writes only the sentence.**

Letting a model group sessions would be slow, costly, non-reproducible, and —
worst — it would put the untrustworthy component in charge of the part that has
to be trustworthy. Two runs over the same data must produce the same clusters, or
nobody can check the agent's reasoning against them.

Narratives run on `gemini-3.1-flash-lite`, the cheapest model in the chain. This
is the highest-count, lowest-stakes model use in the product: nothing downstream
depends on the prose being elegant, and everything depends on the numbers being
right — and those come from SQL.

A cluster signature is four coarse facts: `device | reached-pricing? | dwell-band
| outcome`. Coarse deliberately. Finer buckets produce many clusters of one
session each, which is a list rather than a description.

#### Two prompt corrections worth knowing about

Both were caught by reading the output rather than by the script passing:

1. The model wrote **"reached the pricing page"**. Site A is a single page; that
   phrasing would have taught the agent the site has multiple pages it could
   navigate between.
2. A tightened prompt then produced *"did not reach the pricing section, click
   the call to action, or convert"* — which **dropped the fact that 100% saw
   it**. A group that saw something and did not act on it is the most useful
   thing a summary can report, and omitting the view figure throws it away. The
   prompt now requires both numbers whenever they differ.

#### Failure looks like

| Symptom | Cause | Whose problem |
|---|---|---|
| Fewer than 4 clusters | not enough sessions; run `pnpm swarm --sessions 200` | environment |
| Narratives cite numbers not in `stats` | the prompt is letting the model speculate | code |
| `[fallback]` instead of a model name | every model in the chain was busy; the deterministic sentence was used | neither, by design |
| Screenshot shows a mutated page | capture forces the control arm and refuses otherwise | code, guarded |
| `column ... is of type text[] but expression is of type record` | the HTTP driver sends JS arrays as records; build the array in SQL | code |
| Screenshots return 403 after a deploy | `deploy:infra` used to `s3 sync --delete` the CDN bucket and remove `shots/`, which it does not manage. Now excluded — but if you add another out-of-band path to that bucket, exclude it too | code, guarded |

#### Why screenshots are captured locally

Site A changes approximately never, and packaging Chromium into a Lambda layer is
a well-known time sink that buys nothing here (PLAN §1.2). The capture forces the
**control** variant: an overlay of click data drawn over a screenshot of a
*different* variant would be silently, confidently wrong.

The document dimensions printed at the end (`390 × 4685`, `1440 × 2960`) are what
P11 projects event coordinates onto. Without them the overlay would be guessing.

---

### P10 — Dashboard scaffold and design system  [status: ✅ passed Fri 19 Sept]

#### What this phase should have made true

The Best-UI surface exists, on its own domain, reading live data — with the
design decisions from PLAN §5.3 encoded as tokens so nothing drifts later.

#### Run this

```bash
source .env.local && open "$GX_DASHBOARD_URL"
pnpm dev:dashboard     # or locally on :5173
```

Click every nav item.

#### You should see

**Overview** with real figures: mobile CTA click rate against desktop, time to
reach the CTA, and a plain-language paragraph naming where the objective leaks.
**Heatmaps** with six working segments including converted-vs-bounced. Every other
nav item reaching a **designed empty state** that says what will live there and
which phase builds it — never a blank page or a 404.

The objective and guardrail sit in the header on every screen. That is
deliberate: the product's premise is that the agent holds a goal rather than
taking instructions one at a time, and an objective hidden on a settings page
would make the whole thing read as a variant generator with extra steps.

#### Judge it yourself — this is the Best UI submission

Open it at the width and zoom you will record the video at, and look for the
tells in PLAN §5.1: default-Tailwind blue, purple gradients, glassmorphism,
emoji as icons, Inter everywhere. If any of it reads as generic, say so now —
it is cheap today and impossible on Saturday.

Two structural choices support that:

- **Tailwind's default colour palette is deleted, not extended.** A stray
  `bg-blue-500` fails to compile. Default Tailwind blue is the fastest way to
  look machine-generated, and making it impossible beats remembering not to use it.
- **Numbers are always mono** with tabular figures. It is the cheapest thing that
  makes a tool look like an instrument rather than a web page.

#### Element ranking is not by popularity

Sorting by view count surfaces the page header and the hero — things everyone
sees and nobody interacts with. Elements rank by `attention × inaction +
friction`, so what a growth team needs first rises: many saw it and few acted, or
it is generating rage clicks.

#### The bug this screen exposed

The heatmap listed `div.tier-expand` with **0% saw it** — next to eleven dead
clicks. Visitors had demonstrably clicked something the data said nobody saw.

The IntersectionObserver was watching only `SNAPSHOT_SELECTOR`, a tag list
(`a, button, h1…h4, p, img, section, …`). A `<div class="tier-expand">` matches
none of it, so the accordion producing the page's friction was never observed for
visibility, while clicks recorded it fine. Anything carrying a human-chosen class
or `cursor: pointer` is now observed too.

It now reads coherently, and says something more interesting:

```
div.tier-expand   viewed 12.7%   clicked 55.6%   dead clicks 10
```

Of the bounced mobile visitors who scroll far enough to see it, **more than half
try to use it** — and nothing happens.

This mattered beyond tidiness: P11 draws a marker per element, and a row claiming
nobody saw something eleven people clicked would render as a visible
contradiction on the screen judges look at longest.

---

### P11 — ★ Heatmap overlay  [status: ✅ passed Fri 19 Sept]

#### What this phase should have made true

The hero screen: real click density drawn over the real page, with the segment
controls a CRO tool is expected to have.

#### Run this

```bash
source .env.local && open "$GX_DASHBOARD_URL/heatmaps"
```

Switch Mobile ↔ Desktop, Clicks ↔ Scroll ↔ Attention, and Outcome between
Converted and Bounced.

#### You should see

The pane opens **on the densest part of the page**, not the top, and the two
hottest spots are the **£11 price** and the **"See what's included" accordion
that does nothing**. That second one is the point: you can see people clicking a
control that is not wired up.

The page underneath is desaturated so the overlay is the only strong colour.

#### How the overlay is drawn

Two passes. The first draws every point as a greyscale radial gradient, so
overlapping points accumulate density in the alpha channel. The second replaces
each pixel's colour by looking its alpha up in a ramp. Drawing coloured blobs
directly would stack as discs; this blends them into a field.

Rage clicks carry 3× weight and dead clicks 2×, so friction reads hotter than
ordinary interaction.

Points are **page fractions** (§4.5), so the same data draws correctly over the
390×4685 mobile capture and the 1440×2960 desktop one with no re-measurement.
That is the entire reason events were stored as fractions back in P4.

#### Two problems the reference screenshots exposed

1. **The overlay was invisible on load.** Site A is 4685px tall on mobile, so a
   scroll pane opens on the header — where nothing ever happens. It looked
   broken. There is now a density rail showing activity by depth, and the view
   opens on the densest region.
2. **Only 22 click points.** The personas clicked the CTA and the accordion and
   nothing else, so the map was three hot spots on a dead page — a property of
   the simulation, not the site. Visitors now also click headings, logos and nav
   links on the way past, which is what people do. **201 points.**

#### What is deliberately not here

The reference has a **Move** map and Location / Browser / OS filters. We never
recorded mousemove, and we do not collect geo or user-agent breakdowns — adding
them now means new event types and re-running everything downstream. Four filters
that work beat seven where three are decorative, particularly if a judge clicks one.

---

### P12 — Agent skeleton  [status: ✅ passed Sat 20 Sept]

#### What this phase should have made true

A Strands agent holds the objective, calls real tools, and its every step is
recorded where you can inspect it.

#### Run this

```bash
pnpm agent:run
source .env.local && open "$GX_DASHBOARD_URL/runs"
```

#### You should see

A diagnosis in about 40 seconds over roughly 15 tool calls, and every figure in
it traceable to a tool result in the run log. The last run produced:

```
FINDING: losing signups primarily on mobile due to fold-and-scroll drop-off,
alongside broken interaction controls in the pricing section.

EVIDENCE:
  6.8% conversion on device=mobile (12/176) vs 31.9% on device=desktop (46/144)
  22.2% reach 75% depth on mobile vs 95.1% on desktop
  15.1% saw div.tier-expand when bounced vs 94.8% when converted
  251 dead clicks and 55 rage clicks on div.tier-expand
```

**Check the arithmetic yourself.** 12/176 is 6.8%, 46/144 is 31.9%, and both
appear verbatim in the run log's funnel steps. The agent is quoting, not
inventing — which is the only reason the evidence trail means anything.

#### The rule that makes this work

**The agent may quote figures, never calculate them.** Every number was computed
in SQL and handed over by a tool. If a statistic were produced inside the model's
context, nothing in the evidence trail could be checked.

Tools return a dozen ranked lines rather than raw JSON. Handing back a 20KB
payload per call fills the context with data the model cannot act on.

#### Failure looks like

| Symptom | Cause | Whose problem |
|---|---|---|
| `got multiple values for argument 'path'` | a tool's own argument collides with the HTTP helper's first parameter | code |
| Dozens of repeated tool calls, no conclusion | a tool is raising and the model is retrying; look at the *first* error, not the last | code |
| `exceeded your current quota` | free-tier daily limit on that model; the chain spills to the next | environment, self-healing |
| `503 high demand` | that model is at capacity for large prompts; the chain spills | environment, self-healing |
| Wall of `Event loop is closed` tracebacks | the Gemini client tearing down after the loop has gone. Noise at exit, nothing leaked | neither |

#### Three failures worth recording

This phase took four attempts, and the diagnoses I gave for the first two were
wrong. Recorded because the reasoning error is instructive:

1. **27 tool calls, only the zero-argument tool worked.** I concluded Gemini was
   rejecting `"default"` keys in the tool schema and removed them. Plausible, and
   wrong.
2. **118 tool calls.** I concluded the 20KB JSON payloads were overflowing
   context and made the tools return compact summaries. Also a real improvement,
   also not the cause.
3. **The actual bug**: `_get(path, **params)` took `path` as its first parameter,
   and every tool called `_get("/api/heatmap", …, path=path)` — passing `path`
   twice. Every parameterised tool raised `TypeError` before any request was
   made. The agent saw a tool error and retried.

The tell was visible from the first run and I misread it: `get_experiment_history`
worked because it is the only tool that **does not pass a path**, not because it
takes no arguments. Calling the tool functions directly found it in seconds —
which is what I should have done before theorising about the framework.

**The lesson: test your own function in isolation before blaming the layer above
it.** The two "fixes" were improvements, but shipping them as explanations cost
most of a day's model quota.

---

### P13 — Opportunities with verified evidence  [status: ✅ passed Sat 19 Sept]

#### What this phase should have made true

The agent records what it found, and **every figure is checked against the
database before the opportunity is accepted**.

#### Run this

```bash
pnpm agent:run
source .env.local && open "$GX_DASHBOARD_URL/opportunities"
```

Click "Show evidence" on an opportunity.

#### You should see

An opportunity, and a table with two numeric columns: what the agent **cited**
and what is **in the data**. They match, because one that does not match is never
written.

```
Mobile conversion is significantly lower than desktop due to poor engagement
and scroll depth.

mobile_conv        12     12     funnel:device=mobile:converted
desktop_conv       46     46     funnel:device=desktop:converted
mobile_scroll_50   43.8   43.8   scroll:device=mobile:50
desktop_scroll_50  100    100    scroll:device=desktop:50
```

#### The enforcement is real, and you can watch it work

Each evidence item carries a `sourceRef` — `heatmap:<segment>:<selector>:<field>`,
`funnel:<segment>:<step>`, `scroll:<segment>:<depth>` or `digest:<signature>`.
The API resolves it against the stored aggregate and compares the cited value.
A mismatch returns **422** naming the failing citation, and the agent must
correct it and try again.

In the run that produced the opportunity above, **six attempts were rejected
first**:

```
funnel:device=mobile:converted   says 0.068, data says 12     ← cited a rate where the funnel holds a count
scroll:device=mobile:50          says 0.438, data says 43.8   ← cited a fraction where the data is a percentage
heatmap:…:div.tier-expand        says 63, data says …         ← wrong figure
```

A model merely *asked* to cite sources will cite plausible ones. This rejects
them. That is the whole difference between an evidence trail and prose with
numbers in it.

#### Failure looks like

| Symptom | Cause | Whose problem |
|---|---|---|
| `only N of M evidence items resolve` | fewer than three citations matched; the agent should retry with exact figures | working as designed |
| Every attempt rejected, none stored | the agent is restating rates instead of quoting tool output; tighten the prompt | code |
| `no aggregate for segment "…"` | that segment has not been computed — run `pnpm aggregate` | environment |
| `exceeded your current quota … retry in Ns` | free tier is ~20 requests per minute **per model**; the loop now waits it out | environment, self-healing |

#### Known limitation

The last run recorded **one** opportunity rather than the two or three requested.
It spent its tool budget gathering and then correcting rejected citations. One
well-evidenced opportunity demonstrates the mechanism; with quota at ~20
requests per minute per model, chasing a second was not worth the calls.

---

### P15 — The agent writes its own experiment  [status: ✅ passed Sat 19 Sept]

**What it adds.** The agent reads a verified opportunity plus everything it has
learned from past experiments, and proposes a variant: a hypothesis, and a set
of structured mutations validated against the same schema the P6 gate uses. Two
screens land with it — **Experiments** and **Learnings**.

The point of this phase is the *memory*. A proposal must cite the learning it
relied on, by id. That is checked, not trusted.

**Run it.**

```bash
pnpm seed:learnings          # prior learnings, so there is a memory to consult
pnpm agent:run -- --propose  # the agent reads, cites, proposes
```

**What you should see.** In the dashboard, **Experiments** shows the draft with
its hypothesis and the learning it cited; **Learnings** shows the memory it read
from.

| You see | What it means |
|---|---|
| `proposal rejected: cited text, not an id` | working as intended — the agent paraphrased a learning instead of citing one. It re-reads and corrects. Worth showing on camera. |
| `mutation rejected: op not permitted` | the agent tried something outside the closed op set (there is no `set_html`, ever) |
| A draft appears with `status: draft` | correct. Drafts are deliberately **not** in the live manifest — nothing reaches a visitor without approval. |

> The rejection-then-correction is the evidence that the memory is load-bearing
> rather than decorative. If it never rejects anything, be suspicious.

---

### P16 — Variant diff  [status: ✅ passed Sat 19 Sept]

**What it adds.** A side-by-side screen at **Experiments → Compare side by
side**, showing control and challenger as two **live iframes of the real site**,
with the mutation list beside them. Hovering a mutation highlights the element
it touches, and each one carries the agent's own note explaining why.

They are real iframes on purpose: it is the shipping snippet applying the
stored mutations, so what you approve is exactly what a visitor gets. Nothing
is mocked.

**Verify it.**

```bash
pnpm check:diff <experimentId>     # the draft id from the Experiments screen
```

All checks should pass, ending with `The diff screen shows a real difference.`

**What it is actually checking, and why.** A draft is not in the live manifest,
so the screen asks for it explicitly with `?gx_preview=<experimentId>`. That
request deliberately **bypasses the CDN**, so a draft can never be edge-cached
and handed to a real visitor.

The failure this check exists to catch is a silent one. Going to the origin
means paying cold-Lambda latency (~2s), which is longer than the anti-flicker
budget a real visitor gets. When that budget expires the snippet does the right
thing and *refuses to mutate* — so both frames render the control while the
screen still labels one of them the challenger, and you would approve a variant
having never seen it. Preview therefore gets its own, longer budget
(`PREVIEW_TIMEOUT_MS`); the visitor path is untouched.

| You see | What it means | Fix |
|---|---|---|
| `… was not suppressed by the reveal timer` ✗ | the preview budget is too tight; the frames are showing the control | raise `PREVIEW_TIMEOUT_MS` in `packages/shared/src/runtime/constants.ts`, rebuild, redeploy |
| `control and challenger are visibly different` ✗ | the variant's mutations did not resolve against the live DOM | open the diff screen; unresolved selectors are listed |
| `appending ?preview to the CDN URL does not return the draft` ✗ | CloudFront started forwarding the `preview` query param — a draft could reach a real visitor | remove it from the cache policy's forwarded query strings |
| Both frames blank | Site A is not deployed, or `GX_SITE_A_URL` is stale | `pnpm run deploy:infra` |

**Also confirm the visitor path still holds** — this phase touches the snippet's
reveal timers, which are the one thing that must never regress:

```bash
pnpm check:flicker      # must end with: Anti-flicker contract holds.
```

---

### P17 — Cedar policy gate  [status: ✅ passed Sat 19 Sept]

**What it adds.** `policies/growthx.cedar` — eight rules saying what the agent
may and may not do — evaluated by Cedar on every state-changing request, plus a
**Policy** screen showing the rules and every decision they have produced.

**Read the policy file first.** It should read as policy, not as code:

```bash
cat policies/growthx.cedar
```

**Verify it.**

```bash
pnpm check:policy
```

Ends with `The gate refuses, names its reason, and records it.`

**What it proves, and why each one is there.**

| Check | Why it matters |
|---|---|
| Rewriting `.tier-price` to `$9` is refused **403** | This exact request **succeeded** before P17. The code denylist never fired, because it matched on selector text and `div.tier.tier-1 > p.tier-price` contains none of the banned words. |
| The refusal names `forbid-pricing-and-checkout` | A denial you cannot trace to a rule is indistinguishable from a bug |
| Launch is refused without an approval row | The one action that changes what a stranger sees |
| A forged `approvedBy` in the request body changes nothing | The approval is read from the `approvals` table, never from the caller |
| Every decision is recorded, refusals included | A refused action writes nothing else anywhere — without this the gate's most important moments would leave no trace |

**The two demo moments.** On the **Policy** screen, click a refusal and the rule
that caused it highlights in the source beside it. The stronger one: an
experiment that a human **has** approved is still refused if it touches pricing,
because in Cedar a `forbid` beats every `permit`. Approval does not unlock
everything — only the things that were merely gated.

**Where the gate runs, and why there.** In the API, not in the agent. A gate
inside the agent's own process is a suggestion: the agent, or anything else
holding the API URL, calls the endpoint directly. Putting it in the API means
there is no path to a write that skips it — which is why `check:policy` makes
every request over HTTPS to the real Lambda rather than calling the function.

**Two things this phase found and fixed.**

1. *The pricing denylist never worked.* `validateMutations` accepted a
   `deniedPaths` option and no caller ever passed one, and the snapshot did not
   record which elements were marked `data-gx-deny`. The page now declares its
   own protected regions, the snapshot records them, and the policy decides.
2. *Two experiments could run on one page.* The snippet applies the first
   experiment it finds for a path, so a second would sit in the dashboard marked
   "running", collect no exposures and prove nothing. Now
   `forbid-concurrent-experiment-on-path`.

| You see | What it means | Fix |
|---|---|---|
| `Internal Server Error` on `/api/policy` | the Lambda could not load Cedar or the policy file | `aws logs tail GrowthxStack-DashboardFnLogs… --since 5m` |
| `growthx.cedar not found` | the CDK `afterBundling` copy did not run | redeploy; the file must land beside the handler |
| Everything is refused, including reads | the policy file failed to parse, so the policy set is empty — and an empty set is default-deny | check `/api/policy` returns 8 ids |
| A pricing mutation is **accepted** | the snapshot predates P17 and has no `protected` flags | `pnpm capture:snapshot` |

> Re-running `capture:snapshot` is required after this phase. `protected` and
> `region` are now part of the snapshot's content hash, so the first run after
> upgrading stores a new version even though no visible text changed.

---

### P19 — Approval queue and lifecycle  [status: ✅ passed Sat 19 Sept]

**What it adds.** The **Approvals** screen, and the transitions behind it:
`draft → pending_approval → running`, with `rejected` and `killed` as explicit
states rather than error paths.

**The idea worth keeping hold of.** The queue is not a workflow sitting beside
the policy — it is *produced by* it. When the agent tries to launch, Cedar
refuses with `forbid-launch-without-approval`, and that refusal becomes the
request, carrying the decision that created it. Each card shows the refusal
verbatim at the top.

**Verify it.**

```bash
pnpm check:approvals
```

Ends with `Nothing reaches a visitor without a human name on it.`

| Check | Why it is there |
|---|---|
| The refusal creates a pending request | the queue and the policy are the same mechanism |
| Retrying does not pile up duplicates | the agent retries within a run; the human should see one card |
| **A pricing refusal never enters the queue** | an Approve button that cannot work would misrepresent what the button does |
| Rejecting without a reason is refused | the reason is read back to the agent |
| Approving without a name is refused | an approval with nobody attached is not an approval |
| Approving re-runs the *whole* policy | something else may have started running in between. A queue that bypassed the gate on the way out would be a gate with a hole shaped like the button a human clicks |
| The launch records who permitted it | read from the `approvals` table, never from the request body |

**Both branches, by hand.** Open **Approvals**:

- **Approve and launch** → the card reports it launched, and the challenger is
  live on Site A within 30s (the manifest edge cache is the bound).
- **Reject** → you must type a reason. The experiment becomes `rejected` rather
  than being deleted, and the reason appears at `/api/feedback`, which the
  agent's `get_rejection_feedback` tool reads before it proposes anything next.

**Recording shot 7.** Approving consumes the pending card, so the take cannot be
repeated as filmed. Put it back with:

```bash
pnpm demo:queue
```

This resets the experiment and asks the API to launch again, so the policy
refuses and produces a fresh request — created the way it would be in real use,
not inserted by hand. Safe to re-run between takes.

**The kill switch.**

```bash
curl -X POST "$GX_API_BASE/api/experiments/stop" \
  -H 'content-type: application/json' \
  -d "{\"site\":\"$GX_SITE_ID\",\"experimentId\":\"<id>\"}"
```

Sets `killed`, not `concluded` — an experiment somebody pulled and one that ran
its course are different facts, and P20 must never write a learning from the
first.

| You see | What it means | Fix |
|---|---|---|
| `invalid input value for enum experiment_status` | a status was used that is not in the enum (`draft`, `pending_approval`, `rejected`, `running`, `stopping`, `concluded`, `killed`) | use one of those |
| Approved, "but the policy still refuses" | correct behaviour — something else started running on that page in the meantime | kill the other experiment, approve again |
| The queue is empty after an agent run | the launch was refused for a reason no human can lift; check **Policy** | look at the newest refusal |

> **Deferred from this phase.** PLAN §P19 step 1 also lists an EventBridge tick
> Lambda driving `running → evaluate → conclude`. It is deferred to P20, where
> the evaluator it would call actually exists — a scheduled tick with nothing to
> invoke would be theatre. Step 2 (Step Functions) stays cut per §3.3.

---

---

## §D — Demo-day runbook

_Written in P22 (Sat 14:00). Will contain: the cold-start sequence with timings,
the `?gx_force=` URLs for each variant, tab order for recording, and the
cached-last-run fallback if a live model call fails mid-take._
