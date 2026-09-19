import { sql } from "drizzle-orm";
import type { Db } from "@growthx/db";
import { newId } from "@growthx/shared/runtime";
import { authorize, type AuthzInput, type PolicyDecision } from "./policy.js";

/**
 * Evaluating a policy and recording what it decided.
 *
 * The recording is not incidental. A denied action writes nothing else
 * anywhere — no experiment, no approval — so if the decision were not stored
 * here, the gate's most important moments would be invisible, and the claim
 * that the agent is governed would rest on trusting that some `if` ran.
 */

export interface Mutation { op: string; selector: string; target?: string }
export interface OutlineElement { path: string; protected?: boolean; region?: string | null }

/**
 * What a set of variants actually touches, in the terms the policy speaks:
 * which named regions of the page, and whether any protected element is hit.
 *
 * Derived from the stored page outline rather than by pattern-matching the
 * selector text, because the page is what declares data-gx-deny. A selector
 * like `div.tier.tier-1 > p.tier-price` contains none of the words a string
 * check would look for; the outline knows it sits inside the pricing section
 * and is marked protected.
 */
export function describeTargets(
  mutations: Mutation[],
  elements: OutlineElement[]
): { regions: string[]; touchesProtected: boolean; protectedSelectors: string[]; selectors: string[] } {
  const byPath = new Map(elements.map((e) => [e.path, e]));
  const regions = new Set<string>();
  const protectedSelectors: string[] = [];
  const selectors: string[] = [];

  for (const m of mutations ?? []) {
    // move_before/move_after have a second element in play; a move into the
    // pricing table is still a change to pricing.
    for (const sel of [m.selector, m.target].filter(Boolean) as string[]) {
      selectors.push(sel);
      const el = byPath.get(sel);
      if (!el) continue;
      if (el.region) regions.add(el.region);
      if (el.protected) protectedSelectors.push(sel);
    }
  }
  return {
    regions: [...regions],
    touchesProtected: protectedSelectors.length > 0,
    protectedSelectors,
    selectors,
  };
}

export async function recordDecision(
  db: Db, siteId: string, d: PolicyDecision,
  extra: { resourceAttrs?: unknown; context?: unknown; runId?: string | null } = {}
): Promise<string> {
  const id = newId("pd");
  await db.execute(sql`
    insert into policy_decisions
      (id, site_id, action, resource, decision, policy_id, reasons, explain, resource_attrs, context, run_id)
    values (${id}, ${siteId}, ${d.action}, ${d.resource}, ${d.decision}, ${d.policyId},
            ${JSON.stringify(d.reasons)}::jsonb, ${d.explain},
            ${JSON.stringify(extra.resourceAttrs ?? null)}::jsonb,
            ${JSON.stringify(extra.context ?? null)}::jsonb,
            ${extra.runId ?? null})
  `);
  return id;
}

/** Evaluate, record, return. Callers act only on `decision`. */
export async function gate(
  db: Db, siteId: string, input: AuthzInput,
  extra: { runId?: string | null } = {}
): Promise<PolicyDecision & { decisionId: string }> {
  const d = authorize(input);
  const decisionId = await recordDecision(db, siteId, d, {
    resourceAttrs: input.resource.attrs ?? null,
    context: input.context ?? null,
    runId: extra.runId ?? null,
  });
  return { ...d, decisionId };
}

/** The shape the API returns on a refusal. 403, and it says why and by which policy. */
export function refusal(d: PolicyDecision & { decisionId?: string }) {
  return {
    stored: false,
    denied: true,
    policyId: d.policyId,
    explain: d.explain,
    reasons: d.reasons,
    action: d.action,
    resource: d.resource,
    decisionId: d.decisionId ?? null,
    errors: [`refused by policy ${d.policyId ?? "(default-deny)"}: ${d.explain}`],
  };
}
