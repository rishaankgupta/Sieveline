-- Auth tables are global (not tenant data), so they have no row-level security.
-- The app role needs them to sign users in; the admin role manages them.
GRANT SELECT, INSERT, UPDATE, DELETE ON sessions, accounts, verifications, two_factors, rate_limits
  TO sieveline_app, sieveline_admin;
