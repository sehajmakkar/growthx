import { sql } from "drizzle-orm";
import type { Db } from "@growthx/db";
import { newId } from "@growthx/shared/runtime";

/**
 * Opportunity storage, with evidence that is *verified* rather than trusted.
 *
 * PLAN §6 P13: "An opportunity containing an unbacked claim is rejected by the
 * tool, not by the model's goodwill." That distinction is the whole difference
 * between an evidence trail and a paragraph with numbers in it. A model that is
 * merely *asked* to cite sources will cite plausible ones; this resolves every
 * citation against the stored aggregate and rejects the opportunity if a figure
 * does not match what the data actually says.
 */

export interface EvidenceItem {
  kind: "heatmap" | "funnel" | "digest" | "scroll";
  label: string;
  value: string | number;
  /**
   * Where the figure came from, resolvable without the model's help:
   *   heatmap:<segment>:<selector>:<field>
   *   funnel:<segment>:<step>
   *   scroll:<segment>:<depth_pct>
   *   digest:<signature>
   */
  sourceRef: string;
}

export interface VerifyResult {
  ok: boolean;
  verified: (EvidenceItem & { actual: unknown; matched: boolean })[];
  errors: string[];
}

function close(a: number, b: number): boolean {
  // Rounding differs between the aggregate and however the model restates it,
  // so allow a small tolerance rather than demanding an exact string match.
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const scale = Math.max(1, Math.abs(b));
  return Math.abs(a - b) <= Math.max(0.55, scale * 0.02);
}

function num(value: unknown): number {
  if (typeof value === "number") return value;
  const m = String(value ?? "").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : NaN;
}

export async function verifyEvidence(
  db: Db, siteId: string, path: string, evidence: EvidenceItem[]
): Promise<VerifyResult> {
  const verified: VerifyResult["verified"] = [];
  const errors: string[] = [];

  for (const item of evidence) {
    const parts = String(item.sourceRef ?? "").split(":");
    const kind = parts[0];
    let actual: unknown = null;
    let matched = false;

    try {
      if (kind === "heatmap" || kind === "scroll" || kind === "funnel") {
        const segment = parts[1] ?? "all";
        const rows = await db.execute<Record<string, unknown>>(sql`
          select elements, scroll_bands, funnel, sessions from aggregates
          where site_id = ${siteId} and path = ${path} and segment_key = ${segment}
          order by computed_at desc limit 1`);
        const agg = (rows.rows ?? [])[0];
        if (!agg) {
          errors.push(`${item.sourceRef}: no aggregate for segment "${segment}"`);
          verified.push({ ...item, actual: null, matched: false });
          continue;
        }

        if (kind === "heatmap") {
          const selector = parts[2];
          const field = parts[3] ?? "click_rate_pct";
          const el = (agg.elements as Record<string, unknown>[] ?? [])
            .find((e) => e.selector === selector);
          if (!el) {
            errors.push(`${item.sourceRef}: no element "${selector}" in segment "${segment}"`);
          } else {
            actual = el[field];
            matched = close(num(actual), num(item.value));
            if (!matched) {
              errors.push(`${item.sourceRef}: says ${item.value}, data says ${describe(actual)}`);
            }
          }
        } else if (kind === "scroll") {
          const depth = Number(parts[2]);
          const band = (agg.scroll_bands as Record<string, unknown>[] ?? [])
            .find((b) => Number(b.depth_pct) === depth);
          actual = band?.reach_pct ?? null;
          matched = close(num(actual), num(item.value));
          if (!matched) errors.push(`${item.sourceRef}: says ${item.value}, data says ${describe(actual)}`);
        } else {
          const step = parts[2];
          const row = (agg.funnel as Record<string, unknown>[] ?? [])
            .find((f) => f.step === step);
          actual = row?.sessions ?? null;
          matched = close(num(actual), num(item.value));
          if (!matched) errors.push(`${item.sourceRef}: says ${item.value}, data says ${describe(actual)}`);
        }
      } else if (kind === "digest") {
        const signature = parts.slice(1).join(":");
        const rows = await db.execute<Record<string, unknown>>(sql`
          select signature, session_count from digests
          where site_id = ${siteId} and path = ${path} and signature = ${signature} limit 1`);
        const row = (rows.rows ?? [])[0];
        actual = row?.session_count ?? null;
        matched = !!row;
        if (!row) errors.push(`${item.sourceRef}: no digest cluster with that signature`);
      } else {
        errors.push(`${item.sourceRef}: unknown evidence kind "${kind}"`);
      }
    } catch (err) {
      errors.push(`${item.sourceRef}: ${err instanceof Error ? err.message : String(err)}`);
    }

    verified.push({ ...item, actual, matched });
  }

  const backed = verified.filter((v) => v.matched).length;
  if (backed < 3) {
    errors.push(`only ${backed} of ${evidence.length} evidence items resolve to stored data; at least 3 are required`);
  }

  return { ok: errors.length === 0, verified, errors };
}

/** "data says undefined" reads like a bug in the checker rather than a problem
 *  with the citation, and the agent has to act on this text. Say what actually
 *  happened instead. */
function describe(actual: unknown): string {
  if (actual === undefined || actual === null) {
    return "there is no such figure in the stored data — check the selector and field name";
  }
  return String(actual);
}

export async function createOpportunity(
  db: Db, siteId: string, path: string,
  input: { title: string; body: string; confidence: string; segmentKey: string; evidence: EvidenceItem[] }
) {
  const check = await verifyEvidence(db, siteId, path, input.evidence ?? []);
  if (!check.ok) {
    return { stored: false, errors: check.errors, verified: check.verified };
  }

  const id = newId("opp");
  const rank = (await db.execute<Record<string, unknown>>(sql`
    select count(*)::int n from opportunities where site_id = ${siteId}`)).rows?.[0]?.n ?? 0;

  await db.execute(sql`
    insert into opportunities (id, site_id, title, body, confidence, rank, evidence, segment_key, status)
    values (${id}, ${siteId}, ${input.title}, ${input.body}, ${input.confidence},
            ${Number(rank)}, ${JSON.stringify(check.verified)}::jsonb, ${input.segmentKey}, 'open')`);

  return { stored: true, id, verified: check.verified };
}

export async function listOpportunities(db: Db, siteId: string) {
  const res = await db.execute<Record<string, unknown>>(sql`
    select id, title, body, confidence, rank, evidence, segment_key, status, detected_at
    from opportunities where site_id = ${siteId} order by detected_at desc limit 20`);
  return res.rows ?? [];
}
