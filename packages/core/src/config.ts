import { z } from "zod";

const optional = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const csv = z
  .string()
  .default("")
  .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean));

/**
 * Server configuration. Validated once at startup; the app refuses to start if a required
 * value is missing or malformed. Secrets are never logged: errors name the variable only.
 */
export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  DATABASE_URL: z.string().url().refine((v) => v.startsWith("postgres"), "must be a postgres URL"),
  DATABASE_URL_UNPOOLED: optional,
  TAVILY_API_KEY: optional.refine((v) => v === undefined || v.startsWith("tvly-"), "must start with tvly-"),
  TAVILY_KEY_ENVIRONMENT: z.enum(["production", "development"]).default("development"),
  LLM_PROVIDER: optional,
  LLM_API_KEY: optional,
  LLM_BASE_URL: optional,
  LLM_MODEL_SCORING: optional,
  LLM_MODEL_CHAT: optional,
  GLOBAL_DAILY_TAVILY_CREDIT_LIMIT: z.coerce.number().int().positive().default(2000),
  DEFAULT_WORKSPACE_MONTHLY_CREDIT_CAP: z.coerce.number().int().positive().default(1000),
  DEEP_DIVE_MAX_CREDITS: z.coerce.number().int().positive().default(110),
  TURNSTILE_SECRET_KEY: optional,
  PLATFORM_OWNER_EMAILS: csv,
  ADMIN_IP_ALLOWLIST: csv,
  SENTRY_DSN: optional,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid server configuration:\n- ${problems.join("\n- ")}`);
    this.name = "ConfigError";
  }
}

export function loadServerEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  const parsed = serverEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new ConfigError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  }
  const env = parsed.data;
  if (env.NODE_ENV === "production" && env.APP_URL.startsWith("http://")) {
    throw new ConfigError(["APP_URL: must use https in production"]);
  }
  return env;
}

/** Which integrations are ready. Shown in the admin panel without ever exposing values. */
export function integrationStatus(env: ServerEnv): Record<string, boolean> {
  return {
    tavily: Boolean(env.TAVILY_API_KEY),
    llm: Boolean(env.LLM_PROVIDER && env.LLM_API_KEY && env.LLM_MODEL_SCORING),
    turnstile: Boolean(env.TURNSTILE_SECRET_KEY),
    errorTracking: Boolean(env.SENTRY_DSN),
  };
}
