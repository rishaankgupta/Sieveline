import { PGlite } from "@electric-sql/pglite";
import { loadServerEnv, createLogger } from "@sieveline/core";
import { schema } from "@sieveline/db";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import { createAuth, type Auth } from "./auth";
import type { EmailMessage } from "./email";

const ORIGIN = "http://localhost:3000";
const outbox: EmailMessage[] = [];
let auth: Auth;
let db: ReturnType<typeof drizzle<typeof schema>>;
let client: PGlite;
let ipCounter = 0;

/** Each test uses its own client IP so rate limits don't leak between tests. */
function newIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter}`;
}

async function call(path: string, body: unknown, opts: { ip: string; cookie?: string; method?: string } ) {
  const res = await auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: opts.method ?? "POST",
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        "x-forwarded-for": opts.ip,
        ...(opts.cookie ? { cookie: opts.cookie } : {}),
      },
      body: opts.method === "GET" ? undefined : JSON.stringify(body),
    }),
  );
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, setCookie: res.headers.getSetCookie() };
}

function lastLinkTo(email: string): string {
  const m = [...outbox].reverse().find((e) => e.to === email);
  const url = m?.text.match(/https?:\/\/\S+/)?.[0];
  if (!url) throw new Error(`no email link for ${email}`);
  return url;
}

function cookieHeader(setCookie: string[]): string {
  return setCookie.map((c) => c.split(";")[0]).join("; ");
}

async function adminQuery<T>(fn: () => Promise<T>): Promise<T> {
  await client.exec("RESET ROLE");
  try {
    return await fn();
  } finally {
    await client.exec("SET ROLE sieveline_app");
  }
}

async function signUpAndVerify(email: string, ip: string) {
  const r = await call("/sign-up/email", { email, password: "correct horse battery 9", name: "Test User" }, { ip });
  expect(r.status).toBe(200);
  const verify = new URL(lastLinkTo(email));
  const v = await auth.handler(new Request(`${ORIGIN}${verify.pathname}${verify.search}`, { headers: { "x-forwarded-for": ip } }));
  expect([200, 302]).toContain(v.status);
}

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: new URL("../../../../packages/db/migrations", import.meta.url).pathname });
  // Connect the way production does: as the app role, subject to row-level security.
  await client.exec("SET ROLE sieveline_app");
  const env = loadServerEnv({
    NODE_ENV: "test",
    APP_URL: ORIGIN,
    AUTH_SECRET: "test-secret-".padEnd(48, "x"),
    DATABASE_URL: "postgres://unused/db",
    PLATFORM_OWNER_EMAILS: "owner@sieveline.test",
  });
  auth = createAuth({
    db: db as never,
    env,
    email: { send: async (m) => void outbox.push(m) },
    log: createLogger({}, { write: () => undefined }),
    offline: true,
  });
}, 60_000);

describe("auth", () => {
  it("signs up, stores an Argon2id hash, and creates an owned workspace under RLS", async () => {
    await call("/sign-up/email", { email: "ann@sieveline.test", password: "correct horse battery 9", name: "Ann Lee" }, { ip: newIp() });
    const user = await adminQuery(() => db.select().from(schema.users).where(eq(schema.users.email, "ann@sieveline.test")));
    expect(user[0]?.emailVerified).toBe(false);
    const account = await adminQuery(() => db.select().from(schema.accounts).where(eq(schema.accounts.userId, user[0]!.id)));
    expect(account[0]?.password).toMatch(/^\$argon2id\$/);
    const ws = await adminQuery(() =>
      db.select().from(schema.memberships).innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.memberships.workspaceId))
        .where(eq(schema.memberships.userId, user[0]!.id)),
    );
    expect(ws.length).toBe(1);
    expect(ws[0]?.memberships.role).toBe("owner");
    expect(ws[0]?.workspaces.name).toBe("Ann's workspace");
  });

  it("blocks sign-in until the email is verified, then allows it", async () => {
    const ip = newIp();
    await call("/sign-up/email", { email: "ben@sieveline.test", password: "correct horse battery 9", name: "Ben" }, { ip });
    const before = await call("/sign-in/email", { email: "ben@sieveline.test", password: "correct horse battery 9" }, { ip });
    expect(before.status).toBe(403);
    const verify = new URL(lastLinkTo("ben@sieveline.test"));
    await auth.handler(new Request(`${ORIGIN}${verify.pathname}${verify.search}`, { headers: { "x-forwarded-for": ip } }));
    const after = await call("/sign-in/email", { email: "ben@sieveline.test", password: "correct horse battery 9" }, { ip });
    expect(after.status).toBe(200);
    const session = await call("/get-session", null, { ip, method: "GET", cookie: cookieHeader(after.setCookie) });
    expect(session.body?.user?.email).toBe("ben@sieveline.test");
  });

  it("uses httpOnly, SameSite cookies with the sl prefix", async () => {
    const ip = newIp();
    await signUpAndVerify("cookie@sieveline.test", ip);
    const r = await call("/sign-in/email", { email: "cookie@sieveline.test", password: "correct horse battery 9" }, { ip });
    const sessionCookie = r.setCookie.find((c) => c.startsWith("sl."));
    expect(sessionCookie).toMatch(/HttpOnly/i);
    expect(sessionCookie).toMatch(/SameSite=Lax/i);
  });

  it("rejects short passwords and does not reveal whether an email exists", async () => {
    const ip = newIp();
    expect((await call("/sign-up/email", { email: "s@sieveline.test", password: "short", name: "S" }, { ip })).status).toBe(400);
    const dup = await call("/sign-up/email", { email: "ann@sieveline.test", password: "another long password 1", name: "X" }, { ip });
    expect(dup.status).toBe(200);
  });

  it("rate limits repeated failed sign-ins (11th attempt in a minute is blocked)", async () => {
    const ip = newIp();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      statuses.push((await call("/sign-in/email", { email: "ben@sieveline.test", password: "wrong password here" }, { ip })).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("refuses requests from untrusted origins (CSRF)", async () => {
    const res = await auth.handler(
      new Request(`${ORIGIN}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://evil.example", "x-forwarded-for": newIp(), cookie: "sl.session_token=x" },
        body: JSON.stringify({ email: "ben@sieveline.test", password: "correct horse battery 9" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("blocks first-login CSRF via cross-site form navigation", async () => {
    const res = await auth.handler(
      new Request(`${ORIGIN}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document",
          "x-forwarded-for": newIp(),
        },
        body: "email=ben%40sieveline.test&password=correct+horse+battery+9",
      }),
    );
    expect(res.status).toBe(403);
  });

  it("rejects open-redirect callback URLs", async () => {
    const r = await call("/sign-in/email", { email: "ben@sieveline.test", password: "correct horse battery 9", callbackURL: "https://evil.example/steal" }, { ip: newIp() });
    expect(r.status).toBe(403);
  });

  it("denies sign-in to suspended users", async () => {
    const ip = newIp();
    await signUpAndVerify("sus@sieveline.test", ip);
    await adminQuery(() => db.update(schema.users).set({ suspendedAt: new Date() }).where(eq(schema.users.email, "sus@sieveline.test")));
    const r = await call("/sign-in/email", { email: "sus@sieveline.test", password: "correct horse battery 9" }, { ip });
    expect(r.status).toBe(403);
  });

  it("grants platform owner only after email verification", async () => {
    const ip = newIp();
    await call("/sign-up/email", { email: "owner@sieveline.test", password: "correct horse battery 9", name: "Owner" }, { ip });
    const before = await adminQuery(() => db.select().from(schema.users).where(eq(schema.users.email, "owner@sieveline.test")));
    expect(before[0]?.platformRole).toBe("none");
    const verify = new URL(lastLinkTo("owner@sieveline.test"));
    await auth.handler(new Request(`${ORIGIN}${verify.pathname}${verify.search}`, { headers: { "x-forwarded-for": ip } }));
    const after = await adminQuery(() => db.select().from(schema.users).where(eq(schema.users.email, "owner@sieveline.test")));
    expect(after[0]?.platformRole).toBe("owner");
  });

  it("users cannot set their own platform role at sign-up", async () => {
    const ip = newIp();
    await call("/sign-up/email", { email: "sneaky@sieveline.test", password: "correct horse battery 9", name: "Sneaky", platformRole: "owner" }, { ip });
    const u = await adminQuery(() => db.select().from(schema.users).where(eq(schema.users.email, "sneaky@sieveline.test")));
    expect(u[0]?.platformRole ?? "none").toBe("none");
  });

  it("password reset revokes existing sessions", async () => {
    const ip = newIp();
    await signUpAndVerify("reset@sieveline.test", ip);
    const signIn = await call("/sign-in/email", { email: "reset@sieveline.test", password: "correct horse battery 9" }, { ip });
    const cookie = cookieHeader(signIn.setCookie);
    await call("/request-password-reset", { email: "reset@sieveline.test", redirectTo: "/reset-password" }, { ip });
    const link = new URL(lastLinkTo("reset@sieveline.test"));
    const token = link.pathname.split("/").pop() ?? link.searchParams.get("token");
    const r = await call("/reset-password", { newPassword: "a brand new long password", token }, { ip });
    expect(r.status).toBe(200);
    const session = await call("/get-session", null, { ip, method: "GET", cookie });
    expect(session.body).toBeNull();
    const ok = await call("/sign-in/email", { email: "reset@sieveline.test", password: "a brand new long password" }, { ip });
    expect(ok.status).toBe(200);
  });

  it("keeps workspace data isolated per user", async () => {
    const rows = await db.execute(sql`select count(*)::int as n from workspaces`);
    expect((rows.rows[0] as { n: number }).n).toBe(0);
  });
});
