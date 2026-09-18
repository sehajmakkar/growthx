/**
 * GrowthX snippet — `g.js`.
 *
 * One blocking <script> in <head>. It hides the page, decides which variant this
 * visitor gets, applies a set of structured DOM mutations, and reveals — or gives
 * up and reveals the original. It must never leave a customer's page blank, and
 * it must never show the control and then swap to the challenger, because that
 * flash is the single most visible way a CRO tool looks amateur.
 *
 * Assignment is computed locally from a hash of the visitor id (PLAN.md §9.1).
 * The manifest is per (site, path), never per visitor, so CloudFront can cache
 * it at the edge — which takes a cold Lambda off the critical render path.
 */
import { bucketVariant, ANTIFLICKER_TIMEOUT_MS, ANTIFLICKER_TOTAL_MS, MANIFEST_MAX_AGE_S } from "@growthx/shared/runtime";
import { identify, readCachedManifest, writeCachedManifest } from "./storage.js";
import { applyMutations, type ApplyResult, type Mutation } from "./apply.js";

declare const __GX_API__: string;
declare const __GX_CDN__: string;
declare const __GX_VERSION__: string;

interface ManifestVariant { id: string; mutations: Mutation[] }
interface ManifestExperiment { id: string; path: string; split: Record<string, number>; variants: ManifestVariant[] }
interface Manifest { v: 1; siteId: string; generatedAt: number; conversion: { kind: string; value: string }; experiments: ManifestExperiment[] }

interface GxState {
  version: string;
  siteId: string | null;
  visitorId?: string;
  sessionId?: string;
  isReturning?: boolean;
  experimentId: string | null;
  variantId: string | null;
  /** True once mutations were applied to the DOM. */
  applied: boolean;
  /** True when we bucketed into a variant but refused to apply it — the page
   *  had already been revealed, so mutating would have caused a visible flash.
   *  These sessions must not be attributed to the variant (P4). */
  suppressed: boolean;
  revealedAfterMs: number | null;
  reason: string | null;
  result?: ApplyResult;
  manifestSource: "cache" | "network" | "none";
}

declare global {
  interface Window { __growthx?: GxState }
}

/**
 * Two distinct budgets, and the difference matters.
 *
 * NETWORK: how long we will wait for the manifest before giving up on this
 * pageview entirely. Measured rather than guessed — see the constant's comment.
 *
 * TOTAL: an absolute ceiling on how long the page stays hidden, whatever else
 * is happening. On a slow connection the document itself may still be parsing
 * long after the manifest arrived; we would rather keep waiting (nothing has
 * painted yet anyway) than reveal the control and swap it a moment later. This
 * cap exists so that "keep waiting" can never become "blank page forever".
 */
const NETWORK_BUDGET_MS = ANTIFLICKER_TIMEOUT_MS;
const TOTAL_BUDGET_MS = ANTIFLICKER_TOTAL_MS;

const state: GxState = {
  version: __GX_VERSION__,
  siteId: null,
  experimentId: null,
  variantId: null,
  applied: false,
  suppressed: false,
  revealedAfterMs: null,
  reason: null,
  manifestSource: "none",
};
window.__growthx = state;

const t0 = Date.now();
let revealed = false;
let manifest: Manifest | null = null;

function currentScript(): HTMLScriptElement | null {
  const cur = document.currentScript as HTMLScriptElement | null;
  if (cur) return cur;
  const all = document.getElementsByTagName("script");
  for (let i = all.length - 1; i >= 0; i--) {
    const s = all[i];
    if (s && s.src && s.src.indexOf("g.js") !== -1) return s;
  }
  return null;
}

function hide(): void {
  try {
    document.documentElement.style.setProperty("visibility", "hidden", "important");
  } catch {
    /* never fatal */
  }
}

/** Idempotent. Called from several paths; only the first one counts. */
function reveal(reason: string): void {
  if (revealed) return;
  revealed = true;
  state.revealedAfterMs = Date.now() - t0;
  state.reason = reason;
  try {
    document.documentElement.style.removeProperty("visibility");
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent("growthx:ready", { detail: { ...state } }));
  } catch {
    /* CustomEvent is unavailable in very old browsers; not worth a polyfill */
  }
}

function whenDomReady(fn: () => void): void {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fn, { once: true });
  } else {
    fn();
  }
}

function forcedVariant(): string | null {
  try {
    return new URLSearchParams(location.search).get("gx_force");
  } catch {
    return null;
  }
}

function pickExperiment(m: Manifest, path: string): ManifestExperiment | null {
  for (const e of m.experiments) if (e.path === path) return e;
  return null;
}

function run(m: Manifest, visitorId: string): void {
  const experiment = pickExperiment(m, location.pathname);
  if (!experiment) {
    reveal("no-experiment");
    return;
  }

  const forced = forcedVariant();
  const variantId = forced ?? bucketVariant(visitorId, experiment.id, experiment.split);
  state.experimentId = experiment.id;
  state.variantId = variantId;

  const variant = experiment.variants.filter((v) => v.id === variantId)[0];
  if (!variant || !variant.mutations.length) {
    reveal(forced ? "forced-control" : "control");
    return;
  }

  whenDomReady(() => {
    // Refusing to mutate after reveal is what guarantees no flash: either the
    // change lands before anything is visible, or it does not land at all.
    if (revealed) {
      state.suppressed = true;
      return;
    }
    const result = applyMutations(variant.mutations);
    state.result = result;
    state.applied = true;
    reveal("applied");

    // One retry for nodes that render late. Only unresolved selectors are
    // retried, so nothing already on screen is touched a second time.
    if (result.unresolved.length) {
      setTimeout(() => {
        const retry = applyMutations(result.unresolved);
        state.result = {
          applied: result.applied + retry.applied,
          failed: result.failed.concat(retry.failed),
          unresolved: retry.unresolved,
        };
      }, 400);
    }
  });
}

(function boot() {
  const script = currentScript();
  const siteId = script ? script.getAttribute("data-site") : null;
  state.siteId = siteId;

  if (!siteId) {
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
      console.warn("[growthx] missing data-site on the script tag");
    }
    return; // never hid the page, nothing to reveal
  }

  hide();

  // Registered before the fetch, so a hung or unreachable API can never leave
  // the page blank. This ordering is the whole safety property.
  setTimeout(() => reveal("network-timeout"), NETWORK_BUDGET_MS);
  setTimeout(() => reveal("total-timeout"), TOTAL_BUDGET_MS);

  const id = identify();
  state.visitorId = id.visitorId;
  state.sessionId = id.sessionId;
  state.isReturning = id.isReturning;

  // A repeat visit inside the cache window needs no network at all, which is
  // what makes the second pageview reliably flicker-free on a slow connection.
  const cached = readCachedManifest<Manifest>(MANIFEST_MAX_AGE_S * 1000);
  if (cached) {
    manifest = cached;
    state.manifestSource = "cache";
    run(cached, id.visitorId);
    return;
  }

  // Served from the CDN edge, not the API origin: a cache hit here is the
  // difference between ~30ms and ~500ms on a throttled connection, and the
  // network budget above is only 300ms.
  const url = __GX_CDN__ + "/manifest?site=" + encodeURIComponent(siteId) +
    "&path=" + encodeURIComponent(location.pathname);

  fetch(url, { credentials: "omit", mode: "cors" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("manifest " + r.status))))
    .then((m: Manifest) => {
      manifest = m;
      state.manifestSource = "network";
      writeCachedManifest(m);
      run(m, id.visitorId);
    })
    .catch(() => reveal("manifest-error"));
})();
