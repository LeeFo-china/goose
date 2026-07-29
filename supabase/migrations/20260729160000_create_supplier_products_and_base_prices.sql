-- Rollback: use a forward migration to hide the Admin entry points and revoke
-- the four new permissions first. If no purchase order has ever referenced
-- these records, export and reconcile all rows, then drop triggers, functions,
-- supplier_price_list_items, supplier_price_lists, supplier_skus, and
-- supplier_products in dependency order. Once a purchase order references a
-- SKU or published price version, do not drop these history tables; retire the
-- feature and preserve immutable facts for audit instead.

BEGIN;

ALTER TABLE public.supplier_command_events
DROP CONSTRAINT supplier_command_events_resource_type_check;

ALTER TABLE public.supplier_command_events
ADD CONSTRAINT supplier_command_events_resource_type_check CHECK (
  resource_type IN (
    'supplier',
    'supplier_qualification_type',
    'supplier_qualification',
    'supplier_service_region',
    'supplier_address',
    'supplier_contact',
    'catalog_category',
    'catalog_brand',
    'catalog_unit',
    'tenant_supplier',
    'supplier_contract',
    'supplier_product',
    'supplier_sku',
    'supplier_price_list'
  )
);

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

    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  price_list_id := CASE
    WHEN TG_OP = 'INSERT' THEN NEW.supplier_price_list_id
    ELSE OLD.supplier_price_list_id
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

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.supplier_price_list_id IS DISTINCT FROM
      OLD.supplier_price_list_id THEN
      SELECT price_list.lifecycle_status
      INTO price_list_status
      FROM public.supplier_price_lists AS price_list
      WHERE price_list.id = NEW.supplier_price_list_id
      FOR SHARE;

      IF price_list_status IS DISTINCT FROM 'draft' THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
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

CREATE FUNCTION public.assert_supplier_proxy_scope(
  p_tenant_id uuid,
  p_supplier_id uuid,
  p_actor_employee_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM employee.id
  FROM public.employees AS employee
  WHERE employee.id = p_actor_employee_id
    AND employee.tenant_id = p_tenant_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PROXY_ACTOR_INVALID';
  END IF;

  PERFORM setting.tenant_id
  FROM public.tenant_supplier_settings AS setting
  WHERE setting.tenant_id = p_tenant_id
    AND setting.module_enabled
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_MODULE_DISABLED';
  END IF;

  PERFORM relationship.id
  FROM public.tenant_suppliers AS relationship
  WHERE relationship.tenant_id = p_tenant_id
    AND relationship.supplier_id = p_supplier_id
    AND relationship.relationship_status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_ORDER_NOT_ELIGIBLE';
  END IF;

  PERFORM supplier.id
  FROM public.suppliers AS supplier
  WHERE supplier.id = p_supplier_id
    AND supplier.onboarding_status = 'approved'
    AND supplier.operational_status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_ORDER_NOT_ELIGIBLE';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_supplier_proxy_scope(uuid, uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.create_supplier_product(
  p_product_id uuid,
  p_tenant_id uuid,
  p_supplier_id uuid,
  p_product_code text,
  p_name text,
  p_category_id uuid,
  p_brand_id uuid,
  p_description text,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_proxy_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_product public.supplier_products%ROWTYPE;
  v_request jsonb;
  v_snapshot jsonb;
BEGIN
  IF p_product_id IS NULL OR p_tenant_id IS NULL OR p_supplier_id IS NULL
    OR p_product_code IS NULL OR btrim(p_product_code) = ''
    OR p_name IS NULL OR btrim(p_name) = ''
    OR p_category_id IS NULL OR p_brand_id IS NULL
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
    OR p_proxy_reason IS NULL OR btrim(p_proxy_reason) = ''
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_PRODUCT_STATE_CONFLICT';
  END IF;

  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'supplier_id', p_supplier_id,
    'product_code', p_product_code,
    'name', p_name,
    'category_id', p_category_id,
    'brand_id', p_brand_id,
    'description', p_description,
    'actor_employee_id', p_actor_employee_id,
    'proxy_reason', p_proxy_reason
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        p_idempotency_key,
      0
    )
  );

  SELECT event.*
  INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_product'
      OR v_event.resource_id <> p_product_id
      OR v_event.command <> 'create_supplier_product'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'status', 'created',
      'idempotent', true,
      'product', v_event.to_state,
      'version', v_event.result_version
    );
  END IF;

  PERFORM public.assert_supplier_proxy_scope(
    p_tenant_id,
    p_supplier_id,
    p_actor_employee_id
  );

  BEGIN
    INSERT INTO public.supplier_products (
      id,
      supplier_id,
      product_code,
      name,
      category_id,
      brand_id,
      description,
      status,
      version,
      acting_tenant_id,
      acting_employee_id,
      operation_source,
      proxy_reason,
      created_by_employee_id,
      updated_by_employee_id
    )
    VALUES (
      p_product_id,
      p_supplier_id,
      btrim(p_product_code),
      btrim(p_name),
      p_category_id,
      p_brand_id,
      NULLIF(btrim(p_description), ''),
      'draft',
      1,
      p_tenant_id,
      p_actor_employee_id,
      'tenant_proxy',
      btrim(p_proxy_reason),
      p_actor_employee_id,
      p_actor_employee_id
    )
    RETURNING * INTO v_product;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'status', 'state_conflict',
        'error_code', 'SUPPLIER_PRODUCT_STATE_CONFLICT'
      );
  END;

  v_snapshot := to_jsonb(v_product);

  INSERT INTO public.supplier_command_events (
    tenant_id,
    resource_type,
    resource_id,
    command,
    from_state,
    to_state,
    reason,
    actor_user_id,
    actor_employee_id,
    idempotency_key,
    result_version
  )
  VALUES (
    p_tenant_id,
    'supplier_product',
    v_product.id,
    'create_supplier_product',
    jsonb_build_object('_request', v_request),
    v_snapshot,
    btrim(p_proxy_reason),
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_product.version
  );

  RETURN jsonb_build_object(
    'status', 'created',
    'idempotent', false,
    'product', v_snapshot,
    'version', v_product.version
  );
END;
$$;

CREATE FUNCTION public.create_supplier_sku(
  p_sku_id uuid,
  p_tenant_id uuid,
  p_supplier_id uuid,
  p_product_id uuid,
  p_sku_code text,
  p_name text,
  p_specification text,
  p_model text,
  p_purchase_unit_id uuid,
  p_batch_managed boolean,
  p_color_managed boolean,
  p_serial_managed boolean,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_proxy_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_sku public.supplier_skus%ROWTYPE;
  v_request jsonb;
  v_snapshot jsonb;
BEGIN
  IF p_sku_id IS NULL OR p_tenant_id IS NULL OR p_supplier_id IS NULL
    OR p_product_id IS NULL
    OR p_sku_code IS NULL OR btrim(p_sku_code) = ''
    OR p_name IS NULL OR btrim(p_name) = ''
    OR p_purchase_unit_id IS NULL
    OR p_batch_managed IS NULL OR p_color_managed IS NULL
    OR p_serial_managed IS NULL
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
    OR p_proxy_reason IS NULL OR btrim(p_proxy_reason) = ''
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_SKU_STATE_CONFLICT';
  END IF;

  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'supplier_id', p_supplier_id,
    'product_id', p_product_id,
    'sku_code', p_sku_code,
    'name', p_name,
    'specification', p_specification,
    'model', p_model,
    'purchase_unit_id', p_purchase_unit_id,
    'batch_managed', p_batch_managed,
    'color_managed', p_color_managed,
    'serial_managed', p_serial_managed,
    'actor_employee_id', p_actor_employee_id,
    'proxy_reason', p_proxy_reason
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        p_idempotency_key,
      0
    )
  );

  SELECT event.*
  INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_sku'
      OR v_event.resource_id <> p_sku_id
      OR v_event.command <> 'create_supplier_sku'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'status', 'created',
      'idempotent', true,
      'sku', v_event.to_state,
      'version', v_event.result_version
    );
  END IF;

  PERFORM public.assert_supplier_proxy_scope(
    p_tenant_id,
    p_supplier_id,
    p_actor_employee_id
  );

  BEGIN
    INSERT INTO public.supplier_skus (
      id,
      supplier_id,
      supplier_product_id,
      sku_code,
      name,
      specification,
      model,
      purchase_unit_id,
      base_unit_id,
      base_unit_conversion,
      batch_managed,
      color_managed,
      serial_managed,
      status,
      version,
      acting_tenant_id,
      acting_employee_id,
      operation_source,
      proxy_reason,
      created_by_employee_id,
      updated_by_employee_id
    )
    VALUES (
      p_sku_id,
      p_supplier_id,
      p_product_id,
      btrim(p_sku_code),
      btrim(p_name),
      NULLIF(btrim(p_specification), ''),
      NULLIF(btrim(p_model), ''),
      p_purchase_unit_id,
      p_purchase_unit_id,
      1,
      p_batch_managed,
      p_color_managed,
      p_serial_managed,
      'draft',
      1,
      p_tenant_id,
      p_actor_employee_id,
      'tenant_proxy',
      btrim(p_proxy_reason),
      p_actor_employee_id,
      p_actor_employee_id
    )
    RETURNING * INTO v_sku;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'status', 'state_conflict',
        'error_code', 'SUPPLIER_SKU_STATE_CONFLICT'
      );
  END;

  v_snapshot := to_jsonb(v_sku) || jsonb_build_object(
    'base_unit_conversion',
    v_sku.base_unit_conversion::text
  );

  INSERT INTO public.supplier_command_events (
    tenant_id,
    resource_type,
    resource_id,
    command,
    from_state,
    to_state,
    reason,
    actor_user_id,
    actor_employee_id,
    idempotency_key,
    result_version
  )
  VALUES (
    p_tenant_id,
    'supplier_sku',
    v_sku.id,
    'create_supplier_sku',
    jsonb_build_object('_request', v_request),
    v_snapshot,
    btrim(p_proxy_reason),
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_sku.version
  );

  RETURN jsonb_build_object(
    'status', 'created',
    'idempotent', false,
    'sku', v_snapshot,
    'version', v_sku.version
  );
END;
$$;

CREATE FUNCTION public.mutate_supplier_product(
  p_tenant_id uuid,
  p_supplier_id uuid,
  p_product_id uuid,
  p_action text,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_proxy_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_product public.supplier_products%ROWTYPE;
  v_before jsonb;
  v_request jsonb;
  v_next_status text;
  v_snapshot jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_supplier_id IS NULL OR p_product_id IS NULL
    OR p_action NOT IN ('activate', 'deactivate')
    OR p_expected_version IS NULL OR p_expected_version < 1
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
    OR p_proxy_reason IS NULL OR btrim(p_proxy_reason) = ''
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_PRODUCT_STATE_CONFLICT';
  END IF;

  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'supplier_id', p_supplier_id,
    'product_id', p_product_id,
    'action', p_action,
    'expected_version', p_expected_version,
    'actor_employee_id', p_actor_employee_id,
    'proxy_reason', p_proxy_reason
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        p_idempotency_key,
      0
    )
  );

  SELECT event.*
  INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_product'
      OR v_event.resource_id <> p_product_id
      OR v_event.command <> 'mutate_supplier_product:' || p_action
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'status', 'updated',
      'idempotent', true,
      'product', v_event.to_state,
      'version', v_event.result_version
    );
  END IF;

  PERFORM public.assert_supplier_proxy_scope(
    p_tenant_id,
    p_supplier_id,
    p_actor_employee_id
  );

  SELECT product.*
  INTO v_product
  FROM public.supplier_products AS product
  WHERE product.id = p_product_id
    AND product.supplier_id = p_supplier_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PRODUCT_NOT_FOUND'
    );
  END IF;

  IF v_product.version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_PRODUCT_VERSION_CONFLICT',
      'version', v_product.version,
      'current_status', v_product.status
    );
  END IF;

  IF p_action = 'activate' AND v_product.status IN ('draft', 'inactive') THEN
    v_next_status := 'active';
  ELSIF p_action = 'deactivate' AND v_product.status = 'active' THEN
    v_next_status := 'inactive';
  ELSE
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PRODUCT_STATE_CONFLICT',
      'version', v_product.version,
      'current_status', v_product.status
    );
  END IF;

  v_before := to_jsonb(v_product);

  UPDATE public.supplier_products AS product
  SET
    status = v_next_status,
    version = product.version + 1,
    acting_tenant_id = p_tenant_id,
    acting_employee_id = p_actor_employee_id,
    operation_source = 'tenant_proxy',
    proxy_reason = btrim(p_proxy_reason),
    updated_by_employee_id = p_actor_employee_id,
    updated_at = now()
  WHERE product.id = p_product_id
    AND product.supplier_id = p_supplier_id
  RETURNING * INTO v_product;

  v_snapshot := to_jsonb(v_product);

  INSERT INTO public.supplier_command_events (
    tenant_id,
    resource_type,
    resource_id,
    command,
    from_state,
    to_state,
    reason,
    actor_user_id,
    actor_employee_id,
    idempotency_key,
    result_version
  )
  VALUES (
    p_tenant_id,
    'supplier_product',
    v_product.id,
    'mutate_supplier_product:' || p_action,
    v_before || jsonb_build_object('_request', v_request),
    v_snapshot,
    btrim(p_proxy_reason),
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_product.version
  );

  RETURN jsonb_build_object(
    'status', 'updated',
    'idempotent', false,
    'product', v_snapshot,
    'version', v_product.version
  );
END;
$$;

CREATE FUNCTION public.mutate_supplier_sku(
  p_tenant_id uuid,
  p_supplier_id uuid,
  p_sku_id uuid,
  p_action text,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_proxy_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_sku public.supplier_skus%ROWTYPE;
  v_before jsonb;
  v_request jsonb;
  v_next_status text;
  v_snapshot jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_supplier_id IS NULL OR p_sku_id IS NULL
    OR p_action NOT IN ('activate', 'deactivate')
    OR p_expected_version IS NULL OR p_expected_version < 1
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
    OR p_proxy_reason IS NULL OR btrim(p_proxy_reason) = ''
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_SKU_STATE_CONFLICT';
  END IF;

  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'supplier_id', p_supplier_id,
    'sku_id', p_sku_id,
    'action', p_action,
    'expected_version', p_expected_version,
    'actor_employee_id', p_actor_employee_id,
    'proxy_reason', p_proxy_reason
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        p_idempotency_key,
      0
    )
  );

  SELECT event.*
  INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_sku'
      OR v_event.resource_id <> p_sku_id
      OR v_event.command <> 'mutate_supplier_sku:' || p_action
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'status', 'updated',
      'idempotent', true,
      'sku', v_event.to_state,
      'version', v_event.result_version
    );
  END IF;

  PERFORM public.assert_supplier_proxy_scope(
    p_tenant_id,
    p_supplier_id,
    p_actor_employee_id
  );

  SELECT sku.*
  INTO v_sku
  FROM public.supplier_skus AS sku
  WHERE sku.id = p_sku_id
    AND sku.supplier_id = p_supplier_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_SKU_NOT_FOUND'
    );
  END IF;

  IF v_sku.version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_SKU_VERSION_CONFLICT',
      'version', v_sku.version,
      'current_status', v_sku.status
    );
  END IF;

  IF p_action = 'activate' AND v_sku.status IN ('draft', 'inactive') THEN
    v_next_status := 'active';
  ELSIF p_action = 'deactivate' AND v_sku.status = 'active' THEN
    v_next_status := 'inactive';
  ELSE
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_SKU_STATE_CONFLICT',
      'version', v_sku.version,
      'current_status', v_sku.status
    );
  END IF;

  v_before := to_jsonb(v_sku);

  UPDATE public.supplier_skus AS sku
  SET
    status = v_next_status,
    version = sku.version + 1,
    acting_tenant_id = p_tenant_id,
    acting_employee_id = p_actor_employee_id,
    operation_source = 'tenant_proxy',
    proxy_reason = btrim(p_proxy_reason),
    updated_by_employee_id = p_actor_employee_id,
    updated_at = now()
  WHERE sku.id = p_sku_id
    AND sku.supplier_id = p_supplier_id
  RETURNING * INTO v_sku;

  v_snapshot := to_jsonb(v_sku) || jsonb_build_object(
    'base_unit_conversion',
    v_sku.base_unit_conversion::text
  );

  INSERT INTO public.supplier_command_events (
    tenant_id,
    resource_type,
    resource_id,
    command,
    from_state,
    to_state,
    reason,
    actor_user_id,
    actor_employee_id,
    idempotency_key,
    result_version
  )
  VALUES (
    p_tenant_id,
    'supplier_sku',
    v_sku.id,
    'mutate_supplier_sku:' || p_action,
    v_before || jsonb_build_object('_request', v_request),
    v_snapshot,
    btrim(p_proxy_reason),
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_sku.version
  );

  RETURN jsonb_build_object(
    'status', 'updated',
    'idempotent', false,
    'sku', v_snapshot,
    'version', v_sku.version
  );
END;
$$;

CREATE FUNCTION public.create_supplier_price_list(
  p_price_list_id uuid,
  p_tenant_id uuid,
  p_supplier_id uuid,
  p_price_list_code text,
  p_name text,
  p_currency text,
  p_effective_from timestamptz,
  p_effective_until timestamptz,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_proxy_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_price_list public.supplier_price_lists%ROWTYPE;
  v_request jsonb;
  v_snapshot jsonb;
BEGIN
  IF p_price_list_id IS NULL OR p_tenant_id IS NULL
    OR p_supplier_id IS NULL
    OR p_price_list_code IS NULL OR btrim(p_price_list_code) = ''
    OR p_name IS NULL OR btrim(p_name) = ''
    OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$'
    OR p_effective_from IS NULL
    OR (
      p_effective_until IS NOT NULL
      AND p_effective_until <= p_effective_from
    )
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
    OR p_proxy_reason IS NULL OR btrim(p_proxy_reason) = ''
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
  END IF;

  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'supplier_id', p_supplier_id,
    'price_list_code', p_price_list_code,
    'name', p_name,
    'currency', p_currency,
    'effective_from', p_effective_from,
    'effective_until', p_effective_until,
    'actor_employee_id', p_actor_employee_id,
    'proxy_reason', p_proxy_reason
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        p_idempotency_key,
      0
    )
  );

  SELECT event.*
  INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_price_list'
      OR v_event.resource_id <> p_price_list_id
      OR v_event.command <> 'create_supplier_price_list'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'status', 'created',
      'idempotent', true,
      'price_list', v_event.to_state,
      'version', v_event.result_version
    );
  END IF;

  PERFORM public.assert_supplier_proxy_scope(
    p_tenant_id,
    p_supplier_id,
    p_actor_employee_id
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-price-series:' || p_supplier_id::text || ':' ||
        lower(btrim(p_price_list_code)),
      6720240729160000
    )
  );

  IF EXISTS (
    SELECT 1
    FROM public.supplier_price_lists AS existing
    WHERE existing.supplier_id = p_supplier_id
      AND existing.price_list_code = btrim(p_price_list_code)
  ) THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION'
    );
  END IF;

  BEGIN
    INSERT INTO public.supplier_price_lists (
      id,
      supplier_id,
      price_list_code,
      version_number,
      scope_type,
      name,
      currency,
      lifecycle_status,
      effective_from,
      effective_until,
      row_version,
      acting_tenant_id,
      acting_employee_id,
      operation_source,
      proxy_reason,
      created_by_employee_id,
      updated_by_employee_id
    )
    VALUES (
      p_price_list_id,
      p_supplier_id,
      btrim(p_price_list_code),
      1,
      'default',
      btrim(p_name),
      p_currency::char(3),
      'draft',
      p_effective_from,
      p_effective_until,
      1,
      p_tenant_id,
      p_actor_employee_id,
      'tenant_proxy',
      btrim(p_proxy_reason),
      p_actor_employee_id,
      p_actor_employee_id
    )
    RETURNING * INTO v_price_list;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'status', 'state_conflict',
        'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION'
      );
  END;

  v_snapshot := to_jsonb(v_price_list);

  INSERT INTO public.supplier_command_events (
    tenant_id,
    resource_type,
    resource_id,
    command,
    from_state,
    to_state,
    reason,
    actor_user_id,
    actor_employee_id,
    idempotency_key,
    result_version
  )
  VALUES (
    p_tenant_id,
    'supplier_price_list',
    v_price_list.id,
    'create_supplier_price_list',
    jsonb_build_object('_request', v_request),
    v_snapshot,
    btrim(p_proxy_reason),
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_price_list.row_version
  );

  RETURN jsonb_build_object(
    'status', 'created',
    'idempotent', false,
    'price_list', v_snapshot,
    'version', v_price_list.row_version
  );
END;
$$;

CREATE FUNCTION public.publish_supplier_price_list(
  p_price_list_id uuid,
  p_tenant_id uuid,
  p_supplier_id uuid,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_proxy_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_draft public.supplier_price_lists%ROWTYPE;
  v_before jsonb;
  v_request jsonb;
  v_snapshot jsonb;
BEGIN
  IF p_price_list_id IS NULL OR p_tenant_id IS NULL
    OR p_supplier_id IS NULL
    OR p_expected_version IS NULL OR p_expected_version < 1
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
    OR p_proxy_reason IS NULL OR btrim(p_proxy_reason) = ''
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
  END IF;

  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'supplier_id', p_supplier_id,
    'price_list_id', p_price_list_id,
    'expected_version', p_expected_version,
    'actor_employee_id', p_actor_employee_id,
    'proxy_reason', p_proxy_reason
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        p_idempotency_key,
      0
    )
  );

  SELECT event.*
  INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_price_list'
      OR v_event.resource_id <> p_price_list_id
      OR v_event.command <> 'publish_supplier_price_list'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'status', 'published',
      'idempotent', true,
      'price_list', v_event.to_state,
      'version', v_event.result_version
    );
  END IF;

  PERFORM public.assert_supplier_proxy_scope(
    p_tenant_id,
    p_supplier_id,
    p_actor_employee_id
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-price-publish:' || p_supplier_id::text,
      6720240729160000
    )
  );

  SELECT draft.*
  INTO v_draft
  FROM public.supplier_price_lists AS draft
  WHERE draft.id = p_price_list_id
    AND draft.supplier_id = p_supplier_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PRICE_LIST_NOT_FOUND'
    );
  END IF;

  IF v_draft.row_version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_PRICE_LIST_VERSION_CONFLICT',
      'version', v_draft.row_version,
      'current_status', v_draft.lifecycle_status
    );
  END IF;

  IF v_draft.lifecycle_status <> 'draft' THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION',
      'version', v_draft.row_version,
      'current_status', v_draft.lifecycle_status
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.supplier_price_list_items AS draft_item
    WHERE draft_item.supplier_price_list_id = v_draft.id
  ) THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION',
      'reason', 'empty_price_list'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.supplier_price_list_items AS draft_item
    JOIN public.supplier_skus AS sku
      ON sku.id = draft_item.supplier_sku_id
      AND sku.supplier_id = v_draft.supplier_id
    JOIN public.supplier_products AS product
      ON product.id = sku.supplier_product_id
      AND product.supplier_id = sku.supplier_id
    WHERE draft_item.supplier_price_list_id = v_draft.id
      AND (
        product.status <> 'active'
        OR sku.status <> 'active'
      )
  ) THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION',
      'reason', 'inactive_product_or_sku'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.supplier_price_list_items AS draft_item
    JOIN public.supplier_price_lists AS draft
      ON draft.id = draft_item.supplier_price_list_id
    JOIN public.supplier_price_list_items AS published_item
      ON published_item.supplier_sku_id = draft_item.supplier_sku_id
    JOIN public.supplier_price_lists AS published
      ON published.id = published_item.supplier_price_list_id
      AND published.supplier_id = draft.supplier_id
      AND published.lifecycle_status = 'published'
    WHERE draft.id = v_draft.id
      AND published.id <> draft.id
      AND published.effective_from <
        COALESCE(draft.effective_until, 'infinity'::timestamptz)
      AND COALESCE(
        published.effective_until,
        'infinity'::timestamptz
      ) > draft.effective_from
  ) THEN
    RETURN jsonb_build_object(
      'status', 'period_conflict',
      'error_code', 'SUPPLIER_PRICE_PERIOD_CONFLICT'
    );
  END IF;

  v_before := to_jsonb(v_draft);

  UPDATE public.supplier_price_lists AS price_list
  SET
    lifecycle_status = 'published',
    published_at = now(),
    row_version = price_list.row_version + 1,
    acting_tenant_id = p_tenant_id,
    acting_employee_id = p_actor_employee_id,
    operation_source = 'tenant_proxy',
    proxy_reason = btrim(p_proxy_reason),
    updated_by_employee_id = p_actor_employee_id,
    updated_at = now()
  WHERE price_list.id = p_price_list_id
    AND price_list.supplier_id = p_supplier_id
  RETURNING * INTO v_draft;

  v_snapshot := to_jsonb(v_draft);

  INSERT INTO public.supplier_command_events (
    tenant_id,
    resource_type,
    resource_id,
    command,
    from_state,
    to_state,
    reason,
    actor_user_id,
    actor_employee_id,
    idempotency_key,
    result_version
  )
  VALUES (
    p_tenant_id,
    'supplier_price_list',
    v_draft.id,
    'publish_supplier_price_list',
    v_before || jsonb_build_object('_request', v_request),
    v_snapshot,
    btrim(p_proxy_reason),
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_draft.row_version
  );

  RETURN jsonb_build_object(
    'status', 'published',
    'idempotent', false,
    'price_list', v_snapshot,
    'version', v_draft.row_version
  );
END;
$$;

CREATE FUNCTION public.create_supplier_price_list_version(
  p_new_price_list_id uuid,
  p_tenant_id uuid,
  p_supplier_id uuid,
  p_source_price_list_id uuid,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_proxy_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_source public.supplier_price_lists%ROWTYPE;
  v_new public.supplier_price_lists%ROWTYPE;
  v_request jsonb;
  v_snapshot jsonb;
BEGIN
  IF p_new_price_list_id IS NULL OR p_tenant_id IS NULL
    OR p_supplier_id IS NULL OR p_source_price_list_id IS NULL
    OR p_expected_version IS NULL OR p_expected_version < 1
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
    OR p_proxy_reason IS NULL OR btrim(p_proxy_reason) = ''
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
  END IF;

  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'supplier_id', p_supplier_id,
    'source_price_list_id', p_source_price_list_id,
    'expected_version', p_expected_version,
    'actor_employee_id', p_actor_employee_id,
    'proxy_reason', p_proxy_reason
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        p_idempotency_key,
      0
    )
  );

  SELECT event.*
  INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_price_list'
      OR v_event.resource_id <> p_new_price_list_id
      OR v_event.command <> 'create_supplier_price_list_version'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'status', 'created',
      'idempotent', true,
      'price_list', v_event.to_state,
      'version', v_event.result_version
    );
  END IF;

  PERFORM public.assert_supplier_proxy_scope(
    p_tenant_id,
    p_supplier_id,
    p_actor_employee_id
  );

  SELECT source.*
  INTO v_source
  FROM public.supplier_price_lists AS source
  WHERE source.id = p_source_price_list_id
    AND source.supplier_id = p_supplier_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PRICE_LIST_NOT_FOUND'
    );
  END IF;

  IF v_source.row_version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_PRICE_LIST_VERSION_CONFLICT',
      'version', v_source.row_version,
      'current_status', v_source.lifecycle_status
    );
  END IF;

  IF v_source.lifecycle_status NOT IN ('published', 'retired') THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION'
    );
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-price-series:' || p_supplier_id::text || ':' ||
        lower(v_source.price_list_code),
      6720240729160000
    )
  );

  IF EXISTS (
    SELECT 1
    FROM public.supplier_price_lists AS draft
    WHERE draft.supplier_id = p_supplier_id
      AND draft.price_list_code = v_source.price_list_code
      AND draft.lifecycle_status = 'draft'
  ) THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION',
      'reason', 'draft_already_exists'
    );
  END IF;

  INSERT INTO public.supplier_price_lists (
    id,
    supplier_id,
    price_list_code,
    version_number,
    scope_type,
    name,
    currency,
    lifecycle_status,
    effective_from,
    effective_until,
    supersedes_price_list_id,
    row_version,
    acting_tenant_id,
    acting_employee_id,
    operation_source,
    proxy_reason,
    created_by_employee_id,
    updated_by_employee_id
  )
  VALUES (
    p_new_price_list_id,
    p_supplier_id,
    v_source.price_list_code,
    v_source.version_number + 1,
    v_source.scope_type,
    v_source.name,
    v_source.currency,
    'draft',
    v_source.effective_from,
    v_source.effective_until,
    v_source.id,
    1,
    p_tenant_id,
    p_actor_employee_id,
    'tenant_proxy',
    btrim(p_proxy_reason),
    p_actor_employee_id,
    p_actor_employee_id
  )
  RETURNING * INTO v_new;

  INSERT INTO public.supplier_price_list_items (
    id,
    supplier_id,
    supplier_price_list_id,
    supplier_sku_id,
    minimum_quantity,
    maximum_quantity,
    purchase_unit_id,
    base_unit_id,
    base_unit_conversion,
    unit_price,
    tax_rate,
    tax_inclusive,
    acting_tenant_id,
    acting_employee_id,
    operation_source,
    proxy_reason,
    created_by_employee_id,
    updated_by_employee_id
  )
  SELECT
    gen_random_uuid(),
    source_item.supplier_id,
    v_new.id,
    source_item.supplier_sku_id,
    source_item.minimum_quantity,
    source_item.maximum_quantity,
    source_item.purchase_unit_id,
    source_item.base_unit_id,
    source_item.base_unit_conversion,
    source_item.unit_price,
    source_item.tax_rate,
    source_item.tax_inclusive,
    p_tenant_id,
    p_actor_employee_id,
    'tenant_proxy',
    btrim(p_proxy_reason),
    p_actor_employee_id,
    p_actor_employee_id
  FROM public.supplier_price_list_items AS source_item
  WHERE source_item.supplier_price_list_id = v_source.id;

  v_snapshot := to_jsonb(v_new);

  INSERT INTO public.supplier_command_events (
    tenant_id,
    resource_type,
    resource_id,
    command,
    from_state,
    to_state,
    reason,
    actor_user_id,
    actor_employee_id,
    idempotency_key,
    result_version
  )
  VALUES (
    p_tenant_id,
    'supplier_price_list',
    v_new.id,
    'create_supplier_price_list_version',
    to_jsonb(v_source) || jsonb_build_object('_request', v_request),
    v_snapshot,
    btrim(p_proxy_reason),
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_new.row_version
  );

  RETURN jsonb_build_object(
    'status', 'created',
    'idempotent', false,
    'price_list', v_snapshot,
    'version', v_new.row_version
  );
END;
$$;

CREATE FUNCTION public.retire_supplier_price_list(
  p_price_list_id uuid,
  p_tenant_id uuid,
  p_supplier_id uuid,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_proxy_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_price_list public.supplier_price_lists%ROWTYPE;
  v_before jsonb;
  v_request jsonb;
  v_snapshot jsonb;
BEGIN
  IF p_price_list_id IS NULL OR p_tenant_id IS NULL
    OR p_supplier_id IS NULL
    OR p_expected_version IS NULL OR p_expected_version < 1
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
    OR p_proxy_reason IS NULL OR btrim(p_proxy_reason) = ''
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
  END IF;

  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'supplier_id', p_supplier_id,
    'price_list_id', p_price_list_id,
    'expected_version', p_expected_version,
    'actor_employee_id', p_actor_employee_id,
    'proxy_reason', p_proxy_reason
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        p_idempotency_key,
      0
    )
  );

  SELECT event.*
  INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_price_list'
      OR v_event.resource_id <> p_price_list_id
      OR v_event.command <> 'retire_supplier_price_list'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'status', 'retired',
      'idempotent', true,
      'price_list', v_event.to_state,
      'version', v_event.result_version
    );
  END IF;

  PERFORM public.assert_supplier_proxy_scope(
    p_tenant_id,
    p_supplier_id,
    p_actor_employee_id
  );

  SELECT price_list.*
  INTO v_price_list
  FROM public.supplier_price_lists AS price_list
  WHERE price_list.id = p_price_list_id
    AND price_list.supplier_id = p_supplier_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PRICE_LIST_NOT_FOUND'
    );
  END IF;

  IF v_price_list.row_version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_PRICE_LIST_VERSION_CONFLICT',
      'version', v_price_list.row_version,
      'current_status', v_price_list.lifecycle_status
    );
  END IF;

  IF v_price_list.lifecycle_status <> 'published' THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION',
      'version', v_price_list.row_version,
      'current_status', v_price_list.lifecycle_status
    );
  END IF;

  v_before := to_jsonb(v_price_list);

  UPDATE public.supplier_price_lists AS price_list
  SET
    lifecycle_status = 'retired',
    row_version = price_list.row_version + 1,
    acting_tenant_id = p_tenant_id,
    acting_employee_id = p_actor_employee_id,
    operation_source = 'tenant_proxy',
    proxy_reason = btrim(p_proxy_reason),
    updated_by_employee_id = p_actor_employee_id,
    updated_at = now()
  WHERE price_list.id = p_price_list_id
    AND price_list.supplier_id = p_supplier_id
  RETURNING * INTO v_price_list;

  v_snapshot := to_jsonb(v_price_list);

  INSERT INTO public.supplier_command_events (
    tenant_id,
    resource_type,
    resource_id,
    command,
    from_state,
    to_state,
    reason,
    actor_user_id,
    actor_employee_id,
    idempotency_key,
    result_version
  )
  VALUES (
    p_tenant_id,
    'supplier_price_list',
    v_price_list.id,
    'retire_supplier_price_list',
    v_before || jsonb_build_object('_request', v_request),
    v_snapshot,
    btrim(p_proxy_reason),
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_price_list.row_version
  );

  RETURN jsonb_build_object(
    'status', 'retired',
    'idempotent', false,
    'price_list', v_snapshot,
    'version', v_price_list.row_version
  );
END;
$$;

CREATE FUNCTION public.upsert_supplier_price_list_item(
  p_item_id uuid,
  p_price_list_id uuid,
  p_tenant_id uuid,
  p_supplier_id uuid,
  p_sku_id uuid,
  p_unit_price numeric,
  p_tax_rate numeric,
  p_tax_inclusive boolean,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_proxy_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_price_list public.supplier_price_lists%ROWTYPE;
  v_item public.supplier_price_list_items%ROWTYPE;
  v_before_item jsonb := NULL;
  v_before_list jsonb;
  v_request jsonb;
  v_item_snapshot jsonb;
  v_to_state jsonb;
  v_purchase_unit_id uuid;
  v_base_unit_id uuid;
  v_base_unit_conversion numeric(18, 6);
BEGIN
  IF p_item_id IS NULL OR p_price_list_id IS NULL
    OR p_tenant_id IS NULL OR p_supplier_id IS NULL OR p_sku_id IS NULL
    OR p_unit_price IS NULL OR p_unit_price < 0
    OR p_tax_rate IS NULL OR p_tax_rate < 0 OR p_tax_rate > 1
    OR p_tax_inclusive IS NULL
    OR p_expected_version IS NULL OR p_expected_version < 1
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
    OR p_proxy_reason IS NULL OR btrim(p_proxy_reason) = ''
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
  END IF;

  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'supplier_id', p_supplier_id,
    'price_list_id', p_price_list_id,
    'item_id', p_item_id,
    'sku_id', p_sku_id,
    'unit_price', p_unit_price::text,
    'tax_rate', p_tax_rate::text,
    'tax_inclusive', p_tax_inclusive,
    'expected_version', p_expected_version,
    'actor_employee_id', p_actor_employee_id,
    'proxy_reason', p_proxy_reason
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        p_idempotency_key,
      0
    )
  );

  SELECT event.*
  INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_price_list'
      OR v_event.resource_id <> p_price_list_id
      OR v_event.command <>
        'upsert_supplier_price_list_item:' || p_item_id::text
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'status', 'updated',
      'idempotent', true,
      'price_list', v_event.to_state -> 'price_list',
      'item', v_event.to_state -> 'item',
      'version', v_event.result_version
    );
  END IF;

  PERFORM public.assert_supplier_proxy_scope(
    p_tenant_id,
    p_supplier_id,
    p_actor_employee_id
  );

  SELECT price_list.*
  INTO v_price_list
  FROM public.supplier_price_lists AS price_list
  WHERE price_list.id = p_price_list_id
    AND price_list.supplier_id = p_supplier_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PRICE_LIST_NOT_FOUND'
    );
  END IF;

  IF v_price_list.row_version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_PRICE_LIST_VERSION_CONFLICT',
      'version', v_price_list.row_version,
      'current_status', v_price_list.lifecycle_status
    );
  END IF;

  IF v_price_list.lifecycle_status <> 'draft' THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION'
    );
  END IF;

  SELECT
    sku.purchase_unit_id,
    sku.base_unit_id,
    sku.base_unit_conversion
  INTO
    v_purchase_unit_id,
    v_base_unit_id,
    v_base_unit_conversion
  FROM public.supplier_skus AS sku
  WHERE sku.id = p_sku_id
    AND sku.supplier_id = p_supplier_id
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_SKU_NOT_FOUND'
    );
  END IF;

  SELECT item.*
  INTO v_item
  FROM public.supplier_price_list_items AS item
  WHERE item.id = p_item_id
  FOR UPDATE;

  IF FOUND AND (
    v_item.supplier_price_list_id <> p_price_list_id
    OR v_item.supplier_id <> p_supplier_id
  ) THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION'
    );
  END IF;

  IF FOUND THEN
    v_before_item := to_jsonb(v_item);
  END IF;
  v_before_list := to_jsonb(v_price_list);

  BEGIN
    IF v_before_item IS NULL THEN
      INSERT INTO public.supplier_price_list_items (
        id,
        supplier_id,
        supplier_price_list_id,
        supplier_sku_id,
        minimum_quantity,
        maximum_quantity,
        purchase_unit_id,
        base_unit_id,
        base_unit_conversion,
        unit_price,
        tax_rate,
        tax_inclusive,
        acting_tenant_id,
        acting_employee_id,
        operation_source,
        proxy_reason,
        created_by_employee_id,
        updated_by_employee_id
      )
      VALUES (
        p_item_id,
        p_supplier_id,
        p_price_list_id,
        p_sku_id,
        1,
        NULL,
        v_purchase_unit_id,
        v_base_unit_id,
        v_base_unit_conversion,
        p_unit_price::numeric(14, 2),
        p_tax_rate::numeric(7, 6),
        p_tax_inclusive,
        p_tenant_id,
        p_actor_employee_id,
        'tenant_proxy',
        btrim(p_proxy_reason),
        p_actor_employee_id,
        p_actor_employee_id
      )
      RETURNING * INTO v_item;
    ELSE
      UPDATE public.supplier_price_list_items AS item
      SET
        supplier_sku_id = p_sku_id,
        unit_price = p_unit_price::numeric(14, 2),
        tax_rate = p_tax_rate::numeric(7, 6),
        tax_inclusive = p_tax_inclusive,
        acting_tenant_id = p_tenant_id,
        acting_employee_id = p_actor_employee_id,
        operation_source = 'tenant_proxy',
        proxy_reason = btrim(p_proxy_reason),
        updated_by_employee_id = p_actor_employee_id,
        updated_at = now()
      WHERE item.id = p_item_id
      RETURNING * INTO v_item;
    END IF;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'status', 'state_conflict',
        'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION',
        'reason', 'duplicate_sku'
      );
  END;

  UPDATE public.supplier_price_lists AS price_list
  SET
    row_version = price_list.row_version + 1,
    acting_tenant_id = p_tenant_id,
    acting_employee_id = p_actor_employee_id,
    operation_source = 'tenant_proxy',
    proxy_reason = btrim(p_proxy_reason),
    updated_by_employee_id = p_actor_employee_id,
    updated_at = now()
  WHERE price_list.id = p_price_list_id
  RETURNING * INTO v_price_list;

  v_item_snapshot := to_jsonb(v_item) || jsonb_build_object(
    'minimum_quantity', v_item.minimum_quantity::text,
    'maximum_quantity',
      CASE
        WHEN v_item.maximum_quantity IS NULL THEN NULL
        ELSE to_jsonb(v_item.maximum_quantity::text)
      END,
    'base_unit_conversion', v_item.base_unit_conversion::text,
    'unit_price', v_item.unit_price::text,
    'tax_rate', v_item.tax_rate::text
  );
  v_to_state := jsonb_build_object(
    'price_list', to_jsonb(v_price_list),
    'item', v_item_snapshot
  );

  INSERT INTO public.supplier_command_events (
    tenant_id,
    resource_type,
    resource_id,
    command,
    from_state,
    to_state,
    reason,
    actor_user_id,
    actor_employee_id,
    idempotency_key,
    result_version
  )
  VALUES (
    p_tenant_id,
    'supplier_price_list',
    p_price_list_id,
    'upsert_supplier_price_list_item:' || p_item_id::text,
    jsonb_build_object(
      '_request', v_request,
      'price_list', v_before_list,
      'item', v_before_item
    ),
    v_to_state,
    btrim(p_proxy_reason),
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_price_list.row_version
  );

  RETURN jsonb_build_object(
    'status', 'updated',
    'idempotent', false,
    'price_list', to_jsonb(v_price_list),
    'item', v_item_snapshot,
    'version', v_price_list.row_version
  );
END;
$$;

CREATE FUNCTION public.delete_supplier_price_list_item(
  p_item_id uuid,
  p_price_list_id uuid,
  p_tenant_id uuid,
  p_supplier_id uuid,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_proxy_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_price_list public.supplier_price_lists%ROWTYPE;
  v_item public.supplier_price_list_items%ROWTYPE;
  v_before_list jsonb;
  v_request jsonb;
BEGIN
  IF p_item_id IS NULL OR p_price_list_id IS NULL
    OR p_tenant_id IS NULL OR p_supplier_id IS NULL
    OR p_expected_version IS NULL OR p_expected_version < 1
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
    OR p_proxy_reason IS NULL OR btrim(p_proxy_reason) = ''
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_PRICE_LIST_INVALID_ACTION';
  END IF;

  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'supplier_id', p_supplier_id,
    'price_list_id', p_price_list_id,
    'item_id', p_item_id,
    'expected_version', p_expected_version,
    'actor_employee_id', p_actor_employee_id,
    'proxy_reason', p_proxy_reason
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        p_idempotency_key,
      0
    )
  );

  SELECT event.*
  INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_price_list'
      OR v_event.resource_id <> p_price_list_id
      OR v_event.command <>
        'delete_supplier_price_list_item:' || p_item_id::text
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'status', 'deleted',
      'idempotent', true,
      'price_list', v_event.to_state -> 'price_list',
      'version', v_event.result_version
    );
  END IF;

  PERFORM public.assert_supplier_proxy_scope(
    p_tenant_id,
    p_supplier_id,
    p_actor_employee_id
  );

  SELECT price_list.*
  INTO v_price_list
  FROM public.supplier_price_lists AS price_list
  WHERE price_list.id = p_price_list_id
    AND price_list.supplier_id = p_supplier_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PRICE_LIST_NOT_FOUND'
    );
  END IF;

  IF v_price_list.row_version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_PRICE_LIST_VERSION_CONFLICT',
      'version', v_price_list.row_version,
      'current_status', v_price_list.lifecycle_status
    );
  END IF;

  IF v_price_list.lifecycle_status <> 'draft' THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION'
    );
  END IF;

  SELECT item.*
  INTO v_item
  FROM public.supplier_price_list_items AS item
  WHERE item.id = p_item_id
    AND item.supplier_price_list_id = p_price_list_id
    AND item.supplier_id = p_supplier_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PRICE_ITEM_NOT_FOUND'
    );
  END IF;

  v_before_list := to_jsonb(v_price_list);

  DELETE FROM public.supplier_price_list_items AS item
  WHERE item.id = p_item_id;

  UPDATE public.supplier_price_lists AS price_list
  SET
    row_version = price_list.row_version + 1,
    acting_tenant_id = p_tenant_id,
    acting_employee_id = p_actor_employee_id,
    operation_source = 'tenant_proxy',
    proxy_reason = btrim(p_proxy_reason),
    updated_by_employee_id = p_actor_employee_id,
    updated_at = now()
  WHERE price_list.id = p_price_list_id
  RETURNING * INTO v_price_list;

  INSERT INTO public.supplier_command_events (
    tenant_id,
    resource_type,
    resource_id,
    command,
    from_state,
    to_state,
    reason,
    actor_user_id,
    actor_employee_id,
    idempotency_key,
    result_version
  )
  VALUES (
    p_tenant_id,
    'supplier_price_list',
    p_price_list_id,
    'delete_supplier_price_list_item:' || p_item_id::text,
    jsonb_build_object(
      '_request', v_request,
      'price_list', v_before_list,
      'item', to_jsonb(v_item)
    ),
    jsonb_build_object('price_list', to_jsonb(v_price_list)),
    btrim(p_proxy_reason),
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_price_list.row_version
  );

  RETURN jsonb_build_object(
    'status', 'deleted',
    'idempotent', false,
    'price_list', to_jsonb(v_price_list),
    'version', v_price_list.row_version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_supplier_price_list_item(
  uuid, uuid, uuid, uuid, uuid, numeric, numeric, boolean, integer, uuid,
  uuid, text, text
)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_supplier_price_list_item(
  uuid, uuid, uuid, uuid, uuid, numeric, numeric, boolean, integer, uuid,
  uuid, text, text
)
TO service_role;

REVOKE ALL ON FUNCTION public.delete_supplier_price_list_item(
  uuid, uuid, uuid, uuid, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_supplier_price_list_item(
  uuid, uuid, uuid, uuid, integer, uuid, uuid, text, text
)
TO service_role;

REVOKE ALL ON FUNCTION public.create_supplier_product(
  uuid, uuid, uuid, text, text, uuid, uuid, text, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_supplier_product(
  uuid, uuid, uuid, text, text, uuid, uuid, text, uuid, uuid, text, text
)
TO service_role;

REVOKE ALL ON FUNCTION public.create_supplier_sku(
  uuid, uuid, uuid, uuid, text, text, text, text, uuid, boolean, boolean,
  boolean, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_supplier_sku(
  uuid, uuid, uuid, uuid, text, text, text, text, uuid, boolean, boolean,
  boolean, uuid, uuid, text, text
)
TO service_role;

REVOKE ALL ON FUNCTION public.mutate_supplier_product(
  uuid, uuid, uuid, text, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_supplier_product(
  uuid, uuid, uuid, text, integer, uuid, uuid, text, text
)
TO service_role;

REVOKE ALL ON FUNCTION public.mutate_supplier_sku(
  uuid, uuid, uuid, text, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_supplier_sku(
  uuid, uuid, uuid, text, integer, uuid, uuid, text, text
)
TO service_role;

REVOKE ALL ON FUNCTION public.create_supplier_price_list(
  uuid, uuid, uuid, text, text, text, timestamptz, timestamptz, uuid,
  uuid, text, text
)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_supplier_price_list(
  uuid, uuid, uuid, text, text, text, timestamptz, timestamptz, uuid,
  uuid, text, text
)
TO service_role;

REVOKE ALL ON FUNCTION public.publish_supplier_price_list(
  uuid, uuid, uuid, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_supplier_price_list(
  uuid, uuid, uuid, integer, uuid, uuid, text, text
)
TO service_role;

REVOKE ALL ON FUNCTION public.create_supplier_price_list_version(
  uuid, uuid, uuid, uuid, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_supplier_price_list_version(
  uuid, uuid, uuid, uuid, integer, uuid, uuid, text, text
)
TO service_role;

REVOKE ALL ON FUNCTION public.retire_supplier_price_list(
  uuid, uuid, uuid, integer, uuid, uuid, text, text
)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retire_supplier_price_list(
  uuid, uuid, uuid, integer, uuid, uuid, text, text
)
TO service_role;

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
