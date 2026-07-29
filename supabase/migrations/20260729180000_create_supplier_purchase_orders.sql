-- Rollback: use a forward migration to hide the Admin entry point and revoke
-- purchase-order permissions first. Preserve every submitted order, item
-- snapshot, and command event for audit. Only when no order has ever been
-- submitted and no downstream record references these facts may a later
-- forward migration export the data and drop functions, items, orders, and
-- the number sequence in dependency order.

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
    'supplier_price_list',
    'supplier_purchase_order'
  )
);

CREATE SEQUENCE public.supplier_purchase_order_number_seq
AS bigint
START WITH 1
INCREMENT BY 1
NO MINVALUE
NO MAXVALUE
CACHE 1;

CREATE TABLE public.supplier_purchase_orders (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL
    REFERENCES public.projects(id) ON DELETE RESTRICT,
  tenant_supplier_id uuid NOT NULL,
  supplier_id uuid NOT NULL
    REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  order_no text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft',
  currency char(3) NOT NULL DEFAULT 'CNY',
  expected_delivery_date date NULL,
  remark text NULL,
  priced_at timestamptz NOT NULL,
  subtotal_amount numeric(18, 2) NOT NULL DEFAULT 0,
  tax_amount numeric(18, 2) NOT NULL DEFAULT 0,
  total_amount numeric(18, 2) NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  created_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  updated_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  submitted_by_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  submitted_at timestamptz NULL,
  cancelled_by_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  cancelled_at timestamptz NULL,
  cancel_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_purchase_orders_relationship_tenant_fkey
    FOREIGN KEY (tenant_supplier_id, tenant_id)
    REFERENCES public.tenant_suppliers(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_orders_status_check
    CHECK (status IN ('draft', 'submitted', 'cancelled')),
  CONSTRAINT supplier_purchase_orders_currency_check
    CHECK (currency = 'CNY'),
  CONSTRAINT supplier_purchase_orders_order_no_check
    CHECK (order_no = btrim(order_no) AND order_no <> ''),
  CONSTRAINT supplier_purchase_orders_remark_check
    CHECK (remark IS NULL OR (remark = btrim(remark) AND remark <> '')),
  CONSTRAINT supplier_purchase_orders_amount_check CHECK (
    subtotal_amount >= 0
    AND tax_amount >= 0
    AND total_amount >= 0
    AND total_amount = subtotal_amount + tax_amount
  ),
  CONSTRAINT supplier_purchase_orders_version_check CHECK (version > 0),
  CONSTRAINT supplier_purchase_orders_cancel_reason_check CHECK (
    cancel_reason IS NULL
    OR (cancel_reason = btrim(cancel_reason) AND cancel_reason <> '')
  ),
  CONSTRAINT supplier_purchase_orders_state_metadata_check CHECK (
    (
      status = 'draft'
      AND submitted_by_employee_id IS NULL
      AND submitted_at IS NULL
      AND cancelled_by_employee_id IS NULL
      AND cancelled_at IS NULL
      AND cancel_reason IS NULL
    )
    OR (
      status = 'submitted'
      AND submitted_by_employee_id IS NOT NULL
      AND submitted_at IS NOT NULL
      AND cancelled_by_employee_id IS NULL
      AND cancelled_at IS NULL
      AND cancel_reason IS NULL
    )
    OR (
      status = 'cancelled'
      AND cancelled_by_employee_id IS NOT NULL
      AND cancelled_at IS NOT NULL
      AND cancel_reason IS NOT NULL
    )
  ),
  CONSTRAINT supplier_purchase_orders_id_tenant_key
    UNIQUE (id, tenant_id),
  CONSTRAINT supplier_purchase_orders_id_tenant_supplier_key
    UNIQUE (id, tenant_id, supplier_id)
);

CREATE TABLE public.supplier_purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  supplier_id uuid NOT NULL
    REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  supplier_purchase_order_id uuid NOT NULL,
  line_no integer NOT NULL,
  supplier_product_id uuid NOT NULL,
  supplier_sku_id uuid NOT NULL,
  supplier_price_list_id uuid NOT NULL,
  supplier_price_list_item_id uuid NOT NULL
    REFERENCES public.supplier_price_list_items(id) ON DELETE RESTRICT,
  product_code_snapshot text NOT NULL,
  product_name_snapshot text NOT NULL,
  sku_code_snapshot text NOT NULL,
  sku_name_snapshot text NOT NULL,
  specification_snapshot text NULL,
  model_snapshot text NULL,
  purchase_unit_id uuid NOT NULL,
  purchase_unit_code_snapshot text NOT NULL,
  purchase_unit_name_snapshot text NOT NULL,
  purchase_unit_symbol_snapshot text NOT NULL,
  base_unit_id uuid NOT NULL,
  base_unit_code_snapshot text NOT NULL,
  base_unit_name_snapshot text NOT NULL,
  base_unit_symbol_snapshot text NOT NULL,
  base_unit_conversion numeric(18, 8) NOT NULL,
  price_list_code_snapshot text NOT NULL,
  price_list_version_snapshot integer NOT NULL,
  price_effective_from_snapshot timestamptz NOT NULL,
  price_effective_until_snapshot timestamptz NULL,
  quantity numeric(18, 4) NOT NULL,
  unit_price numeric(14, 2) NOT NULL,
  tax_rate numeric(7, 6) NOT NULL,
  tax_inclusive boolean NOT NULL,
  subtotal_amount numeric(18, 2) NOT NULL,
  tax_amount numeric(18, 2) NOT NULL,
  total_amount numeric(18, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_purchase_order_items_order_tenant_fkey
    FOREIGN KEY (supplier_purchase_order_id, tenant_id)
    REFERENCES public.supplier_purchase_orders(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_order_items_order_supplier_fkey
    FOREIGN KEY (supplier_purchase_order_id, tenant_id, supplier_id)
    REFERENCES public.supplier_purchase_orders(id, tenant_id, supplier_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_order_items_product_supplier_fkey
    FOREIGN KEY (supplier_product_id, supplier_id)
    REFERENCES public.supplier_products(id, supplier_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_order_items_sku_supplier_fkey
    FOREIGN KEY (supplier_sku_id, supplier_id)
    REFERENCES public.supplier_skus(id, supplier_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_order_items_price_list_supplier_fkey
    FOREIGN KEY (supplier_price_list_id, supplier_id)
    REFERENCES public.supplier_price_lists(id, supplier_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_order_items_line_no_check
    CHECK (line_no BETWEEN 1 AND 100),
  CONSTRAINT supplier_purchase_order_items_quantity_check
    CHECK (quantity > 0),
  CONSTRAINT supplier_purchase_order_items_conversion_check
    CHECK (base_unit_conversion > 0),
  CONSTRAINT supplier_purchase_order_items_price_check
    CHECK (unit_price >= 0),
  CONSTRAINT supplier_purchase_order_items_tax_rate_check
    CHECK (tax_rate BETWEEN 0 AND 1),
  CONSTRAINT supplier_purchase_order_items_amount_check CHECK (
    subtotal_amount >= 0
    AND tax_amount >= 0
    AND total_amount >= 0
    AND total_amount = subtotal_amount + tax_amount
  ),
  CONSTRAINT supplier_purchase_order_items_order_line_key
    UNIQUE (supplier_purchase_order_id, line_no),
  CONSTRAINT supplier_purchase_order_items_order_sku_key
    UNIQUE (supplier_purchase_order_id, supplier_sku_id)
);

CREATE INDEX supplier_purchase_orders_tenant_status_updated_idx
ON public.supplier_purchase_orders(
  tenant_id,
  status,
  updated_at DESC,
  id DESC
);

CREATE INDEX supplier_purchase_orders_tenant_project_updated_idx
ON public.supplier_purchase_orders(
  tenant_id,
  project_id,
  updated_at DESC,
  id DESC
);

CREATE INDEX supplier_purchase_orders_tenant_relationship_updated_idx
ON public.supplier_purchase_orders(
  tenant_id,
  tenant_supplier_id,
  updated_at DESC,
  id DESC
);

CREATE INDEX supplier_purchase_order_items_order_line_idx
ON public.supplier_purchase_order_items(
  supplier_purchase_order_id,
  line_no,
  id
);

CREATE INDEX supplier_price_items_supplier_sku_order_idx
ON public.supplier_price_list_items(
  supplier_id,
  supplier_sku_id,
  supplier_price_list_id
);

CREATE FUNCTION public.supplier_purchase_order_snapshot(
  p_order public.supplier_purchase_orders
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT to_jsonb(p_order) || jsonb_build_object(
    'subtotal_amount', p_order.subtotal_amount::text,
    'tax_amount', p_order.tax_amount::text,
    'total_amount', p_order.total_amount::text
  );
$$;

REVOKE ALL ON FUNCTION public.supplier_purchase_order_snapshot(
  public.supplier_purchase_orders
)
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.validate_supplier_purchase_order_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM project.id
  FROM public.projects AS project
  WHERE project.id = NEW.project_id
    AND project.tenant_id = NEW.tenant_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_ORDER_PROJECT_INVALID';
  END IF;

  PERFORM relationship.id
  FROM public.tenant_suppliers AS relationship
  WHERE relationship.id = NEW.tenant_supplier_id
    AND relationship.tenant_id = NEW.tenant_id
    AND relationship.supplier_id = NEW.supplier_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_ORDER_NOT_ELIGIBLE';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_supplier_purchase_order_scope()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER supplier_purchase_orders_validate_scope
BEFORE INSERT OR UPDATE OF tenant_id, project_id, tenant_supplier_id, supplier_id
ON public.supplier_purchase_orders
FOR EACH ROW
EXECUTE FUNCTION public.validate_supplier_purchase_order_scope();

CREATE FUNCTION public.prevent_submitted_supplier_purchase_order_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT';
  END IF;

  IF OLD.status = 'submitted' AND (
    NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.tenant_supplier_id IS DISTINCT FROM OLD.tenant_supplier_id
    OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
    OR NEW.order_no IS DISTINCT FROM OLD.order_no
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.expected_delivery_date IS DISTINCT FROM OLD.expected_delivery_date
    OR NEW.remark IS DISTINCT FROM OLD.remark
    OR NEW.priced_at IS DISTINCT FROM OLD.priced_at
    OR NEW.subtotal_amount IS DISTINCT FROM OLD.subtotal_amount
    OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
    OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_submitted_supplier_purchase_order_mutation()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER supplier_purchase_orders_prevent_submitted_mutation
BEFORE UPDATE ON public.supplier_purchase_orders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_submitted_supplier_purchase_order_mutation();

CREATE FUNCTION public.prevent_supplier_purchase_order_item_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order_status text;
BEGIN
  SELECT purchase_order.status
  INTO v_order_status
  FROM public.supplier_purchase_orders AS purchase_order
  WHERE purchase_order.id = COALESCE(
    NEW.supplier_purchase_order_id,
    OLD.supplier_purchase_order_id
  )
  FOR SHARE;

  IF NOT FOUND OR v_order_status <> 'draft' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_supplier_purchase_order_item_mutation()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER supplier_purchase_order_items_require_draft
BEFORE INSERT OR UPDATE OR DELETE
ON public.supplier_purchase_order_items
FOR EACH ROW
EXECUTE FUNCTION public.prevent_supplier_purchase_order_item_mutation();

CREATE FUNCTION public.assert_supplier_purchase_order_actor(
  p_tenant_id uuid,
  p_actor_user_id uuid,
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
    AND employee.user_id = p_actor_user_id
    AND employee.status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PROXY_ACTOR_INVALID';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_supplier_purchase_order_actor(
  uuid,
  uuid,
  uuid
)
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.resolve_supplier_purchase_order_catalog(
  p_tenant_id uuid,
  p_tenant_supplier_id uuid,
  p_priced_at timestamptz,
  p_keyword text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_supplier_id uuid;
  v_eligibility record;
  v_page integer := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size integer :=
    LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100);
  v_items jsonb;
  v_total bigint;
BEGIN
  IF p_tenant_id IS NULL
    OR p_tenant_supplier_id IS NULL
    OR p_priced_at IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_ORDER_NOT_ELIGIBLE';
  END IF;

  SELECT eligibility.*
  INTO v_eligibility
  FROM public.get_tenant_supplier_order_eligibility_set(
    p_tenant_id,
    p_priced_at,
    p_tenant_supplier_id
  ) AS eligibility;

  IF NOT FOUND OR NOT v_eligibility.eligible THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_ORDER_NOT_ELIGIBLE',
      DETAIL = COALESCE(
        array_to_string(v_eligibility.blocking_reasons, ','),
        'tenant_supplier_not_found'
      );
  END IF;
  v_supplier_id := v_eligibility.supplier_id;

  PERFORM relationship.id
  FROM public.tenant_suppliers AS relationship
  WHERE relationship.id = p_tenant_supplier_id
    AND relationship.tenant_id = p_tenant_id
    AND relationship.supplier_id = v_supplier_id
    AND relationship.default_currency = 'CNY';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_ORDER_NOT_ELIGIBLE';
  END IF;

  WITH eligible_prices AS MATERIALIZED (
    SELECT
      product.id AS supplier_product_id,
      product.product_code,
      product.name AS product_name,
      sku.id AS supplier_sku_id,
      sku.sku_code,
      sku.name AS sku_name,
      sku.specification,
      sku.model,
      price_list.id AS supplier_price_list_id,
      price_list.price_list_code,
      price_list.version_number AS price_list_version,
      price_list.effective_from,
      price_list.effective_until,
      price_item.id AS supplier_price_list_item_id,
      price_item.purchase_unit_id,
      purchase_unit.code AS purchase_unit_code,
      purchase_unit.name AS purchase_unit_name,
      purchase_unit.symbol AS purchase_unit_symbol,
      price_item.base_unit_id,
      base_unit.code AS base_unit_code,
      base_unit.name AS base_unit_name,
      base_unit.symbol AS base_unit_symbol,
      price_item.base_unit_conversion::text AS base_unit_conversion,
      price_item.unit_price::text AS unit_price,
      price_item.tax_rate::text AS tax_rate,
      price_item.tax_inclusive
    FROM public.supplier_price_list_items AS price_item
    JOIN public.supplier_price_lists AS price_list
      ON price_list.id = price_item.supplier_price_list_id
      AND price_list.supplier_id = price_item.supplier_id
    JOIN public.supplier_skus AS sku
      ON sku.id = price_item.supplier_sku_id
      AND sku.supplier_id = price_item.supplier_id
    JOIN public.supplier_products AS product
      ON product.id = sku.supplier_product_id
      AND product.supplier_id = sku.supplier_id
    JOIN public.catalog_units AS purchase_unit
      ON purchase_unit.id = price_item.purchase_unit_id
    JOIN public.catalog_units AS base_unit
      ON base_unit.id = price_item.base_unit_id
    WHERE price_item.supplier_id = v_supplier_id
      AND price_list.lifecycle_status = 'published'
      AND price_list.scope_type = 'default'
      AND price_list.currency = 'CNY'
      AND price_list.effective_from <= p_priced_at
      AND (
        price_list.effective_until IS NULL
        OR price_list.effective_until > p_priced_at
      )
      AND product.status = 'active'
      AND sku.status = 'active'
      AND (
        NULLIF(btrim(p_keyword), '') IS NULL
        OR product.product_code ILIKE '%' || btrim(p_keyword) || '%'
        OR product.name ILIKE '%' || btrim(p_keyword) || '%'
        OR sku.sku_code ILIKE '%' || btrim(p_keyword) || '%'
        OR sku.name ILIKE '%' || btrim(p_keyword) || '%'
      )
  ),
  page_rows AS MATERIALIZED (
    SELECT eligible_prices.*
    FROM eligible_prices
    ORDER BY
      product_name ASC,
      sku_name ASC,
      supplier_sku_id ASC
    LIMIT v_page_size
    OFFSET (v_page - 1) * v_page_size
  )
  SELECT
    (SELECT count(*) FROM eligible_prices),
    COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(page_rows) ORDER BY
          page_rows.product_name,
          page_rows.sku_name,
          page_rows.supplier_sku_id
        )
        FROM page_rows
      ),
      '[]'::jsonb
    )
  INTO v_total, v_items;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'page', v_page,
    'page_size', v_page_size
  );
END;
$$;

CREATE FUNCTION public.save_supplier_purchase_order_draft(
  p_order_id uuid,
  p_tenant_id uuid,
  p_project_id uuid,
  p_tenant_supplier_id uuid,
  p_expected_version integer,
  p_expected_delivery_date date,
  p_remark text,
  p_items jsonb,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_order public.supplier_purchase_orders%ROWTYPE;
  v_before jsonb := '{}'::jsonb;
  v_request jsonb;
  v_eligibility record;
  v_supplier_id uuid;
  v_priced_at timestamptz;
  v_resolved_items jsonb;
  v_requested_count integer;
  v_resolved_count integer;
  v_duplicate_count integer;
  v_invalid_count integer;
  v_subtotal_amount numeric(18, 2);
  v_tax_amount numeric(18, 2);
  v_total_amount numeric(18, 2);
BEGIN
  IF p_order_id IS NULL
    OR p_tenant_id IS NULL
    OR p_project_id IS NULL
    OR p_tenant_supplier_id IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version < 0
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
    OR p_items IS NULL
    OR jsonb_typeof(p_items) <> 'array'
    OR NOT jsonb_array_length(p_items) BETWEEN 1 AND 100
    OR (p_remark IS NOT NULL AND btrim(p_remark) = '')
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_VALIDATION_ERROR'
    );
  END IF;

  PERFORM public.assert_supplier_purchase_order_actor(
    p_tenant_id,
    p_actor_user_id,
    p_actor_employee_id
  );

  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'project_id', p_project_id,
    'tenant_supplier_id', p_tenant_supplier_id,
    'expected_version', p_expected_version,
    'expected_delivery_date', p_expected_delivery_date,
    'remark', CASE
      WHEN p_remark IS NULL THEN NULL
      ELSE btrim(p_remark)
    END,
    'items', p_items,
    'actor_employee_id', p_actor_employee_id
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
      OR v_event.resource_type <> 'supplier_purchase_order'
      OR v_event.resource_id <> p_order_id
      OR v_event.command <> 'save_supplier_purchase_order_draft'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'status', 'saved',
      'idempotent', true,
      'purchase_order', v_event.to_state,
      'version', v_event.result_version
    );
  END IF;

  PERFORM project.id
  FROM public.projects AS project
  WHERE project.id = p_project_id
    AND project.tenant_id = p_tenant_id
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'project_invalid',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_PROJECT_INVALID'
    );
  END IF;

  v_priced_at := clock_timestamp();

  SELECT relationship.supplier_id
  INTO v_supplier_id
  FROM public.tenant_suppliers AS relationship
  JOIN public.suppliers AS supplier
    ON supplier.id = relationship.supplier_id
  WHERE relationship.id = p_tenant_supplier_id
    AND relationship.tenant_id = p_tenant_id
    AND relationship.default_currency = 'CNY'
  FOR SHARE OF relationship, supplier;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'supplier_not_eligible',
      'error_code', 'SUPPLIER_ORDER_NOT_ELIGIBLE'
    );
  END IF;

  SELECT eligibility.*
  INTO v_eligibility
  FROM public.get_tenant_supplier_order_eligibility_set(
    p_tenant_id,
    v_priced_at,
    p_tenant_supplier_id
  ) AS eligibility;
  IF NOT FOUND
    OR NOT v_eligibility.eligible
    OR v_eligibility.supplier_id <> v_supplier_id
  THEN
    RETURN jsonb_build_object(
      'status', 'supplier_not_eligible',
      'error_code', 'SUPPLIER_ORDER_NOT_ELIGIBLE',
      'blocking_reasons', COALESCE(
        to_jsonb(v_eligibility.blocking_reasons),
        '["tenant_supplier_not_found"]'::jsonb
      )
    );
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-price-publish:' || v_supplier_id::text,
      6720240729160000
    )
  );

  BEGIN
    WITH requested_items AS MATERIALIZED (
      SELECT
        (entry.value ->> 'supplier_sku_id')::uuid AS supplier_sku_id,
        (entry.value ->> 'quantity')::numeric AS quantity,
        entry.ordinality
      FROM jsonb_array_elements(p_items)
        WITH ORDINALITY AS entry(value, ordinality)
    )
    SELECT
      COUNT(*),
      CASE
        WHEN COUNT(*) <> COUNT(DISTINCT supplier_sku_id) THEN 1
        ELSE 0
      END,
      COUNT(*) FILTER (
        WHERE supplier_sku_id IS NULL
          OR quantity IS NULL
          OR quantity <= 0
          OR quantity > 99999999999999.9999
          OR scale(quantity) > 4
      )
    INTO v_requested_count, v_duplicate_count, v_invalid_count
    FROM requested_items;
  EXCEPTION
    WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RETURN jsonb_build_object(
        'status', 'validation_error',
        'error_code', 'SUPPLIER_PURCHASE_ORDER_VALIDATION_ERROR'
      );
  END;

  IF v_requested_count <> jsonb_array_length(p_items)
    OR v_duplicate_count > 0
    OR v_invalid_count > 0
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_DUPLICATE_SKU'
    );
  END IF;

  WITH requested_items AS MATERIALIZED (
    SELECT
      (entry.value ->> 'supplier_sku_id')::uuid AS supplier_sku_id,
      (entry.value ->> 'quantity')::numeric(18, 4) AS quantity,
      entry.ordinality
    FROM jsonb_array_elements(p_items)
      WITH ORDINALITY AS entry(value, ordinality)
  ),
  price_candidates AS MATERIALIZED (
    SELECT
      requested.supplier_sku_id,
      requested.quantity,
      requested.ordinality,
      product.id AS supplier_product_id,
      product.product_code,
      product.name AS product_name,
      sku.sku_code,
      sku.name AS sku_name,
      sku.specification,
      sku.model,
      price_list.id AS supplier_price_list_id,
      price_list.price_list_code,
      price_list.version_number AS price_list_version,
      price_list.effective_from,
      price_list.effective_until,
      price_item.id AS supplier_price_list_item_id,
      price_item.purchase_unit_id,
      purchase_unit.code AS purchase_unit_code,
      purchase_unit.name AS purchase_unit_name,
      purchase_unit.symbol AS purchase_unit_symbol,
      price_item.base_unit_id,
      base_unit.code AS base_unit_code,
      base_unit.name AS base_unit_name,
      base_unit.symbol AS base_unit_symbol,
      price_item.base_unit_conversion,
      price_item.unit_price,
      price_item.tax_rate,
      price_item.tax_inclusive
    FROM public.supplier_price_list_items AS price_item
    JOIN requested_items AS requested
      ON requested.supplier_sku_id = price_item.supplier_sku_id
    JOIN public.supplier_price_lists AS price_list
      ON price_list.id = price_item.supplier_price_list_id
      AND price_list.supplier_id = price_item.supplier_id
    JOIN public.supplier_skus AS sku
      ON sku.id = price_item.supplier_sku_id
      AND sku.supplier_id = price_item.supplier_id
    JOIN public.supplier_products AS product
      ON product.id = sku.supplier_product_id
      AND product.supplier_id = sku.supplier_id
    JOIN public.catalog_units AS purchase_unit
      ON purchase_unit.id = price_item.purchase_unit_id
    JOIN public.catalog_units AS base_unit
      ON base_unit.id = price_item.base_unit_id
    WHERE price_item.supplier_id = v_supplier_id
      AND price_list.lifecycle_status = 'published'
      AND price_list.scope_type = 'default'
      AND price_list.currency = 'CNY'
      AND price_list.effective_from <= v_priced_at
      AND (
        price_list.effective_until IS NULL
        OR price_list.effective_until > v_priced_at
      )
      AND product.status = 'active'
      AND sku.status = 'active'
      AND requested.quantity > 0
  ),
  resolved_items AS MATERIALIZED (
    SELECT
      candidate.*,
      row_number() OVER (
        ORDER BY candidate.ordinality
      )::integer AS line_no,
      CASE
        WHEN candidate.tax_inclusive THEN
          round(
            round(candidate.quantity * candidate.unit_price, 2) /
              (1 + candidate.tax_rate),
            2
          )
        ELSE round(candidate.quantity * candidate.unit_price, 2)
      END::numeric(18, 2) AS subtotal_amount,
      CASE
        WHEN candidate.tax_inclusive THEN
          (
            round(candidate.quantity * candidate.unit_price, 2) -
            round(
              round(candidate.quantity * candidate.unit_price, 2) /
                (1 + candidate.tax_rate),
              2
            )
          )
        ELSE
          round(
            round(candidate.quantity * candidate.unit_price, 2) *
              candidate.tax_rate,
            2
          )
      END::numeric(18, 2) AS tax_amount,
      CASE
        WHEN candidate.tax_inclusive THEN
          round(candidate.quantity * candidate.unit_price, 2)
        ELSE
          (
            round(candidate.quantity * candidate.unit_price, 2) +
            round(
              round(candidate.quantity * candidate.unit_price, 2) *
                candidate.tax_rate,
              2
            )
          )
      END::numeric(18, 2) AS total_amount
    FROM price_candidates AS candidate
  )
  SELECT
    COUNT(*),
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'line_no', resolved.line_no,
          'supplier_product_id', resolved.supplier_product_id,
          'supplier_sku_id', resolved.supplier_sku_id,
          'supplier_price_list_id', resolved.supplier_price_list_id,
          'supplier_price_list_item_id',
            resolved.supplier_price_list_item_id,
          'product_code_snapshot', resolved.product_code,
          'product_name_snapshot', resolved.product_name,
          'sku_code_snapshot', resolved.sku_code,
          'sku_name_snapshot', resolved.sku_name,
          'specification_snapshot', resolved.specification,
          'model_snapshot', resolved.model,
          'purchase_unit_id', resolved.purchase_unit_id,
          'purchase_unit_code_snapshot', resolved.purchase_unit_code,
          'purchase_unit_name_snapshot', resolved.purchase_unit_name,
          'purchase_unit_symbol_snapshot', resolved.purchase_unit_symbol,
          'base_unit_id', resolved.base_unit_id,
          'base_unit_code_snapshot', resolved.base_unit_code,
          'base_unit_name_snapshot', resolved.base_unit_name,
          'base_unit_symbol_snapshot', resolved.base_unit_symbol,
          'base_unit_conversion', resolved.base_unit_conversion,
          'price_list_code_snapshot', resolved.price_list_code,
          'price_list_version_snapshot', resolved.price_list_version,
          'price_effective_from_snapshot', resolved.effective_from,
          'price_effective_until_snapshot', resolved.effective_until,
          'quantity', resolved.quantity,
          'unit_price', resolved.unit_price,
          'tax_rate', resolved.tax_rate,
          'tax_inclusive', resolved.tax_inclusive,
          'subtotal_amount', resolved.subtotal_amount,
          'tax_amount', resolved.tax_amount,
          'total_amount', resolved.total_amount
        )
        ORDER BY resolved.line_no
      ),
      '[]'::jsonb
    ),
    COALESCE(SUM(resolved.subtotal_amount), 0),
    COALESCE(SUM(resolved.tax_amount), 0),
    COALESCE(SUM(resolved.total_amount), 0)
  INTO
    v_resolved_count,
    v_resolved_items,
    v_subtotal_amount,
    v_tax_amount,
    v_total_amount
  FROM resolved_items AS resolved;

  IF v_resolved_count <> v_requested_count THEN
    RETURN jsonb_build_object(
      'status', 'price_missing',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_PRICE_MISSING'
    );
  END IF;

  SELECT purchase_order.*
  INTO v_order
  FROM public.supplier_purchase_orders AS purchase_order
  WHERE purchase_order.id = p_order_id
  FOR UPDATE;

  IF p_expected_version = 0 THEN
    IF FOUND THEN
      RETURN jsonb_build_object(
        'status', 'version_conflict',
        'error_code', 'SUPPLIER_PURCHASE_ORDER_VERSION_CONFLICT',
        'version', v_order.version
      );
    END IF;

    INSERT INTO public.supplier_purchase_orders (
      id,
      tenant_id,
      project_id,
      tenant_supplier_id,
      supplier_id,
      order_no,
      status,
      currency,
      expected_delivery_date,
      remark,
      priced_at,
      subtotal_amount,
      tax_amount,
      total_amount,
      version,
      created_by_employee_id,
      updated_by_employee_id
    )
    VALUES (
      p_order_id,
      p_tenant_id,
      p_project_id,
      p_tenant_supplier_id,
      v_supplier_id,
      'PO-' || to_char(v_priced_at, 'YYYYMMDD') || '-' ||
        lpad(
          nextval('public.supplier_purchase_order_number_seq')::text,
          8,
          '0'
        ),
      'draft',
      'CNY',
      p_expected_delivery_date,
      CASE WHEN p_remark IS NULL THEN NULL ELSE btrim(p_remark) END,
      v_priced_at,
      v_subtotal_amount,
      v_tax_amount,
      v_total_amount,
      1,
      p_actor_employee_id,
      p_actor_employee_id
    )
    RETURNING * INTO v_order;
  ELSE
    IF NOT FOUND OR v_order.tenant_id <> p_tenant_id THEN
      RETURN jsonb_build_object(
        'status', 'not_found',
        'error_code', 'SUPPLIER_PURCHASE_ORDER_NOT_FOUND'
      );
    END IF;
    IF v_order.status <> 'draft'
      OR v_order.project_id <> p_project_id
      OR v_order.tenant_supplier_id <> p_tenant_supplier_id
      OR v_order.supplier_id <> v_supplier_id
    THEN
      RETURN jsonb_build_object(
        'status', 'state_conflict',
        'error_code', 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT'
      );
    END IF;
    IF v_order.version <> p_expected_version THEN
      RETURN jsonb_build_object(
        'status', 'version_conflict',
        'error_code', 'SUPPLIER_PURCHASE_ORDER_VERSION_CONFLICT',
        'version', v_order.version
      );
    END IF;
    v_before := public.supplier_purchase_order_snapshot(v_order);
  END IF;

  DELETE FROM public.supplier_purchase_order_items AS item
  WHERE item.supplier_purchase_order_id = p_order_id;

  INSERT INTO public.supplier_purchase_order_items (
    tenant_id,
    supplier_id,
    supplier_purchase_order_id,
    line_no,
    supplier_product_id,
    supplier_sku_id,
    supplier_price_list_id,
    supplier_price_list_item_id,
    product_code_snapshot,
    product_name_snapshot,
    sku_code_snapshot,
    sku_name_snapshot,
    specification_snapshot,
    model_snapshot,
    purchase_unit_id,
    purchase_unit_code_snapshot,
    purchase_unit_name_snapshot,
    purchase_unit_symbol_snapshot,
    base_unit_id,
    base_unit_code_snapshot,
    base_unit_name_snapshot,
    base_unit_symbol_snapshot,
    base_unit_conversion,
    price_list_code_snapshot,
    price_list_version_snapshot,
    price_effective_from_snapshot,
    price_effective_until_snapshot,
    quantity,
    unit_price,
    tax_rate,
    tax_inclusive,
    subtotal_amount,
    tax_amount,
    total_amount
  )
  SELECT
    p_tenant_id,
    v_supplier_id,
    p_order_id,
    resolved.line_no,
    resolved.supplier_product_id,
    resolved.supplier_sku_id,
    resolved.supplier_price_list_id,
    resolved.supplier_price_list_item_id,
    resolved.product_code_snapshot,
    resolved.product_name_snapshot,
    resolved.sku_code_snapshot,
    resolved.sku_name_snapshot,
    resolved.specification_snapshot,
    resolved.model_snapshot,
    resolved.purchase_unit_id,
    resolved.purchase_unit_code_snapshot,
    resolved.purchase_unit_name_snapshot,
    resolved.purchase_unit_symbol_snapshot,
    resolved.base_unit_id,
    resolved.base_unit_code_snapshot,
    resolved.base_unit_name_snapshot,
    resolved.base_unit_symbol_snapshot,
    resolved.base_unit_conversion,
    resolved.price_list_code_snapshot,
    resolved.price_list_version_snapshot,
    resolved.price_effective_from_snapshot,
    resolved.price_effective_until_snapshot,
    resolved.quantity,
    resolved.unit_price,
    resolved.tax_rate,
    resolved.tax_inclusive,
    resolved.subtotal_amount,
    resolved.tax_amount,
    resolved.total_amount
  FROM jsonb_to_recordset(v_resolved_items) AS resolved(
    line_no integer,
    supplier_product_id uuid,
    supplier_sku_id uuid,
    supplier_price_list_id uuid,
    supplier_price_list_item_id uuid,
    product_code_snapshot text,
    product_name_snapshot text,
    sku_code_snapshot text,
    sku_name_snapshot text,
    specification_snapshot text,
    model_snapshot text,
    purchase_unit_id uuid,
    purchase_unit_code_snapshot text,
    purchase_unit_name_snapshot text,
    purchase_unit_symbol_snapshot text,
    base_unit_id uuid,
    base_unit_code_snapshot text,
    base_unit_name_snapshot text,
    base_unit_symbol_snapshot text,
    base_unit_conversion numeric(18, 8),
    price_list_code_snapshot text,
    price_list_version_snapshot integer,
    price_effective_from_snapshot timestamptz,
    price_effective_until_snapshot timestamptz,
    quantity numeric(18, 4),
    unit_price numeric(14, 2),
    tax_rate numeric(7, 6),
    tax_inclusive boolean,
    subtotal_amount numeric(18, 2),
    tax_amount numeric(18, 2),
    total_amount numeric(18, 2)
  );

  IF p_expected_version > 0 THEN
    UPDATE public.supplier_purchase_orders AS purchase_order
    SET expected_delivery_date = p_expected_delivery_date,
        remark = CASE
          WHEN p_remark IS NULL THEN NULL
          ELSE btrim(p_remark)
        END,
        priced_at = v_priced_at,
        subtotal_amount = v_subtotal_amount,
        tax_amount = v_tax_amount,
        total_amount = v_total_amount,
        version = version + 1,
        updated_by_employee_id = p_actor_employee_id,
        updated_at = now()
    WHERE purchase_order.id = p_order_id
    RETURNING * INTO v_order;
  END IF;

  INSERT INTO public.supplier_command_events (
    tenant_id,
    resource_type,
    resource_id,
    command,
    from_state,
    to_state,
    actor_user_id,
    actor_employee_id,
    idempotency_key,
    result_version
  )
  VALUES (
    p_tenant_id,
    'supplier_purchase_order',
    p_order_id,
    'save_supplier_purchase_order_draft',
    v_before || jsonb_build_object('_request', v_request),
    public.supplier_purchase_order_snapshot(v_order),
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_order.version
  );

  RETURN jsonb_build_object(
    'status', 'saved',
    'idempotent', false,
    'purchase_order', public.supplier_purchase_order_snapshot(v_order),
    'version', v_order.version
  );
END;
$$;

CREATE FUNCTION public.submit_supplier_purchase_order(
  p_order_id uuid,
  p_tenant_id uuid,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_order public.supplier_purchase_orders%ROWTYPE;
  v_before jsonb;
  v_request jsonb;
  v_eligibility record;
  v_locked_supplier_id uuid;
  v_checked_at timestamptz := clock_timestamp();
  v_item_count integer;
  v_price_mismatch_count integer;
BEGIN
  IF p_order_id IS NULL
    OR p_tenant_id IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version <= 0
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_VALIDATION_ERROR'
    );
  END IF;

  PERFORM public.assert_supplier_purchase_order_actor(
    p_tenant_id,
    p_actor_user_id,
    p_actor_employee_id
  );

  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'order_id', p_order_id,
    'expected_version', p_expected_version,
    'actor_employee_id', p_actor_employee_id
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
      OR v_event.resource_type <> 'supplier_purchase_order'
      OR v_event.resource_id <> p_order_id
      OR v_event.command <> 'submit_supplier_purchase_order'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'status', 'submitted',
      'idempotent', true,
      'purchase_order', v_event.to_state,
      'version', v_event.result_version
    );
  END IF;

  SELECT purchase_order.*
  INTO v_order
  FROM public.supplier_purchase_orders AS purchase_order
  WHERE purchase_order.id = p_order_id
    AND purchase_order.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_NOT_FOUND'
    );
  END IF;
  IF v_order.status <> 'draft' THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT'
    );
  END IF;
  IF v_order.version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_VERSION_CONFLICT',
      'version', v_order.version
    );
  END IF;

  PERFORM project.id
  FROM public.projects AS project
  WHERE project.id = v_order.project_id
    AND project.tenant_id = p_tenant_id
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'project_invalid',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_PROJECT_INVALID'
    );
  END IF;

  SELECT relationship.supplier_id
  INTO v_locked_supplier_id
  FROM public.tenant_suppliers AS relationship
  JOIN public.suppliers AS supplier
    ON supplier.id = relationship.supplier_id
  WHERE relationship.id = v_order.tenant_supplier_id
    AND relationship.tenant_id = p_tenant_id
    AND relationship.supplier_id = v_order.supplier_id
    AND relationship.default_currency = 'CNY'
  FOR SHARE OF relationship, supplier;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'supplier_not_eligible',
      'error_code', 'SUPPLIER_ORDER_NOT_ELIGIBLE'
    );
  END IF;

  SELECT eligibility.*
  INTO v_eligibility
  FROM public.get_tenant_supplier_order_eligibility_set(
    p_tenant_id,
    v_checked_at,
    v_order.tenant_supplier_id
  ) AS eligibility;
  IF NOT FOUND
    OR NOT v_eligibility.eligible
    OR v_eligibility.supplier_id <> v_locked_supplier_id
  THEN
    RETURN jsonb_build_object(
      'status', 'supplier_not_eligible',
      'error_code', 'SUPPLIER_ORDER_NOT_ELIGIBLE'
    );
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-price-publish:' || v_order.supplier_id::text,
      6720240729160000
    )
  );

  SELECT count(*)
  INTO v_item_count
  FROM public.supplier_purchase_order_items AS item
  WHERE item.supplier_purchase_order_id = p_order_id;
  IF v_item_count = 0 THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT'
    );
  END IF;

  WITH current_price_candidates AS MATERIALIZED (
    SELECT
      order_item.id AS order_item_id,
      price_item.id AS supplier_price_list_item_id,
      price_list.id AS supplier_price_list_id,
      count(*) OVER (
        PARTITION BY order_item.id
      ) AS candidate_count
    FROM public.supplier_purchase_order_items AS order_item
    LEFT JOIN public.supplier_price_list_items AS price_item
      ON price_item.supplier_sku_id = order_item.supplier_sku_id
      AND price_item.supplier_id = order_item.supplier_id
    LEFT JOIN public.supplier_price_lists AS price_list
      ON price_list.id = price_item.supplier_price_list_id
      AND price_list.supplier_id = price_item.supplier_id
      AND price_list.lifecycle_status = 'published'
      AND price_list.scope_type = 'default'
      AND price_list.currency = 'CNY'
      AND price_list.effective_from <= v_checked_at
      AND (
        price_list.effective_until IS NULL
        OR price_list.effective_until > v_checked_at
      )
    LEFT JOIN public.supplier_skus AS sku
      ON sku.id = order_item.supplier_sku_id
      AND sku.supplier_id = order_item.supplier_id
      AND sku.status = 'active'
    LEFT JOIN public.supplier_products AS product
      ON product.id = order_item.supplier_product_id
      AND product.supplier_id = order_item.supplier_id
      AND product.status = 'active'
    WHERE order_item.supplier_purchase_order_id = p_order_id
      AND price_list.id IS NOT NULL
      AND sku.id IS NOT NULL
      AND product.id IS NOT NULL
  ),
  current_prices AS MATERIALIZED (
    SELECT candidate.*
    FROM current_price_candidates AS candidate
    WHERE candidate.candidate_count = 1
  )
  SELECT count(*)
  INTO v_price_mismatch_count
  FROM public.supplier_purchase_order_items AS order_item
  LEFT JOIN current_prices AS current_price
    ON current_price.order_item_id = order_item.id
  WHERE order_item.supplier_purchase_order_id = p_order_id
    AND (
      current_price.order_item_id IS NULL
      OR current_price.supplier_price_list_item_id IS DISTINCT FROM
        order_item.supplier_price_list_item_id
      OR current_price.supplier_price_list_id IS DISTINCT FROM
        order_item.supplier_price_list_id
    );

  IF v_price_mismatch_count > 0 THEN
    RETURN jsonb_build_object(
      'status', 'price_changed',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_PRICE_CHANGED'
    );
  END IF;

  v_before := public.supplier_purchase_order_snapshot(v_order);
  UPDATE public.supplier_purchase_orders AS purchase_order
  SET status = 'submitted',
      submitted_by_employee_id = p_actor_employee_id,
      submitted_at = v_checked_at,
      version = purchase_order.version + 1,
      updated_by_employee_id = p_actor_employee_id,
      updated_at = now()
  WHERE purchase_order.id = p_order_id
  RETURNING * INTO v_order;

  INSERT INTO public.supplier_command_events (
    tenant_id,
    resource_type,
    resource_id,
    command,
    from_state,
    to_state,
    actor_user_id,
    actor_employee_id,
    idempotency_key,
    result_version
  )
  VALUES (
    p_tenant_id,
    'supplier_purchase_order',
    p_order_id,
    'submit_supplier_purchase_order',
    v_before || jsonb_build_object('_request', v_request),
    public.supplier_purchase_order_snapshot(v_order),
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_order.version
  );

  RETURN jsonb_build_object(
    'status', 'submitted',
    'idempotent', false,
    'purchase_order', public.supplier_purchase_order_snapshot(v_order),
    'version', v_order.version
  );
END;
$$;

CREATE FUNCTION public.cancel_supplier_purchase_order(
  p_order_id uuid,
  p_tenant_id uuid,
  p_expected_version integer,
  p_reason text,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_order public.supplier_purchase_orders%ROWTYPE;
  v_before jsonb;
  v_request jsonb;
  v_cancelled_at timestamptz := clock_timestamp();
BEGIN
  IF p_order_id IS NULL
    OR p_tenant_id IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version <= 0
    OR p_reason IS NULL
    OR btrim(p_reason) = ''
    OR char_length(btrim(p_reason)) > 500
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_VALIDATION_ERROR'
    );
  END IF;

  PERFORM public.assert_supplier_purchase_order_actor(
    p_tenant_id,
    p_actor_user_id,
    p_actor_employee_id
  );

  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'order_id', p_order_id,
    'expected_version', p_expected_version,
    'reason', btrim(p_reason),
    'actor_employee_id', p_actor_employee_id
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
      OR v_event.resource_type <> 'supplier_purchase_order'
      OR v_event.resource_id <> p_order_id
      OR v_event.command <> 'cancel_supplier_purchase_order'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'status', 'cancelled',
      'idempotent', true,
      'purchase_order', v_event.to_state,
      'version', v_event.result_version
    );
  END IF;

  SELECT purchase_order.*
  INTO v_order
  FROM public.supplier_purchase_orders AS purchase_order
  WHERE purchase_order.id = p_order_id
    AND purchase_order.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_NOT_FOUND'
    );
  END IF;
  IF v_order.status NOT IN ('draft', 'submitted') THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT'
    );
  END IF;
  IF v_order.version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_VERSION_CONFLICT',
      'version', v_order.version
    );
  END IF;

  PERFORM project.id
  FROM public.projects AS project
  WHERE project.id = v_order.project_id
    AND project.tenant_id = p_tenant_id
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'project_invalid',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_PROJECT_INVALID'
    );
  END IF;

  v_before := public.supplier_purchase_order_snapshot(v_order);
  UPDATE public.supplier_purchase_orders AS purchase_order
  SET status = 'cancelled',
      cancelled_by_employee_id = p_actor_employee_id,
      cancelled_at = v_cancelled_at,
      cancel_reason = btrim(p_reason),
      version = purchase_order.version + 1,
      updated_by_employee_id = p_actor_employee_id,
      updated_at = now()
  WHERE purchase_order.id = p_order_id
  RETURNING * INTO v_order;

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
    'supplier_purchase_order',
    p_order_id,
    'cancel_supplier_purchase_order',
    v_before || jsonb_build_object('_request', v_request),
    public.supplier_purchase_order_snapshot(v_order),
    btrim(p_reason),
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_order.version
  );

  RETURN jsonb_build_object(
    'status', 'cancelled',
    'idempotent', false,
    'purchase_order', public.supplier_purchase_order_snapshot(v_order),
    'version', v_order.version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_supplier_purchase_order_catalog(
  uuid,
  uuid,
  timestamptz,
  text,
  integer,
  integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.resolve_supplier_purchase_order_catalog(
  uuid,
  uuid,
  timestamptz,
  text,
  integer,
  integer
) TO service_role;

REVOKE ALL ON FUNCTION public.save_supplier_purchase_order_draft(
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  date,
  text,
  jsonb,
  uuid,
  uuid,
  text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.save_supplier_purchase_order_draft(
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  date,
  text,
  jsonb,
  uuid,
  uuid,
  text
) TO service_role;

REVOKE ALL ON FUNCTION public.submit_supplier_purchase_order(
  uuid,
  uuid,
  integer,
  uuid,
  uuid,
  text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.submit_supplier_purchase_order(
  uuid,
  uuid,
  integer,
  uuid,
  uuid,
  text
) TO service_role;

REVOKE ALL ON FUNCTION public.cancel_supplier_purchase_order(
  uuid,
  uuid,
  integer,
  text,
  uuid,
  uuid,
  text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.cancel_supplier_purchase_order(
  uuid,
  uuid,
  integer,
  text,
  uuid,
  uuid,
  text
) TO service_role;

ALTER TABLE public.supplier_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_purchase_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_purchase_order_items FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.supplier_purchase_orders,
  public.supplier_purchase_order_items
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE
  public.supplier_purchase_orders,
  public.supplier_purchase_order_items
TO service_role;

REVOKE ALL ON SEQUENCE public.supplier_purchase_order_number_seq
FROM PUBLIC, anon, authenticated, service_role;

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
    'supplier.purchase-order.view',
    '查看供应商采购单',
    'supplier',
    'purchase_order',
    'view',
    '查看当前租户项目采购单和金额快照',
    'active'
  ),
  (
    'supplier.purchase-order.manage',
    '管理供应商采购单',
    'supplier',
    'purchase_order',
    'manage',
    '保存、提交和取消当前租户项目采购单',
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
    'supplier.purchase-order.view',
    'supplier.purchase-order.manage'
  )
WHERE roles.code = 'system_admin'
  AND roles.tenant_id IS NOT NULL
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

COMMIT;
