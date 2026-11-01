import { randomBytes } from "node:crypto";
import { DEMO_EMAIL_DOMAIN, hitRateLimit, listUserWorkspaces, schema, seedSampleRun, withTenant, type SampleRun } from "@sieveline/db";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { assertSameOrigin, handle, HttpError } from "@/server/api";
import { app, logger } from "@/server/context";
import sample from "@/server/sample-run.json";

export const dynamic = "force-dynamic";

const PER_IP_PER_HOUR = 5;
const PLATFORM_PER_DAY = 300;

/**
 * One-click demo (DEMO_MODE only): creates a throwaway account (deleted after 24 hours), signs
 * it in, copies a real finished list into its workspace and gives it a small credit cap for one
 * real search. Rate limited per IP and platform-wide.
 */
export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const { env, db, auth } = app();
    if (!env.DEMO_MODE) throw new HttpError(404, "Not found");
    assertSameOrigin(request, env.APP_URL);
    const h = await headers();
    const ip = (h.get(env.CLIENT_IP_HEADER) ?? "").split(",")[0]?.trim() || "unknown";
    if (!(await hitRateLimit(db, `demo:ip:${ip}`, PER_IP_PER_HOUR, 3_600_000))) throw new HttpError(429, "Too many demo accounts from your network. Please try again in an hour.");
    if (!(await hitRateLimit(db, "demo:all", PLATFORM_PER_DAY, 86_400_000))) throw new HttpError(503, "The demo is busy today. Please sign up instead.");

    const email = `demo-${randomBytes(6).toString("hex")}@${DEMO_EMAIL_DOMAIN}`;
    const password = randomBytes(24).toString("base64url");
    // asResponse keeps Better Auth's Set-Cookie headers (the session), which we pass back.
    const res = await auth.api.signUpEmail({ body: { email, password, name: "Demo buyer" }, headers: h, asResponse: true });
    if (!res.ok) {
      logger.warn("demo sign-up failed", { status: res.status });
      throw new HttpError(502, "Could not start the demo. Please try again.");
    }
    const { user } = (await res.json()) as { user: { id: string } };
    const [ws] = await listUserWorkspaces(db, user.id);
    if (!ws) throw new HttpError(500, "Demo workspace missing");
    const ctx = { userId: user.id, workspaceId: ws.id };
    await withTenant(db, ctx, (tx) =>
      tx.update(schema.workspaces).set({ name: "Demo workspace", monthlyCreditCap: env.DEMO_CREDIT_CAP }).where(eq(schema.workspaces.id, ws.id)),
    );
    const { runId } = await seedSampleRun(db, ctx, sample as unknown as SampleRun);

    const out = Response.json({ runId }, { status: 201, headers: { "Cache-Control": "no-store" } });
    for (const c of res.headers.getSetCookie()) out.headers.append("Set-Cookie", c);
    return out;
  });
}
