import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";

export * from "./schema.js";
// Re-exported so scripts at the repo root can compose raw SQL without taking a
// direct dependency on drizzle-orm, which pnpm does not hoist.
export { sql } from "drizzle-orm";
export { schema };

/**
 * Neon's HTTP driver, not TCP. This is the reason Lambda needs no VPC
 * (PLAN.md §3.2): it is fetch over HTTPS, so there is no connection pool to
 * exhaust and no NAT gateway to pay for. Interactive transactions are not
 * available over HTTP; use `db.batch()` where atomicity is needed.
 */
let cached: ReturnType<typeof make> | null = null;

function make(url: string) {
  return drizzle(neon(url), { schema });
}

export function getDb(url?: string) {
  const connection = url ?? process.env.DATABASE_URL;
  if (!connection) {
    throw new Error(
      "DATABASE_URL is not set. Locally it comes from .env (GUIDE.md §B9); " +
        "in Lambda it is read from SSM at cold start."
    );
  }
  if (!cached) cached = make(connection);
  return cached;
}

export type Db = ReturnType<typeof make>;
