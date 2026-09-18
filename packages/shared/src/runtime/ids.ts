/**
 * Prefixed, readable identifiers — `exp_k3f9a2`, `sess_9dk2ls`.
 *
 * Readable on purpose: these appear in the dashboard, in agent prompts and in
 * the demo video, and `exp_k3f9a2` is easier to talk about on camera than a
 * UUID. Zod-free so the browser snippet can generate visitor and session ids
 * with the same function the server uses.
 */
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  // Structural, not `Crypto` — this package has no DOM lib so the browser
  // snippet and Node share one definition.
  const g = globalThis as unknown as {
    crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array };
  };
  if (typeof g.crypto?.getRandomValues === "function") {
    g.crypto.getRandomValues(out);
    return out;
  }
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

export function newId(prefix: string, length = 10): string {
  const bytes = randomBytes(length);
  let s = "";
  for (let i = 0; i < length; i++) {
    s += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return prefix ? `${prefix}_${s}` : s;
}

export const ID_PREFIX = {
  site: "site",
  session: "sess",
  visitor: "vis",
  experiment: "exp",
  variant: "var",
  learning: "learn",
  opportunity: "opp",
  snapshot: "snap",
  aggregate: "agg",
  digest: "dig",
  approval: "appr",
  report: "rep",
  run: "run",
} as const;
