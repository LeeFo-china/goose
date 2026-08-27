-- Rollback: forward-only. This non-transactional preflight only prepares the
-- unique index consumed by 20260826141000. It intentionally performs no
-- destructive cleanup. Before the next migration is applied, a separately
-- approved operator change may remove this index concurrently. After the
-- constraint owns the index, use a reviewed forward migration and preserve
-- every dependent batch snapshot.
--
-- Failed index check: CREATE UNIQUE INDEX CONCURRENTLY can leave an unusable index.
-- Inspect pg_catalog.pg_index before any retry and require indisready,
-- indisvalid, and indislive to all be true for the exact index OID:
--
-- SELECT indexrelid::regclass, indisready, indisvalid, indislive
-- FROM pg_catalog.pg_index
-- WHERE indexrelid =
--   to_regclass('public.supplier_price_list_items_batch_snapshot_uidx');
--
-- Retry policy: if an invalid index remains, stop. Reconcile the failure and
-- any duplicate diagnostics first; removal requires manual review and a
-- separately approved operator action. If the index is valid but migration
-- bookkeeping failed, verify its exact six-column definition and repair the
-- migration record under change control instead of rebuilding it.

CREATE UNIQUE INDEX CONCURRENTLY supplier_price_list_items_batch_snapshot_uidx
ON public.supplier_price_list_items(
  id,
  tenant_id,
  supplier_id,
  supplier_price_list_id,
  supplier_product_id,
  supplier_sku_id
);
