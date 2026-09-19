import cedarModule from "@cedar-policy/cedar-wasm/nodejs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * The policy gate.
 *
 * Two decisions worth stating, because both are the kind a reviewer should
 * push back on:
 *
 * 1. It runs in the API, not in the agent. A gate inside the agent's own
 *    process is a suggestion — the agent, or anything else holding the API
 *    URL, simply calls the endpoint directly. Enforcing here means there is no
 *    path to a write that skips it.
 *
 * 2. The policy is Cedar, evaluated by Cedar, rather than a few `if`s. The
 *    value is not that Cedar is faster or shorter; it is that the rules live in
 *    a file a non-engineer can read and audit, the engine is default-deny
 *    rather than default-allow, and every refusal names the policy that caused
 *    it. `if (!approved) throw` gives you none of that third part, which is the
 *    part the dashboard renders.
 *
 * Cedar assigns positional ids (policy0, policy1…) to a policy set parsed from
 * one blob of text, which would put "policy3" on screen. So the file is split
 * on its own @id annotations and handed to Cedar as a named map. The file stays
 * readable; the decisions stay legible.
 */

/**
 * This module has to work in two module systems. Under tsx it is ESM, where
 * `import.meta.url` exists and `__dirname` does not; in the Lambda it is the
 * CJS bundle esbuild emits, where the reverse is true and `import.meta.url`
 * comes out undefined. Reaching for either one directly crashes in the other —
 * which is how the first deploy of this failed, at module load, before a single
 * request was served.
 */
declare const __dirname: string | undefined;

function moduleDir(): string {
  if (typeof __dirname === "string") return __dirname;
  try { return dirname(fileURLToPath(import.meta.url)); } catch { return process.cwd(); }
}

// A plain import, deliberately. `@cedar-policy/cedar-wasm` is external in the
// Lambda bundle (infra: nodeModules), so esbuild leaves this as a require in
// its CJS output and Node resolves it normally; under tsx it is an ESM import
// of a CJS module, which interops. Trying to be clever here with createRequire
// or eval broke in one module system or the other, twice.
const cedar = cedarModule as unknown as { isAuthorized: (req: unknown) => any };

/**
 * The policy file is read at runtime rather than inlined at build time, so the
 * .cedar file is the only copy of the rules that exists. CDK copies it next to
 * the handler when bundling (see infra: commandHooks), which is why the Lambda
 * path is first here; the repo path is what runs under tsx in development.
 */
function loadPolicySource(): string {
  const here = moduleDir();
  const candidates = [
    join(here, "growthx.cedar"),                       // bundled beside the handler
    join(here, "../../../policies/growthx.cedar"),     // packages/api/src → repo root
    join(process.cwd(), "policies/growthx.cedar"),
  ];
  for (const c of candidates) {
    try { return readFileSync(c, "utf8"); } catch { /* try the next */ }
  }
  // Failing loudly beats running with no rules: an empty policy set is
  // default-deny, which would look like a working gate that refuses everything.
  throw new Error(`growthx.cedar not found; looked in ${candidates.join(", ")}`);
}

const policySource = loadPolicySource();



export type PolicyAction =
  | "read_analytics" | "read_heatmap" | "read_snapshot"
  | "create_experiment" | "generate_variants"
  | "launch_experiment" | "deploy_winner"
  | "publish_page" | "delete_page" | "edit_source";

export interface PolicyDecision {
  decision: "allow" | "deny";
  /** The policy that decided it — the name from @id in growthx.cedar. */
  policyId: string | null;
  reasons: string[];
  action: string;
  resource: string;
  /** Rendered verbatim in the dashboard so a denial explains itself. */
  explain: string;
  evaluatedAt: string;
}

/** Split the .cedar file into {id: policyText} using its @id annotations. */
function namedPolicies(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /@id\("([^"]+)"\)\s*((?:permit|forbid)[\s\S]*?;)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out[m[1]!] = m[2]!;
  return out;
}

const POLICIES = namedPolicies(policySource);

/** Human-readable text for the decisions the UI shows. Keyed by policy id so a
 *  new policy without an entry still renders, just less warmly. */
const EXPLANATIONS: Record<string, string> = {
  "forbid-launch-without-approval":
    "An experiment cannot be shown to real visitors until a human approves it. No approval record exists for this one.",
  "forbid-touching-protected-regions":
    "This variant targets an element the page marks as protected (data-gx-deny). Those are never editable by the agent, approved or not.",
  "forbid-pricing-and-checkout":
    "This variant touches pricing or checkout. The agent is permanently barred from those regions — an agent that can edit prices can buy itself a win.",
  "forbid-concurrent-experiment-on-path":
    "Another experiment is already running on this page. Two at once confound each other, and the second would never actually be shown.",
  "forbid-publishing-and-deleting":
    "The agent may propose changes to page content, never publish, delete or edit source.",
  "allow-launch-when-approved": "A human approved this launch.",
  "allow-propose-experiment": "Drafting an experiment changes nothing a visitor sees.",
  "allow-read-analytics": "Reading analytics is unrestricted.",
};

export interface AuthzInput {
  action: PolicyAction;
  resource: { type: string; id: string; attrs?: Record<string, unknown> };
  context?: Record<string, unknown>;
  principal?: string;
}

export function authorize(input: AuthzInput): PolicyDecision {
  const principal = input.principal ?? "growth-orchestrator";
  const res = input.resource;

  const result = cedar.isAuthorized({
    principal: { type: "Agent", id: principal },
    action: { type: "Action", id: input.action },
    resource: { type: res.type, id: res.id },
    context: input.context ?? {},
    policies: { staticPolicies: POLICIES },
    entities: [
      { uid: { type: "Agent", id: principal }, attrs: {}, parents: [] },
      { uid: { type: res.type, id: res.id }, attrs: res.attrs ?? {}, parents: [] },
    ],
  });

  const base = {
    action: input.action,
    resource: `${res.type}::"${res.id}"`,
    evaluatedAt: new Date().toISOString(),
  };

  // A malformed request is a denial, never an allow. Failing open here would
  // make every other guarantee in this file conditional on the request being
  // well-formed, which is exactly the assumption an attacker gets to break.
  if (result.type !== "success") {
    const errs = (result.errors ?? []).map((e: { message?: string }) => e.message ?? String(e));
    return {
      ...base, decision: "deny", policyId: null, reasons: errs,
      explain: "The policy engine could not evaluate this request, so it was refused.",
    };
  }

  const decision = result.response.decision === "allow" ? "allow" : "deny";
  const reasons: string[] = result.response.diagnostics?.reason ?? [];
  const policyId = reasons[0] ?? null;

  return {
    ...base,
    decision,
    policyId,
    reasons,
    explain: policyId
      ? EXPLANATIONS[policyId] ?? `Decided by policy ${policyId}.`
      : decision === "deny"
        ? "No policy permits this action. Cedar is default-deny, so it was refused."
        : "Allowed.",
  };
}

/** The policy text, for the dashboard to render. */
export function policyDocument(): { source: string; ids: string[] } {
  return { source: policySource, ids: Object.keys(POLICIES) };
}
