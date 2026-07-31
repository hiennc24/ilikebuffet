-- Provision the runtime roles (local/dev; production DBA adapts passwords/secrets).
--   audit_owner    — NOLOGIN, owns the audit objects (owner segregation, C1)
--   ilikebuffet_app — the app RUNTIME role (non-owner; audit UPDATE/DELETE revoked)
--
-- Run as the owner/admin role AFTER `prisma migrate deploy`, then run
-- scripts/apply-audit-guards.sh. ALTER DEFAULT PRIVILEGES ensures future tables
-- created by the migration owner are automatically usable by the app role.
-- Idempotent.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'audit_owner') THEN
    CREATE ROLE audit_owner NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ilikebuffet_app') THEN
    CREATE ROLE ilikebuffet_app LOGIN PASSWORD 'ilikebuffet_app' NOSUPERUSER;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO ilikebuffet_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ilikebuffet_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ilikebuffet_app;

-- Future tables/sequences created by the migration owner → auto-granted.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ilikebuffet_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ilikebuffet_app;
