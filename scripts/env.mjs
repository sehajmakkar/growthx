import { readFileSync } from "node:fs";

/**
 * Reads the project's environment the same way every script here does.
 *
 * Two files, both required: `.env` holds secrets you wrote by hand, and
 * `.env.local` holds the deployed URLs that `scripts/outputs.mjs` regenerates
 * on every deploy. Values may be quoted — Neon's URL contains `&`, which breaks
 * shell sourcing unless quoted — so quotes are stripped here.
 */
export function loadEnv(files = ["../.env", "../.env.local"]) {
  const env = {};
  for (const f of files) {
    try {
      for (const line of readFileSync(new URL(f, import.meta.url), "utf8").split("\n")) {
        const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
      }
    } catch {}
  }
  // Real environment variables fill gaps, but .env wins: it is the project's
  // source of truth and a stale exported shell var should never override it.
  const fromShell = Object.fromEntries(
    Object.entries(process.env).filter(([, v]) => v)
  );
  return { ...fromShell, ...env };
}

export const ok = (s) => `\x1b[32m✓\x1b[0m ${s}`;
export const bad = (s) => `\x1b[31m✗\x1b[0m ${s}`;
export const dim = (s) => `\x1b[2m${s}\x1b[0m`;
export const step = (s) => `\n\x1b[1m▸ ${s}\x1b[0m`;
