#!/usr/bin/env node
/**
 * Prints the stored outline in the EXACT text form the variant generator sees.
 *
 * Read the output as if you were the model: if you cannot write a correct CSS
 * selector for the hero CTA from this text alone, neither can a Flash-class
 * model, and the P6 gate will fail. That is the whole point of this script.
 */
import postgres from "postgres";
import { renderSnapshotForModel } from "../packages/shared/src/snapshot.ts";
import { loadEnv, bad, dim } from "./env.mjs";

const env = loadEnv();
const sql = postgres(env.DATABASE_URL, { max: 1 });
const path = process.argv[2] || "/";

try {
  const [snap] = await sql`
    select * from snapshots
    where site_id = ${env.GX_SITE_ID || "site_corrick"} and path = ${path} and is_current = true
    order by captured_at desc limit 1`;

  if (!snap) {
    console.error(bad(`No current snapshot for ${path}. Run \`pnpm capture:snapshot\` first.`));
    process.exit(1);
  }

  console.log(renderSnapshotForModel({
    path: snap.path,
    viewport: snap.viewport,
    elements: snap.elements,
  }));
  console.log(dim(`\n(${snap.elements.length} elements · captured ${new Date(snap.captured_at).toISOString()} · hash ${snap.content_hash})`));
} finally {
  await sql.end();
}
