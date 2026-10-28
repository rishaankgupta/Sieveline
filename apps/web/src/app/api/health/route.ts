import { ConfigError, integrationStatus, loadServerEnv } from "@sieveline/core";

export const dynamic = "force-dynamic";

/**
 * Liveness + configuration readiness. Reports booleans and, when misconfigured, the names of the
 * variables at fault (names are public in .env.example; values are never included).
 */
export function GET(): Response {
  const headers = { "Cache-Control": "no-store" };
  try {
    const env = loadServerEnv();
    return Response.json({ status: "ok", integrations: integrationStatus(env) }, { headers });
  } catch (e) {
    const variables = e instanceof ConfigError ? [...new Set(e.problems.map((p) => p.split(":")[0]!.trim()))] : [];
    return Response.json({ status: "misconfigured", variables }, { status: 503, headers });
  }
}
