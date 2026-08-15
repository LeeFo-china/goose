-- Rollback: forward-only. This migration makes category and brand codes
-- unique per ownership scope so each tenant can maintain its own catalog
-- codes. Rolling back is destructive: drop the four scope-aware indexes and
-- restore the global catalog_categories_code_key and catalog_brands_code_key
-- unique constraints. Reconcile duplicate tenant codes before any rollback.

BEGIN;

ALTER TABLE public.catalog_categories
  DROP CONSTRAINT catalog_categories_code_key;

ALTER TABLE public.catalog_brands
  DROP CONSTRAINT catalog_brands_code_key;

CREATE UNIQUE INDEX catalog_categories_platform_code_unique_idx
ON public.catalog_categories(upper(btrim(code)))
WHERE ownership_scope = 'platform';

CREATE UNIQUE INDEX catalog_categories_tenant_code_unique_idx
ON public.catalog_categories(owner_tenant_id, upper(btrim(code)))
WHERE ownership_scope = 'tenant';

CREATE UNIQUE INDEX catalog_brands_platform_code_unique_idx
ON public.catalog_brands(upper(btrim(code)))
WHERE ownership_scope = 'platform';

CREATE UNIQUE INDEX catalog_brands_tenant_code_unique_idx
ON public.catalog_brands(owner_tenant_id, upper(btrim(code)))
WHERE ownership_scope = 'tenant';

COMMIT;
