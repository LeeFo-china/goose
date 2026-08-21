-- Rollback: forward-only. Disable product and SKU writes before restoring any
-- EXECUTE privilege. The generic SKU mutator remains retired; restore a scoped
-- wrapper only if it preserves ownership, actor, idempotency and audit checks.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

REVOKE ALL ON FUNCTION public.mutate_supplier_sku(
  uuid, uuid, uuid, text, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.mutate_supplier_product(
  uuid, uuid, uuid, text, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.mutate_supplier_product(
  uuid, uuid, uuid, text, integer, uuid, uuid, text, text
)
TO service_role;

REVOKE ALL ON FUNCTION public.mutate_supplier_sku_for_product(
  uuid, uuid, uuid, uuid, text, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.mutate_supplier_sku_for_product(
  uuid, uuid, uuid, uuid, text, integer, uuid, uuid, text, text
)
TO service_role;

COMMIT;
