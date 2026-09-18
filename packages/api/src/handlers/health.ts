import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { getDb } from "@growthx/db";
import { sql } from "drizzle-orm";
import { requireSecret } from "../secrets.js";
import { ok, unavailable } from "../http.js";

/**
 * One request that proves the whole P1 chain: API Gateway routed to Lambda,
 * Lambda read its secret from SSM, and reached Neon over HTTPS without a VPC.
 * If this returns `db: "ok"`, P1 is wired correctly end to end.
 */
export const handler: APIGatewayProxyHandlerV2 = async () => {
  const started = Date.now();
  const result: Record<string, unknown> = {
    service: "growthx-api",
    commit: process.env.GX_COMMIT ?? "dev",
    region: process.env.AWS_REGION ?? "local",
    time: new Date().toISOString(),
  };

  try {
    const db = getDb(await requireSecret("DATABASE_URL"));
    const res = await db.execute<{ tables: number; version: string }>(sql`
      select
        (select count(*)::int from information_schema.tables
          where table_schema = 'public') as tables,
        version() as version
    `);
    const row = res.rows[0];

    result.db = "ok";
    result.tables = row?.tables ?? null;
    result.postgres = row?.version.split(",")[0] ?? null;
    result.latencyMs = Date.now() - started;
    return ok(result);
  } catch (err) {
    result.db = "error";
    result.detail = err instanceof Error ? err.message : String(err);
    result.latencyMs = Date.now() - started;
    // 503, not 500: the API itself is up; its dependency is not.
    return unavailable("database unreachable", result);
  }
};
