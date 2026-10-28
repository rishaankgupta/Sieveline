-- Platform-wide Tavily spend today, for the global daily ceiling.
-- Row-level security hides other workspaces' usage from the app role (and FORCE RLS hides it
-- even from the table owner), so a dedicated NOLOGIN role with a read-only policy owns a
-- SECURITY DEFINER function that returns one number and nothing else. search_path is pinned.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sieveline_reporter') THEN
    CREATE ROLE sieveline_reporter NOLOGIN;
  END IF;
END $$;
--> statement-breakpoint
GRANT sieveline_reporter TO current_user;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO sieveline_reporter;
--> statement-breakpoint
GRANT SELECT ON usage_events, settings TO sieveline_reporter;
--> statement-breakpoint
CREATE POLICY reporter_read ON usage_events FOR SELECT TO sieveline_reporter USING (true);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION platform_tavily_credits_today() RETURNS numeric
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT coalesce(sum(credits), 0) FROM public.usage_events
  WHERE provider = 'tavily' AND created_at >= date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc'
$$;
--> statement-breakpoint
ALTER FUNCTION platform_tavily_credits_today() OWNER TO sieveline_reporter;
--> statement-breakpoint
REVOKE ALL ON FUNCTION platform_tavily_credits_today() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION platform_tavily_credits_today() TO sieveline_app, sieveline_admin;
--> statement-breakpoint
-- Admin kill switch: research is paused platform-wide while this is true.
INSERT INTO settings (key, value, version, active, note)
VALUES ('research_paused', 'false'::jsonb, 1, true, 'initial')
ON CONFLICT DO NOTHING;
