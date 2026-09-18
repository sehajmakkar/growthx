import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { getDb, events, sites } from "@growthx/db";
import { eq } from "drizzle-orm";
import { IngestBatch } from "@growthx/shared";
import { requireSecret } from "../secrets.js";
import { json, badRequest } from "../http.js";

/**
 * Behavioural ingestion.
 *
 * Two properties matter more than throughput here:
 *
 * 1. It accepts `text/plain`. `navigator.sendBeacon` cannot set a JSON content
 *    type without triggering a CORS preflight, and a preflight during page
 *    unload never completes — so the last events of every session, which are
 *    the most informative ones, would be silently lost.
 * 2. It never returns an error the snippet would retry on. A telemetry endpoint
 *    that fails loudly is a telemetry endpoint that breaks customer pages.
 */

// Site origins are checked once per container, not once per request.
const originCache = new Map<string, string[]>();

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  // A preflight must never be answered with an error, whatever routes exist.
  if ((event.requestContext?.http?.method ?? "").toUpperCase() === "OPTIONS") {
    return json(204, null);
  }

  let parsedBody: unknown;
  try {
    const raw = event.isBase64Encoded && event.body
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;
    parsedBody = JSON.parse(raw ?? "{}");
  } catch {
    return badRequest("body is not valid JSON");
  }

  const parsed = IngestBatch.safeParse(parsedBody);
  if (!parsed.success) {
    return badRequest("invalid batch", parsed.error.issues.slice(0, 5));
  }
  const batch = parsed.data;

  try {
    const db = getDb(await requireSecret("DATABASE_URL"));

    let allowed = originCache.get(batch.siteId);
    if (!allowed) {
      const [site] = await db.select().from(sites).where(eq(sites.id, batch.siteId)).limit(1);
      if (!site) return badRequest("unknown site", { siteId: batch.siteId });
      allowed = site.origins ?? [];
      originCache.set(batch.siteId, allowed);
    }

    // Origin is advisory, not a security boundary — a siteId is public by
    // design, exactly like a analytics measurement id. It is here to stop one
    // customer's data leaking into another's by misconfiguration.
    const origin = event.headers?.origin ?? event.headers?.Origin ?? "";
    const originOk =
      allowed.length === 0 ||
      allowed.some((o) => origin.startsWith(o)) ||
      origin === "" ||
      origin.startsWith("http://localhost") ||
      origin.startsWith("http://127.0.0.1");

    if (!originOk) {
      console.warn("collect rejected origin", { origin, allowed, siteId: batch.siteId });
      return json(202, { accepted: 0, ignored: batch.events.length, reason: "origin not allowed", origin });
    }

    const rows = batch.events.map((e) => ({
      siteId: batch.siteId,
      sessionId: batch.sessionId,
      visitorId: batch.visitorId,
      ts: new Date(e.ts),
      seq: e.seq,
      type: e.type,
      path: e.path,
      experimentId: e.experimentId,
      variantId: e.variantId,
      device: batch.device,
      isReturning: batch.isReturning,
      referrer: batch.referrer,
      viewport: batch.viewport,
      selector: e.selector ?? null,
      elemFrac: e.elemFrac ?? null,
      pageFrac: e.pageFrac ?? null,
      vpFrac: e.vpFrac ?? null,
      scrollY: e.scrollY ?? null,
      docH: e.docH ?? null,
      payload: e.payload ?? null,
      simulated: batch.simulated,
      persona: batch.persona,
    }));

    await db.insert(events).values(rows);
    return json(200, { accepted: rows.length });
  } catch (err) {
    // Swallowed for the caller — losing a batch beats breaking a customer's
    // page — but never swallowed for us. Returning 202 without logging made a
    // real data-loss bug invisible: CloudWatch showed clean invocations while
    // most events were being dropped.
    console.error("collect failed", {
      siteId: batch.siteId,
      sessionId: batch.sessionId,
      events: batch.events.length,
      error: err instanceof Error ? err.message : String(err),
    });
    return json(202, {
      accepted: 0,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
