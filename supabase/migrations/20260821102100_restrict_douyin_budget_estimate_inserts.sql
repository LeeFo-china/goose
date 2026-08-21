-- Rollback: forward-only. If the atomic command must be retired, replace it
-- with an equally serialized service-role command before restoring any table
-- INSERT privilege. Never restore the former count-then-insert writer.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

REVOKE INSERT
ON TABLE public.douyin_budget_estimates
FROM service_role;

COMMIT;
