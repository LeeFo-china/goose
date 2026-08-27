-- gooes:migration-mode=nontransactional
-- gooes:retry-invalid-indexes=public.supplier_price_list_items_batch_snapshot_uidx
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
-- Retry policy: the release runner validates the machine-readable index list,
-- drops only a named INVALID partial index concurrently, and reruns this file.
-- A valid index is retained, allowing a bookkeeping-only retry to finish.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  supplier_price_list_items_batch_snapshot_uidx
ON public.supplier_price_list_items(
  id,
  tenant_id,
  supplier_id,
  supplier_price_list_id,
  supplier_product_id,
  supplier_sku_id
);
