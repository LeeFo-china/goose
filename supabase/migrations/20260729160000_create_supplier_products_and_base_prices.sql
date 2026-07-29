-- Rollback: use a forward migration to hide the Admin entry points and revoke
-- the four new permissions first. If no purchase order has ever referenced
-- these records, export and reconcile all rows, then drop triggers, functions,
-- supplier_price_list_items, supplier_price_lists, supplier_skus, and
-- supplier_products in dependency order. Once a purchase order references a
-- SKU or published price version, do not drop these history tables; retire the
-- feature and preserve immutable facts for audit instead.

BEGIN;

CREATE TABLE public.supplier_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL
    REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  product_code text NOT NULL,
  name text NOT NULL,
  category_id uuid NOT NULL
    REFERENCES public.catalog_categories(id) ON DELETE RESTRICT,
  brand_id uuid NOT NULL
    REFERENCES public.catalog_brands(id) ON DELETE RESTRICT,
  description text NULL,
  status text NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1,
  acting_tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  acting_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  operation_source text NOT NULL DEFAULT 'tenant_proxy',
  proxy_reason text NOT NULL,
  created_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  updated_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_products_product_code_check
    CHECK (product_code = btrim(product_code) AND product_code <> ''),
  CONSTRAINT supplier_products_name_check
    CHECK (name = btrim(name) AND name <> ''),
  CONSTRAINT supplier_products_description_check
    CHECK (
      description IS NULL
      OR (description = btrim(description) AND description <> '')
    ),
  CONSTRAINT supplier_products_status_check
    CHECK (status IN ('draft', 'active', 'inactive')),
  CONSTRAINT supplier_products_version_check CHECK (version > 0),
  CONSTRAINT supplier_products_operation_source_check
    CHECK (operation_source = 'tenant_proxy'),
  CONSTRAINT supplier_products_proxy_reason_check
    CHECK (proxy_reason = btrim(proxy_reason) AND proxy_reason <> ''),
  CONSTRAINT supplier_products_supplier_code_key
    UNIQUE (supplier_id, product_code),
  CONSTRAINT supplier_products_id_supplier_key
    UNIQUE (id, supplier_id)
);

CREATE TABLE public.supplier_skus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL
    REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  supplier_product_id uuid NOT NULL,
  sku_code text NOT NULL,
  name text NOT NULL,
  specification text NULL,
  model text NULL,
  purchase_unit_id uuid NOT NULL
    REFERENCES public.catalog_units(id) ON DELETE RESTRICT,
  base_unit_id uuid NOT NULL
    REFERENCES public.catalog_units(id) ON DELETE RESTRICT,
  base_unit_conversion numeric(18, 8) NOT NULL,
  batch_managed boolean NOT NULL DEFAULT false,
  color_managed boolean NOT NULL DEFAULT false,
  serial_managed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1,
  acting_tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  acting_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  operation_source text NOT NULL DEFAULT 'tenant_proxy',
  proxy_reason text NOT NULL,
  created_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  updated_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_skus_product_supplier_fkey
    FOREIGN KEY (supplier_product_id, supplier_id)
    REFERENCES public.supplier_products(id, supplier_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_skus_sku_code_check
    CHECK (sku_code = btrim(sku_code) AND sku_code <> ''),
  CONSTRAINT supplier_skus_name_check
    CHECK (name = btrim(name) AND name <> ''),
  CONSTRAINT supplier_skus_specification_check
    CHECK (
      specification IS NULL
      OR (specification = btrim(specification) AND specification <> '')
    ),
  CONSTRAINT supplier_skus_model_check
    CHECK (model IS NULL OR (model = btrim(model) AND model <> '')),
  CONSTRAINT supplier_skus_base_unit_conversion_check
    CHECK (base_unit_conversion > 0),
  CONSTRAINT supplier_skus_status_check
    CHECK (status IN ('draft', 'active', 'inactive')),
  CONSTRAINT supplier_skus_version_check CHECK (version > 0),
  CONSTRAINT supplier_skus_operation_source_check
    CHECK (operation_source = 'tenant_proxy'),
  CONSTRAINT supplier_skus_proxy_reason_check
    CHECK (proxy_reason = btrim(proxy_reason) AND proxy_reason <> ''),
  CONSTRAINT supplier_skus_supplier_code_key
    UNIQUE (supplier_id, sku_code),
  CONSTRAINT supplier_skus_id_supplier_key
    UNIQUE (id, supplier_id)
);

CREATE TABLE public.supplier_price_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL
    REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  price_list_code text NOT NULL,
  version_number integer NOT NULL,
  scope_type text NOT NULL DEFAULT 'default',
  name text NOT NULL,
  currency char(3) NOT NULL DEFAULT 'CNY',
  lifecycle_status text NOT NULL DEFAULT 'draft',
  effective_from timestamptz NOT NULL,
  effective_until timestamptz NULL,
  supersedes_price_list_id uuid NULL,
  published_at timestamptz NULL,
  row_version integer NOT NULL DEFAULT 1,
  acting_tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  acting_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  operation_source text NOT NULL DEFAULT 'tenant_proxy',
  proxy_reason text NOT NULL,
  created_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  updated_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_price_lists_code_check
    CHECK (price_list_code = btrim(price_list_code) AND price_list_code <> ''),
  CONSTRAINT supplier_price_lists_version_number_check
    CHECK (version_number > 0),
  CONSTRAINT supplier_price_lists_scope_type_check
    CHECK (scope_type = 'default'),
  CONSTRAINT supplier_price_lists_name_check
    CHECK (name = btrim(name) AND name <> ''),
  CONSTRAINT supplier_price_lists_currency_check
    CHECK (currency::text ~ '^[A-Z]{3}$'),
  CONSTRAINT supplier_price_lists_status_check
    CHECK (lifecycle_status IN ('draft', 'published', 'retired')),
  CONSTRAINT supplier_price_lists_effective_period_check
    CHECK (effective_until IS NULL OR effective_until > effective_from),
  CONSTRAINT supplier_price_lists_publish_metadata_check CHECK (
    (lifecycle_status = 'draft' AND published_at IS NULL)
    OR (lifecycle_status IN ('published', 'retired') AND published_at IS NOT NULL)
  ),
  CONSTRAINT supplier_price_lists_row_version_check
    CHECK (row_version > 0),
  CONSTRAINT supplier_price_lists_operation_source_check
    CHECK (operation_source = 'tenant_proxy'),
  CONSTRAINT supplier_price_lists_proxy_reason_check
    CHECK (proxy_reason = btrim(proxy_reason) AND proxy_reason <> ''),
  CONSTRAINT supplier_price_lists_supplier_version_key
    UNIQUE (supplier_id, price_list_code, version_number),
  CONSTRAINT supplier_price_lists_id_supplier_key
    UNIQUE (id, supplier_id),
  CONSTRAINT supplier_price_lists_supersedes_supplier_fkey
    FOREIGN KEY (supersedes_price_list_id, supplier_id)
    REFERENCES public.supplier_price_lists(id, supplier_id)
    ON DELETE RESTRICT
);

CREATE TABLE public.supplier_price_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL
    REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  supplier_price_list_id uuid NOT NULL,
  supplier_sku_id uuid NOT NULL,
  minimum_quantity numeric(18, 4) NOT NULL DEFAULT 1,
  maximum_quantity numeric(18, 4) NULL,
  purchase_unit_id uuid NOT NULL
    REFERENCES public.catalog_units(id) ON DELETE RESTRICT,
  base_unit_id uuid NOT NULL
    REFERENCES public.catalog_units(id) ON DELETE RESTRICT,
  base_unit_conversion numeric(18, 8) NOT NULL,
  unit_price numeric(14, 2) NOT NULL,
  tax_rate numeric(7, 6) NOT NULL DEFAULT 0,
  tax_inclusive boolean NOT NULL DEFAULT true,
  acting_tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  acting_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  operation_source text NOT NULL DEFAULT 'tenant_proxy',
  proxy_reason text NOT NULL,
  created_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  updated_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_price_items_list_supplier_fkey
    FOREIGN KEY (supplier_price_list_id, supplier_id)
    REFERENCES public.supplier_price_lists(id, supplier_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_price_items_sku_supplier_fkey
    FOREIGN KEY (supplier_sku_id, supplier_id)
    REFERENCES public.supplier_skus(id, supplier_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_price_list_items_base_quantity_check
    CHECK (minimum_quantity = 1 AND maximum_quantity IS NULL),
  CONSTRAINT supplier_price_list_items_base_conversion_check
    CHECK (base_unit_conversion > 0),
  CONSTRAINT supplier_price_list_items_unit_price_check
    CHECK (unit_price >= 0),
  CONSTRAINT supplier_price_list_items_tax_rate_check
    CHECK (tax_rate BETWEEN 0 AND 1),
  CONSTRAINT supplier_price_items_operation_source_check
    CHECK (operation_source = 'tenant_proxy'),
  CONSTRAINT supplier_price_items_proxy_reason_check
    CHECK (proxy_reason = btrim(proxy_reason) AND proxy_reason <> ''),
  CONSTRAINT supplier_price_list_items_list_sku_key
    UNIQUE (supplier_price_list_id, supplier_sku_id)
);

CREATE INDEX supplier_products_supplier_status_updated_idx
ON public.supplier_products(supplier_id, status, updated_at DESC, id DESC);

CREATE INDEX supplier_skus_product_status_updated_idx
ON public.supplier_skus(
  supplier_product_id,
  status,
  updated_at DESC,
  id DESC
);

CREATE INDEX supplier_skus_supplier_status_updated_idx
ON public.supplier_skus(supplier_id, status, updated_at DESC, id DESC);

CREATE INDEX supplier_price_lists_supplier_status_effective_idx
ON public.supplier_price_lists(
  supplier_id,
  lifecycle_status,
  effective_from DESC,
  id DESC
);

CREATE UNIQUE INDEX supplier_price_lists_one_draft_idx
ON public.supplier_price_lists(supplier_id, price_list_code)
WHERE lifecycle_status = 'draft';

CREATE INDEX supplier_price_items_list_sku_idx
ON public.supplier_price_list_items(
  supplier_price_list_id,
  supplier_sku_id
);

CREATE INDEX supplier_price_items_sku_list_idx
ON public.supplier_price_list_items(
  supplier_sku_id,
  supplier_price_list_id
);

CREATE FUNCTION public.validate_supplier_proxy_actor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM employee.id
  FROM public.employees AS employee
  WHERE employee.id = NEW.acting_employee_id
    AND employee.tenant_id = NEW.acting_tenant_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PROXY_ACTOR_INVALID';
  END IF;

  IF (
      TG_OP = 'INSERT'
      AND NEW.created_by_employee_id <> NEW.acting_employee_id
    )
    OR NEW.updated_by_employee_id <> NEW.acting_employee_id THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PROXY_ACTOR_INVALID';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_supplier_proxy_actor()
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.validate_supplier_product_catalog()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM category.id
  FROM public.catalog_categories AS category
  WHERE category.id = NEW.category_id
    AND category.status = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM public.catalog_categories AS child
      WHERE child.parent_id = category.id
    )
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_REFERENCE_INVALID';
  END IF;

  PERFORM brand.id
  FROM public.catalog_brands AS brand
  WHERE brand.id = NEW.brand_id
    AND brand.status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_REFERENCE_INVALID';
  END IF;

  IF NEW.status = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM public.supplier_skus AS sku
      WHERE sku.supplier_product_id = NEW.id
        AND sku.supplier_id = NEW.supplier_id
        AND sku.status = 'active'
    ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PRODUCT_STATE_CONFLICT';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_supplier_product_catalog()
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.prepare_supplier_sku_unit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  purchase_unit_status text;
  purchase_unit_base_id uuid;
  purchase_unit_conversion numeric(18, 6);
  product_status text;
BEGIN
  SELECT unit.status, unit.base_unit_id, unit.conversion_factor
  INTO
    purchase_unit_status,
    purchase_unit_base_id,
    purchase_unit_conversion
  FROM public.catalog_units AS unit
  WHERE unit.id = NEW.purchase_unit_id
  FOR SHARE;

  IF NOT FOUND OR purchase_unit_status <> 'active' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_REFERENCE_INVALID';
  END IF;

  NEW.base_unit_id := COALESCE(
    purchase_unit_base_id,
    NEW.purchase_unit_id
  );
  NEW.base_unit_conversion := CASE
    WHEN purchase_unit_base_id IS NULL THEN 1
    ELSE purchase_unit_conversion::numeric(18, 8)
  END;

  SELECT product.status
  INTO product_status
  FROM public.supplier_products AS product
  WHERE product.id = NEW.supplier_product_id
    AND product.supplier_id = NEW.supplier_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PRODUCT_NOT_FOUND';
  END IF;

  IF NEW.status = 'active' AND product_status = 'inactive' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_SKU_STATE_CONFLICT';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_supplier_sku_unit()
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.prepare_supplier_price_item()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  price_list_status text;
  price_list_supplier_id uuid;
  sku_supplier_id uuid;
  sku_purchase_unit_id uuid;
  sku_base_unit_id uuid;
  sku_base_unit_conversion numeric(18, 8);
BEGIN
  SELECT price_list.lifecycle_status, price_list.supplier_id
  INTO price_list_status, price_list_supplier_id
  FROM public.supplier_price_lists AS price_list
  WHERE price_list.id = NEW.supplier_price_list_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PRICE_LIST_NOT_FOUND';
  END IF;

  IF price_list_status <> 'draft' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
  END IF;

  SELECT
    sku.supplier_id,
    sku.purchase_unit_id,
    sku.base_unit_id,
    sku.base_unit_conversion
  INTO
    sku_supplier_id,
    sku_purchase_unit_id,
    sku_base_unit_id,
    sku_base_unit_conversion
  FROM public.supplier_skus AS sku
  WHERE sku.id = NEW.supplier_sku_id
  FOR SHARE;

  IF NOT FOUND OR sku_supplier_id <> price_list_supplier_id THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_SKU_NOT_FOUND';
  END IF;

  NEW.supplier_id := price_list_supplier_id;
  NEW.purchase_unit_id := sku_purchase_unit_id;
  NEW.base_unit_id := sku_base_unit_id;
  NEW.base_unit_conversion := sku_base_unit_conversion;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_supplier_price_item()
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.lock_published_supplier_price_data()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  price_list_id uuid;
  price_list_status text;
BEGIN
  IF TG_TABLE_NAME = 'supplier_price_lists' THEN
    IF TG_OP = 'DELETE' AND OLD.lifecycle_status <> 'draft' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.lifecycle_status <> 'draft' THEN
      IF NOT (
        OLD.lifecycle_status = 'published'
        AND NEW.lifecycle_status = 'retired'
        AND NEW.id = OLD.id
        AND NEW.supplier_id = OLD.supplier_id
        AND NEW.price_list_code = OLD.price_list_code
        AND NEW.version_number = OLD.version_number
        AND NEW.scope_type = OLD.scope_type
        AND NEW.name = OLD.name
        AND NEW.currency = OLD.currency
        AND NEW.effective_from = OLD.effective_from
        AND NEW.effective_until IS NOT DISTINCT FROM OLD.effective_until
        AND NEW.supersedes_price_list_id IS NOT DISTINCT FROM
          OLD.supersedes_price_list_id
        AND NEW.published_at = OLD.published_at
        AND NEW.row_version = OLD.row_version + 1
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
      END IF;
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  price_list_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.supplier_price_list_id
    ELSE NEW.supplier_price_list_id
  END;

  SELECT price_list.lifecycle_status
  INTO price_list_status
  FROM public.supplier_price_lists AS price_list
  WHERE price_list.id = price_list_id
  FOR SHARE;

  IF price_list_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.lock_published_supplier_price_data()
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.protect_active_supplier_catalog_reference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.status = 'active'
    AND NEW.status = 'inactive'
    AND (
      (TG_TABLE_NAME = 'catalog_categories' AND EXISTS (
        SELECT 1
        FROM public.supplier_products AS product
        WHERE product.category_id = OLD.id
          AND product.status = 'active'
      ))
      OR
      (TG_TABLE_NAME = 'catalog_brands' AND EXISTS (
        SELECT 1
        FROM public.supplier_products AS product
        WHERE product.brand_id = OLD.id
          AND product.status = 'active'
      ))
    ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_REFERENCE_IN_USE';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_active_supplier_catalog_reference()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER tr_supplier_products_validate_proxy_actor
BEFORE INSERT OR UPDATE ON public.supplier_products
FOR EACH ROW
EXECUTE FUNCTION public.validate_supplier_proxy_actor();

CREATE TRIGGER tr_supplier_products_validate_catalog
BEFORE INSERT OR UPDATE OF category_id, brand_id, status
ON public.supplier_products
FOR EACH ROW
EXECUTE FUNCTION public.validate_supplier_product_catalog();

CREATE TRIGGER tr_supplier_skus_validate_proxy_actor
BEFORE INSERT OR UPDATE ON public.supplier_skus
FOR EACH ROW
EXECUTE FUNCTION public.validate_supplier_proxy_actor();

CREATE TRIGGER tr_supplier_skus_prepare_unit
BEFORE INSERT OR UPDATE OF
  supplier_id,
  supplier_product_id,
  purchase_unit_id,
  status
ON public.supplier_skus
FOR EACH ROW
EXECUTE FUNCTION public.prepare_supplier_sku_unit();

CREATE TRIGGER tr_supplier_price_lists_validate_proxy_actor
BEFORE INSERT OR UPDATE ON public.supplier_price_lists
FOR EACH ROW
EXECUTE FUNCTION public.validate_supplier_proxy_actor();

CREATE TRIGGER tr_supplier_price_lists_lock_published
BEFORE UPDATE OR DELETE ON public.supplier_price_lists
FOR EACH ROW
EXECUTE FUNCTION public.lock_published_supplier_price_data();

CREATE TRIGGER tr_supplier_price_items_validate_proxy_actor
BEFORE INSERT OR UPDATE ON public.supplier_price_list_items
FOR EACH ROW
EXECUTE FUNCTION public.validate_supplier_proxy_actor();

CREATE TRIGGER tr_supplier_price_items_lock_published
BEFORE INSERT OR UPDATE OR DELETE ON public.supplier_price_list_items
FOR EACH ROW
EXECUTE FUNCTION public.lock_published_supplier_price_data();

CREATE TRIGGER tr_supplier_price_items_prepare
BEFORE INSERT OR UPDATE OF supplier_price_list_id, supplier_sku_id
ON public.supplier_price_list_items
FOR EACH ROW
EXECUTE FUNCTION public.prepare_supplier_price_item();

CREATE TRIGGER tr_catalog_categories_protect_supplier_products
BEFORE UPDATE OF status ON public.catalog_categories
FOR EACH ROW
EXECUTE FUNCTION public.protect_active_supplier_catalog_reference();

CREATE TRIGGER tr_catalog_brands_protect_supplier_products
BEFORE UPDATE OF status ON public.catalog_brands
FOR EACH ROW
EXECUTE FUNCTION public.protect_active_supplier_catalog_reference();

ALTER TABLE public.supplier_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_products FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_skus FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_price_lists FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_price_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_price_list_items FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.supplier_products,
  public.supplier_skus,
  public.supplier_price_lists,
  public.supplier_price_list_items
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.supplier_products,
  public.supplier_skus,
  public.supplier_price_lists,
  public.supplier_price_list_items
TO service_role;

INSERT INTO public.permissions (
  code,
  name,
  module,
  resource,
  action,
  description,
  status
)
VALUES
  (
    'supplier.product.view',
    '查看供应商商品',
    'supplier',
    'product',
    'view',
    '查看合作供应商的商品和 SKU',
    'active'
  ),
  (
    'supplier.product.manage',
    '管理供应商商品',
    'supplier',
    'product',
    'manage',
    '代录合作供应商的商品和 SKU',
    'active'
  ),
  (
    'supplier.cost-price.view',
    '查看供应商供货价',
    'supplier',
    'cost_price',
    'view',
    '查看合作供应商的供货价格版本',
    'active'
  ),
  (
    'supplier.cost-price.manage',
    '管理供应商供货价',
    'supplier',
    'cost_price',
    'manage',
    '代录并发布合作供应商的供货价格版本',
    'active'
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

INSERT INTO public.role_permissions (
  role_id,
  permission_id,
  access_scope
)
SELECT roles.id, permissions.id, 'all'
FROM public.roles AS roles
JOIN public.permissions AS permissions
  ON permissions.code IN (
    'supplier.product.view',
    'supplier.product.manage',
    'supplier.cost-price.view',
    'supplier.cost-price.manage'
  )
WHERE roles.code = 'system_admin'
  AND roles.tenant_id IS NOT NULL
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

COMMIT;
