/**
 * Serialized Gemini client with rate limiting and per-model spillover.
 *
 * The free tier allows roughly ten requests a minute **per model**, so calls are
 * queued rather than fired in parallel, and a 429 moves the next call to the
 * next model in the chain instead of failing. Quota being per-model is what
 * makes the chain worth having: it roughly triples the daily allowance.
 *
 * PLAN.md §3.1.
 */
import { loadEnv } from "../env.mjs";

const env = loadEnv();
const KEY = env.GEMINI_API_KEY;

export const MODEL_CHAIN = [
  env.GX_GEMINI_MODEL || "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
];

const MIN_INTERVAL_MS = 6500; // ~9/min, just inside the free-tier limit
let lastCallAt = 0;
let chainIndex = 0;
let queue = Promise.resolve();

export const stats = { calls: 0, retries: 0, spillovers: 0, totalMs: 0, byModel: {} };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function throttled(fn) {
  const run = queue.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastCallAt);
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    return fn();
  });
  queue = run.catch(() => {});
  return run;
}

/**
 * Sends a prompt and returns the text. Retries transient failures, and moves
 * down the model chain when a model's daily quota is exhausted.
 */
export async function generate(prompt, { temperature = 0.7, maxAttempts = 6 } = {}) {
  if (!KEY) throw new Error("GEMINI_API_KEY is not set (GUIDE.md §B5)");

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const model = MODEL_CHAIN[Math.min(chainIndex, MODEL_CHAIN.length - 1)];
    const started = Date.now();

    const res = await throttled(() =>
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": KEY, "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens: 4096 },
        }),
      }).then((r) => r.json().then((j) => ({ status: r.status, json: j })))
    ).catch((e) => ({ status: 0, json: { error: { message: String(e) } } }));

    stats.totalMs += Date.now() - started;

    if (res.json?.candidates?.length) {
      stats.calls++;
      stats.byModel[model] = (stats.byModel[model] ?? 0) + 1;
      const parts = res.json.candidates[0].content?.parts ?? [];
      return { text: parts.map((p) => p.text ?? "").join(""), model };
    }

    const code = res.json?.error?.code ?? res.status;
    const message = res.json?.error?.message ?? "no candidates";

    // 429 is an exhausted per-model quota; 503 is that model being at capacity.
    // Both are answered the same way — try the next model rather than waiting,
    // because quota and capacity are both per-model. Measured: a 19KB prompt
    // that 503s on gemini-3.6-flash is served fine by gemini-3.5-flash.
    if (code === 429 || code === 503) {
      if (chainIndex < MODEL_CHAIN.length - 1) {
        chainIndex++;
        stats.spillovers++;
        continue;
      }
      // Whole chain unavailable: now waiting is the only option.
      stats.retries++;
      chainIndex = 0;
      await sleep(code === 429 ? 15000 : 5000);
      continue;
    }
    if (code === 500 || code === 0) {
      stats.retries++;
      await sleep(2000 * (attempt + 1));
      continue;
    }
    throw new Error(`${model}: ${code} ${String(message).slice(0, 200)}`);
  }
  throw new Error(`gave up after ${maxAttempts} attempts`);
}

/** Models wrap JSON in prose or fences no matter how firmly you ask them not to. */
export function extractJsonArray(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}
