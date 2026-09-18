import type { PersonaTraits } from "./behaviour.js";

/**
 * Six visitors, chosen to span the behaviours a real landing page sees rather
 * than to produce a particular outcome. The mix is deliberately mobile-heavy,
 * which is true of most B2B marketing traffic arriving from social or email.
 *
 * Traits were set by asking "what would this person do", not by tuning until a
 * variant won. None of them knows an experiment exists.
 */
export interface Persona extends PersonaTraits {
  label: string;
  /** Relative frequency in the traffic mix. */
  weight: number;
  viewport: { width: number; height: number };
  referrers: string[];
}

export const PERSONAS: Persona[] = [
  {
    id: "mobile-skimmer",
    label: "Skims on a phone, gone in seconds",
    device: "mobile",
    weight: 30,
    viewport: { width: 390, height: 844 },
    patience: 0.25,
    intent: 0.14,
    copyAversion: 0.9,
    returning: false,
    pokesPricing: 0.05,
    dwellRange: [2, 7],
    referrers: ["https://t.co/", "https://www.linkedin.com/", ""],
  },
  {
    id: "mobile-considerer",
    label: "Reads properly on a phone, reaches pricing",
    device: "mobile",
    weight: 22,
    viewport: { width: 390, height: 844 },
    patience: 0.7,
    intent: 0.3,
    copyAversion: 0.5,
    returning: false,
    pokesPricing: 0.35,
    dwellRange: [12, 30],
    referrers: ["https://www.google.com/", "https://news.ycombinator.com/", ""],
  },
  {
    id: "desktop-researcher",
    label: "Compares tiers on a laptop, pokes at everything",
    device: "desktop",
    weight: 18,
    viewport: { width: 1440, height: 900 },
    patience: 0.9,
    intent: 0.26,
    copyAversion: 0.25,
    returning: false,
    pokesPricing: 0.7,
    dwellRange: [25, 60],
    referrers: ["https://www.google.com/", "https://www.producthunt.com/", ""],
  },
  {
    id: "desktop-decisive",
    label: "Knows what they want, straight to the action",
    device: "desktop",
    weight: 12,
    viewport: { width: 1440, height: 900 },
    patience: 0.55,
    intent: 0.45,
    copyAversion: 0.3,
    returning: false,
    pokesPricing: 0.1,
    dwellRange: [6, 18],
    referrers: ["https://www.google.com/", ""],
  },
  {
    id: "returning-comparer",
    label: "Second visit, going straight to pricing",
    device: "desktop",
    weight: 10,
    viewport: { width: 1440, height: 900 },
    patience: 0.85,
    intent: 0.4,
    copyAversion: 0.2,
    returning: true,
    pokesPricing: 0.5,
    dwellRange: [15, 40],
    referrers: [""],
  },
  {
    id: "accidental",
    label: "Wrong page, leaves almost immediately",
    device: "mobile",
    weight: 8,
    viewport: { width: 390, height: 844 },
    patience: 0.08,
    intent: 0.02,
    copyAversion: 1,
    returning: false,
    pokesPricing: 0,
    dwellRange: [1, 3],
    referrers: ["https://www.google.com/", "https://t.co/"],
  },
];

export function pickPersona(rand: () => number): Persona {
  const total = PERSONAS.reduce((a, p) => a + p.weight, 0);
  let n = rand() * total;
  for (const p of PERSONAS) {
    n -= p.weight;
    if (n <= 0) return p;
  }
  return PERSONAS[0]!;
}
