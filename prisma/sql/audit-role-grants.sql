-- GA-01 / Red Team H1: the application must connect as a NON-superuser role
-- (ilikebuffet_app) that can only append to and read the audit trail. The DBA
-- creates this role and runs migrations/admin as a separate privileged role.
-- Deploy segregation: the app process must NOT connect as superuser/owner,
-- otherwise it bypasses the append-only trigger.
--
-- Prerequisite: role "ilikebuffet_app" exists. Re-runnable (idempotent).

REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM ilikebuffet_app;
GRANT INSERT, SELECT ON audit_log TO ilikebuffet_app;
-- Needed so INSERT can draw the BIGSERIAL id.
GRANT USAGE, SELECT ON SEQUENCE audit_log_id_seq TO ilikebuffet_app;
