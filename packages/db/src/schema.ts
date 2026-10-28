import { sql } from "drizzle-orm";
import {
  bigint, bigserial, boolean, index, integer, jsonb, numeric, pgEnum, pgTable, primaryKey, smallint, text,
  timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
/** Every tenant table carries workspace_id so row-level security can protect it directly. */
const workspaceId = () =>
  uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" });

export const platformRole = pgEnum("platform_role", ["none", "viewer", "finance", "support", "admin", "owner"]);
export const memberRole = pgEnum("member_role", ["owner", "member", "viewer"]);
export const runStatus = pgEnum("run_status", ["queued", "running", "succeeded", "failed", "cancelled"]);
export const stepStatus = pgEnum("step_status", ["pending", "running", "succeeded", "failed", "skipped"]);
export const fitStatus = pgEnum("fit_status", [
  "strong_fit", "possible_fit", "weak_fit", "verify_ownership", "fails_rule", "no_website_text", "unscored",
]);
export const reviewDecision = pgEnum("review_decision", ["approved", "rejected", "needs_check"]);
export const factKind = pgEnum("fact_kind", [
  "founded_year", "ownership", "parent_flag", "criterion", "news_flag", "summary", "dossier",
]);
export const chatRole = pgEnum("chat_role", ["user", "assistant", "tool"]);
export const provider = pgEnum("provider", ["tavily", "llm"]);

// ---------------------------------------------------------------- identity (Better Auth core + 2FA + rate limit)
// Property names must match Better Auth's field names; columns are snake_case.
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  platformRole: platformRole("platform_role").notNull().default("none"),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("users_email_lower_idx").on(sql`lower(${t.email})`)]);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  /** Last /admin request on this session; the admin area signs the session out after 30 min idle. */
  adminLastSeenAt: timestamp("admin_last_seen_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("sessions_user_idx").on(t.userId)]);

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("accounts_user_idx").on(t.userId), uniqueIndex("accounts_provider_account").on(t.providerId, t.accountId)]);

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("verifications_identifier_idx").on(t.identifier)]);

export const twoFactors = pgTable("two_factors", {
  id: text("id").primaryKey(),
  secret: text("secret").notNull(),
  backupCodes: text("backup_codes").notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  verified: boolean("verified").default(false),
  failedVerificationCount: integer("failed_verification_count").default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
}, (t) => [index("two_factors_user_idx").on(t.userId)]);

export const rateLimits = pgTable("rate_limits", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("free"),
  monthlyCreditCap: integer("monthly_credit_cap").notNull().default(1000),
  creditsUsedThisMonth: numeric("credits_used_this_month", { precision: 12, scale: 2 }).notNull().default("0"),
  creditsReserved: numeric("credits_reserved", { precision: 12, scale: 2 }).notNull().default("0"),
  usagePeriodStart: timestamp("usage_period_start", { withTimezone: true }).notNull().defaultNow(),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  researchPausedAt: timestamp("research_paused_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const memberships = pgTable("memberships", {
  workspaceId: workspaceId(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: memberRole("role").notNull().default("member"),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.workspaceId, t.userId] }), index("memberships_user_idx").on(t.userId)]);

export const invitations = pgTable("invitations", {
  id: id(),
  workspaceId: workspaceId(),
  email: text("email").notNull(),
  role: memberRole("role").notNull().default("member"),
  /** SHA-256 of the token in the email link; the raw token is never stored. */
  tokenHash: text("token_hash").notNull().unique(),
  invitedBy: text("invited_by").references(() => users.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  acceptedBy: text("accepted_by").references(() => users.id, { onDelete: "set null" }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("invitations_ws_idx").on(t.workspaceId), index("invitations_email_idx").on(sql`lower(${t.email})`)]);

// ---------------------------------------------------------------- research
export const theses = pgTable("theses", {
  id: id(),
  workspaceId: workspaceId(),
  name: text("name").notNull(),
  definition: jsonb("definition").notNull(),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("theses_ws_idx").on(t.workspaceId)]);

export const runs = pgTable("runs", {
  id: id(),
  workspaceId: workspaceId(),
  thesisId: uuid("thesis_id").references(() => theses.id, { onDelete: "set null" }),
  thesisSnapshot: jsonb("thesis_snapshot").notNull(),
  settingsSnapshot: jsonb("settings_snapshot").notNull().default({}),
  status: runStatus("status").notNull().default("queued"),
  workflowRunId: text("workflow_run_id"),
  creditsReserved: numeric("credits_reserved", { precision: 12, scale: 2 }).notNull().default("0"),
  creditsUsed: numeric("credits_used", { precision: 12, scale: 2 }).notNull().default("0"),
  llmCostUsd: numeric("llm_cost_usd", { precision: 12, scale: 4 }).notNull().default("0"),
  error: text("error"),
  startedBy: text("started_by").references(() => users.id, { onDelete: "set null" }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("runs_ws_created_idx").on(t.workspaceId, t.createdAt)]);

export const runSteps = pgTable("run_steps", {
  id: id(),
  workspaceId: workspaceId(),
  runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  step: text("step").notNull(),
  batch: integer("batch").notNull().default(0),
  status: stepStatus("status").notNull().default("pending"),
  attempts: smallint("attempts").notNull().default(0),
  creditsUsed: numeric("credits_used", { precision: 12, scale: 2 }).notNull().default("0"),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => [uniqueIndex("run_steps_unique").on(t.runId, t.step, t.batch)]);

export const companies = pgTable("companies", {
  id: id(),
  workspaceId: workspaceId(),
  runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  domain: text("domain").notNull(),
  name: text("name"),
  source: text("source").notNull(),
  foundBy: text("found_by"),
  score: numeric("score", { precision: 6, scale: 1 }),
  status: fitStatus("status").notNull().default("unscored"),
  failedRule: text("failed_rule"),
  summary: text("summary"),
  pages: jsonb("pages").notNull().default([]),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("companies_run_domain").on(t.runId, t.domain), index("companies_run_status").on(t.runId, t.status)]);

/** Every fact shown to a buyer, with the exact quote and its source page. */
export const facts = pgTable("facts", {
  id: id(),
  workspaceId: workspaceId(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  kind: factKind("kind").notNull(),
  key: text("key"),
  value: text("value").notNull(),
  quote: text("quote"),
  sourceUrl: text("source_url"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("facts_company_idx").on(t.companyId)]);

export const reviews = pgTable("reviews", {
  workspaceId: workspaceId(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  decision: reviewDecision("decision").notNull(),
  note: text("note"),
  updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.companyId, t.userId] })]);

export const shortlistItems = pgTable("shortlist_items", {
  workspaceId: workspaceId(),
  runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  position: smallint("position").notNull(),
  reason: text("reason").notNull(),
  pinned: boolean("pinned").notNull().default(false),
  hidden: boolean("hidden").notNull().default(false),
  updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.runId, t.companyId] })]);

export const chatThreads = pgTable("chat_threads", {
  id: id(),
  workspaceId: workspaceId(),
  runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});

export const chatMessages = pgTable("chat_messages", {
  id: id(),
  workspaceId: workspaceId(),
  threadId: uuid("thread_id").notNull().references(() => chatThreads.id, { onDelete: "cascade" }),
  role: chatRole("role").notNull(),
  content: text("content").notNull(),
  citedFactIds: uuid("cited_fact_ids").array().notNull().default(sql`'{}'::uuid[]`),
  toolCalls: jsonb("tool_calls"),
  citationCheckPassed: boolean("citation_check_passed"),
  llmCostUsd: numeric("llm_cost_usd", { precision: 12, scale: 4 }).notNull().default("0"),
  createdAt: createdAt(),
}, (t) => [index("chat_messages_thread_idx").on(t.threadId, t.createdAt)]);

export const deepDives = pgTable("deep_dives", {
  id: id(),
  workspaceId: workspaceId(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  tavilyRequestId: text("tavily_request_id"),
  model: text("model").notNull().default("mini"),
  status: runStatus("status").notNull().default("queued"),
  dossier: jsonb("dossier"),
  sources: jsonb("sources"),
  creditsUsed: numeric("credits_used", { precision: 12, scale: 2 }).notNull().default("0"),
  /** Worst-case credits held against the workspace cap until the deep dive settles. */
  creditsReserved: numeric("credits_reserved", { precision: 12, scale: 2 }).notNull().default("0"),
  runId: uuid("run_id").references(() => runs.id, { onDelete: "set null" }),
  workflowRunId: text("workflow_run_id"),
  error: text("error"),
  requestedBy: text("requested_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => [
  index("deep_dives_company_idx").on(t.workspaceId, t.companyId, t.createdAt),
  // At most one unfinished deep dive per company, so a double click can't pay twice.
  uniqueIndex("deep_dives_one_active").on(t.companyId).where(sql`status in ('queued', 'running')`),
]);

// ---------------------------------------------------------------- metering and audit
export const usageEvents = pgTable("usage_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  workspaceId: workspaceId(),
  runId: uuid("run_id").references(() => runs.id, { onDelete: "set null" }),
  deepDiveId: uuid("deep_dive_id").references(() => deepDives.id, { onDelete: "set null" }),
  provider: provider("provider").notNull(),
  endpoint: text("endpoint").notNull(),
  credits: numeric("credits", { precision: 12, scale: 2 }).notNull().default("0"),
  costUsd: numeric("cost_usd", { precision: 12, scale: 4 }).notNull().default("0"),
  cached: boolean("cached").notNull().default(false),
  requestId: text("request_id"),
  createdAt: createdAt(),
}, (t) => [index("usage_ws_created_idx").on(t.workspaceId, t.createdAt), index("usage_created_idx").on(t.createdAt)]);

export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
  actorUserId: text("actor_user_id"),
  actorIsAdmin: boolean("actor_is_admin").notNull().default(false),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  ipHash: text("ip_hash"),
  createdAt: createdAt(),
}, (t) => [index("audit_ws_created_idx").on(t.workspaceId, t.createdAt), index("audit_created_idx").on(t.createdAt)]);

// ---------------------------------------------------------------- platform (admin-only; no tenant data)
export const apiCache = pgTable("api_cache", {
  key: text("key").primaryKey(),
  provider: provider("provider").notNull(),
  response: jsonb("response").notNull(),
  createdAt: createdAt(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (t) => [index("api_cache_expires_idx").on(t.expiresAt)]);

/** Versioned admin settings. The newest active row per key wins; old rows allow rollback. */
export const settings = pgTable("settings", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  key: text("key").notNull(),
  value: jsonb("value").notNull(),
  version: integer("version").notNull(),
  active: boolean("active").notNull().default(true),
  changedBy: text("changed_by"),
  note: text("note"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("settings_key_version").on(t.key, t.version)]);

export const featureFlags = pgTable("feature_flags", {
  key: text("key").primaryKey(),
  enabledGlobally: boolean("enabled_globally").notNull().default(false),
  enabledPlans: text("enabled_plans").array().notNull().default(sql`'{}'::text[]`),
  enabledWorkspaceIds: uuid("enabled_workspace_ids").array().notNull().default(sql`'{}'::uuid[]`),
  description: text("description"),
  updatedAt: updatedAt(),
});

export const thesisTemplates = pgTable("thesis_templates", {
  id: id(),
  slug: text("slug").notNull().unique(),
  definition: jsonb("definition").notNull(),
  published: boolean("published").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Tables protected by row-level security (tenant data). Used by migrations and tests. */
export const TENANT_TABLES = [
  "workspaces", "memberships", "invitations", "theses", "runs", "run_steps", "companies", "facts", "reviews",
  "shortlist_items", "chat_threads", "chat_messages", "deep_dives", "usage_events",
] as const;
