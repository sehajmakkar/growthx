import { sql } from "drizzle-orm";
import type { Db } from "@growthx/db";
import { COMPUTED_SEGMENTS, parseSegmentKey, newId } from "@growthx/shared/runtime";

/**
 * Aggregation. PLAN.md §4.2.
 *
 * Every rollup here is a SQL statement, not a loop over rows. That is the whole
 * reason the datastore is Postgres (§3.2): nine segments over seven thousand
 * events is one `GROUP BY` each, where a document store would need a fan-out and
 * a hand-written reduce. If you ever find yourself assembling one of these in
 * TypeScript, it is in the wrong place.
 */

/** Turns a canonical segment key into a WHERE fragment over `sessions`. */
function segmentFilter(segmentKey: string) {
  const spec = parseSegmentKey(segmentKey);
  const parts = [sql`true`];
  if (spec.device) parts.push(sql`s.device = ${spec.device}::device_class`);
  if (spec.visitor) parts.push(sql`s.is_returning = ${spec.visitor === "returning"}`);
  if (spec.outcome === "converted") parts.push(sql`s.converted = true`);
  if (spec.outcome === "bounced") parts.push(sql`s.bounced = true`);
  return sql.join(parts, sql` and `);
}

/**
 * Derives one row per session from the raw event stream.
 *
 * `bounced` is deliberately strict — no conversion *and* the visitor either left
 * within ten seconds or never reached halfway down the page. A looser "did not
 * convert" would make converted-vs-bounced a clean binary split, which looks
 * tidier on a heatmap but would label a careful reader who simply was not ready
 * to buy as a bounce. The remainder are neither: they browsed and left.
 */
export async function rollupSessions(db: Db, siteId: string): Promise<number> {
  const res = await db.execute(sql`
    insert into sessions (
      id, site_id, visitor_id, started_at, ended_at, device, is_returning,
      converted, bounced, max_scroll_frac, event_count,
      experiment_id, variant_id, simulated, persona
    )
    select
      e.session_id,
      ${siteId},
      (array_agg(e.visitor_id order by e.ts))[1],
      min(e.ts),
      max(e.ts),
      (array_agg(e.device order by e.ts))[1],
      bool_or(e.is_returning),
      bool_or(e.type = 'conversion')                                    as converted,
      (not bool_or(e.type = 'conversion'))
        and (
          extract(epoch from (max(e.ts) - min(e.ts))) < 10
          or coalesce(max((e.payload->>'maxScrollFrac')::numeric)
                      filter (where e.type = 'scroll'), 0) < 0.5
        )                                                               as bounced,
      coalesce(max((e.payload->>'maxScrollFrac')::numeric)
               filter (where e.type = 'scroll'), 0)                     as max_scroll_frac,
      count(*),
      (array_agg(e.experiment_id) filter (where e.experiment_id is not null))[1],
      (array_agg(e.variant_id)    filter (where e.variant_id    is not null))[1],
      bool_or(e.simulated),
      (array_agg(e.persona) filter (where e.persona is not null))[1]
    from events e
    where e.site_id = ${siteId}
    group by e.session_id
    on conflict (id) do update set
      ended_at        = excluded.ended_at,
      converted       = excluded.converted,
      bounced         = excluded.bounced,
      max_scroll_frac = excluded.max_scroll_frac,
      event_count     = excluded.event_count,
      experiment_id   = coalesce(excluded.experiment_id, sessions.experiment_id),
      variant_id      = coalesce(excluded.variant_id, sessions.variant_id)
  `);
  return (res as { rowCount?: number }).rowCount ?? 0;
}

export interface HeatmapElement {
  selector: string;
  label: string;
  viewed_pct: number;
  click_rate_pct: number;
  median_time_to_first_view_s: number | null;
  median_visible_ms: number | null;
  clicks: number;
  views: number;
  rage_clicks: number;
  dead_clicks: number;
  rect: { x: number; y: number; w: number; h: number } | null;
  above_fold_mobile: boolean | null;
  above_fold_desktop: boolean | null;
}

/**
 * Per-element behaviour for one page and one segment.
 *
 * Note the `distinct on` over `element_view`: visibility is emitted as a
 * *cumulative snapshot* every time the page is hidden (P4), so summing would
 * multiply-count a visitor who switched tabs. The last snapshot per
 * (session, selector) is the truth.
 */
export async function elementStats(
  db: Db, siteId: string, path: string, segmentKey: string
): Promise<HeatmapElement[]> {
  const seg = segmentFilter(segmentKey);
  const res = await db.execute<Record<string, unknown>>(sql`
    with seg as (
      select s.id from sessions s where s.site_id = ${siteId} and ${seg}
    ),
    total as (select count(*)::int n from seg),
    views as (
      select distinct on (e.session_id, e.selector)
        e.session_id, e.selector,
        (e.payload->>'visibleMs')::numeric        as visible_ms,
        (e.payload->>'timeToFirstViewMs')::numeric as ttfv
      from events e
      join seg on seg.id = e.session_id
      where e.type = 'element_view' and e.site_id = ${siteId}
        and e.path = ${path} and e.selector is not null
      order by e.session_id, e.selector,
               (e.payload->>'snapshot')::int desc nulls last, e.ts desc
    ),
    viewed as (
      select selector,
             count(distinct session_id)::int                      as views,
             percentile_cont(0.5) within group (order by ttfv)     as median_ttfv,
             percentile_cont(0.5) within group (order by visible_ms) as median_visible
      from views group by selector
    ),
    acted as (
      select e.selector,
             count(distinct e.session_id) filter (where e.type = 'click')::int      as clicks,
             count(*) filter (where e.type = 'rage_click')::int                     as rage_clicks,
             count(*) filter (where e.type = 'dead_click')::int                     as dead_clicks
      from events e
      join seg on seg.id = e.session_id
      where e.site_id = ${siteId} and e.path = ${path} and e.selector is not null
      group by e.selector
    )
    select
      coalesce(v.selector, a.selector)                                as selector,
      coalesce(v.views, 0)                                            as views,
      coalesce(a.clicks, 0)                                           as clicks,
      coalesce(a.rage_clicks, 0)                                      as rage_clicks,
      coalesce(a.dead_clicks, 0)                                      as dead_clicks,
      (select n from total)                                           as sessions_in_segment,
      (case when (select n from total) > 0
           then round(coalesce(v.views,0)::numeric * 100 / (select n from total), 1)
           else 0 end)::float8                                        as viewed_pct,
      -- clicks divided by VIEWS, never by sessions. Stated everywhere it shows.
      (case when coalesce(v.views,0) > 0
           then round(coalesce(a.clicks,0)::numeric * 100 / v.views, 1)
           else 0 end)::float8                                        as click_rate_pct,
      round((v.median_ttfv / 1000)::numeric, 2)::float8               as median_time_to_first_view_s,
      round(v.median_visible::numeric)::float8                        as median_visible_ms
    from viewed v
    full outer join acted a on a.selector = v.selector
    where coalesce(v.views, 0) > 0 or coalesce(a.clicks, 0) > 0
       or coalesce(a.rage_clicks, 0) > 0 or coalesce(a.dead_clicks, 0) > 0
    order by coalesce(v.views, 0) desc, clicks desc
  `);
  return (res.rows ?? []) as unknown as HeatmapElement[];
}

export async function scrollBands(db: Db, siteId: string, path: string, segmentKey: string) {
  const seg = segmentFilter(segmentKey);
  const res = await db.execute<Record<string, unknown>>(sql`
    with seg as (select s.id, s.max_scroll_frac from sessions s where s.site_id = ${siteId} and ${seg}),
    total as (select count(*)::int n from seg)
    select band.depth_pct,
           (case when (select n from total) > 0
                then round(count(*) filter (where seg.max_scroll_frac * 100 >= band.depth_pct)::numeric
                           * 100 / (select n from total), 1)
                else 0 end)::float8 as reach_pct
    from (values (25),(50),(75),(100)) as band(depth_pct)
    cross join seg
    group by band.depth_pct order by band.depth_pct
  `);
  return res.rows ?? [];
}

export async function frictionSignals(db: Db, siteId: string, path: string, segmentKey: string) {
  const seg = segmentFilter(segmentKey);
  const res = await db.execute<Record<string, unknown>>(sql`
    select e.type, e.selector, count(*)::int as count,
           count(distinct e.session_id)::int as sessions
    from events e
    join (select s.id from sessions s where s.site_id = ${siteId} and ${seg}) seg on seg.id = e.session_id
    where e.site_id = ${siteId} and e.path = ${path}
      and e.type in ('rage_click','dead_click','back_exit') and e.selector is not null
    group by e.type, e.selector
    having count(*) > 1
    order by count(*) desc limit 12
  `);
  return res.rows ?? [];
}

/** arrive → saw the CTA → clicked it → converted. */
export async function funnel(db: Db, siteId: string, path: string, segmentKey: string, ctaSelector = ".cta-primary") {
  const seg = segmentFilter(segmentKey);
  const res = await db.execute<Record<string, unknown>>(sql`
    with seg as (select s.id, s.converted from sessions s where s.site_id = ${siteId} and ${seg}),
    saw as (
      select distinct e.session_id from events e join seg on seg.id = e.session_id
      where e.type = 'element_view' and e.selector like ${"%" + ctaSelector.replace(".", "") + "%"}
    ),
    clicked as (
      select distinct e.session_id from events e join seg on seg.id = e.session_id
      where e.type = 'click' and e.selector like ${"%" + ctaSelector.replace(".", "") + "%"}
    )
    select 'arrived' as step, (select count(*)::int from seg) as sessions
    union all select 'cta_viewed',  (select count(*)::int from saw)
    union all select 'cta_clicked', (select count(*)::int from clicked)
    union all select 'converted',   (select count(*)::int from seg where converted)
  `);
  return res.rows ?? [];
}

/**
 * The agent-facing artefact. PLAN.md "Heatmaps for the agent" — a heatmap image
 * is nearly useless as a model input; this is the same data as structure.
 */
export async function getHeatmap(db: Db, siteId: string, path: string, segmentKey: string) {
  const [elements, bands, friction, funnelRows, meta] = await Promise.all([
    elementStats(db, siteId, path, segmentKey),
    scrollBands(db, siteId, path, segmentKey),
    frictionSignals(db, siteId, path, segmentKey),
    funnel(db, siteId, path, segmentKey),
    db.execute<Record<string, unknown>>(sql`
      select count(*)::int n,
             count(*) filter (where simulated)::int simulated
      from sessions s where s.site_id = ${siteId} and ${segmentFilter(segmentKey)}
    `),
  ]);

  const m = ((meta.rows ?? [])[0] ?? { n: 0, simulated: 0 }) as { n: number; simulated: number };
  return {
    page: path,
    segment: segmentKey,
    sessions: m.n,
    simulated_pct: m.n > 0 ? Math.round((m.simulated / m.n) * 100) : 0,
    elements,
    scroll_bands: bands,
    friction,
    funnel: funnelRows,
  };
}

/** Recomputes and stores every segment for a page. */
export async function computeAll(db: Db, siteId: string, path: string) {
  await rollupSessions(db, siteId);
  const windowEnd = new Date();

  // Nine segments, computed concurrently. Sequentially this was 8.5s of mostly
  // waiting: each segment is five independent queries over an HTTP database
  // driver, and none of them depends on another.
  const written = await Promise.all(COMPUTED_SEGMENTS.map(async (segmentKey) => {
    const h = await getHeatmap(db, siteId, path, segmentKey);
    await db.execute(sql`
      insert into aggregates (id, site_id, path, segment_key, window_end, sessions,
                              elements, scroll_bands, friction, funnel,
                              source_event_count, simulated_pct, computed_at)
      values (${newId("agg")}, ${siteId}, ${path}, ${segmentKey}, ${windowEnd}, ${h.sessions},
              ${JSON.stringify(h.elements)}::jsonb, ${JSON.stringify(h.scroll_bands)}::jsonb,
              ${JSON.stringify(h.friction)}::jsonb, ${JSON.stringify(h.funnel)}::jsonb,
              ${0}, ${h.simulated_pct}, now())
      on conflict (site_id, path, segment_key, window_end) do update set
        sessions = excluded.sessions, elements = excluded.elements,
        scroll_bands = excluded.scroll_bands, friction = excluded.friction,
        funnel = excluded.funnel, computed_at = now()
    `);
    return `${segmentKey} (${h.sessions})`;
  }));

  return written;
}

/**
 * Raw points for the overlay.
 *
 * The per-element table answers "which things did people act on"; this answers
 * "where on the page did it happen", which is the question a heatmap image is
 * actually good at. Coordinates come back as page fractions so the overlay can
 * be drawn over a screenshot of any width without re-measuring anything —
 * that is the whole reason events store fractions rather than pixels (§4.5).
 */
export async function heatmapPoints(
  db: Db, siteId: string, path: string, segmentKey: string,
  mode: "clicks" | "attention" = "clicks"
) {
  const seg = segmentFilter(segmentKey);
  const types = mode === "clicks"
    ? sql`e.type in ('click','rage_click','dead_click')`
    : sql`e.type = 'element_view'`;

  const res = await db.execute<Record<string, unknown>>(sql`
    select
      (e.page_frac->>'x')::float8 as x,
      (e.page_frac->>'y')::float8 as y,
      case when e.type = 'rage_click' then 3 when e.type = 'dead_click' then 2 else 1 end as weight,
      e.type,
      e.selector
    from events e
    join (select s.id from sessions s where s.site_id = ${siteId} and ${seg}) g on g.id = e.session_id
    where e.site_id = ${siteId} and e.path = ${path}
      and ${types} and e.page_frac is not null
    limit 4000
  `);

  // Attention is drawn from element boxes rather than points: an element seen
  // for four seconds is not a dot, it is a region.
  const boxes = mode === "attention"
    ? await db.execute<Record<string, unknown>>(sql`
        select sn.elements from snapshots sn
        where sn.site_id = ${siteId} and sn.path = ${path} and sn.is_current = true
        limit 1`)
    : null;

  return {
    mode,
    points: (res.rows ?? []) as unknown as { x: number; y: number; weight: number; type: string; selector: string }[],
    elements: (boxes?.rows?.[0] as { elements?: unknown })?.elements ?? null,
  };
}

/** Header figures for the heatmap screen. */
export async function pageSummary(db: Db, siteId: string, path: string, segmentKey: string) {
  const seg = segmentFilter(segmentKey);
  const res = await db.execute<Record<string, unknown>>(sql`
    with g as (select s.* from sessions s where s.site_id = ${siteId} and ${seg})
    select
      (select count(*)::int from g)                                                as sessions,
      (select count(*)::int from events e join g on g.id = e.session_id
        where e.type = 'pageview' and e.path = ${path})                            as pageviews,
      (select count(*)::int from events e join g on g.id = e.session_id
        where e.type in ('click','rage_click','dead_click') and e.path = ${path})  as clicks,
      (select round(avg(extract(epoch from (g.ended_at - g.started_at)))::numeric, 1)::float8
        from g)                                                                    as avg_seconds,
      (select round((count(*) filter (where g.converted)::numeric * 100 /
        nullif(count(*),0)), 2)::float8 from g)                                    as conversion_pct
  `);
  return (res.rows ?? [])[0] ?? {};
}
