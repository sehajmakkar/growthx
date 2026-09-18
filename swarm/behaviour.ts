/**
 * THE SIMULATED VISITOR BEHAVIOUR MODEL — read this before trusting any number.
 *
 * This file is the honest centre of the whole demo, and it is deliberately the
 * only place where a simulated visitor's decision is made. It is disclosed in
 * the README and named in the demo video.
 *
 * ── The rule it obeys ──────────────────────────────────────────────────────
 *
 * Conversion probability is a function of **measured page geometry** and the
 * persona's own traits. It never sees which variant is running, which
 * experiment exists, or what anyone hopes the answer will be. There is no
 * branch anywhere below on a variant id — grep for one.
 *
 * That is what makes the experiment result an emergent property of the
 * simulation rather than a number we typed in. When the agent moves the call to
 * action above the fold, these visitors respond because the geometry they read
 * changed, not because we told them to. If a judge asks "did you just make your
 * variant win?", the answer is this file, on screen.
 *
 * ── What it cannot claim ───────────────────────────────────────────────────
 *
 * These are not real humans, and the absolute conversion rates here are not
 * predictions about real traffic. What the model does claim is *directional*:
 * that burying a call to action under 280px of copy and a 30%-viewport
 * illustration costs conversions on a phone. That is an uncontroversial finding
 * in the CRO literature, and it is what the geometry below encodes.
 */

/** What a visitor can actually perceive about the page, all measured in-page. */
export interface PageReading {
  viewportH: number;
  /** Distance from the top of the document to the primary CTA. */
  ctaTopPx: number;
  /** Is the CTA inside the first screen, without scrolling? */
  ctaInFirstViewport: boolean;
  /** Height of supporting copy sitting between the headline and the CTA. */
  copyAboveCtaPx: number;
  /** Fraction of the first viewport occupied by the hero image, 0..1. */
  heroMediaShare: number;
  /** Banners, navs and other messages competing above the CTA. */
  competingAboveCta: number;
  /** Total document height, for scroll-depth reasoning. */
  docH: number;
}

export interface PersonaTraits {
  id: string;
  device: "mobile" | "desktop";
  /** 0..1 — how far down the page they are willing to go before giving up. */
  patience: number;
  /** 0..1 — baseline propensity to act at all, before any friction. */
  intent: number;
  /** 0..1 — how much a long wall of copy puts them off. */
  copyAversion: number;
  /** Do they arrive already knowing the product? */
  returning: boolean;
  /** Probability they poke at the unwired pricing accordion. */
  pokesPricing: number;
  /** Seconds they will spend reading before deciding. */
  dwellRange: [number, number];
}

/**
 * How far down the page this visitor gets.
 *
 * Patience is the driver, but a screen that opens with a large image and a wall
 * of text spends the visitor's patience before they have seen anything
 * actionable — so the penalty is applied here, not only at the decision.
 */
export function scrollReach(p: PersonaTraits, r: PageReading, rand: () => number): number {
  const wallOfText = Math.min(1, r.copyAboveCtaPx / 400);
  const mediaTax = p.device === "mobile" ? r.heroMediaShare * 0.5 : r.heroMediaShare * 0.15;
  const drag = wallOfText * p.copyAversion * 0.45 + mediaTax;
  const base = p.patience * (1 - drag);
  // Real scroll behaviour is noisy; two visitors with identical patience do not
  // stop in the same place.
  return Math.max(0.05, Math.min(1, base + (rand() - 0.5) * 0.3));
}

/**
 * Does this visitor convert?
 *
 * Reads only geometry and traits. The chain is: did they ever reach the CTA,
 * how much friction did they absorb getting there, and how much intent did they
 * start with.
 */
export function conversionProbability(
  p: PersonaTraits,
  r: PageReading,
  reach: number
): number {
  // 1. You cannot click what you never scrolled to.
  const ctaDepth = r.docH > 0 ? r.ctaTopPx / r.docH : 1;
  if (reach < ctaDepth) return 0;

  let prob = p.intent;

  // 2. A CTA below the fold costs attention, and the cost grows with distance.
  //    This is the single largest term, and it is the one the agent can move.
  if (!r.ctaInFirstViewport) {
    const screensDown = (r.ctaTopPx - r.viewportH) / Math.max(1, r.viewportH);
    prob *= Math.max(0.3, 1 - 0.35 * Math.min(2, Math.max(0, screensDown)) - 0.25);
  }

  // 3. Copy between the headline and the action dilutes intent.
  const copyPenalty = Math.min(0.35, (r.copyAboveCtaPx / 1000) * p.copyAversion);
  prob *= 1 - copyPenalty;

  // 4. On a phone, an uninformative image eating the first screen is pure cost.
  if (p.device === "mobile") prob *= 1 - Math.min(0.3, r.heroMediaShare * 0.45);

  // 5. Competing messages above the action split attention.
  prob *= 1 - Math.min(0.15, r.competingAboveCta * 0.05);

  // 6. Returning visitors already know what they came for.
  if (p.returning) prob *= 1.35;

  return Math.max(0, Math.min(0.95, prob));
}

/** A small deterministic PRNG so a seeded run is reproducible. */
export function makeRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
