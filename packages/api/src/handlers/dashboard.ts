import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { getDb, sql } from "@growthx/db";
import { segmentKey } from "@growthx/shared/runtime";
import { getHeatmap, funnel, computeAll, heatmapPoints, pageSummary } from "../aggregate.js";
import { getSessionDigest } from "../digests.js";
import { createOpportunity, listOpportunities } from "../opportunities.js";
import { proposeExperiment, listExperiments, launchExperiment, listPolicyDecisions } from "../experiments.js";
import { policyDocument } from "../policy.js";
import { listApprovals, decideApproval, stopExperiment, rejectionFeedback } from "../approvals.js";
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
    // The agent's run log. Written by the agent, read by the dashboard, so a
    // human can check the reasoning against what the agent was actually shown.
    if (route.endsWith("/runs") && method === "POST") {
      const body = JSON.parse(event.body ?? "{}");
      await db.execute(sql`
        insert into runs (id, site_id, trigger, status, steps, error, finished_at)
        values (${body.id}, ${body.siteId ?? siteId}, ${body.trigger ?? "manual"},
                ${body.status ?? "running"}, ${JSON.stringify(body.steps ?? [])}::jsonb,
                ${body.error ?? null},
                ${body.finishedAt ? new Date(body.finishedAt * 1000) : null})
        on conflict (id) do update set
          status = excluded.status, steps = excluded.steps,
          error = excluded.error, finished_at = excluded.finished_at
      `);
      return json(200, { ok: true, id: body.id });
    }
    if (route.endsWith("/runs")) {
      const res = await db.execute(sql`
        select id, trigger, status, steps, error, started_at, finished_at
        from runs where site_id = ${siteId} order by started_at desc limit 20`);
      return json(200, { runs: res.rows ?? [] });
    }
    if (route.endsWith("/snapshot")) {
      const res = await db.execute(sql`
        select path, viewport, elements, content_hash from snapshots
        where site_id = ${siteId} and path = ${path} and is_current = true limit 1`);
      return json(200, (res.rows ?? [])[0] ?? { error: "no snapshot" });
    }
    if (route.endsWith("/learnings")) {
      const res = await db.execute(sql`
        select id, hypothesis, generalisation, segment, outcome, tags, confidence, created_at
        from learnings where site_id = ${siteId} order by created_at desc limit 50`);
      return json(200, { learnings: res.rows ?? [] });
    }
    if (route.endsWith("/opportunities") && method === "POST") {
      const body = JSON.parse(event.body ?? "{}");
      const result = await createOpportunity(db, siteId, path, body);
      // 422 rather than 400: the request was well-formed, its claims were not
      // supported. The agent reads these errors and retries with real figures.
      return json(result.stored ? 200 : 422, result);
    }
    if (route.endsWith("/opportunities")) {
      return json(200, { opportunities: await listOpportunities(db, siteId) });
    }
    // The policy file itself, plus every decision it has made. Denials are the
    // point: an action that was refused writes nothing else anywhere.
    if (route.endsWith("/policy")) {
      return json(200, {
        ...policyDocument(),
        decisions: await listPolicyDecisions(db, siteId),
      });
    }
    // The human gate. GET is the queue; POST is a decision on one item.
    if (route.endsWith("/approvals") && method === "POST") {
      const body = JSON.parse(event.body ?? "{}");
      const result = await decideApproval(db, siteId, body);
      return json(result.ok ? 200 : 422, result);
    }
    if (route.endsWith("/approvals")) {
      return json(200, { approvals: await listApprovals(db, siteId) });
    }
    // Read by the agent before it proposes: why a human turned something down.
    if (route.endsWith("/feedback")) {
      return json(200, { rejections: await rejectionFeedback(db, siteId) });
    }
    if (route.endsWith("/experiments/stop") && method === "POST") {
      const body = JSON.parse(event.body ?? "{}");
      const result = await stopExperiment(db, siteId, body);
      return json(result.ok ? 200 : 422, result);
    }
    if (route.endsWith("/experiments/launch") && method === "POST") {
      const body = JSON.parse(event.body ?? "{}");
      const result = await launchExperiment(db, siteId, body);
      // 403, not 400: the request was valid and was refused. The status code
      // should say "you are not allowed to", not "you typed it wrong".
      return json(result.launched ? 200 : ("denied" in result ? 403 : 422), result);
    }
    if (route.endsWith("/experiments") && method === "POST") {
      const body = JSON.parse(event.body ?? "{}");
      const result = await proposeExperiment(db, siteId, path, body);
      return json(result.stored ? 200 : ("denied" in result ? 403 : 422), result);
    }
    if (route.endsWith("/experiments")) {
      return json(200, { experiments: await listExperiments(db, siteId) });
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
