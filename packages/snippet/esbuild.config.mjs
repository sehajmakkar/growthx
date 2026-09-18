import { build, context } from "esbuild";
import { gzipSync } from "node:zlib";
import { readFileSync, statSync } from "node:fs";

// The API base is baked in at build time rather than discovered at runtime:
// one fewer round trip on the critical render path, and the snippet stays a
// single file with no configuration for the customer to get wrong.
function envValue(key, fallback) {
  for (const file of ["../../.env.local", "../../.env"]) {
    try {
      for (const line of readFileSync(new URL(file, import.meta.url), "utf8").split("\n")) {
        const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (m && m[1] === key) return m[2].trim().replace(/^["']|["']$/g, "");
      }
    } catch {}
  }
  return fallback;
}

const API_BASE = envValue("GX_API_BASE", "");
const CDN_BASE = envValue("GX_CDN_URL", "");
if (!API_BASE || !CDN_BASE) {
  console.error("\x1b[31m✗ GX_API_BASE / GX_CDN_URL not set — run `pnpm deploy:infra` first.\x1b[0m");
  process.exit(1);
}
const VERSION = "0.3.0-p3";

// The snippet ships to every visitor of every customer site, so it is built as
// a single dependency-free IIFE targeting older browsers than the dashboard.
// PLAN.md §6 P3 sets the budget: under 8KB gzipped.
const BUDGET_GZIP_BYTES = 8 * 1024;


/**
 * Guard: the snippet must never bundle a node_modules dependency. It is served
 * to every visitor of every customer site and has an 8KB gzipped budget — an
 * accidental `import { X } from "@growthx/shared"` (the zod surface) blows it
 * by 2x. Import from "@growthx/shared/runtime" instead.
 */
const noDepsPlugin = {
  name: "no-runtime-deps",
  setup(b) {
    b.onResolve({ filter: /.*/ }, (args) => {
      if (args.kind === "entry-point") return null;
      if (args.importer.includes("node_modules")) return null;
      if (args.path.startsWith(".") || args.path.startsWith("@growthx/")) return null;
      return {
        errors: [
          {
            text:
              `snippet may not depend on "${args.path}" — it must stay dependency-free. ` +
              `If you need a shared value, put it in packages/shared/src/runtime/.`,
          },
        ],
      };
    });
  },
};

/** @type {import("esbuild").BuildOptions} */
const options = {
  entryPoints: ["src/index.ts"],
  outfile: "dist/g.js",
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2018", "chrome70", "safari12", "firefox68"],
  legalComments: "none",
  sourcemap: false,
  logLevel: "info",
  plugins: [noDepsPlugin],
  define: {
    __GX_API__: JSON.stringify(API_BASE),
    __GX_CDN__: JSON.stringify(CDN_BASE),
    __GX_VERSION__: JSON.stringify(VERSION),
  },
};

if (process.argv.includes("--watch")) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("watching packages/snippet/src …");
} else {
  await build(options);
  const raw = readFileSync(options.outfile);
  const gz = gzipSync(raw).length;
  const pct = Math.round((gz / BUDGET_GZIP_BYTES) * 100);
  const line = `g.js  ${statSync(options.outfile).size} B raw  ·  ${gz} B gzipped  ·  ${pct}% of the 8KB budget  ·  api ${API_BASE}`;
  if (gz > BUDGET_GZIP_BYTES) {
    console.error(`\x1b[31m✗ ${line} — OVER BUDGET\x1b[0m`);
    process.exit(1);
  }
  console.log(`\x1b[32m✓ ${line}\x1b[0m`);
}
