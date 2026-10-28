ALTER TABLE "deep_dives" ADD COLUMN "credits_reserved" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "deep_dives" ADD COLUMN "run_id" uuid;--> statement-breakpoint
ALTER TABLE "deep_dives" ADD COLUMN "workflow_run_id" text;--> statement-breakpoint
ALTER TABLE "deep_dives" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "deep_dive_id" uuid;--> statement-breakpoint
ALTER TABLE "deep_dives" ADD CONSTRAINT "deep_dives_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_deep_dive_id_deep_dives_id_fk" FOREIGN KEY ("deep_dive_id") REFERENCES "public"."deep_dives"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deep_dives_company_idx" ON "deep_dives" USING btree ("workspace_id","company_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "deep_dives_one_active" ON "deep_dives" USING btree ("company_id") WHERE status in ('queued', 'running');