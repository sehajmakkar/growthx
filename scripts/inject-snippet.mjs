#!/usr/bin/env node
/**
 * Stamps the real snippet tag into Site A's HTML at build time.
 *
 * Idempotent: it replaces the marker plus any tag already following it, so
 * rebuilding never accumulates duplicates. This is exactly the one line a
 * customer would paste, which is why it is rendered verbatim rather than
 * assembled by a framework.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, ok, bad, dim, step } from "./env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = loadEnv();
const cdn = env.GX_CDN_URL;
const siteId = env.GX_SITE_ID || "site_corrick";

if (!cdn) {
  console.error(bad("GX_CDN_URL not set — run `pnpm deploy:infra` first."));
  process.exit(1);
}

const tag = `<script src="${cdn}/g.js" data-site="${siteId}"></script>`;
const pub = path.join(root, "sites/site-a/public");
// readdirSync({recursive}) rather than fs.globSync: the latter is Node 22+.
const files = readdirSync(pub, { recursive: true })
  .filter((f) => String(f).endsWith(".html"))
  .map((f) => path.join(pub, String(f)));

console.log(step("Installing the snippet into Site A"));
for (const file of files) {
  const before = readFileSync(file, "utf8");
  const after = before.replace(
    /<!-- GROWTHX_SNIPPET -->(\s*<script[^>]*g\.js[^>]*><\/script>)?/,
    `<!-- GROWTHX_SNIPPET -->\n    ${tag}`
  );
  if (after !== before) writeFileSync(file, after);
  console.log(ok(path.relative(root, file)));
}
console.log(dim(`\n  ${tag}\n`));
