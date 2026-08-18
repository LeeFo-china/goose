-- Rollback: forward-only. Drop supplier_skus_scope_product_list_idx in a
-- reviewed forward migration if rollback is required; no data is changed.
-- Production rollout: run in a maintenance window and monitor lock waits.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE INDEX supplier_skus_scope_product_list_idx
  ON public.supplier_skus (
    supplier_id,
    supplier_product_id,
    updated_at DESC,
    id DESC,
    ownership_scope,
    owner_tenant_id
  );

COMMIT;
