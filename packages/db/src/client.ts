import { Pool as NeonPool } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.ts";
import type { AnyDb } from "./workspaces.ts";

/**
 * Database client. Neon URLs use Neon's WebSocket Pool (works on Vercel functions); any other
 * Postgres URL (local Docker, CI, tests) uses node-postgres. Both support real transactions,
 * which tenant isolation needs (set_config(..., true) is transaction-scoped).
 *
 * Use a login role that is a member of `sieveline_app`; the admin panel uses one in `sieveline_admin`.
 */
/**
 * An idle pooled connection can be closed by the server (Neon scales to zero, restarts, network
 * blips). Without a listener Node treats that as an unhandled error and crashes the process.
 * The pool discards the broken client and opens a new one on the next query.
 */
function onIdleError(err: Error): void {
  console.error(JSON.stringify({ level: "warn", msg: "database idle connection closed", error: err.message }));
}

export function createDb(connectionString: string): AnyDb {
  const isNeon = /\.neon\.tech(:\d+)?\//.test(connectionString) || process.env.DB_DRIVER === "neon";
  if (isNeon) {
    const pool = new NeonPool({ connectionString, max: 5, idleTimeoutMillis: 10_000 });
    pool.on("error", onIdleError);
    return drizzleNeon({ client: pool, schema }) as unknown as AnyDb;
  }
  const max = Number(process.env.DB_POOL_MAX ?? 5) || 5;
  const pool = new pg.Pool({ connectionString, max, idleTimeoutMillis: 10_000 });
  pool.on("error", onIdleError);
  return drizzlePg({ client: pool, schema }) as unknown as AnyDb;
}

export type Db = AnyDb;
