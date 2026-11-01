ALTER TABLE "deep_dives" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "bonus_credits" numeric(12, 2) DEFAULT '0' NOT NULL;