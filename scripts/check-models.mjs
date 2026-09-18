#!/usr/bin/env node
/**
 * Probes both model providers and reports which are actually usable.
 *
 * Listing a model is not the same as being able to call it: Bedrock lists every
 * inference profile in the region regardless of whether your account has been
 * granted access, and Gemini lists models that 404 for newer API keys. The only
 * reliable test is a real call, which is what this does.
 *
 * Usage:  pnpm check:models
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const env = {};
try {
  for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
} catch {
  console.error("✗ No .env found. Copy .env.example to .env first (GUIDE.md §B7).");
  process.exit(1);
}

const g = (k, d = "") => env[k] || process.env[k] || d;
const ok = (s) => `\x1b[32m✓\x1b[0m ${s}`;
const bad = (s) => `\x1b[31m✗\x1b[0m ${s}`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

let usable = 0;
let transient = false;

// ── Bedrock ──────────────────────────────────────────────────────────────────
const profileId = g("GX_BEDROCK_INFERENCE_PROFILE_ID");
const region = g("AWS_REGION", "us-east-1");
const awsProfile = g("AWS_PROFILE", "default");

console.log("\n── Bedrock ── " + dim("closed by decision, informational only (GUIDE.md §B2)"));
if (!profileId) {
  console.log(bad("GX_BEDROCK_INFERENCE_PROFILE_ID is empty — see GUIDE.md §B2"));
} else {
  process.stdout.write(`   ${profileId} … `);
  try {
    const out = execFileSync(
      "aws",
      [
        "bedrock-runtime", "converse",
        "--model-id", profileId,
        "--region", region,
        "--profile", awsProfile,
        "--messages", JSON.stringify([{ role: "user", content: [{ text: "say ok" }] }]),
        "--inference-config", JSON.stringify({ maxTokens: 5 }),
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, AWS_MAX_ATTEMPTS: "6", AWS_RETRY_MODE: "adaptive" } }
    );
    JSON.parse(out);
    console.log("\n" + ok("Bedrock is callable. Not used — prompts are tuned for Gemini."));
  } catch (e) {
    const msg = String(e.stderr || e.message);
    const kind = (msg.match(/\(([A-Za-z]+Exception)\)/) || [])[1] || "error";
    console.log("\n" + bad(`Bedrock not callable — ${kind}`));
    if (kind === "AccessDeniedException") {
      console.log(dim("     Model access is not granted for this model yet."));
      console.log(dim("     Console → Bedrock → Model access. Some accounts need a use-case form."));
      console.log(dim("     Note: `list-inference-profiles` shows the catalogue, NOT your grants."));
    } else if (kind === "ThrottlingException") {
      console.log(dim("     Usually masks a missing grant on a new account. Re-run in a minute."));
    } else {
      console.log(dim("     " + msg.split("\n").find((l) => l.trim()) || ""));
    }
  }
}

// ── Gemini ───────────────────────────────────────────────────────────────────
const key = g("GEMINI_API_KEY");
const primary = g("GX_GEMINI_MODEL", "gemini-3.6-flash");
const FLASH_CHAIN = [...new Set([primary, "gemini-3.5-flash", "gemini-3.1-flash-lite"])];

console.log("\n── Gemini " + dim("(primary — quota is per model, so we use all three)"));
if (!key) {
  console.log(bad("GEMINI_API_KEY is empty — see GUIDE.md §B5"));
} else {
  for (const model of FLASH_CHAIN) {
  process.stdout.write(`   ${model.padEnd(24)} … `);
  // 429/503 are transient on the free tier. Retrying here keeps a temporary
  // spike from being misread as a broken key — the distinction matters at 2am.
  const attempt = async () =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Say ok. Then call the tool." }] }],
        tools: [{ functionDeclarations: [{
          name: "ping", description: "test tool",
          parameters: { type: "object", properties: { x: { type: "string" } } },
        }] }],
      }),
    });

  let d = null, lastErr = "";
  for (let i = 0; i < 4; i++) {
    try {
      const r = await attempt();
      d = await r.json();
      if (d.candidates) break;
      const code = d.error?.code;
      lastErr = `${code} ${d.error?.message || ""}`;
      if (code !== 429 && code !== 503) break;      // permanent — stop retrying
      process.stdout.write(`retry ${i + 1} … `);
      await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
      d = null;
    } catch (e) {
      lastErr = e.message;
      d = null;
    }
  }

  if (d?.candidates) {
    const parts = d.candidates[0].content.parts || [];
    const tools = parts.some((p) => p.functionCall);
    console.log("\n" + ok(`Gemini is CALLABLE (${d.modelVersion})`));
    console.log(tools
      ? ok("Function calling works — Strands sub-agents-as-tools will work.")
      : bad("Function calling did NOT fire — Strands agents-as-tools needs this."));
    usable++;
  } else if (/^(429|503)/.test(lastErr)) {
    console.log("\n" + bad(`Gemini TEMPORARILY unavailable — ${lastErr.slice(0, 90)}`));
    console.log(dim("     This is transient (free-tier demand spike or rate limit), not a"));
    console.log(dim("     broken key. Wait a minute and re-run. If it persists for >15 min,"));
    console.log(dim("     switch GX_GEMINI_MODEL to another flash model and re-run."));
    transient = true;
  } else {
    console.log("\n" + bad(`Gemini not callable — ${lastErr.slice(0, 160)}`));
    console.log(dim("     If this says 'no longer available to new users', pick a newer"));
    console.log(dim("     flash model and update GX_GEMINI_MODEL in .env."));
  }
}
}

console.log("\n───────────────────────────────────────────────────────────");
if (usable === 0) {
  console.log(bad(transient
    ? "No usable provider right now, but Gemini looked transient — re-run shortly."
    : "No usable model provider. The P6 gate cannot run. Fix this first.") + "\n");
  process.exit(1);
}
console.log(ok(`${usable} usable model${usable > 1 ? "s" : ""}. ` +
  `Active: \x1b[1m${g("GX_MODEL_PROVIDER", "bedrock")}\x1b[0m (GX_MODEL_PROVIDER in .env)\n`));
