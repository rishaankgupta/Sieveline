import { createLogger, loadServerEnv, TavilyClient, type LlmClient, type ServerEnv } from "@sieveline/core";
import { createDb, postgresTavilyCache, recordUsage, type Db } from "@sieveline/db";
import { createLlm } from "./llm.ts";

/**
 * Dependencies for research steps. Built once per function instance. Deliberately free of
 * Next.js-only imports so workflow step bundles can load it.
 */
interface Deps {
  env: ServerEnv;
  db: Db;
  llm: LlmClient | null;
}

let deps: Deps | undefined;

export function researchDeps(): Deps {
  if (!deps) {
    const env = loadServerEnv();
    const db = createDb(env.DATABASE_URL);
    deps = { env, db, llm: createLlm(env) };
  }
  return deps;
}

export const researchLog = createLogger({ service: "research" });

/** A Tavily client whose every call (and cache hit) is metered against this run. */
export function tavilyForRun(ctx: { userId: string; workspaceId: string }, runId: string, cacheTtlDays: number): TavilyClient {
  const { env, db } = researchDeps();
  if (!env.TAVILY_API_KEY) throw new Error("TAVILY_API_KEY is not set");
  return new TavilyClient({
    apiKey: env.TAVILY_API_KEY,
    environment: env.TAVILY_KEY_ENVIRONMENT,
    baseUrl: env.TAVILY_BASE_URL,
    cache: postgresTavilyCache(db),
    cacheTtlSeconds: cacheTtlDays * 86_400,
    onUsage: (e) =>
      recordUsage(db, ctx, {
        runId, provider: "tavily", endpoint: e.endpoint, credits: e.credits, costUsd: 0, cached: e.cached,
        ...(e.requestId ? { requestId: e.requestId } : {}),
      }),
  });
}

/**
 * A Tavily client with no cache and no automatic metering. Used for deep dives, whose credits
 * are recorded once, idempotently, when the task settles (finishDeepDive).
 */
export function tavilyUnmetered(): TavilyClient {
  const { env } = researchDeps();
  if (!env.TAVILY_API_KEY) throw new Error("TAVILY_API_KEY is not set");
  return new TavilyClient({ apiKey: env.TAVILY_API_KEY, environment: env.TAVILY_KEY_ENVIRONMENT, baseUrl: env.TAVILY_BASE_URL });
}

/** An LLM client whose cost is metered against this run. */
export function llmForRun(ctx: { userId: string; workspaceId: string }, runId: string): LlmClient | undefined {
  const { db, llm } = researchDeps();
  if (!llm) return undefined;
  return {
    async json(input) {
      const out = await llm.json(input);
      await recordUsage(db, ctx, { runId, provider: "llm", endpoint: input.task, credits: 0, costUsd: out.costUsd, cached: false });
      return out;
    },
  };
}
