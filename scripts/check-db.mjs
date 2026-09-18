#!/usr/bin/env node
/**
 * Verifies DATABASE_URL points at a reachable Postgres and reports what is there.
 * GUIDE.md §B9. Run this before P1; re-run any time the database looks wrong.
 */
import postgres from "postgres";
import { loadEnv } from "./env.mjs";

// Values in .env may be quoted — Neon's URL contains `&`, which breaks shell
// sourcing unless quoted, so the quotes must be stripped when reading it here.
const env = loadEnv();

const url = env.DATABASE_URL || process.env.DATABASE_URL;
const ok = (s) => `\x1b[32m✓\x1b[0m ${s}`;
const bad = (s) => `\x1b[31m✗\x1b[0m ${s}`;
const warn = (s) => `\x1b[33m!\x1b[0m ${s}`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

if (!url) {
  console.error("\n" + bad("DATABASE_URL is not set in .env — see GUIDE.md §B9.\n"));
  process.exit(1);
}

let host = "?";
try { host = new URL(url).host; } catch {}
console.log(`\n── Database ───────────────────────────────────────────────`);
console.log(dim(`   ${host}`));

if (!/-pooler\./.test(host)) {
  console.log(warn("This is NOT the pooled endpoint (no '-pooler' in the hostname)."));
  console.log(dim("     It will work now and then fail with 'too many connections'"));
  console.log(dim("     once the traffic swarm runs. Switch to the pooled string."));
}

const sql = postgres(url, { max: 1, idle_timeout: 5, connect_timeout: 10 });
try {
  const [{ version }] = await sql`select version()`;
  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name`;
  console.log(ok(`connected — ${version.split(",")[0]}`));
  if (tables.length === 0) {
    console.log(dim("   0 tables — expected until P1 runs `pnpm db:push`."));
  } else {
    console.log(ok(`${tables.length} tables: ${tables.map((t) => t.table_name).join(", ")}`));
  }
  console.log();
} catch (e) {
  const m = String(e.message || e);
  console.log(bad(`could not connect — ${m.slice(0, 140)}`));
  if (/password authentication/i.test(m))
    console.log(dim("     Connection string is probably truncated. Re-copy the whole line."));
  else if (/SSL|pg_hba/i.test(m))
    console.log(dim("     '?sslmode=require' was dropped from the end of the URL."));
  else if (/ENOTFOUND|getaddrinfo/i.test(m))
    console.log(dim("     Hostname typo, or the Neon project is still provisioning (wait ~30s)."));
  else if (/too many connections/i.test(m))
    console.log(dim("     Use the pooled endpoint — hostname must contain '-pooler'."));
  console.log(dim("     All of the above are environment problems, not code. GUIDE.md §B9.\n"));
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
