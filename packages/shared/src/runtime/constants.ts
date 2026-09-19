/**
 * Values shared between the snippet (browser, zod-free) and the server side.
 * Nothing in `runtime/` may import zod — the snippet bundles this file and has
 * an 8KB gzipped budget. The bundle guard in packages/snippet/esbuild.config.mjs
 * enforces that.
 */

// --- anti-flicker & manifest caching (PLAN.md §6 P3) -------------------------
/**
 * How long the snippet will wait for the manifest before giving up on this
 * pageview and revealing the original.
 *
 * Measured, not guessed. The plan originally specified ~300ms, which turned out
 * to be unachievable: on a throttled 4G connection the manifest request cannot
 * even begin until g.js has itself downloaded (~790ms into the page load), and
 * the round trip alone costs 150ms of latency. At 300ms the experiment silently
 * never ran for slow mobile visitors — exactly the segment this product is about.
 *
 * 1000ms is still tighter than every commercial CRO tool (VWO defaults to 1000ms,
 * Optimizely to several seconds) and is bounded by TOTAL below, so a hung API
 * can never leave a page blank.
 */
export const ANTIFLICKER_TIMEOUT_MS = 1000;
/** Absolute ceiling on staying hidden, whatever else is happening. */
export const ANTIFLICKER_TOTAL_MS = 1500;
/**
 * Budgets for ?gx_preview — the dashboard's variant-diff screen.
 *
 * A preview deliberately bypasses the CDN so a draft can never be edge-cached
 * and served to a real visitor, which means it pays full origin latency
 * (a cold Lambda is ~2s). Under the visitor budget the reveal timer wins, the
 * snippet correctly refuses to mutate after reveal, and the review screen then
 * shows the *control* in both frames while labelling one of them the
 * challenger — a silent wrong answer on the one screen whose entire job is to
 * show the difference.
 *
 * These apply only when gx_preview is present. No real visitor can be held for
 * this long: the visitor path still uses ANTIFLICKER_* above.
 */
export const PREVIEW_TIMEOUT_MS = 6000;
export const PREVIEW_TOTAL_MS = 8000;
/** Manifest edge-cache window. Also the kill-switch latency we demo. */
export const MANIFEST_MAX_AGE_S = 30;
export const MANIFEST_SWR_S = 300;

// --- mutation schema limits (PLAN.md §4.3) -----------------------------------
export const MAX_TEXT_LENGTH = 160;

export const MUTATION_OPS = [
  "replace_text",
  "set_attr",
  "set_style",
  "set_media_style",
  "add_class",
  "remove_class",
  "hide",
  "show",
  "move_before",
  "move_after",
  "swap",
] as const;
export type MutationOp = (typeof MUTATION_OPS)[number];

/** Attributes the agent may set. Anything else is rejected. */
export const ATTR_ALLOWLIST = [
  "href",
  "alt",
  "title",
  "aria-label",
  "placeholder",
] as const;

/** CSS properties the agent may set. Deliberately layout/typography only. */
export const STYLE_PROP_ALLOWLIST = [
  "display",
  "width",
  "max-width",
  "margin",
  "margin-top",
  "margin-bottom",
  "padding",
  "font-size",
  "font-weight",
  "line-height",
  "text-align",
  "background-color",
  "color",
  "border-radius",
  "order",
  "position",
  "top",
  "gap",
  "flex-direction",
  "align-items",
  "justify-content",
] as const;

/**
 * Selectors the agent may never target. Enforced in code as well as in Cedar
 * policy — belt and braces, PLAN.md §2.2 rule 3 and §4.3 step 3.
 */
export const SELECTOR_DENYLIST = [
  "[data-gx-deny]",
  "[data-gx-deny] *",
  "input",
  "script",
  "iframe",
  "form[action]",
] as const;

/** Media queries used by `set_media_style`. Must match Site A's breakpoints. */
export const MEDIA_QUERIES = {
  mobile: "(max-width: 767px)",
  desktop: "(min-width: 768px)",
} as const;

// --- behaviour capture (PLAN.md §6 P4) ---------------------------------------
export const SCROLL_BANDS = [25, 50, 75, 100] as const;

export const FRICTION_THRESHOLDS = {
  rageClickCount: 3,
  rageClickWindowMs: 800,
  rageClickRadiusPx: 40,
  deadClickSettleMs: 500,
  backExitMs: 4000,
  sessionIdleMs: 30 * 60 * 1000,
} as const;

/** Batching policy for /collect. */
export const BATCH = { maxEvents: 25, flushIntervalMs: 5000 } as const;

// --- DOM snapshot (PLAN.md §6 P5) --------------------------------------------
export const SNAPSHOT_SELECTOR =
  "a, button, h1, h2, h3, h4, p, img, section, header, footer, form, [role]";

/** Also capture any element occupying more than this share of the viewport. */
export const SNAPSHOT_MIN_AREA_FRAC = 0.01;

/** Redaction patterns applied before a snapshot leaves the browser. */
export const REDACT_PATTERNS: RegExp[] = [
  /[\w.+-]+@[\w-]+\.[\w.]+/g,
  /\+?\d[\d\s().-]{7,}\d/g,
];
