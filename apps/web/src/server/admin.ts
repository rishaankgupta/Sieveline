import "server-only";
import { adminCan, type AdminAction, type PlatformRole, STEP_UP_ACTIONS } from "@sieveline/core";
import { createDb, schema, type Db } from "@sieveline/db";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { createHash } from "node:crypto";
import { ipAllowed, STEP_UP_MS, stepUpToken, verifyStepUpToken } from "./admin-tokens";
import { HttpError } from "./api";
import { app } from "./context";

/**
 * Access control for /admin (docs/07-admin/ADMIN.md section 3):
 * - platform staff role, re-read from the database on every request (never trusted from a cookie);
 * - 2FA must be on;
 * - optional IP allowlist;
 * - the session is signed out after 30 minutes without admin activity;
 * - dangerous actions need a fresh 2FA code (step-up, valid 5 minutes, bound to the session).
 * Anyone who fails the first three checks gets a plain 404, so /admin does not reveal itself.
 */

export const ADMIN_IDLE_MS = 30 * 60_000;
export const STEP_UP_COOKIE = "sl.stepup";

let adminDbInstance: Db | undefined;

/** The admin connection (login role in sieveline_admin). Never used outside /admin. */
export function adminDb(): Db {
  if (!adminDbInstance) {
    const url = app().env.DATABASE_URL_ADMIN;
    if (!url) throw new HttpError(503, "Admin database connection is not configured (DATABASE_URL_ADMIN)");
    adminDbInstance = createDb(url);
  }
  return adminDbInstance;
}

export class AdminNotFound extends HttpError {
  constructor() {
    super(404, "Not found");
  }
}
export class AdminNeeds2FA extends HttpError {
  constructor() {
    super(403, "Turn on two-factor authentication to use the admin panel", "two_factor_required");
  }
}
export class AdminIdle extends HttpError {
  constructor() {
    super(401, "Signed out after 30 minutes without activity", "admin_idle");
  }
}
export class StepUpRequired extends HttpError {
  constructor() {
    super(401, "Enter a code from your authenticator app to continue", "step_up_required");
  }
}

export interface Staff {
  userId: string;
  email: string;
  role: PlatformRole;
  sessionId: string;
  ipHash: string | null;
}

async function clientIp(): Promise<string | null> {
  const h = await headers();
  const raw = h.get(app().env.CLIENT_IP_HEADER) ?? "";
  return raw.split(",")[0]?.trim() || null;
}

function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return createHash("sha256").update(`${app().env.AUTH_SECRET}:${ip}`).digest("hex").slice(0, 32);
}

/**
 * Checks everything for an admin request and returns the staff member. `action` is checked
 * against the permission matrix; step-up actions also need a valid step-up cookie.
 */
export async function requireStaff(action: AdminAction = "admin.view"): Promise<Staff> {
  const { env, auth } = app();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new AdminNotFound();
  const ip = await clientIp();
  if (!ipAllowed(ip, env.ADMIN_IP_ALLOWLIST)) throw new AdminNotFound();

  const db = adminDb();
  const [user] = await db
    .select({ id: schema.users.id, email: schema.users.email, role: schema.users.platformRole, twoFactorEnabled: schema.users.twoFactorEnabled, suspendedAt: schema.users.suspendedAt })
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id));
  if (!user || user.suspendedAt || !adminCan(user.role, "admin.view")) throw new AdminNotFound();
  if (!user.twoFactorEnabled) throw new AdminNeeds2FA();

  const [row] = await db.select({ seen: schema.sessions.adminLastSeenAt }).from(schema.sessions).where(eq(schema.sessions.id, session.session.id));
  const now = Date.now();
  if (row?.seen && now - row.seen.getTime() > ADMIN_IDLE_MS) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, session.session.id));
    throw new AdminIdle();
  }
  // Throttled write: at most once a minute per session.
  if (!row?.seen || now - row.seen.getTime() > 60_000) {
    await db.update(schema.sessions).set({ adminLastSeenAt: new Date(now) }).where(eq(schema.sessions.id, session.session.id));
  }

  if (!adminCan(user.role, action)) throw new HttpError(403, "Your admin role can't do that");
  const staff: Staff = { userId: user.id, email: user.email, role: user.role, sessionId: session.session.id, ipHash: hashIp(ip) };
  if (STEP_UP_ACTIONS.has(action) && !(await hasStepUp(staff))) throw new StepUpRequired();
  return staff;
}

// ---------------------------------------------------------------- step-up cookie
async function hasStepUp(staff: Staff): Promise<boolean> {
  return verifyStepUpToken(app().env.AUTH_SECRET, (await cookies()).get(STEP_UP_COOKIE)?.value, staff.sessionId);
}

export async function setStepUpCookie(staff: Staff): Promise<void> {
  const exp = Date.now() + STEP_UP_MS;
  (await cookies()).set(STEP_UP_COOKIE, stepUpToken(app().env.AUTH_SECRET, staff.sessionId, exp), {
    httpOnly: true,
    secure: app().env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: STEP_UP_MS / 1000,
  });
}

export function actorOf(staff: Staff) {
  return { userId: staff.userId, ipHash: staff.ipHash };
}
