-- Row-level security and database roles.
--
-- sieveline_app   : used by the web app and research steps. Sees only the workspace set in
--                   `app.workspace_id` (and the user's own memberships via `app.user_id`).
-- sieveline_admin : used only by the admin panel. Policies grant it full access explicitly,
--                   so no BYPASSRLS attribute is needed.
-- The table owner runs migrations only. FORCE RLS makes even the owner see nothing without a
-- policy, so a misconfigured connection fails closed instead of leaking data.
--
-- Both roles are NOLOGIN groups. In Neon, create login roles and GRANT these groups to them.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sieveline_app') THEN
    CREATE ROLE sieveline_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sieveline_admin') THEN
    CREATE ROLE sieveline_admin NOLOGIN;
  END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO sieveline_app, sieveline_admin;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sieveline_admin;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sieveline_app, sieveline_admin;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON
  workspaces, memberships, theses, runs, run_steps, companies, facts, reviews,
  shortlist_items, chat_threads, chat_messages, deep_dives, api_cache, users
  TO sieveline_app;
--> statement-breakpoint
-- Usage and audit records are append-only for the app.
GRANT SELECT, INSERT ON usage_events, audit_log TO sieveline_app;
--> statement-breakpoint
-- Platform configuration is read-only for the app; only the admin role can change it.
GRANT SELECT ON settings, feature_flags, thesis_templates TO sieveline_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_workspace_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.workspace_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_user_id() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id', true), '') $$;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'theses','runs','run_steps','companies','facts','reviews','shortlist_items',
    'chat_threads','chat_messages','deep_dives','usage_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I TO sieveline_app
         USING (workspace_id = app_workspace_id())
         WITH CHECK (workspace_id = app_workspace_id())', t);
    EXECUTE format('CREATE POLICY admin_all ON %I TO sieveline_admin USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;
--> statement-breakpoint
-- Workspaces: visible when selected, or when the current user is a member (workspace picker).
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY workspace_member_read ON workspaces FOR SELECT TO sieveline_app
  USING (id = app_workspace_id()
         OR id IN (SELECT m.workspace_id FROM memberships m WHERE m.user_id = app_user_id()));
--> statement-breakpoint
CREATE POLICY workspace_selected_write ON workspaces FOR UPDATE TO sieveline_app
  USING (id = app_workspace_id()) WITH CHECK (id = app_workspace_id());
--> statement-breakpoint
-- Creating a workspace: allowed only for the workspace id the app has selected for creation.
CREATE POLICY workspace_create ON workspaces FOR INSERT TO sieveline_app
  WITH CHECK (id = app_workspace_id());
--> statement-breakpoint
CREATE POLICY admin_all ON workspaces TO sieveline_admin USING (true) WITH CHECK (true);
--> statement-breakpoint
-- Memberships: a user can always read their own rows; changes only inside the selected workspace.
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY membership_read ON memberships FOR SELECT TO sieveline_app
  USING (workspace_id = app_workspace_id() OR user_id = app_user_id());
--> statement-breakpoint
CREATE POLICY membership_write ON memberships FOR INSERT TO sieveline_app
  WITH CHECK (workspace_id = app_workspace_id());
--> statement-breakpoint
CREATE POLICY membership_update ON memberships FOR UPDATE TO sieveline_app
  USING (workspace_id = app_workspace_id()) WITH CHECK (workspace_id = app_workspace_id());
--> statement-breakpoint
CREATE POLICY membership_delete ON memberships FOR DELETE TO sieveline_app
  USING (workspace_id = app_workspace_id());
--> statement-breakpoint
CREATE POLICY admin_all ON memberships TO sieveline_admin USING (true) WITH CHECK (true);
--> statement-breakpoint
-- Audit log: the app may write entries for the selected workspace (or platform-level ones
-- with no workspace) and read only its workspace's entries.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY audit_insert ON audit_log FOR INSERT TO sieveline_app
  WITH CHECK (workspace_id IS NULL OR workspace_id = app_workspace_id());
--> statement-breakpoint
CREATE POLICY audit_read ON audit_log FOR SELECT TO sieveline_app
  USING (workspace_id = app_workspace_id());
--> statement-breakpoint
CREATE POLICY admin_all ON audit_log TO sieveline_admin USING (true) WITH CHECK (true);
