import { Forbidden } from "@sieveline/core";
import { InsufficientCredits, ResearchPaused } from "@sieveline/db";
import { ZodError } from "zod";
import { logger } from "./context";
import { Unauthorized } from "./session";

/** Same-origin check for state-changing API calls (CSRF defense in depth beyond SameSite cookies). */
export function assertSameOrigin(request: Request, appUrl: string): void {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(appUrl).origin) throw new Forbidden("workspace.view");
}

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Maps known errors to safe JSON responses; anything else is logged and returned as a generic 500. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    const json = (status: number, error: string, extra: Record<string, unknown> = {}) =>
      Response.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
    if (e instanceof Unauthorized) return json(401, "Sign in required");
    if (e instanceof Forbidden) return json(403, "You don't have permission to do that");
    if (e instanceof ZodError) return json(400, "Invalid input", { issues: e.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })) });
    if (e instanceof InsufficientCredits) return json(402, e.message, { available: e.available, needed: e.needed });
    if (e instanceof ResearchPaused) return json(503, "Research is paused right now. Please try again later.");
    if (e instanceof HttpError) return json(e.status, e.message);
    logger.error("unhandled api error", { err: e });
    return json(500, "Something went wrong");
  }
}
