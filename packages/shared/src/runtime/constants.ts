/**
 * Values shared between the snippet (browser, zod-free) and the server side.
 * Nothing in `runtime/` may import zod — the snippet bundles this file and has
 * an 8KB gzipped budget. The bundle guard in packages/snippet/esbuild.config.mjs
 * enforces that.
 */

// --- anti-flicker & manifest caching (PLAN.md §6 P3) -------------------------
/** Hard ceiling on how long the page may stay hidden waiting for a variant. */
export const ANTIFLICKER_TIMEOUT_MS = 300;
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
