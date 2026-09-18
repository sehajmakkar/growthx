import { FRICTION_THRESHOLDS, SCROLL_BANDS, SNAPSHOT_SELECTOR } from "@growthx/shared/runtime";
import { domPath, meaningfulTarget } from "./path.js";
import { record, flush } from "./collect.js";

/**
 * Behavioural capture. Everything spatial is recorded as fractions, never as
 * raw pixels (PLAN.md §4.5): a click at (195, 420) means nothing across screen
 * sizes, but "62% across and 44% down the primary CTA" means the same thing on
 * a phone and on a 27-inch monitor. Getting this wrong would make every heatmap
 * plausible-looking and wrong, which is worse than having no heatmap.
 */

interface Ctx {
  experimentId: string | null;
  variantId: string | null;
}

function frac(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 10000) / 10000 : 0;
}

function docHeight(): number {
  const b = document.body;
  const e = document.documentElement;
  return Math.max(b?.scrollHeight ?? 0, e?.scrollHeight ?? 0, e?.clientHeight ?? 0);
}

function spatial(el: Element | null, clientX: number, clientY: number) {
  const docH = docHeight();
  const docW = Math.max(document.documentElement.scrollWidth, window.innerWidth);
  const pageX = clientX + window.scrollX;
  const pageY = clientY + window.scrollY;

  let elemFrac: { x: number; y: number } | null = null;
  if (el) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      elemFrac = { x: frac(clientX - r.left, r.width), y: frac(clientY - r.top, r.height) };
    }
  }

  return {
    elemFrac,
    pageFrac: { x: frac(pageX, docW), y: frac(pageY, docH) },
    vpFrac: { x: frac(clientX, window.innerWidth), y: frac(clientY, window.innerHeight) },
    scrollY: Math.round(window.scrollY),
    docH: Math.round(docH),
  };
}

/**
 * Does this element invite a click? Cursor, role and tabindex are the signals a
 * visitor actually reads. Without this check every click on a card's padding
 * counts as friction, which inflates the exact signal the agent is meant to
 * diagnose — a dead click should mean "I tried to use this and nothing
 * happened", not "I clicked some whitespace".
 */
function looksClickable(el: Element | null): boolean {
  let node: Element | null = el;
  for (let i = 0; node && i < 3; i++) {
    if (node.hasAttribute("role") || node.hasAttribute("tabindex")) return true;
    try {
      if (getComputedStyle(node).cursor === "pointer") return true;
    } catch { /* detached node */ }
    node = node.parentElement;
  }
  return false;
}

function isInteractive(el: Element | null): boolean {
  let node: Element | null = el;
  for (let i = 0; node && i < 4; i++) {
    const tag = node.tagName.toLowerCase();
    if (tag === "a" && node.hasAttribute("href")) return true;
    if (tag === "button" || tag === "input" || tag === "select" || tag === "textarea" || tag === "label") return true;
    if (node.getAttribute("role") === "button" || node.hasAttribute("onclick")) return true;
    node = node.parentElement;
  }
  return false;
}

export function observe(ctx: Ctx, conversion: { kind: string; value: string }): (useBeacon?: boolean) => void {
  const ids = () => ({ experimentId: ctx.experimentId, variantId: ctx.variantId });
  let converted = false;

  // ── clicks, dead clicks, rage clicks ────────────────────────────────────
  const recent: { x: number; y: number; t: number }[] = [];

  document.addEventListener(
    "click",
    (e) => {
      const ev = e as MouseEvent;
      const raw = ev.target as Element | null;
      const el = meaningfulTarget(raw);
      const selector = domPath(el);
      const geo = spatial(el, ev.clientX, ev.clientY);

      record("click", { ...ids(), selector, ...geo });

      // Rage: three or more clicks inside 800ms within 40px of each other.
      const now = Date.now();
      recent.push({ x: ev.clientX, y: ev.clientY, t: now });
      while (recent.length && now - recent[0]!.t > FRICTION_THRESHOLDS.rageClickWindowMs) recent.shift();
      const near = recent.filter(
        (p) =>
          Math.abs(p.x - ev.clientX) < FRICTION_THRESHOLDS.rageClickRadiusPx &&
          Math.abs(p.y - ev.clientY) < FRICTION_THRESHOLDS.rageClickRadiusPx
      );
      if (near.length >= FRICTION_THRESHOLDS.rageClickCount) {
        record("rage_click", {
          ...ids(), selector, ...geo,
          payload: { clickCount: near.length, withinMs: now - near[0]!.t },
        });
        recent.length = 0;
      }

      // Dead: something that looked clickable, was not, and where nothing
      // changed and nothing navigated. This is exactly the unwired accordion in
      // .tier-2 — and deliberately not the card's padding around it.
      if (!isInteractive(raw) && looksClickable(raw)) {
        let mutated = false;
        const mo = new MutationObserver(() => { mutated = true; });
        mo.observe(document.body, { childList: true, subtree: true, attributes: true });
        const before = location.href;
        setTimeout(() => {
          mo.disconnect();
          if (!mutated && location.href === before) {
            record("dead_click", { ...ids(), selector, ...geo });
          }
        }, FRICTION_THRESHOLDS.deadClickSettleMs);
      }

      // Conversion by selector, checked on the element the visitor actually hit.
      if (conversion.kind === "selector" && el) {
        try {
          if (el.matches(conversion.value) || el.closest(conversion.value)) {
            converted = true;
            record("conversion", { ...ids(), selector, payload: { kind: "selector", value: conversion.value } });
            flush(true);
          }
        } catch { /* a bad selector in config must not break clicks */ }
      }
    },
    true // capture: we see the click even if the page stops propagation
  );

  // ── scroll depth ────────────────────────────────────────────────────────
  let maxScrollFrac = 0;
  const bandsCrossed: number[] = [];
  let scrollTimer: number | null = null;

  function sampleScroll() {
    const docH = docHeight();
    const reached = window.scrollY + window.innerHeight;
    const f = Math.min(1, frac(reached, docH));
    if (f > maxScrollFrac) maxScrollFrac = f;
    for (const band of SCROLL_BANDS) {
      if (maxScrollFrac * 100 >= band && bandsCrossed.indexOf(band) === -1) bandsCrossed.push(band);
    }
  }

  window.addEventListener(
    "scroll",
    () => {
      sampleScroll();
      if (scrollTimer !== null) return;
      scrollTimer = window.setTimeout(() => {
        scrollTimer = null;
        record("scroll", {
          ...ids(),
          scrollY: Math.round(window.scrollY),
          docH: Math.round(docHeight()),
          payload: { maxScrollFrac, bandsCrossed: bandsCrossed.slice() },
        });
      }, 400);
    },
    { passive: true }
  );

  // ── element visibility and dwell ────────────────────────────────────────
  // What the agent reads as `viewed_pct` and `median_time_to_first_view_s`.
  const firstSeen = new Map<Element, number>();
  const visibleSince = new Map<Element, number>();
  const visibleTotal = new Map<Element, number>();
  const t0 = Date.now();

  if (typeof IntersectionObserver !== "undefined") {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target;
          if (entry.isIntersecting) {
            if (!firstSeen.has(el)) firstSeen.set(el, Date.now() - t0);
            visibleSince.set(el, Date.now());
          } else if (visibleSince.has(el)) {
            visibleTotal.set(el, (visibleTotal.get(el) ?? 0) + (Date.now() - visibleSince.get(el)!));
            visibleSince.delete(el);
          }
        }
      },
      { threshold: 0.5 }
    );
    try {
      const nodes = document.querySelectorAll(SNAPSHOT_SELECTOR);
      for (let i = 0; i < nodes.length && i < 200; i++) io.observe(nodes[i]!);
    } catch { /* ignore */ }
  }

  function emitVisibility(snapshot: number) {
    const now = Date.now();
    firstSeen.forEach((ttfv, el) => {
      let total = visibleTotal.get(el) ?? 0;
      if (visibleSince.has(el)) total += now - visibleSince.get(el)!;
      const selector = domPath(el);
      if (!selector) return;
      record("element_view", {
        ...ids(), selector,
        payload: { timeToFirstViewMs: Math.round(ttfv), visibleMs: Math.round(total), snapshot },
      });
    });
  }

  // ── hover dwell on meaningful elements ──────────────────────────────────
  let hoverEl: Element | null = null;
  let hoverStart = 0;
  document.addEventListener(
    "mouseover",
    (e) => {
      const el = meaningfulTarget(e.target as Element);
      if (el === hoverEl) return;
      if (hoverEl && Date.now() - hoverStart > 400) {
        record("dwell", {
          ...ids(), selector: domPath(hoverEl),
          payload: { ms: Date.now() - hoverStart },
        });
      }
      hoverEl = el;
      hoverStart = Date.now();
    },
    { passive: true }
  );

  // ── exit behaviour ──────────────────────────────────────────────────────
  //
  // Deliberately NOT latched. A visitor who switches tabs and comes back is
  // still on the page, and latching would silently discard every subsequent
  // second of visibility — which is what `viewed_pct` and
  // `median_time_to_first_view` are computed from. Each hide emits a cumulative
  // snapshot; aggregation takes the last one per (session, selector) rather
  // than summing them.
  let emitCount = 0;

  /**
   * `useBeacon` is false only when called programmatically. Beaconing here
   * would empty the queue before an awaited flush could see it, which silently
   * reintroduces the very race the caller is trying to avoid.
   */
  function onEnd(useBeacon = true) {
    sampleScroll();
    const elapsed = Date.now() - t0;
    emitVisibility(emitCount++);
    record("dwell", { ...ids(), selector: null, payload: { ms: elapsed, scope: "page", snapshot: emitCount } });

    // A back-exit means "the previous page promised something this one did not
    // deliver". Someone who converted and closed the tab is the opposite of
    // that, and counting them would poison the friction signal.
    let sameOrigin = false;
    try { sameOrigin = !!document.referrer && new URL(document.referrer).origin === location.origin; } catch { /* ignore */ }
    const onConversionPage =
      conversion.kind === "url" && location.pathname.indexOf(conversion.value) !== -1;
    if (sameOrigin && !converted && !onConversionPage && elapsed < FRICTION_THRESHOLDS.backExitMs && emitCount === 1) {
      record("back_exit", { ...ids(), payload: { ms: elapsed } });
    }
    if (useBeacon) flush(true);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") onEnd(true);
  });
  window.addEventListener("pagehide", () => onEnd(true));

  // ── conversion by URL ───────────────────────────────────────────────────
  if (conversion.kind === "url" && location.pathname.indexOf(conversion.value) !== -1) {
    converted = true;
    record("conversion", { ...ids(), payload: { kind: "url", value: conversion.value } });
    flush(true);
  }

  // Returned so the session can be ended deterministically. A real visitor
  // triggers this through pagehide; automation needs to be able to ask for it,
  // because a closed browser context fires nothing and a beacon racing a
  // navigation is not a reliable way to deliver the last events of a session.
  return (useBeacon?: boolean) => onEnd(useBeacon ?? true);
}
