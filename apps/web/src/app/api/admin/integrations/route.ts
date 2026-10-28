import { integrationStatus, TavilyClient } from "@sieveline/core";
import { adminAudit } from "@sieveline/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { actorOf, adminDb, requireStaff } from "@/server/admin";
import { assertSameOrigin, handle, readJson } from "@/server/api";
import { app } from "@/server/context";

export const dynamic = "force-dynamic";

const body = z.object({ name: z.enum(["database", "tavily", "llm"]) });

/** Which integrations are configured (booleans only; values never leave the server). */
export function GET(): Promise<Response> {
  return handle(async () => {
    await requireStaff("admin.view");
    return Response.json({ integrations: integrationStatus(app().env) }, { headers: { "Cache-Control": "no-store" } });
  });
}

/**
 * "Test connection". Every test is free: Tavily /usage costs no credits, the LLM test lists
 * models instead of generating text. Results carry status and timing, never response bodies.
 */
export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const { env, db } = app();
    assertSameOrigin(request, env.APP_URL);
    const staff = await requireStaff("integrations.test");
    const { name } = body.parse(await readJson(request));
    const t0 = Date.now();
    let ok = false;
    let detail: string;
    try {
      if (name === "database") {
        await db.execute(sql`select 1`);
        await adminDb().execute(sql`select 1`);
        ok = true;
        detail = "App and admin connections answered";
      } else if (name === "tavily") {
        if (!env.TAVILY_API_KEY) detail = "TAVILY_API_KEY is not set";
        else {
          const usage = (await new TavilyClient({ apiKey: env.TAVILY_API_KEY, environment: env.TAVILY_KEY_ENVIRONMENT, maxRetries: 0 }).usage()) as {
            key?: { usage?: number; limit?: number | null };
            account?: { current_plan?: string; plan_usage?: number; plan_limit?: number };
          };
          ok = true;
          const a = usage.account;
          detail = a ? `Plan ${a.current_plan ?? "?"}: ${a.plan_usage ?? "?"} of ${a.plan_limit ?? "?"} credits used (Tavily's figure; it can lag)` : "Key accepted";
        }
      } else {
        if (!env.LLM_BASE_URL) detail = "LLM_BASE_URL is not set";
        else {
          const res = await fetch(`${env.LLM_BASE_URL.replace(/\/$/, "")}/models`, {
            headers: env.LLM_API_KEY ? { Authorization: `Bearer ${env.LLM_API_KEY}` } : {},
            signal: AbortSignal.timeout(10_000),
          });
          ok = res.ok;
          detail = res.ok ? "Model list returned" : `HTTP ${res.status}`;
        }
      }
    } catch (e) {
      detail = e instanceof Error ? e.message.slice(0, 200) : "failed";
    }
    const ms = Date.now() - t0;
    await adminAudit(adminDb(), actorOf(staff), { action: "admin.integration.tested", targetType: "integration", targetId: name, after: { ok, ms } });
    return Response.json({ name, ok, ms, detail });
  });
}
