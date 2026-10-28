-- Invitations are tenant data: the app sees only the selected workspace's invitations.
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON invitations TO sieveline_app
  USING (workspace_id = app_workspace_id()) WITH CHECK (workspace_id = app_workspace_id());
--> statement-breakpoint
CREATE POLICY admin_all ON invitations TO sieveline_admin USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON invitations TO sieveline_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON invitations TO sieveline_admin;
--> statement-breakpoint
-- Accepting happens before the invitee belongs to the workspace, so row-level security would
-- hide the invitation. A narrowly-scoped function, owned by a dedicated role whose policies allow
-- only what it needs, does the check-and-join atomically. The caller passes the user's VERIFIED
-- email (from the session); the invitation must be for that exact email.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sieveline_invites') THEN
    CREATE ROLE sieveline_invites NOLOGIN;
  END IF;
END $$;
--> statement-breakpoint
GRANT sieveline_invites TO current_user;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS invites AUTHORIZATION sieveline_invites;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO sieveline_invites;
--> statement-breakpoint
GRANT USAGE ON SCHEMA invites TO sieveline_app;
--> statement-breakpoint
GRANT SELECT, UPDATE ON invitations TO sieveline_invites;
--> statement-breakpoint
GRANT SELECT, INSERT ON memberships, audit_log TO sieveline_invites;
--> statement-breakpoint
GRANT USAGE ON SEQUENCE audit_log_id_seq TO sieveline_invites;
--> statement-breakpoint
CREATE POLICY invites_accept ON invitations TO sieveline_invites USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY invites_join ON memberships TO sieveline_invites USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY invites_audit ON audit_log TO sieveline_invites USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION invites.accept_invitation(p_token_hash text, p_user_id text, p_email text)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE inv public.invitations%ROWTYPE;
BEGIN
  SELECT * INTO inv FROM public.invitations
   WHERE token_hash = p_token_hash
     AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
   FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF lower(inv.email) <> lower(p_email) THEN RETURN NULL; END IF;
  INSERT INTO public.memberships (workspace_id, user_id, role)
    VALUES (inv.workspace_id, p_user_id, inv.role)
    ON CONFLICT (workspace_id, user_id) DO NOTHING;
  UPDATE public.invitations SET accepted_at = now(), accepted_by = p_user_id WHERE id = inv.id;
  INSERT INTO public.audit_log (workspace_id, actor_user_id, action, target_type, target_id, after)
    VALUES (inv.workspace_id, p_user_id, 'invitation.accepted', 'invitation', inv.id::text, jsonb_build_object('role', inv.role));
  RETURN inv.workspace_id;
END $$;
--> statement-breakpoint
ALTER FUNCTION invites.accept_invitation(text, text, text) OWNER TO sieveline_invites;
--> statement-breakpoint
REVOKE ALL ON FUNCTION invites.accept_invitation(text, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION invites.accept_invitation(text, text, text) TO sieveline_app;
