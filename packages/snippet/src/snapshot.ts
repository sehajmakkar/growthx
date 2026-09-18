import {
  SNAPSHOT_SELECTOR,
  SNAPSHOT_MIN_AREA_FRAC,
  REDACT_PATTERNS,
} from "@growthx/shared/runtime";
import { domPath, semanticClasses } from "./path.js";

/**
 * The sanitised page outline the variant generator reads.
 *
 * It lives here, in the snippet, for one reason: it calls the *same*
 * `domPath()` that event capture uses. The agent reads a heatmap keyed on
 * selectors from that builder and is then asked to emit selectors for this
 * outline — if the two alphabets ever differed, every generated mutation would
 * silently no-op. Sharing the function is what makes the P6 gate possible.
 *
 * Nothing a visitor typed ever leaves the browser: input values are never read,
 * and anything resembling an email address or phone number is redacted from the
 * text samples.
 */

export interface SnapshotElement {
  path: string;
  tag: string;
  classes: string[];
  textSample: string;
  rect: { x: number; y: number; w: number; h: number };
  fontSizePx: number;
  fontWeight: number;
  isInteractive: boolean;
  aboveFold: boolean;
  childCount: number;
}

export interface SnapshotCapture {
  v: 1;
  path: string;
  capturedAt: number;
  viewport: { w: number; h: number };
  docH: number;
  elements: SnapshotElement[];
}

function redact(text: string): string {
  let out = text;
  for (const re of REDACT_PATTERNS) out = out.replace(re, "[redacted]");
  return out;
}

/** Direct text only — a section's sample should not be the whole page. */
function ownText(el: Element): string {
  let out = "";
  const kids = el.childNodes;
  for (let i = 0; i < kids.length; i++) {
    const n = kids[i]!;
    if (n.nodeType === 3) out += n.nodeValue ?? "";
  }
  out = out.replace(/\s+/g, " ").trim();
  if (!out) {
    // Fall back to the subtree, which is what makes a button or a link useful.
    out = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  }
  return redact(out).slice(0, 120);
}

function isInteractive(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === "a") return el.hasAttribute("href");
  if (tag === "button" || tag === "select" || tag === "textarea" || tag === "label") return true;
  if (el.getAttribute("role") === "button") return true;
  try {
    if (getComputedStyle(el).cursor === "pointer") return true;
  } catch { /* detached */ }
  return false;
}

export function captureSnapshot(): SnapshotCapture {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const docH = Math.max(
    document.body?.scrollHeight ?? 0,
    document.documentElement?.scrollHeight ?? 0
  );
  const docW = Math.max(document.documentElement?.scrollWidth ?? 0, vw);
  const viewportArea = vw * vh;

  const seen = new Set<Element>();
  const candidates: Element[] = [];

  try {
    const matched = document.querySelectorAll(SNAPSHOT_SELECTOR);
    for (let i = 0; i < matched.length; i++) {
      const el = matched[i]!;
      if (!seen.has(el)) { seen.add(el); candidates.push(el); }
    }
  } catch { /* ignore */ }

  // Anything large enough to dominate a screen matters to layout reasoning even
  // when it is a plain <div> — the hero illustration on Site A is exactly this.
  const all = document.body ? document.body.getElementsByTagName("*") : [];
  for (let i = 0; i < all.length; i++) {
    const el = all[i]!;
    if (seen.has(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width * r.height > viewportArea * SNAPSHOT_MIN_AREA_FRAC) {
      seen.add(el);
      candidates.push(el);
    }
  }

  const elements: SnapshotElement[] = [];
  for (const el of candidates) {
    if (elements.length >= 400) break;

    const tag = el.tagName.toLowerCase();
    if (tag === "script" || tag === "style" || tag === "noscript" || tag === "input") continue;

    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;

    const path = domPath(el);
    if (!path) continue; // no stable selector means the agent could not target it

    let fontSizePx = 16;
    let fontWeight = 400;
    try {
      const cs = getComputedStyle(el);
      fontSizePx = Math.round(parseFloat(cs.fontSize) || 16);
      fontWeight = parseInt(cs.fontWeight, 10) || 400;
      if (cs.display === "none" || cs.visibility === "hidden") continue;
    } catch { /* ignore */ }

    const pageTop = r.top + window.scrollY;
    elements.push({
      path,
      tag,
      classes: semanticClasses(el),
      textSample: ownText(el),
      // Page fractions, matching how events are recorded (PLAN §4.5), so the
      // agent can reason about a click position and an element box in one frame.
      rect: {
        x: Math.round((r.left / docW) * 10000) / 10000,
        y: Math.round((pageTop / docH) * 10000) / 10000,
        w: Math.round((r.width / docW) * 10000) / 10000,
        h: Math.round((r.height / docH) * 10000) / 10000,
      },
      fontSizePx,
      fontWeight,
      isInteractive: isInteractive(el),
      aboveFold: pageTop < vh,
      childCount: el.children.length,
    });
  }

  return {
    v: 1,
    path: location.pathname,
    capturedAt: Date.now(),
    viewport: { w: vw, h: vh },
    docH: Math.round(docH),
    elements,
  };
}
