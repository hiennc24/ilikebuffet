-- GA-01 / Red Team H1: audit_log is append-only even against an insider/owner.
-- REVOKE (see audit-role-grants.sql) stops the app role; this trigger stops
-- ANY non-superuser (including a table owner with UPDATE/DELETE privilege).
-- Superuser is the sole escape hatch (DR / court-ordered legit maintenance).
--
-- Applied OUTSIDE Prisma migrations (Prisma models neither triggers nor roles),
-- so the schema/migration drift check stays exact. Re-runnable (idempotent).

CREATE OR REPLACE FUNCTION audit_log_block_mutation() RETURNS trigger AS $$
BEGIN
  -- `is_superuser` is a Postgres-protected GUC set per session; it is NOT
  -- client-settable, so it cannot be spoofed. Do NOT "harden" this into
  -- `current_user IN (...)` — that WOULD be spoofable via `SET ROLE`.
  IF current_setting('is_superuser') = 'on' THEN
    -- Row triggers must return a tuple to proceed; statement triggers ignore it.
    IF TG_LEVEL = 'ROW' THEN
      RETURN COALESCE(NEW, OLD);
    END IF;
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'audit_log is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_row_mutation ON audit_log;
CREATE TRIGGER audit_log_no_row_mutation
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_block_mutation();

DROP TRIGGER IF EXISTS audit_log_no_truncate ON audit_log;
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_block_mutation();
