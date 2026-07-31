-- GA-01 / Red Team C1: owner segregation.
--
-- REVOKE + trigger are not enough on their own: the OWNER of audit_log can
-- `DROP TRIGGER` or `ALTER TABLE audit_log DISABLE TRIGGER ALL` and then mutate
-- freely. So the audit objects are reassigned to a dedicated NOLOGIN role
-- (audit_owner) that neither the app role nor the migration/DBA role is a
-- member of. Only audit_owner (nobody logs in as it) or a superuser can alter
-- the guard — matching GA-01's "kể cả quản trị" (even admins) requirement.
--
-- Prerequisite: role "audit_owner" exists (NOLOGIN) and the executing role is a
-- superuser (or member of audit_owner). Applied OUTSIDE Prisma migrations, after
-- the immutability trigger. Re-runnable.

ALTER TABLE audit_log OWNER TO audit_owner;
ALTER SEQUENCE audit_log_id_seq OWNER TO audit_owner;
ALTER FUNCTION audit_log_block_mutation() OWNER TO audit_owner;
