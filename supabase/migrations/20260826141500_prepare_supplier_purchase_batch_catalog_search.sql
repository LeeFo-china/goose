-- gooes:migration-mode=nontransactional
-- gooes:expected-index=public.supplier_products_product_code_batch_catalog_trgm_idx|public.supplier_products|false|gin|product_code|extensions.gin_trgm_ops|null
-- gooes:expected-index=public.supplier_products_name_batch_catalog_trgm_idx|public.supplier_products|false|gin|name|extensions.gin_trgm_ops|null
-- gooes:expected-index=public.supplier_skus_sku_code_batch_catalog_trgm_idx|public.supplier_skus|false|gin|sku_code|extensions.gin_trgm_ops|null
-- gooes:expected-index=public.supplier_skus_name_batch_catalog_trgm_idx|public.supplier_skus|false|gin|name|extensions.gin_trgm_ops|null
-- Non-transactional preflight: CREATE INDEX CONCURRENTLY cannot run inside a
-- transaction block. Supabase deploy tooling must execute this file without
-- wrapping it in BEGIN/COMMIT before 20260826142000.
--
-- Failure/retry: the release runner checks all three pg_index readiness flags
-- and drops only a listed INVALID index concurrently before retrying.
-- Existing valid indexes make the guarded statements safe to rerun.
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
