import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { getDb, snapshots } from "@growthx/db";
import { and, eq, ne } from "drizzle-orm";
import { SnapshotPayload } from "@growthx/shared";
import { newId } from "@growthx/shared/runtime";
import { requireSecret } from "../secrets.js";
import { json, badRequest } from "../http.js";

/**
 * Stores the page outline the variant generator reads.
 *
 * Keyed on a content hash so re-capturing an unchanged page is a no-op: the
 * outline changes only when the page does, and the agent should not see a new
 * "version" of a page that nobody edited.
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  let body: unknown;
  try {
    const raw = event.isBase64Encoded && event.body
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;
    body = JSON.parse(raw ?? "{}");
  } catch {
    return badRequest("body is not valid JSON");
  }

  const parsed = SnapshotPayload.safeParse(body);
  if (!parsed.success) return badRequest("invalid snapshot", parsed.error.issues.slice(0, 5));
  const snap = parsed.data;

  try {
    const db = getDb(await requireSecret("DATABASE_URL"));

    const existing = await db
      .select()
      .from(snapshots)
      .where(
        and(
          eq(snapshots.siteId, snap.siteId),
          eq(snapshots.path, snap.path),
          eq(snapshots.contentHash, snap.contentHash)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return json(200, { stored: false, reason: "unchanged", id: existing[0]!.id, elements: snap.elements.length });
    }

    const id = newId("snap");
    await db.insert(snapshots).values({
      id,
      siteId: snap.siteId,
      path: snap.path,
      contentHash: snap.contentHash,
      viewport: snap.viewport,
      elements: snap.elements,
      isCurrent: true,
    });

    // Exactly one current snapshot per page: the agent must never be handed two
    // competing descriptions of the same thing.
    await db
      .update(snapshots)
      .set({ isCurrent: false })
      .where(
        and(
          eq(snapshots.siteId, snap.siteId),
          eq(snapshots.path, snap.path),
          ne(snapshots.id, id)
        )
      );

    return json(200, { stored: true, id, elements: snap.elements.length });
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : String(err) });
  }
};
