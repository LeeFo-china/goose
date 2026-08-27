-- Non-transactional preflight: CREATE INDEX CONCURRENTLY cannot run inside a
-- transaction block. Supabase deploy tooling must execute this file without
-- wrapping it in BEGIN/COMMIT before 20260826142000.
--
-- Failure/retry: a cancelled or failed concurrent build can leave an INVALID
-- index. Inspect pg_index.indisvalid for these exact names, DROP INDEX
-- CONCURRENTLY only the invalid index, then retry this migration. Existing
-- valid indexes make the guarded statements safe to rerun.
-- Rollback: after disabling the batch catalog endpoint, drop these four exact
-- indexes concurrently. Keep pg_trgm because other features share it.

SET lock_timeout = '5s';
SET statement_timeout = '30min';

CREATE INDEX CONCURRENTLY IF NOT EXISTS
  supplier_products_product_code_batch_catalog_trgm_idx
ON public.supplier_products
USING gin (product_code extensions.gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS
  supplier_products_name_batch_catalog_trgm_idx
ON public.supplier_products
USING gin (name extensions.gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS
  supplier_skus_sku_code_batch_catalog_trgm_idx
ON public.supplier_skus
USING gin (sku_code extensions.gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS
  supplier_skus_name_batch_catalog_trgm_idx
ON public.supplier_skus
USING gin (name extensions.gin_trgm_ops);

RESET statement_timeout;
RESET lock_timeout;
