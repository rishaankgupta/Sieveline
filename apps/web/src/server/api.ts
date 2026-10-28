import { Forbidden } from "@sieveline/core";
import { AdminRuleError, InsufficientCredits, MembershipRuleError, ResearchPaused } from "@sieveline/db";
import { ZodError } from "zod";
import { logger } from "./context";
import { Unauthorized } from "./session";

/** Same-origin check for state-changing API calls (CSRF defense in depth beyond SameSite cookies). */
export function assertSameOrigin(request: Request, appUrl: string): void {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(appUrl).origin) throw new Forbidden("workspace.view");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string) => UUID.test(v);

const MAX_BODY_BYTES = 256 * 1024;

/** Reads a JSON body with a size limit, so a huge request can't exhaust memory. */
export async function readJson(request: Request): Promise<unknown> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) throw new HttpError(413, "Request body too large");
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, "Request body too large");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Body must be JSON");
  }
}

export class HttpError extends Error {
  readonly status: number;
  /** Machine-readable reason the client can act on (e.g. "step_up_required"). */
  readonly code: string | undefined;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
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
    if (e instanceof MembershipRuleError) return json(409, e.message, { reason: e.reason });
    if (e instanceof ResearchPaused) return json(503, "Research is paused right now. Please try again later.");
    if (e instanceof AdminRuleError) return json(409, e.message);
    if (e instanceof HttpError) return json(e.status, e.message, e.code ? { code: e.code } : {});
    logger.error("unhandled api error", { err: e });
    return json(500, "Something went wrong");
  }
}
