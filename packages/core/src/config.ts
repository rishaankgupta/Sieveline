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
  /** Whether the provider supports JSON-schema structured outputs (OpenAI and most compatible APIs do). */
  LLM_STRUCTURED_OUTPUTS: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  /** USD per million tokens, for cost tracking and caps. Set from the provider's price list. */
  LLM_PRICE_INPUT_PER_MTOK: z.coerce.number().min(0).default(0),
  LLM_PRICE_OUTPUT_PER_MTOK: z.coerce.number().min(0).default(0),
  /** Requests per minute allowed by the provider (free tiers are low, e.g. 2). 0 = no local limit. */
  LLM_MAX_RPM: z.coerce.number().int().min(0).default(0),
  /** Test-only override; must be https in production. */
  TAVILY_BASE_URL: z.string().url().default("https://api.tavily.com"),
  /** Separate connection for the admin panel (login role in sieveline_admin). */
  DATABASE_URL_ADMIN: optional,
  GLOBAL_DAILY_TAVILY_CREDIT_LIMIT: z.coerce.number().int().positive().default(2000),
  DEFAULT_WORKSPACE_MONTHLY_CREDIT_CAP: z.coerce.number().int().positive().default(1000),
  DEEP_DIVE_MAX_CREDITS: z.coerce.number().int().positive().default(110),
  TURNSTILE_SECRET_KEY: optional,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: optional,
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  EMAIL_PROVIDER_API_KEY: optional,
  EMAIL_FROM: optional,
  /** Header the host sets with the real client IP (Vercel overwrites x-forwarded-for). */
  CLIENT_IP_HEADER: z.string().trim().toLowerCase().default("x-forwarded-for"),
  PLATFORM_OWNER_EMAILS: csv,
  ADMIN_IP_ALLOWLIST: csv,
  SENTRY_DSN: optional,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export class ConfigError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Invalid server configuration:\n- ${problems.join("\n- ")}`);
    this.problems = problems;
    this.name = "ConfigError";
  }
}

export function loadServerEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  const parsed = serverEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new ConfigError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  }
  const env = parsed.data;
  if (env.NODE_ENV === "production") {
    const problems: string[] = [];
    if (env.APP_URL.startsWith("http://")) problems.push("APP_URL: must use https in production");
    if (!env.TAVILY_BASE_URL.startsWith("https://")) problems.push("TAVILY_BASE_URL: must use https in production");
    if (problems.length) throw new ConfigError(problems);
  }
  return env;
}

/** Which integrations are ready. Shown in the admin panel without ever exposing values. */
export function integrationStatus(env: ServerEnv): Record<string, boolean> {
  return {
    tavily: Boolean(env.TAVILY_API_KEY),
    llm: Boolean(env.LLM_BASE_URL && env.LLM_MODEL_SCORING),
    turnstile: Boolean(env.TURNSTILE_SECRET_KEY && env.NEXT_PUBLIC_TURNSTILE_SITE_KEY),
    googleSignIn: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    email: Boolean(env.EMAIL_PROVIDER_API_KEY && env.EMAIL_FROM),
    errorTracking: Boolean(env.SENTRY_DSN),
  };
}
