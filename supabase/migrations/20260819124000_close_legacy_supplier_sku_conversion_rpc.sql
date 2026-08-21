-- Rollback: forward-only. The legacy wrapper bypasses the current supplier
-- relationship and platform permission contract; do not reopen it. Roll back
-- callers to the audited v3 command instead of restoring this grant.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

REVOKE ALL ON FUNCTION public.replace_supplier_sku_unit_conversions(
  uuid,
  integer,
  jsonb,
  uuid,
  uuid,
  uuid,
  text
)
FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
