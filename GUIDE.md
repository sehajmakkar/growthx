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

**Last updated:** P2 complete — Corrick landing page live. Thu 18 Sept.

### Phases

| | Phase | Status |
|---|---|---|
| ✅ | **P0** — Repo, toolchain, `GUIDE.md` | passed Thu 18 Sept |
| ✅ | **P1** — AWS foundation deployed | passed Thu 18 Sept |
| ✅ | **P2** — Site A landing page | passed Thu 18 Sept |
| ▶ | **P3** — Snippet: bucketing, mutations, anti-flicker (1.75h) | next |
| ⬜ | P4 — Event capture and ingestion (1.5h) | |
| ⬜ | P5 — DOM snapshot (0.75h) | |
| ⬜ | P6 — Selector grounding spike ⚠ GATE (1.25h) | unblocked — runs on Gemini |
| ⬜ | P7 — Traffic swarm (1.75h) | |
| ⬜ | P8–P16 — Friday: aggregation, dashboard, agent | |
| ⬜ | P17–P21 — Saturday: governance, results, polish | |
| ⬜ | P22–P23 — Saturday: rehearse, record, submit | |

**Next checkpoint:** Thu 22:00 — Site A live and instrumented, events flowing,
snapshot captured, P6 gate passed, swarm producing traffic. (PLAN.md §1.4)

**Time used so far:** P0–P2 ≈ 3h of the ~12h Thursday budget. On schedule.

### Your next action

**Verify P2** using its block in §C below. Run `node scripts/check-site-a.mjs`,
then look at Site A yourself at 390px and 1440px — the script measures the
flaws, but only you can judge whether the page looks like a real company's.
Then merge the PR and say **"start P3"**.

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

---

## §D — Demo-day runbook

_Written in P22 (Sat 14:00). Will contain: the cold-start sequence with timings,
the `?gx_force=` URLs for each variant, tab order for recording, and the
cached-last-run fallback if a live model call fails mid-take._
