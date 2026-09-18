/**
 * GrowthX snippet — `g.js`.
 *
 * P0 placeholder. The real implementation lands in P3 (bucketing, mutation
 * application, anti-flicker) and P4 (event capture). This file exists now so the
 * build pipeline, the size budget and the CDN deploy are all proven before any
 * behaviour depends on them.
 *
 * Nothing secret ever goes in here: this file is public by design and carries
 * only a siteId. PLAN.md §7 §B7.
 */
import { ANTIFLICKER_TIMEOUT_MS } from "@growthx/shared/runtime";

declare global {
  interface Window {
    __growthx?: { version: string; siteId: string | null };
  }
}

const VERSION = "0.0.0-p0";

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

(function boot() {
  const script = currentScript();
  const siteId = script ? script.getAttribute("data-site") : null;

  window.__growthx = { version: VERSION, siteId: siteId };

  if (!siteId) {
    // Fail silently in production, loudly in development. A customer's page must
    // never break because our snippet was misconfigured.
    if (location.hostname === "localhost") {
      console.warn("[growthx] missing data-site attribute on the script tag");
    }
    return;
  }

  console.info(
    "[growthx] " + VERSION + " loaded for " + siteId +
    " (P0 placeholder — anti-flicker budget " + ANTIFLICKER_TIMEOUT_MS + "ms)"
  );
})();
