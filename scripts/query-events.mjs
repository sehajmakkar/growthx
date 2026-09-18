#!/usr/bin/env node
/**
 * Human-readable dump of what the snippet actually recorded.
 *
 * Used by every later phase's verification step, and by you at 2am when a
 * heatmap looks wrong and you need to see whether the problem is the data or
 * the aggregation.
 *
 * Usage:
 *   pnpm query:events                  # last 3 sessions
 *   pnpm query:events --session <id>   # one session, every event in order
 *   pnpm query:events --summary        # counts by type, device, variant
 */
import postgres from "postgres";
import { loadEnv, ok, dim, step } from "./env.mjs";

const env = loadEnv();
const sql = postgres(env.DATABASE_URL, { max: 1 });
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1] ?? true; };

const TYPE_COLOR = {
  conversion: "\x1b[32m", rage_click: "\x1b[31m", dead_click: "\x1b[33m",
  back_exit: "\x1b[35m", exposure: "\x1b[36m",
};
const tag = (t) => `${TYPE_COLOR[t] ?? ""}${t.padEnd(13)}\x1b[0m`;

try {
  if (flag("--summary") !== null) {
    console.log(step("Events by type"));
    for (const r of await sql`
      select type, count(*)::int n, count(distinct session_id)::int sessions
      from events group by type order by n desc`) {
      console.log(`  ${r.type.padEnd(15)} ${String(r.n).padStart(6)}  ${dim(`${r.sessions} sessions`)}`);
    }

    console.log(step("Sessions by device and variant"));
    for (const r of await sql`
      select device, coalesce(variant_id,'(unassigned)') variant,
             count(distinct session_id)::int sessions,
             count(*) filter (where type='conversion')::int conversions
      from events group by device, variant_id order by device, variant`) {
      console.log(`  ${r.device.padEnd(9)} ${r.variant.padEnd(20)} ${String(r.sessions).padStart(5)} sessions  ` +
        `${String(r.conversions).padStart(4)} conversions`);
    }

    console.log(step("Most-clicked selectors"));
    for (const r of await sql`
      select selector, count(*)::int n from events
      where type = 'click' and selector is not null
      group by selector order by n desc limit 10`) {
      console.log(`  ${String(r.n).padStart(5)}  ${r.selector}`);
    }

    console.log(step("Friction"));
    for (const r of await sql`
      select type, selector, count(*)::int n from events
      where type in ('rage_click','dead_click') and selector is not null
      group by type, selector order by n desc limit 10`) {
      console.log(`  ${tag(r.type)} ${String(r.n).padStart(4)}  ${r.selector}`);
    }
    console.log();
  } else if (flag("--session")) {
    const id = flag("--session");
    console.log(step(`Session ${id}`));
    for (const e of await sql`
      select * from events where session_id = ${id} order by ts, seq`) {
      const geo = e.elem_frac ? dim(` elem(${e.elem_frac.x},${e.elem_frac.y})`) : "";
      const sel = e.selector ? ` ${e.selector}` : "";
      const pay = e.payload ? dim(` ${JSON.stringify(e.payload).slice(0, 80)}`) : "";
      console.log(`  ${new Date(e.ts).toISOString().slice(11, 23)} ${tag(e.type)}${sel}${geo}${pay}`);
    }
    console.log();
  } else {
    const sessions = await sql`
      select session_id, min(ts) started, max(ts) ended, count(*)::int n,
             max(device) device, max(coalesce(variant_id,'')) variant,
             bool_or(type='conversion') converted, bool_or(simulated) simulated
      from events group by session_id order by started desc limit 3`;
    if (!sessions.length) {
      console.log(dim("\n  No events yet. Open Site A and click around.\n"));
    }
    for (const s of sessions) {
      console.log(step(`${s.session_id}  ${s.device}  ${s.variant || "(unassigned)"}` +
        `${s.converted ? "  \x1b[32mconverted\x1b[0m" : ""}${s.simulated ? dim("  simulated") : ""}`));
      console.log(dim(`    ${s.n} events over ${Math.round((s.ended - s.started) / 1000)}s`));
      for (const e of await sql`
        select * from events where session_id = ${s.session_id} order by ts, seq limit 40`) {
        const sel = e.selector ? ` ${e.selector}` : "";
        const pay = e.payload ? dim(` ${JSON.stringify(e.payload).slice(0, 60)}`) : "";
        console.log(`    ${tag(e.type)}${sel}${pay}`);
      }
    }
    console.log();
  }
} finally {
  await sql.end();
}
