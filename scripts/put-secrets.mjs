#!/usr/bin/env node
/**
 * Publishes secrets to SSM as SecureString so deployed Lambdas can read them.
 *
 * They are NOT passed as Lambda environment variables: env vars are visible in
 * the CloudFormation template and in the Lambda console. SSM SecureStrings are
 * not. The Lambda reads them once per cold start (packages/api/src/secrets.ts).
 */
import { execFileSync } from "node:child_process";
import { loadEnv, ok, bad, dim, step } from "./env.mjs";

const env = loadEnv();
const profile = env.AWS_PROFILE ?? "default";
const region = env.AWS_REGION ?? "us-east-1";
const prefix = "/growthx";
const NAMES = ["DATABASE_URL", "GEMINI_API_KEY"];

console.log(step(`Publishing secrets to SSM ${prefix}/* in ${region}`));

let failed = false;
for (const name of NAMES) {
  const value = env[name];
  if (!value) {
    console.log(bad(`${name} is empty in .env — skipping`));
    failed = true;
    continue;
  }
  try {
    execFileSync(
      "aws",
      ["ssm", "put-parameter", "--name", `${prefix}/${name}`, "--value", value,
       "--type", "SecureString", "--overwrite", "--region", region, "--profile", profile],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    console.log(ok(`${prefix}/${name}  ${dim(`(${value.length} chars, encrypted)`)}`));
  } catch (e) {
    console.log(bad(`${prefix}/${name} — ${String(e.stderr || e.message).split("\n")[0]}`));
    failed = true;
  }
}
if (failed) {
  console.log(dim("\n  Secrets missing or unwritable. Deployed Lambdas will fail health checks.\n"));
  process.exit(1);
}
console.log();
