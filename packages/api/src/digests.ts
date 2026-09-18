import { sql } from "drizzle-orm";
import type { Db } from "@growthx/db";

/**
 * Session digests. PLAN.md §9.3.
 *
 * The clustering is deterministic SQL and the model writes only the sentence.
 * That split is deliberate: letting a model group sessions would be slow,
 * expensive, non-reproducible, and — worst — it would put the untrustworthy part
 * of the system in charge of the part that has to be trustworthy. Two runs over
 * the same data must produce the same clusters, or nobody can check the agent's
 * reasoning against them.
 *
 * The narrative is generated from the cluster's *statistics*, never from raw
 * events, so every claim in the prose is traceable to a number in `stats`.
 */

export interface ClusterStats {
  signature: string;
  sessions: number;
  device: string;
  reached_pricing: boolean;
  dwell_band: string;
  outcome: string;
  median_duration_s: number;
  median_scroll_pct: number;
  conversion_pct: number;
  cta_view_pct: number;
  cta_click_pct: number;
  rage_click_sessions: number;
  dead_click_sessions: number;
  example_session_ids: string[];
}

/**
 * One row per behavioural cluster.
 *
 * The signature is four coarse facts about how a session went. Coarse on
 * purpose: finer buckets produce many clusters of one session each, which is
 * a list of sessions rather than a description of behaviour.
 */
export async function clusterSessions(
  db: Db, siteId: string, path: string, minClusterSize = 15
): Promise<ClusterStats[]> {
  const res = await db.execute<Record<string, unknown>>(sql`
    with s as (
      select
        se.id, se.device::text as device,
        se.max_scroll_frac,
        extract(epoch from (se.ended_at - se.started_at)) as duration_s,
        se.converted, se.bounced,
        -- The pricing table starts around 45% down the document.
        (se.max_scroll_frac >= 0.45)                              as reached_pricing,
        case
          when extract(epoch from (se.ended_at - se.started_at)) < 8  then 'brief'
          when extract(epoch from (se.ended_at - se.started_at)) < 25 then 'considered'
          else 'long'
        end                                                        as dwell_band,
        case
          when se.converted then 'converted'
          when se.bounced   then 'bounced'
          else 'browsed'
        end                                                        as outcome
      from sessions se
      where se.site_id = ${siteId}
    ),
    sig as (
      select *,
        device || ' | ' ||
        case when reached_pricing then 'reached-pricing' else 'stopped-before-pricing' end ||
        ' | ' || dwell_band || ' | ' || outcome as signature
      from s
    ),
    cta as (
      select e.session_id,
             bool_or(e.type = 'element_view') as saw_cta,
             bool_or(e.type = 'click')        as clicked_cta
      from events e
      where e.site_id = ${siteId} and e.path = ${path}
        and e.selector like '%cta-primary%'
      group by e.session_id
    ),
    friction as (
      select e.session_id,
             bool_or(e.type = 'rage_click') as raged,
             bool_or(e.type = 'dead_click') as dead
      from events e
      where e.site_id = ${siteId} and e.path = ${path}
        and e.type in ('rage_click','dead_click')
      group by e.session_id
    ),
    grouped as (
      select
        sig.signature,
        count(*)::int                                                       as sessions,
        (array_agg(sig.device))[1]                                          as device,
        bool_or(sig.reached_pricing)                                        as reached_pricing,
        (array_agg(sig.dwell_band))[1]                                      as dwell_band,
        (array_agg(sig.outcome))[1]                                         as outcome,
        round(percentile_cont(0.5) within group (order by sig.duration_s)::numeric, 1)::float8   as median_duration_s,
        round((percentile_cont(0.5) within group (order by sig.max_scroll_frac) * 100)::numeric, 1)::float8 as median_scroll_pct,
        round((count(*) filter (where sig.converted)::numeric * 100 / count(*)), 1)::float8      as conversion_pct,
        round((count(*) filter (where cta.saw_cta)::numeric     * 100 / count(*)), 1)::float8    as cta_view_pct,
        round((count(*) filter (where cta.clicked_cta)::numeric * 100 / count(*)), 1)::float8    as cta_click_pct,
        count(*) filter (where friction.raged)::int                         as rage_click_sessions,
        count(*) filter (where friction.dead)::int                          as dead_click_sessions,
        (array_agg(sig.id order by sig.id))[1:3]                            as example_session_ids
      from sig
      left join cta on cta.session_id = sig.id
      left join friction on friction.session_id = sig.id
      group by sig.signature
    )
    select * from grouped where sessions >= ${minClusterSize} order by sessions desc
  `);
  return (res.rows ?? []) as unknown as ClusterStats[];
}

/** What the agent reads. Narratives come from `digests`, written by P9's script. */
export async function getSessionDigest(db: Db, siteId: string, path: string) {
  const res = await db.execute<Record<string, unknown>>(sql`
    select signature, session_count, segment_key, stats, narrative, example_session_ids
    from digests
    where site_id = ${siteId} and path = ${path}
    order by session_count desc
  `);
  return res.rows ?? [];
}
