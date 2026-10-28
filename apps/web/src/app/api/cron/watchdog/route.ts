import { timingSafeEqual } from "node:crypto";
import { adminDb } from "@/server/admin";
import { handle, HttpError } from "@/server/api";
import { sweepStaleWork } from "@/server/watchdog";

export const dynamic = "force-dynamic";

/**
 * Vercel Cron (vercel.json) calls this with `Authorization: Bearer $CRON_SECRET`. Without the
 * secret configured the endpoint refuses every request. Admin page visits also run the sweep,
 * because the free Vercel plan allows crons only once a day.
 */
export function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const secret = process.env.CRON_SECRET;
    const got = Buffer.from(request.headers.get("authorization") ?? "");
    const want = Buffer.from(`Bearer ${secret ?? ""}`);
    if (!secret || secret.length < 16 || got.length !== want.length || !timingSafeEqual(got, want)) throw new HttpError(401, "Unauthorized", "cron_auth");
    return Response.json(await sweepStaleWork(adminDb()), { headers: { "Cache-Control": "no-store" } });
  });
}
