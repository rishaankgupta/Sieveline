/**
 * Applies migrations using the owner (direct, unpooled) connection.
 * Usage: DATABASE_URL_UNPOOLED=... node packages/db/scripts/migrate.ts
 * Prints the real database error on failure (drizzle-kit can hide it).
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) {
  console.error("Set DATABASE_URL_UNPOOLED (owner role, direct connection)");
  process.exit(1);
}
const client = new pg.Client({ connectionString: url.replace(/sslmode=require/, "sslmode=verify-full") });
await client.connect();
try {
  await migrate(drizzle(client), { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
  console.error("migrations applied");
} catch (e) {
  const err = e as Error & { cause?: { message?: string; detail?: string; hint?: string } };
  console.error("migration failed:", err.cause?.message ?? err.message, err.cause?.detail ?? "", err.cause?.hint ?? "");
  process.exitCode = 1;
} finally {
  await client.end();
}
