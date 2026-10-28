import { sql } from "drizzle-orm";
import type { AnyDb } from "./workspaces.ts";

/**
 * Fixed-window rate limit shared by every server instance (Postgres `rate_limits` table, the
 * same one Better Auth uses; keys here are prefixed "app:" so they never collide).
 * One atomic upsert per hit: returns false when the caller is over the limit.
 */
export async function hitRateLimit(db: AnyDb, key: string, max: number, windowMs: number): Promise<boolean> {
  const now = Date.now();
  const k = `app:${key}`.slice(0, 200);
  const r = await db.execute(sql`
    insert into rate_limits (id, key, count, last_request) values (${crypto.randomUUID()}, ${k}, 1, ${now})
    on conflict (key) do update set
      count = case when rate_limits.last_request < ${now - windowMs} then 1 else rate_limits.count + 1 end,
      last_request = case when rate_limits.last_request < ${now - windowMs} then ${now} else rate_limits.last_request end
    returning count`);
  const rows = Array.isArray(r) ? r : ((r as { rows?: { count: number }[] }).rows ?? []);
  return Number((rows[0] as { count?: number } | undefined)?.count ?? 0) <= max;
}
