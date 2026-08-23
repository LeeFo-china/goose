-- Rollback: forward-only metadata repair. To rollback, drop these two
-- constraints only after confirming no API select relies on the mapped catalog
-- relationships, then reload the PostgREST schema cache again.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'catalog_categories_mapped_platform_category_id_fkey'
      AND conrelid = 'public.catalog_categories'::regclass
  ) THEN
    ALTER TABLE public.catalog_categories
      ADD CONSTRAINT catalog_categories_mapped_platform_category_id_fkey
      FOREIGN KEY (mapped_platform_category_id) REFERENCES public.catalog_categories(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'catalog_brands_mapped_platform_brand_id_fkey'
      AND conrelid = 'public.catalog_brands'::regclass
  ) THEN
    ALTER TABLE public.catalog_brands
      ADD CONSTRAINT catalog_brands_mapped_platform_brand_id_fkey
      FOREIGN KEY (mapped_platform_brand_id) REFERENCES public.catalog_brands(id) ON DELETE RESTRICT;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
