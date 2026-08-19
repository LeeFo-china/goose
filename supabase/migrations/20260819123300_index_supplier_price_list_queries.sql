-- Rollback: forward-only. Drop
-- supplier_price_lists_tenant_relationship_list_idx in a reviewed forward
-- migration if rollback is required; no data is changed.
-- Production rollout: run in a maintenance window and monitor lock waits.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE INDEX supplier_price_lists_tenant_relationship_list_idx
  ON public.supplier_price_lists (
    tenant_id,
    tenant_supplier_id,
    supplier_id,
    effective_from DESC,
    id DESC
  );

COMMIT;
