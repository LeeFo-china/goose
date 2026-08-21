-- Rollback: forward-only. Drop supplier_products_scope_list_idx in a
-- reviewed forward migration if rollback is required; no data is changed.
-- Production rollout: run in a maintenance window and monitor lock waits.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE INDEX supplier_products_scope_list_idx
  ON public.supplier_products (
    supplier_id,
    updated_at DESC,
    id DESC,
    ownership_scope,
    owner_tenant_id
  );

COMMIT;
