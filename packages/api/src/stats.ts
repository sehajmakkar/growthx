/**
 * The statistics. Deliberately a separate module with no database and no model
 * in it, so the arithmetic can be read and checked on its own.
 *
 * Nothing here is ever done by the language model. The agent is given these
 * numbers and asked to explain them; if it were asked to compute them, every
 * figure in the product would inherit the model's arithmetic, and the evidence
 * trail would stop meaning anything. PLAN §2.2.
 */

/** 95% two-sided. */
const Z = 1.959963985;

export interface Interval { lo: number; hi: number }

/**
 * Wilson score interval, not the textbook normal approximation.
 *
 * At the sample sizes a real landing-page test reaches in a week — a couple of
 * hundred sessions an arm, conversion in the low tens of percent — the Wald
 * interval is visibly wrong: it is too narrow, and near 0 or 1 it produces
 * bounds outside [0,1], which would render as a confidence interval hanging off
 * the end of the chart. Wilson stays inside the range and keeps roughly its
 * nominal coverage at small n.
 */
export function wilson(successes: number, trials: number): Interval {
  if (trials <= 0) return { lo: 0, hi: 0 };
  const p = successes / trials;
  const denom = 1 + (Z * Z) / trials;
  const centre = (p + (Z * Z) / (2 * trials)) / denom;
  const half = (Z / denom) * Math.sqrt((p * (1 - p)) / trials + (Z * Z) / (4 * trials * trials));
  return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

/**
 * Newcombe's method 10 for the difference between two proportions, built from
 * the two Wilson intervals.
 *
 * Using a Wald interval on the difference would be the easy thing and would
 * overstate certainty at exactly the sample sizes this product reports on —
 * which is the one direction an experiment tool must never err in. A test that
 * says "significant" too readily is worse than no test, because the team acts
 * on it.
 */
export function differenceInterval(
  aSuccess: number, aTrials: number, bSuccess: number, bTrials: number
): Interval {
  if (aTrials <= 0 || bTrials <= 0) return { lo: 0, hi: 0 };
  const p1 = aSuccess / aTrials;
  const p2 = bSuccess / bTrials;
  const w1 = wilson(aSuccess, aTrials);
  const w2 = wilson(bSuccess, bTrials);
  const diff = p2 - p1;
  return {
    lo: diff - Math.sqrt((p2 - w2.lo) ** 2 + (w1.hi - p1) ** 2),
    hi: diff + Math.sqrt((w2.hi - p2) ** 2 + (p1 - w1.lo) ** 2),
  };
}

/** Two-proportion z test, pooled. Reported alongside the interval, never instead. */
export function pValue(
  aSuccess: number, aTrials: number, bSuccess: number, bTrials: number
): number | null {
  if (aTrials <= 0 || bTrials <= 0) return null;
  const pooled = (aSuccess + bSuccess) / (aTrials + bTrials);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / aTrials + 1 / bTrials));
  if (se === 0) return null;
  const z = (bSuccess / bTrials - aSuccess / aTrials) / se;
  return 2 * (1 - normalCdf(Math.abs(z)));
}

/** Abramowitz & Stegun 7.1.26 — accurate to ~1e-7, which is far beyond what
 *  any decision here turns on. */
function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 +
    t * (-1.821255978 + t * 1.330274429))));
  return x > 0 ? 1 - p : p;
}

/**
 * Sessions per arm needed to detect a given absolute lift at 80% power, 95%
 * two-sided. Shown on screen so "not yet decisive" comes with a number rather
 * than a shrug — the honest answer to "is it done?" is "no, and here is how
 * much more traffic it needs".
 */
export function requiredPerArm(baseline: number, absoluteLift: number): number | null {
  if (absoluteLift <= 0 || baseline <= 0 || baseline >= 1) return null;
  const p2 = Math.min(0.999, baseline + absoluteLift);
  const pBar = (baseline + p2) / 2;
  const zA = Z, zB = 0.8416212336; // 80% power
  const n = ((zA * Math.sqrt(2 * pBar * (1 - pBar)) + zB *
    Math.sqrt(baseline * (1 - baseline) + p2 * (1 - p2))) ** 2) / (absoluteLift ** 2);
  return Math.ceil(n);
}

export type DecisionState =
  | "not_yet_decisive"
  | "no_difference"
  | "challenger_won"
  | "control_won"
  | "guardrail_breach";

/**
 * The decision, as a state rather than a number.
 *
 * Two rules do the work. The interval on the difference must exclude zero —
 * and separately, each arm must have reached the sample size the experiment
 * was designed for. Both matter: an interval can exclude zero early by chance,
 * and calling that a win is how teams end up shipping noise. When it has not
 * reached that size, the honest answer is "not yet", never "no difference".
 */
export function decide(input: {
  controlSuccess: number; controlTrials: number;
  challengerSuccess: number; challengerTrials: number;
  minPerArm: number;
  guardrailBreached: boolean;
}): { state: DecisionState; reason: string } {
  const { controlTrials, challengerTrials, minPerArm } = input;

  if (input.guardrailBreached) {
    return {
      state: "guardrail_breach",
      reason: "The guardrail moved the wrong way. Whatever happened to the primary metric, this variant is not shippable as it stands.",
    };
  }

  const ci = differenceInterval(
    input.controlSuccess, controlTrials, input.challengerSuccess, challengerTrials);
  const excludesZero = ci.lo > 0 || ci.hi < 0;
  const underpowered = controlTrials < minPerArm || challengerTrials < minPerArm;

  if (underpowered) {
    return {
      state: "not_yet_decisive",
      reason: excludesZero
        ? `The interval currently excludes zero, but neither arm has reached the ${minPerArm} sessions this experiment was designed for. Early separation is the most common way an A/B test lies, so this is not being called.`
        : `Neither arm has reached the ${minPerArm} sessions this experiment was designed for, and the interval still includes zero.`,
    };
  }
  if (!excludesZero) {
    return {
      state: "no_difference",
      reason: "The experiment reached its planned size and the interval still includes zero. That is a result: this change does not move the metric.",
    };
  }
  return ci.lo > 0
    ? { state: "challenger_won", reason: "The challenger is ahead and the interval excludes zero at the planned sample size." }
    : { state: "control_won", reason: "The control is ahead and the interval excludes zero at the planned sample size." };
}

export const pct = (x: number) => Math.round(x * 1000) / 10;
