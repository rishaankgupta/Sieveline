import { assertCan, draftThesis } from "@sieveline/core";
import { z } from "zod";
import { assertSameOrigin, handle, HttpError, readJson } from "@/server/api";
import { app, logger } from "@/server/context";
import { requireWorkspace } from "@/server/session";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const body = z.object({ description: z.string().trim().min(15).max(1500) });

/** Per-instance throttle for drafts (each is one LLM call). Serverless instances don't share it; fine at this scale. */
const recent = new Map<string, number[]>();
const DRAFTS_PER_HOUR = 20;

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const { env, llm } = app();
    assertSameOrigin(request, env.APP_URL);
    const ws = await requireWorkspace();
    assertCan(ws.role, "thesis.edit");
    if (!llm) throw new HttpError(503, "Drafting isn't configured yet. Start from the template instead.");
    const now = Date.now();
    const times = (recent.get(ws.userId) ?? []).filter((t) => now - t < 3_600_000);
    if (times.length >= DRAFTS_PER_HOUR) throw new HttpError(429, "Too many drafts this hour. Please edit the current one.");
    recent.set(ws.userId, [...times, now]);

    const { description } = body.parse(await readJson(request));
    try {
      const { thesis } = await draftThesis(llm, description);
      return Response.json({ thesis });
    } catch (e) {
      logger.warn("thesis draft failed", { err: e });
      throw new HttpError(502, "Couldn't draft rules just now. Please try again or start from the template.");
    }
  });
}
