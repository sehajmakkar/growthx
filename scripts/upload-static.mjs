#!/usr/bin/env node
/** Uploads the built static assets to their S3 origins and invalidates CloudFront. */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, ok, bad, dim, step } from "./env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = loadEnv();
const profile = env.AWS_PROFILE ?? "default";
const region = env.AWS_REGION ?? "us-east-1";

const outputsPath = path.join(root, "infra/cdk-outputs.json");
if (!existsSync(outputsPath)) {
  console.error(bad("infra/cdk-outputs.json missing — run the CDK deploy first."));
  process.exit(1);
}
const out = JSON.parse(readFileSync(outputsPath, "utf8")).GrowthxStack;

const aws = (args) =>
  execFileSync("aws", [...args, "--region", region, "--profile", profile], {
    stdio: ["ignore", "pipe", "pipe"], encoding: "utf8",
  });

// The dashboard is built in P10; until then it gets an honest placeholder so
// the third origin is real and verifiable rather than a 404.
const dashDir = path.join(root, "packages/dashboard/dist");
if (!existsSync(dashDir)) {
  mkdirSync(dashDir, { recursive: true });
  writeFileSync(path.join(dashDir, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>GrowthX — dashboard</title>
<body style="font:16px/1.6 system-ui;max-width:34rem;margin:20vh auto;padding:0 1.5rem;color:#14161A">
<h1 style="font-weight:600">GrowthX dashboard</h1>
<p style="color:#61656C">Origin provisioned in P1. The dashboard itself is built in P10.</p>
</body>`);
}

const jobs = [
  // `shots/` is written by `pnpm screenshot`, not by this build, so the sync
  // must not treat it as stale and delete it. It did once, and the heatmap
  // backdrop vanished on the next deploy with a 403 that looked like a
  // permissions problem rather than a self-inflicted one.
  { name: "g.js (CDN)", dir: path.join(root, "packages/snippet/dist"),
    bucket: out.CdnBucketName, dist: out.CdnDistributionId, cacheControl: "public,max-age=60",
    keep: ["shots/*"] },
  { name: "Site A", dir: path.join(root, "sites/site-a/public"),
    bucket: out.SiteABucketName, dist: out.SiteADistributionId, cacheControl: "public,max-age=300" },
  { name: "Dashboard", dir: dashDir,
    bucket: out.DashboardBucketName, dist: out.DashboardDistributionId, cacheControl: "public,max-age=300" },
];

console.log(step("Uploading static assets"));
for (const j of jobs) {
  if (!existsSync(j.dir)) { console.log(bad(`${j.name}: ${j.dir} does not exist`)); continue; }
  aws([
    "s3", "sync", j.dir, `s3://${j.bucket}/`, "--delete",
    ...(j.keep ?? []).flatMap((p) => ["--exclude", p]),
    "--cache-control", j.cacheControl,
  ]);
  aws(["cloudfront", "create-invalidation", "--distribution-id", j.dist, "--paths", "/*"]);
  console.log(ok(`${j.name} → ${j.bucket} ${dim("(invalidated)")}`));
}
console.log();
