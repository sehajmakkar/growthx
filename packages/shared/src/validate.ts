import { Mutation, MutationSet, selectorsOf } from "./mutations.js";
import {
  ATTR_ALLOWLIST,
  MAX_TEXT_LENGTH,
  SELECTOR_DENYLIST,
  STYLE_PROP_ALLOWLIST,
} from "./runtime/constants.js";
import type { SnapshotElement } from "./snapshot.js";

/**
 * The mutation validation pipeline. PLAN.md §4.4.
 *
 * Plain code, deliberately. The agent decides *what* to change and *why*; this
 * decides whether the change is safe and applyable, and it is the only thing
 * standing between a Flash-class model's output and a customer's live page.
 *
 * It never trusts the model's goodwill. A selector that resolves to two
 * elements is rejected rather than applied to the first, because the agent
 * would be mutating something it never looked at.
 */

export interface ValidationError {
  index: number;
  op: string;
  selector: string;
  reason: string;
  /** Selectors from the snapshot that look closest to what was attempted. */
  nearest?: string[];
}

export interface ValidationResult {
  ok: boolean;
  mutations: Mutation[];
  errors: ValidationError[];
  selectorsChecked: number;
  selectorsMatched: number;
}

/** Cheap lexical similarity — good enough to suggest what the model meant. */
function similarity(a: string, b: string): number {
  const at = new Set(a.toLowerCase().split(/[^a-z0-9-]+/).filter(Boolean));
  const bt = new Set(b.toLowerCase().split(/[^a-z0-9-]+/).filter(Boolean));
  if (at.size === 0 || bt.size === 0) return 0;
  let shared = 0;
  at.forEach((t) => { if (bt.has(t)) shared++; });
  return shared / Math.max(at.size, bt.size);
}

export function nearestSelectors(
  attempted: string,
  elements: SnapshotElement[],
  limit = 8
): string[] {
  return elements
    .map((e) => ({ path: e.path, score: similarity(attempted, e.path + " " + e.textSample) }))
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((x) => x.path);
}

function isDenied(selector: string): boolean {
  const s = selector.toLowerCase();
  for (const denied of SELECTOR_DENYLIST) {
    const bare = denied.replace(/[[\]"']/g, "").split("=")[0]!;
    if (s.indexOf(bare.toLowerCase()) !== -1) return true;
  }
  return false;
}

export function validateMutations(
  raw: unknown,
  elements: SnapshotElement[],
  opts: { deniedPaths?: string[] } = {}
): ValidationResult {
  const errors: ValidationError[] = [];
  const known = new Set(elements.map((e) => e.path));
  const denied = new Set(opts.deniedPaths ?? []);

  // 1. Shape. An unknown op is rejected, never guessed at.
  const parsed = MutationSet.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues.slice(0, 8)) {
      const idx = typeof issue.path[0] === "number" ? issue.path[0] : -1;
      errors.push({
        index: idx,
        op: String((raw as any)?.[idx]?.op ?? "?"),
        selector: String((raw as any)?.[idx]?.selector ?? "?"),
        reason: `schema: ${issue.message} at ${issue.path.join(".")}`,
      });
    }
    return { ok: false, mutations: [], errors, selectorsChecked: 0, selectorsMatched: 0 };
  }

  const mutations = parsed.data;
  let checked = 0;
  let matched = 0;

  mutations.forEach((m, index) => {
    for (const sel of selectorsOf(m)) {
      checked++;

      // 2. The selector must exist in the outline the agent was given.
      if (!known.has(sel)) {
        errors.push({
          index, op: m.op, selector: sel,
          reason: "no element with this selector exists on the page",
          nearest: nearestSelectors(sel, elements),
        });
        continue;
      }
      matched++;

      // 3. Denylist. Enforced here as well as in Cedar policy (PLAN §2.2).
      if (isDenied(sel) || denied.has(sel)) {
        errors.push({
          index, op: m.op, selector: sel,
          reason: "this element is protected and may never be modified",
        });
      }
    }

    // 4. Value and property allowlists.
    if (m.op === "replace_text" && m.value.length > MAX_TEXT_LENGTH) {
      errors.push({ index, op: m.op, selector: m.selector, reason: `text exceeds ${MAX_TEXT_LENGTH} characters` });
    }
    if (m.op === "set_attr" && !(ATTR_ALLOWLIST as readonly string[]).includes(m.name)) {
      errors.push({ index, op: m.op, selector: m.selector, reason: `attribute "${m.name}" is not permitted` });
    }
    if (m.op === "set_style" || m.op === "set_media_style") {
      for (const prop of Object.keys(m.props)) {
        if (!(STYLE_PROP_ALLOWLIST as readonly string[]).includes(prop)) {
          errors.push({ index, op: m.op, selector: m.selector, reason: `style property "${prop}" is not permitted` });
        }
      }
    }
    // Reordering something relative to itself is always a mistake.
    if ("target" in m && m.target === m.selector) {
      errors.push({ index, op: m.op, selector: m.selector, reason: "selector and target are the same element" });
    }
  });

  return { ok: errors.length === 0, mutations, errors, selectorsChecked: checked, selectorsMatched: matched };
}
