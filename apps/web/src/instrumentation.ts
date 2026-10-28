/**
 * Runs once when the server starts. Validates configuration so a missing or malformed secret
 * stops the server immediately instead of failing later in a user's request.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { loadServerEnv } = await import("@sieveline/core");
  loadServerEnv();
}
