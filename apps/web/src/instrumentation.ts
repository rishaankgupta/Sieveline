/**
 * Runs once when the server starts. Validates configuration and logs exactly which variables
 * are wrong (names only, never values). It does not throw: a throw here takes down every route,
 * including /api/health, which then can't tell the operator what is missing. Routes that need
 * the configuration still refuse to run (app() throws), so nothing works half-configured.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ConfigError, loadServerEnv } = await import("@sieveline/core");
  try {
    loadServerEnv();
  } catch (e) {
    const problems = e instanceof ConfigError ? e.problems : ["unknown configuration error"];
    console.error(JSON.stringify({ level: "error", msg: "server misconfigured", problems }));
  }
}
