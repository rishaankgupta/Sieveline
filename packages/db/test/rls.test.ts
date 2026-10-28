import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import { TENANT_TABLES, withTenant } from "../src/index";
import * as s from "../src/schema";

const WS_A = "00000000-0000-4000-8000-00000000000a";
const WS_B = "00000000-0000-4000-8000-00000000000b";

let client: PGlite;

/** Drizzle wraps driver errors; the database's own message is on `cause`. */
async function dbError(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const err = e as Error & { cause?: Error };
    return `${err.message} | ${err.cause?.message ?? ""}`;
  }
  return "no error";
}
let db: ReturnType<typeof drizzle>;

/** Runs as the app role, the way production connects. */
async function asApp<T>(fn: () => Promise<T>): Promise<T> {
  await client.exec("SET ROLE sieveline_app");
  try {
    return await fn();
  } finally {
    await client.exec("RESET ROLE");
  }
}

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client, { schema: s });
  await migrate(db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
  // Seed as admin role (policies grant it full access).
  await client.exec("SET ROLE sieveline_admin");
  await db.insert(s.users).values([{ id: "alice", name: "Alice", email: "a@x.com" }, { id: "bob", name: "Bob", email: "b@x.com" }]);
  await db.insert(s.workspaces).values([{ id: WS_A, name: "A" }, { id: WS_B, name: "B" }]);
  await db.insert(s.memberships).values([
    { workspaceId: WS_A, userId: "alice", role: "owner" },
    { workspaceId: WS_B, userId: "bob", role: "owner" },
  ]);
  await db.insert(s.theses).values([
    { workspaceId: WS_A, name: "A thesis", definition: {} },
    { workspaceId: WS_B, name: "B thesis", definition: {} },
  ]);
  await client.exec("RESET ROLE");
}, 60_000);

describe("row-level security", () => {
  it("is enabled and forced on every tenant table", async () => {
    const r = await client.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relname, relrowsecurity, relforcerowsecurity from pg_class where relname = any($1)`,
      [[...TENANT_TABLES]],
    );
    expect(r.rows.length).toBe(TENANT_TABLES.length);
    for (const row of r.rows) {
      expect(row.relrowsecurity, row.relname).toBe(true);
      expect(row.relforcerowsecurity, row.relname).toBe(true);
    }
  });

  it("shows nothing when no workspace is selected", async () => {
    const rows = await asApp(() => db.select().from(s.theses));
    expect(rows).toEqual([]);
  });

  it("shows only the selected workspace's rows", async () => {
    const rows = await asApp(() =>
      withTenant(db, { userId: "alice", workspaceId: WS_A }, (tx) => tx.select().from(s.theses)),
    );
    expect(rows.map((r) => r.name)).toEqual(["A thesis"]);
  });

  it("blocks writing into another workspace", async () => {
    const msg = await dbError(
      asApp(() =>
        withTenant(db, { userId: "alice", workspaceId: WS_A }, (tx) =>
          tx.insert(s.theses).values({ workspaceId: WS_B, name: "sneaky", definition: {} }),
        ),
      ),
    );
    expect(msg).toMatch(/row-level security/);
  });

  it("cannot update or delete another workspace's rows", async () => {
    await asApp(() =>
      withTenant(db, { userId: "alice", workspaceId: WS_A }, async (tx) => {
        await tx.update(s.theses).set({ name: "hacked" }).where(sql`true`);
        await tx.delete(s.theses).where(sql`workspace_id = ${WS_B}`);
      }),
    );
    await client.exec("SET ROLE sieveline_admin");
    const all = await db.select().from(s.theses);
    await client.exec("RESET ROLE");
    expect(all.find((t) => t.workspaceId === WS_B)?.name).toBe("B thesis");
    expect(all.find((t) => t.workspaceId === WS_A)?.name).toBe("hacked");
  });

  it("lets a user list only their own workspaces in the picker", async () => {
    const rows = await asApp(() =>
      withTenant(db, { userId: "alice", workspaceId: null }, (tx) => tx.select().from(s.workspaces)),
    );
    expect(rows.map((w) => w.name)).toEqual(["A"]);
  });

  it("keeps context per transaction (no leak to the next query)", async () => {
    await asApp(() => withTenant(db, { userId: "alice", workspaceId: WS_A }, async () => undefined));
    const rows = await asApp(() => db.select().from(s.theses));
    expect(rows).toEqual([]);
  });

  it("forbids the app from editing platform settings", async () => {
    const msg = await dbError(
      asApp(() => db.insert(s.settings).values({ key: "shortlist_size", value: 5, version: 1 })),
    );
    expect(msg).toMatch(/permission denied/);
  });

  it("makes usage events append-only for the app", async () => {
    const msg = await dbError(
      asApp(() =>
        withTenant(db, { userId: "alice", workspaceId: WS_A }, async (tx) => {
          await tx.insert(s.usageEvents).values({ workspaceId: WS_A, provider: "tavily", endpoint: "search", credits: "1" });
          await tx.update(s.usageEvents).set({ credits: "0" });
        }),
      ),
    );
    expect(msg).toMatch(/permission denied/);
  });

  it("rejects malformed context values", async () => {
    await expect(withTenant(db, { userId: "alice", workspaceId: "1; drop table x" }, async () => 1)).rejects.toThrow();
    await expect(withTenant(db, { userId: "", workspaceId: WS_A }, async () => 1)).rejects.toThrow();
  });
});
