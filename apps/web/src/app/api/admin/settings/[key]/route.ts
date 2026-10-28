import { researchSettingsOverrideSchema } from "@sieveline/core";
import { adminPutSetting } from "@sieveline/db";
import { z } from "zod";
import { actorOf, adminDb, requireStaff } from "@/server/admin";
import { assertSameOrigin, handle, HttpError, readJson } from "@/server/api";
import { app } from "@/server/context";

export const dynamic = "force-dynamic";

/**
 * Only known keys can be written, each with its own schema, so a typo can't store something the
 * pipeline later misreads. research_settings is stored as a partial override of the defaults.
 */
const SETTINGS = {
  research_settings: { schema: researchSettingsOverrideSchema, action: "settings.edit" },
  research_paused: { schema: z.boolean(), action: "research.kill_switch" },
} as const;

const body = z.object({ value: z.unknown(), note: z.string().trim().min(3, "Say why you are changing it").max(500) });

export function PUT(request: Request, { params }: { params: Promise<{ key: string }> }): Promise<Response> {
  return handle(async () => {
    assertSameOrigin(request, app().env.APP_URL);
    const { key } = await params;
    const def = SETTINGS[key as keyof typeof SETTINGS];
    if (!def) throw new HttpError(404, "Unknown setting");
    const staff = await requireStaff(def.action);
    const input = body.parse(await readJson(request));
    const value = def.schema.parse(input.value);
    const version = await adminPutSetting(adminDb(), actorOf(staff), key, value, input.note);
    return Response.json({ version });
  });
}
