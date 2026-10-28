import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

export interface TenantContext {
  userId: string;
  /** null only while listing the user's workspaces (picker). */
  workspaceId: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs `fn` in a transaction with the tenant context set via `set_config(..., true)`, which
 * lasts only for this transaction. This is what row-level security policies read, so every
 * query inside sees only this workspace. Values are passed as bind parameters, never concatenated.
 */
export async function withTenant<TDb extends PgDatabase<PgQueryResultHKT, Record<string, unknown>>, T>(
  db: TDb,
  ctx: TenantContext,
  fn: (tx: Parameters<Parameters<TDb["transaction"]>[0]>[0]) => Promise<T>,
): Promise<T> {
  if (!ctx.userId || ctx.userId.length > 128) throw new Error("invalid user id");
  if (ctx.workspaceId !== null && !UUID.test(ctx.workspaceId)) throw new Error("invalid workspace id");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${ctx.userId}, true),
                                set_config('app.workspace_id', ${ctx.workspaceId ?? ""}, true)`);
    return fn(tx as Parameters<Parameters<TDb["transaction"]>[0]>[0]);
  });
}
