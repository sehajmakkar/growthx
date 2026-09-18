import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { getDb } from "@growthx/db";
import { segmentKey } from "@growthx/shared/runtime";
import { getHeatmap, funnel, computeAll, heatmapPoints, pageSummary } from "../aggregate.js";
import { getSessionDigest } from "../digests.js";
import { requireSecret } from "../secrets.js";
import { json, badRequest, serverError } from "../http.js";

/**
 * Read API for the dashboard and for the agent's tools. The same numbers feed
 * both, deliberately: if the agent ever cited a figure the human could not find
 * on screen, the evidence trail would be a fiction.
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const method = (event.requestContext?.http?.method ?? "GET").toUpperCase();
  if (method === "OPTIONS") return json(204, null);

  const route = event.requestContext?.http?.path ?? "";
  const q = event.queryStringParameters ?? {};
  const siteId = q.site ?? "site_corrick";
  const path = q.path ?? "/";
  const segment = q.segment ?? segmentKey({});

  try {
    const db = getDb(await requireSecret("DATABASE_URL"));

    if (route.endsWith("/aggregate") && method === "POST") {
      const written = await computeAll(db, siteId, path);
      return json(200, { recomputed: written });
    }
    if (route.endsWith("/heatmap")) {
      return json(200, await getHeatmap(db, siteId, path, segment));
    }
    if (route.endsWith("/points")) {
      const mode = (q.mode === "attention" ? "attention" : "clicks") as "clicks" | "attention";
      return json(200, await heatmapPoints(db, siteId, path, segment, mode));
    }
    if (route.endsWith("/summary")) {
      return json(200, await pageSummary(db, siteId, path, segment));
    }
    if (route.endsWith("/digests")) {
      return json(200, { page: path, clusters: await getSessionDigest(db, siteId, path) });
    }
    if (route.endsWith("/funnel")) {
      return json(200, { page: path, segment, steps: await funnel(db, siteId, path, segment) });
    }
    return badRequest("unknown route", { route });
  } catch (err) {
    console.error("dashboard failed", { route, segment, error: String(err) });
    return serverError("query failed", { detail: err instanceof Error ? err.message : String(err) });
  }
};
