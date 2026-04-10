-- Run this script once as a PostgreSQL superuser after running migrations.
-- It revokes UPDATE and DELETE on audit_logs from the application DB user,
-- ensuring the audit trail is append-only.
--
-- Usage:
--   psql -U postgres -d doc_tracking -f scripts/restrict_audit_logs.sql
--
-- Replace 'doc_user' with the value of DB_USER in your .env if different.

REVOKE UPDATE, DELETE ON TABLE audit_logs FROM doc_user;

-- Confirm
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'audit_logs'
  AND grantee = 'doc_user';
