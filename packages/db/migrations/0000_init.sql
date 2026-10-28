CREATE TYPE "public"."chat_role" AS ENUM('user', 'assistant', 'tool');--> statement-breakpoint
CREATE TYPE "public"."fact_kind" AS ENUM('founded_year', 'ownership', 'parent_flag', 'criterion', 'news_flag', 'summary', 'dossier');--> statement-breakpoint
CREATE TYPE "public"."fit_status" AS ENUM('strong_fit', 'possible_fit', 'weak_fit', 'verify_ownership', 'fails_rule', 'no_website_text', 'unscored');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'member', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."platform_role" AS ENUM('none', 'viewer', 'finance', 'support', 'admin', 'owner');--> statement-breakpoint
CREATE TYPE "public"."provider" AS ENUM('tavily', 'llm');--> statement-breakpoint
CREATE TYPE "public"."review_decision" AS ENUM('approved', 'rejected', 'needs_check');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."step_status" AS ENUM('pending', 'running', 'succeeded', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "api_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"provider" "provider" NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" uuid,
	"actor_user_id" text,
	"actor_is_admin" boolean DEFAULT false NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"role" "chat_role" NOT NULL,
	"content" text NOT NULL,
	"cited_fact_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"tool_calls" jsonb,
	"citation_check_passed" boolean,
	"llm_cost_usd" numeric(12, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"name" text,
	"source" text NOT NULL,
	"found_by" text,
	"score" numeric(6, 1),
	"status" "fit_status" DEFAULT 'unscored' NOT NULL,
	"failed_rule" text,
	"summary" text,
	"pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deep_dives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"tavily_request_id" text,
	"model" text DEFAULT 'mini' NOT NULL,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"dossier" jsonb,
	"sources" jsonb,
	"credits_used" numeric(12, 2) DEFAULT '0' NOT NULL,
	"requested_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" "fact_kind" NOT NULL,
	"key" text,
	"value" text NOT NULL,
	"quote" text,
	"source_url" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled_globally" boolean DEFAULT false NOT NULL,
	"enabled_plans" text[] DEFAULT '{}'::text[] NOT NULL,
	"enabled_workspace_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"decision" "review_decision" NOT NULL,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_company_id_user_id_pk" PRIMARY KEY("company_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "run_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"step" text NOT NULL,
	"batch" integer DEFAULT 0 NOT NULL,
	"status" "step_status" DEFAULT 'pending' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"credits_used" numeric(12, 2) DEFAULT '0' NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"thesis_id" uuid,
	"thesis_snapshot" jsonb NOT NULL,
	"settings_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"workflow_run_id" text,
	"credits_reserved" numeric(12, 2) DEFAULT '0' NOT NULL,
	"credits_used" numeric(12, 2) DEFAULT '0' NOT NULL,
	"llm_cost_usd" numeric(12, 4) DEFAULT '0' NOT NULL,
	"error" text,
	"started_by" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"last_heartbeat_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"version" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"changed_by" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shortlist_items" (
	"workspace_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"reason" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shortlist_items_run_id_company_id_pk" PRIMARY KEY("run_id","company_id")
);
--> statement-breakpoint
CREATE TABLE "theses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"definition" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thesis_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"definition" jsonb NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "thesis_templates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_id" uuid,
	"provider" "provider" NOT NULL,
	"endpoint" text NOT NULL,
	"credits" numeric(12, 2) DEFAULT '0' NOT NULL,
	"cost_usd" numeric(12, 4) DEFAULT '0' NOT NULL,
	"cached" boolean DEFAULT false NOT NULL,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"platform_role" "platform_role" DEFAULT 'none' NOT NULL,
	"suspended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"monthly_credit_cap" integer DEFAULT 1000 NOT NULL,
	"credits_used_this_month" numeric(12, 2) DEFAULT '0' NOT NULL,
	"credits_reserved" numeric(12, 2) DEFAULT '0' NOT NULL,
	"usage_period_start" timestamp with time zone DEFAULT now() NOT NULL,
	"suspended_at" timestamp with time zone,
	"research_paused_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deep_dives" ADD CONSTRAINT "deep_dives_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deep_dives" ADD CONSTRAINT "deep_dives_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deep_dives" ADD CONSTRAINT "deep_dives_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_steps" ADD CONSTRAINT "run_steps_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_steps" ADD CONSTRAINT "run_steps_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_thesis_id_theses_id_fk" FOREIGN KEY ("thesis_id") REFERENCES "public"."theses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist_items" ADD CONSTRAINT "shortlist_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist_items" ADD CONSTRAINT "shortlist_items_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlist_items" ADD CONSTRAINT "shortlist_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theses" ADD CONSTRAINT "theses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theses" ADD CONSTRAINT "theses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_cache_expires_idx" ON "api_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "audit_ws_created_idx" ON "audit_log" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_thread_idx" ON "chat_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_run_domain" ON "companies" USING btree ("run_id","domain");--> statement-breakpoint
CREATE INDEX "companies_run_status" ON "companies" USING btree ("run_id","status");--> statement-breakpoint
CREATE INDEX "facts_company_idx" ON "facts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "run_steps_unique" ON "run_steps" USING btree ("run_id","step","batch");--> statement-breakpoint
CREATE INDEX "runs_ws_created_idx" ON "runs" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "settings_key_version" ON "settings" USING btree ("key","version");--> statement-breakpoint
CREATE INDEX "theses_ws_idx" ON "theses" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "usage_ws_created_idx" ON "usage_events" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_created_idx" ON "usage_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_idx" ON "users" USING btree (lower("email"));