-- Rollback: forward-only. Drop catalog_categories_leaf_scope_list_idx in a
-- reviewed forward migration if rollback is required; no data is changed.
-- Production rollout: run in a maintenance window and monitor lock waits.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE INDEX catalog_categories_leaf_scope_list_idx
  ON public.catalog_categories (
    status,
    sort_order,
    id,
    ownership_scope,
    owner_tenant_id
  )
  WHERE is_leaf = true;

COMMIT;
