import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { getDb, experiments, variants, sites } from "@growthx/db";
import { and, eq } from "drizzle-orm";
import { MANIFEST_MAX_AGE_S, MANIFEST_SWR_S } from "@growthx/shared/runtime";
import { requireSecret } from "../secrets.js";
import { json, badRequest } from "../http.js";

/**
 * What the snippet fetches before paint.
 *
 * Per (site, path) and never per visitor — that is the whole point (PLAN.md
 * §9.1). A per-visitor response could not be cached, so every first paint would
 * wait on a cold Lambda, which is precisely what causes flicker. The snippet
 * buckets locally from a hash of its visitor id instead.
 *
 * The 30s max-age is also the kill switch's latency: stopping an experiment
 * removes it from this response, and the live site stops serving the variant
 * within half a minute (PLAN.md §6 P18).
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const q = event.queryStringParameters ?? {};
  const siteId = q.site;
  const path = q.path ?? "/";
  if (!siteId) return badRequest("missing ?site");

  try {
    const db = getDb(await requireSecret("DATABASE_URL"));

    const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
    if (!site) return badRequest("unknown site", { siteId });

    const running = await db
      .select()
      .from(experiments)
      .where(
        and(
          eq(experiments.siteId, siteId),
          eq(experiments.path, path),
          eq(experiments.status, "running")
        )
      );

    const out = [];
    for (const exp of running) {
      const rows = await db
        .select()
        .from(variants)
        .where(eq(variants.experimentId, exp.id));
      out.push({
        id: exp.id,
        path: exp.path,
        split: exp.split as Record<string, number>,
        variants: rows.map((v) => ({ id: v.id, mutations: v.mutations ?? [] })),
      });
    }

    return json(
      200,
      {
        v: 1,
        siteId,
        generatedAt: Date.now(),
        conversion: site.conversion,
        experiments: out,
      },
      {
        "cache-control": `public, max-age=${MANIFEST_MAX_AGE_S}, stale-while-revalidate=${MANIFEST_SWR_S}`,
      }
    );
  } catch (err) {
    // A failing manifest must never block a customer's page: the snippet treats
    // any non-200 as "no experiment" and reveals the original immediately.
    return json(
      200,
      {
        v: 1,
        siteId,
        generatedAt: Date.now(),
        conversion: { kind: "url", value: "/signup/success" },
        experiments: [],
        degraded: err instanceof Error ? err.message : String(err),
      },
      { "cache-control": "no-store" }
    );
  }
};
