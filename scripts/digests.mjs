#!/usr/bin/env node
/**
 * Clusters sessions deterministically, then asks the model for one sentence per
 * cluster — from the cluster's statistics only, never from raw events.
 *
 * Narratives run on the cheapest model in the chain: this is the highest-count,
 * lowest-stakes model use in the product (PLAN §3.1). Nothing downstream depends
 * on the prose being right; everything depends on the *numbers* being right, and
 * those come from SQL.
 */
import { getDb, sql } from "../packages/db/src/index.ts";
import { clusterSessions } from "../packages/api/src/digests.ts";
import { newId } from "../packages/shared/src/runtime/ids.ts";
import { generate } from "./lib/model.mjs";
import { loadEnv, ok, bad, dim, step } from "./env.mjs";

const env = loadEnv();
const siteId = env.GX_SITE_ID || "site_corrick";
const path = process.argv[2] || "/";
const db = getDb(env.DATABASE_URL);

console.log(step(`Clustering sessions for ${siteId} ${path}`));
const clusters = await clusterSessions(db, siteId, path, 10);
console.log(ok(`${clusters.length} clusters of 10+ sessions`));

if (!clusters.length) {
  console.log(bad("No clusters. Run `pnpm swarm` and `pnpm aggregate` first.\n"));
  process.exit(1);
}

const PROMPT = (c) => `You are summarising one cluster of website visitors for a growth team.

Write ONE sentence, at most 40 words, describing what this group of visitors did.
Use only the figures given. Do not speculate about motives, do not recommend
anything, do not use marketing language. Write plainly, as an analyst would.

This is a SINGLE-PAGE site. "reached-pricing" means the visitor scrolled far
enough to see the pricing section of that page — never say "pricing page", and
never imply the visitor navigated anywhere.

If the share who SAW the call to action differs from the share who CLICKED it,
say both numbers explicitly. A group that saw something and did not act on it is
the most useful thing this summary can report, and omitting the view figure
throws that away.

Cluster: ${c.signature}
Sessions: ${c.sessions}
Median time on page: ${c.median_duration_s}s
Median scroll depth: ${c.median_scroll_pct}%
Saw the primary call to action: ${c.cta_view_pct}% of sessions
Clicked it: ${c.cta_click_pct}% of sessions
Converted: ${c.conversion_pct}%
Sessions with rage clicks: ${c.rage_click_sessions}
Sessions with dead clicks: ${c.dead_click_sessions}

Sentence:`;

const windowEnd = new Date();
await db.execute(sql`delete from digests where site_id = ${siteId} and path = ${path}`);

for (const c of clusters) {
  let narrative = "";
  try {
    const { text, model } = await generate(PROMPT(c), { temperature: 0.4 });
    narrative = text.trim().replace(/^["']|["']$/g, "").split("\n")[0];
    process.stdout.write(dim(`  [${model}] `));
  } catch (e) {
    narrative = `${c.sessions} ${c.device} sessions, ${c.outcome}, median ${c.median_scroll_pct}% scroll depth.`;
    process.stdout.write(dim("  [fallback] "));
  }

  await db.execute(sql`
    insert into digests (id, site_id, path, window_end, signature, session_count,
                         segment_key, stats, narrative, example_session_ids)
    values (${newId("dig")}, ${siteId}, ${path}, ${windowEnd}, ${c.signature}, ${c.sessions},
            ${"device=" + c.device}, ${JSON.stringify(c)}::jsonb, ${narrative},
            -- The HTTP driver sends a JS array as a record, so build the text[]
            -- from a delimited string instead.
            string_to_array(${(c.example_session_ids ?? []).join("\u0001")}, e'\\x01'))
  `);

  console.log(`${String(c.sessions).padStart(4)} sessions  ${dim(c.signature)}`);
  console.log(`       ${narrative}`);
}

console.log(dim(`\n  Every figure in those sentences comes from the cluster stats above them.\n`));
process.exit(0);
