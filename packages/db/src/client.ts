import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

/**
 * Database client for Neon. Uses the WebSocket Pool driver because tenant isolation needs
 * real transactions (set_config(..., true) is transaction-scoped). The HTTP driver can't do that.
 *
 * Use the pooled connection string whose login role is a member of `sieveline_app`.
 * The admin panel uses a second connection whose role is a member of `sieveline_admin`.
 */
export function createDb(connectionString: string) {
  const pool = new Pool({ connectionString, max: 5, idleTimeoutMillis: 10_000 });
  return drizzle({ client: pool, schema });
}

export type Db = ReturnType<typeof createDb>;
