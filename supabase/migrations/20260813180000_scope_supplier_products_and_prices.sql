-- Rollback: forward-only. This migration scopes supplier products, SKUs, and
-- prices to immutable ownership and tenant boundaries. Rolling back is
-- destructive: drop the new triggers and functions first, then drop
-- supplier_sku_unit_conversions, then drop the scope-aware unique indexes and
-- restore the global code keys, and finally drop the added tenant_id columns.
-- Reconcile all downstream purchase order and snapshot references before any
-- rollback.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

-- ---------------------------------------------------------------------------
-- 1. Structured SKU spec values
-- ---------------------------------------------------------------------------

ALTER TABLE public.supplier_skus
  ADD COLUMN spec_values jsonb NULL;

-- ---------------------------------------------------------------------------
-- 2. SKU unit conversion edges
-- ---------------------------------------------------------------------------

CREATE TABLE public.supplier_sku_unit_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_sku_id uuid NOT NULL
    REFERENCES public.supplier_skus(id) ON DELETE RESTRICT,
  from_unit_id uuid NOT NULL
    REFERENCES public.catalog_units(id) ON DELETE RESTRICT,
  to_unit_id uuid NOT NULL
    REFERENCES public.catalog_units(id) ON DELETE RESTRICT,
  factor numeric(18, 6) NOT NULL,
  status text NOT NULL DEFAULT 'active',
  version integer NOT NULL DEFAULT 1,
  created_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  updated_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_sku_unit_conversions_factor_check
    CHECK (factor > 0),
  CONSTRAINT supplier_sku_unit_conversions_self_check
    CHECK (from_unit_id <> to_unit_id),
  CONSTRAINT supplier_sku_unit_conversions_status_check
    CHECK (status IN ('active', 'inactive')),
  CONSTRAINT supplier_sku_unit_conversions_version_check
    CHECK (version > 0),
  CONSTRAINT supplier_sku_unit_conversions_sku_edge_key
    UNIQUE (supplier_sku_id, from_unit_id, to_unit_id)
);

-- ---------------------------------------------------------------------------
-- 3. Explicit tenant ownership for prices
-- ---------------------------------------------------------------------------

ALTER TABLE public.supplier_price_lists
  ADD COLUMN tenant_id uuid NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT;

ALTER TABLE public.supplier_price_list_items
  ADD COLUMN tenant_id uuid NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT;

ALTER TABLE public.supplier_price_lists DISABLE TRIGGER USER;
ALTER TABLE public.supplier_price_list_items DISABLE TRIGGER USER;

UPDATE public.supplier_price_lists
SET tenant_id = acting_tenant_id
WHERE tenant_id IS NULL;

UPDATE public.supplier_price_list_items AS item
SET tenant_id = list.acting_tenant_id
FROM public.supplier_price_lists AS list
WHERE item.supplier_price_list_id = list.id
  AND item.tenant_id IS NULL;

ALTER TABLE public.supplier_price_lists
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.supplier_price_list_items
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.supplier_price_lists ENABLE TRIGGER USER;
ALTER TABLE public.supplier_price_list_items ENABLE TRIGGER USER;

-- ---------------------------------------------------------------------------
-- 4. Scope-aware product and SKU code uniqueness
-- ---------------------------------------------------------------------------

ALTER TABLE public.supplier_products
  DROP CONSTRAINT supplier_products_supplier_code_key;

ALTER TABLE public.supplier_skus
  DROP CONSTRAINT supplier_skus_supplier_code_key;

CREATE UNIQUE INDEX supplier_products_platform_code_unique_idx
ON public.supplier_products(supplier_id, upper(btrim(product_code)))
WHERE ownership_scope = 'platform';

CREATE UNIQUE INDEX supplier_products_tenant_code_unique_idx
ON public.supplier_products(supplier_id, owner_tenant_id, upper(btrim(product_code)))
WHERE ownership_scope = 'tenant';

CREATE UNIQUE INDEX supplier_skus_platform_code_unique_idx
ON public.supplier_skus(supplier_id, upper(btrim(sku_code)))
WHERE ownership_scope = 'platform';

CREATE UNIQUE INDEX supplier_skus_tenant_code_unique_idx
ON public.supplier_skus(supplier_id, owner_tenant_id, upper(btrim(sku_code)))
WHERE ownership_scope = 'tenant';

-- ---------------------------------------------------------------------------
-- 5. Ownership guard functions
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.guard_supplier_product_ownership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_supplier public.suppliers%ROWTYPE;
  v_category public.catalog_categories%ROWTYPE;
  v_brand public.catalog_brands%ROWTYPE;
BEGIN
  IF NEW.ownership_scope IS NOT NULL THEN
    SELECT * INTO v_supplier
    FROM public.suppliers
    WHERE id = NEW.supplier_id;
    IF NEW.ownership_scope = 'platform' THEN
      IF v_supplier.ownership_scope IS DISTINCT FROM 'platform'
        OR v_supplier.owner_tenant_id IS NOT NULL
      THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
      END IF;
    ELSIF v_supplier.ownership_scope = 'tenant'
      AND v_supplier.owner_tenant_id IS DISTINCT FROM NEW.owner_tenant_id
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
    END IF;

    SELECT * INTO v_category
    FROM public.catalog_categories
    WHERE id = NEW.category_id;
    IF NEW.ownership_scope = 'platform'
      AND v_category.ownership_scope IS DISTINCT FROM 'platform'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
    END IF;

    SELECT * INTO v_brand
    FROM public.catalog_brands
    WHERE id = NEW.brand_id;
    IF NEW.ownership_scope = 'platform'
      AND v_brand.ownership_scope IS DISTINCT FROM 'platform'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_supplier_product_ownership()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER tr_supplier_products_guard_ownership
BEFORE INSERT OR UPDATE OF
  supplier_id,
  category_id,
  brand_id,
  ownership_scope,
  owner_tenant_id
ON public.supplier_products
FOR EACH ROW
EXECUTE FUNCTION public.guard_supplier_product_ownership();

CREATE FUNCTION public.guard_supplier_sku_ownership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_product public.supplier_products%ROWTYPE;
BEGIN
  SELECT * INTO v_product
  FROM public.supplier_products
  WHERE id = NEW.supplier_product_id;
  IF v_product.ownership_scope IS DISTINCT FROM NEW.ownership_scope
    OR v_product.owner_tenant_id IS DISTINCT FROM NEW.owner_tenant_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_supplier_sku_ownership()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER tr_supplier_skus_guard_ownership
BEFORE INSERT OR UPDATE OF
  supplier_product_id,
  ownership_scope,
  owner_tenant_id
ON public.supplier_skus
FOR EACH ROW
EXECUTE FUNCTION public.guard_supplier_sku_ownership();

CREATE FUNCTION public.guard_supplier_price_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM NEW.acting_tenant_id THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PRODUCT_OWNERSHIP_CONFLICT';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_supplier_price_tenant()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER tr_supplier_price_lists_guard_tenant
BEFORE INSERT OR UPDATE OF tenant_id, acting_tenant_id
ON public.supplier_price_lists
FOR EACH ROW
EXECUTE FUNCTION public.guard_supplier_price_tenant();

CREATE TRIGGER tr_supplier_price_items_guard_tenant
BEFORE INSERT OR UPDATE OF tenant_id, acting_tenant_id
ON public.supplier_price_list_items
FOR EACH ROW
EXECUTE FUNCTION public.guard_supplier_price_tenant();

-- ---------------------------------------------------------------------------
-- 6. Row level security
-- ---------------------------------------------------------------------------

ALTER TABLE public.supplier_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_products FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_skus FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_sku_unit_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_sku_unit_conversions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_price_lists FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_price_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_price_list_items FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.supplier_sku_unit_conversions
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.supplier_products
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.supplier_skus
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.supplier_price_lists
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.supplier_price_list_items
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.supplier_sku_unit_conversions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.supplier_products TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.supplier_skus TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.supplier_price_lists TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.supplier_price_list_items TO service_role;

COMMIT;
