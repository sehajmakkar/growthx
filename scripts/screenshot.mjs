#!/usr/bin/env node
/**
 * Captures Site A at phone and desktop widths and uploads them to S3.
 *
 * Deliberately a local Playwright script rather than a headless-Chromium Lambda
 * (PLAN §1.2): Site A changes approximately never, and packaging Chromium into a
 * Lambda layer is a well-known time sink that would buy nothing here.
 *
 * These are the backdrop the heatmap overlay is drawn on in P11, so they must be
 * captured with the CONTROL variant forced — an overlay of click data drawn over
 * a screenshot of a *different* variant would be silently, confidently wrong.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { loadEnv, ok, bad, dim, step } from "./env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = loadEnv();
const outDir = path.join(root, "artifacts/shots");
mkdirSync(outDir, { recursive: true });

const outputsPath = path.join(root, "infra/cdk-outputs.json");
const bucket = existsSync(outputsPath)
  ? JSON.parse(readFileSync(outputsPath, "utf8")).GrowthxStack.CdnBucketName
  : null;

const WIDTHS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
];

const browser = await chromium.launch();
console.log(step(`Capturing ${env.GX_SITE_A_URL}`));

const captured = [];
for (const w of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width: w.width, height: w.height },
    deviceScaleFactor: w.name === "mobile" ? 2 : 1,
    isMobile: w.name === "mobile",
  });
  const page = await ctx.newPage();
  const url = new URL(env.GX_SITE_A_URL);
  url.searchParams.set("gx_force", "v_control");
  await page.goto(url.toString(), { waitUntil: "networkidle" });

  // Refuse to capture a mutated page — see the module comment.
  const state = await page.evaluate(() => window.__growthx);
  if (state?.result?.applied > 0) {
    console.log(bad(`${w.name}: page was mutated by ${state.variantId}; refusing`));
    await ctx.close();
    continue;
  }

  // Settle lazy content and return to the top so the capture matches the
  // coordinate frame events were recorded in.
  await page.evaluate(async () => {
    const h = document.body.scrollHeight;
    for (let y = 0; y < h; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)); }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 150));
  });

  const dims = await page.evaluate(() => ({
    docH: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
    docW: Math.max(document.documentElement.scrollWidth, window.innerWidth),
  }));

  const file = path.join(outDir, `site-a-${w.name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  await ctx.close();

  captured.push({ ...w, file, ...dims, key: `shots/site-a-${w.name}.png` });
  console.log(ok(`${w.name.padEnd(8)} ${w.width}×${w.height}  document ${dims.docH}px  → ${path.relative(root, file)}`));
}
await browser.close();

if (!bucket) {
  console.log(dim("\n  No CDN bucket in cdk-outputs.json — captured locally only.\n"));
  process.exit(0);
}

console.log(step("Uploading"));
for (const c of captured) {
  execFileSync("aws", [
    "s3", "cp", c.file, `s3://${bucket}/${c.key}`,
    "--content-type", "image/png",
    "--cache-control", "public,max-age=300",
    "--region", env.AWS_REGION ?? "us-east-1",
    "--profile", env.AWS_PROFILE ?? "default",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  console.log(ok(`${env.GX_CDN_URL}/${c.key}  ${dim(`(${c.docW}×${c.docH} document px)`)}`));
}

// The overlay needs the document dimensions to project page-fraction
// coordinates back onto the image; without them P11 would be guessing.
console.log(dim(`\n  Document dimensions are what P11 projects event coordinates onto:`));
for (const c of captured) console.log(dim(`    ${c.name}: ${c.docW} × ${c.docH}`));
console.log();
