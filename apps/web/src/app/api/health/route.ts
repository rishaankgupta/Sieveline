import { integrationStatus, loadServerEnv } from "@sieveline/core";

export const dynamic = "force-dynamic";

/**
 * Liveness + configuration readiness. Reports only booleans, never values.
 */
export function GET(): Response {
  try {
    const env = loadServerEnv();
    return Response.json(
      { status: "ok", integrations: integrationStatus(env) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ status: "misconfigured" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
