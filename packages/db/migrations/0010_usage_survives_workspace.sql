ALTER TABLE "usage_events" DROP CONSTRAINT "usage_events_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "usage_events" ALTER COLUMN "workspace_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;