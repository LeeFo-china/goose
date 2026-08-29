-- Rollback: forward-only. Add a later migration that restores
-- SUPPLIER_PRODUCT_STATE_CONFLICT in validate_supplier_product_catalog().

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE OR REPLACE FUNCTION public.validate_supplier_product_catalog()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM category.id
  FROM public.catalog_categories AS category
  WHERE category.id = NEW.category_id
    AND category.status = 'active'
    AND category.is_leaf
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_CATALOG_REFERENCE_INVALID';
  END IF;

  PERFORM brand.id
  FROM public.catalog_brands AS brand
  WHERE brand.id = NEW.brand_id AND brand.status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_CATALOG_REFERENCE_INVALID';
  END IF;

  IF NEW.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.supplier_skus AS sku
      WHERE sku.supplier_product_id = NEW.id
        AND sku.supplier_id = NEW.supplier_id
        AND sku.status = 'active'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PRODUCT_ACTIVE_SKU_REQUIRED';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
