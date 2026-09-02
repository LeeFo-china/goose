-- Rollback: restore the previous v1 function definition only after metadata-only overlap commands are no longer possible;
-- a forward rollback first restores the previous Admin/API route, then revokes and drops both functions.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE OR REPLACE FUNCTION public.get_supplier_purchasable_sku_price_context_v1(
  p_tenant_id uuid,
  p_tenant_supplier_id uuid,
  p_supplier_id uuid,
  p_supplier_product_id uuid,
  p_supplier_sku_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_product public.supplier_products%ROWTYPE;
  v_sku public.supplier_skus%ROWTYPE;
  v_current_price_list public.supplier_price_lists%ROWTYPE;
  v_future_price_list public.supplier_price_lists%ROWTYPE;
  v_current_price_item public.supplier_price_list_items%ROWTYPE;
  v_priced_at timestamptz;
  v_current_price jsonb;
  v_recommended_tax_rate text;
  v_current_count integer;
BEGIN
  -- Required scope validation intentionally precedes every table read.
  IF p_tenant_id IS NULL
    OR p_tenant_supplier_id IS NULL
    OR p_supplier_id IS NULL
    OR p_supplier_product_id IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'SUPPLIER_ORDER_NOT_ELIGIBLE';
  END IF;

  v_priced_at := pg_catalog.transaction_timestamp();

  PERFORM relationship.id
  FROM public.tenant_suppliers AS relationship
  JOIN public.suppliers AS supplier
    ON supplier.id = relationship.supplier_id
  WHERE relationship.id = p_tenant_supplier_id
    AND relationship.tenant_id = p_tenant_id
    AND relationship.supplier_id = p_supplier_id
    AND relationship.relationship_status = 'active'
    AND relationship.default_currency = 'CNY'
    AND supplier.onboarding_status = 'approved'
    AND supplier.operational_status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_ORDER_NOT_ELIGIBLE';
  END IF;

  SELECT product.*
  INTO v_product
  FROM public.supplier_products AS product
  WHERE product.id = p_supplier_product_id
    AND product.supplier_id = p_supplier_id
    AND product.ownership_scope = 'tenant'
    AND product.owner_tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_PRODUCT_NOT_FOUND';
  END IF;

  IF p_supplier_sku_id IS NOT NULL THEN
    SELECT sku.*
    INTO v_sku
    FROM public.supplier_skus AS sku
    WHERE sku.id = p_supplier_sku_id
      AND sku.supplier_id = p_supplier_id
      AND sku.supplier_product_id = p_supplier_product_id
      AND sku.ownership_scope = 'tenant'
      AND sku.owner_tenant_id = p_tenant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_SKU_NOT_FOUND';
    END IF;
  END IF;

  IF p_supplier_sku_id IS NOT NULL THEN
    SELECT count(*)
    INTO v_current_count
    FROM public.supplier_price_lists AS price_list
    JOIN public.supplier_price_list_items AS item
      ON item.supplier_price_list_id = price_list.id
      AND item.tenant_id = p_tenant_id
      AND item.supplier_id = p_supplier_id
    WHERE price_list.tenant_id = p_tenant_id
      AND price_list.tenant_supplier_id = p_tenant_supplier_id
      AND price_list.supplier_id = p_supplier_id
      AND upper(btrim(price_list.price_list_code)) = 'DEFAULT'
      AND price_list.scope_type = 'default'
      AND price_list.currency = 'CNY'
      AND price_list.lifecycle_status = 'published'
      AND price_list.effective_from <= v_priced_at
      AND (
        price_list.effective_until IS NULL
        OR price_list.effective_until > v_priced_at
      )
      AND item.supplier_product_id = p_supplier_product_id
      AND item.supplier_sku_id = p_supplier_sku_id;

    IF v_current_count > 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_PRICE_PERIOD_CONFLICT';
    END IF;

    SELECT price_list.*
    INTO v_current_price_list
    FROM public.supplier_price_lists AS price_list
    JOIN public.supplier_price_list_items AS item
      ON item.supplier_price_list_id = price_list.id
      AND item.tenant_id = p_tenant_id
      AND item.supplier_id = p_supplier_id
    WHERE price_list.tenant_id = p_tenant_id
      AND price_list.tenant_supplier_id = p_tenant_supplier_id
      AND price_list.supplier_id = p_supplier_id
      AND upper(btrim(price_list.price_list_code)) = 'DEFAULT'
      AND price_list.scope_type = 'default'
      AND price_list.currency = 'CNY'
      AND price_list.lifecycle_status = 'published'
      AND price_list.effective_from <= v_priced_at
      AND (
        price_list.effective_until IS NULL
        OR price_list.effective_until > v_priced_at
      )
      AND item.supplier_product_id = p_supplier_product_id
      AND item.supplier_sku_id = p_supplier_sku_id
    ORDER BY price_list.version_number DESC, price_list.id DESC
    LIMIT 1;

    SELECT price_list.*
    INTO v_future_price_list
    FROM public.supplier_price_lists AS price_list
    JOIN public.supplier_price_list_items AS item
      ON item.supplier_price_list_id = price_list.id
      AND item.tenant_id = p_tenant_id
      AND item.supplier_id = p_supplier_id
    WHERE price_list.tenant_id = p_tenant_id
      AND price_list.tenant_supplier_id = p_tenant_supplier_id
      AND price_list.supplier_id = p_supplier_id
      AND upper(btrim(price_list.price_list_code)) = 'DEFAULT'
      AND price_list.scope_type = 'default'
      AND price_list.currency = 'CNY'
      AND price_list.lifecycle_status = 'published'
      AND price_list.effective_from > v_priced_at
      AND item.supplier_product_id = p_supplier_product_id
      AND item.supplier_sku_id = p_supplier_sku_id
    ORDER BY
      price_list.effective_from,
      price_list.version_number,
      price_list.id
    LIMIT 1;

    IF v_current_price_list.id IS NOT NULL THEN
    SELECT item.*
    INTO v_current_price_item
    FROM public.supplier_price_list_items AS item
    WHERE item.supplier_price_list_id = v_current_price_list.id
      AND item.tenant_id = p_tenant_id
      AND item.supplier_id = p_supplier_id
      AND item.supplier_product_id = p_supplier_product_id
      AND item.supplier_sku_id = p_supplier_sku_id;
    END IF;
  END IF;

  SELECT item.tax_rate::text
  INTO v_recommended_tax_rate
  FROM public.supplier_price_list_items AS item
  JOIN public.supplier_price_lists AS price_list
    ON price_list.id = item.supplier_price_list_id
    AND price_list.tenant_id = p_tenant_id
    AND price_list.tenant_supplier_id = p_tenant_supplier_id
    AND price_list.supplier_id = p_supplier_id
  WHERE price_list.lifecycle_status = 'published'
    AND price_list.scope_type = 'default'
    AND upper(btrim(price_list.price_list_code)) = 'DEFAULT'
    AND price_list.currency = 'CNY'
    AND price_list.effective_from <= v_priced_at
    AND (
      price_list.effective_until IS NULL
      OR price_list.effective_until > v_priced_at
    )
  ORDER BY
    price_list.effective_from DESC,
    item.updated_at DESC,
    item.id DESC
  LIMIT 1;

  v_current_price := CASE
    WHEN v_current_price_item.id IS NULL THEN 'null'::jsonb
    ELSE jsonb_build_object(
      'supplier_price_list_id', v_current_price_list.id,
      'supplier_price_list_version', v_current_price_list.version_number,
      'supplier_price_list_row_version', v_current_price_list.row_version,
      'supplier_price_list_item_id', v_current_price_item.id,
      'unit_price', v_current_price_item.unit_price::text,
      'tax_rate', v_current_price_item.tax_rate::text,
      'tax_inclusive', v_current_price_item.tax_inclusive,
      'effective_from', v_current_price_list.effective_from,
      'effective_until', v_current_price_list.effective_until
    )
  END;

  RETURN jsonb_build_object(
    'tenant_id', p_tenant_id,
    'tenant_supplier_id', p_tenant_supplier_id,
    'supplier_id', p_supplier_id,
    'supplier_product_id', p_supplier_product_id,
    'supplier_sku_id', p_supplier_sku_id,
    'currency', 'CNY',
    'recommended_tax_rate', COALESCE(v_recommended_tax_rate, '0.13'),
    'recommended_tax_inclusive', false,
    'next_scheduled_effective_from', v_future_price_list.effective_from,
    'current_price', v_current_price
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.command_supplier_purchasable_sku_v1(
  p_action text,
  p_tenant_id uuid,
  p_tenant_supplier_id uuid,
  p_supplier_id uuid,
  p_supplier_product_id uuid,
  p_supplier_sku_id uuid,
  p_expected_sku_version integer,
  p_sku jsonb,
  p_price jsonb,
  p_expected_price_list_id uuid,
  p_expected_price_list_version integer,
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
  v_product public.supplier_products%ROWTYPE;
  v_sku public.supplier_skus%ROWTYPE;
  v_current_price_list public.supplier_price_lists%ROWTYPE;
  v_future_price_list public.supplier_price_lists%ROWTYPE;
  v_source_price_list public.supplier_price_lists%ROWTYPE;
  v_effective_price_list public.supplier_price_lists%ROWTYPE;
  v_current_price_item public.supplier_price_list_items%ROWTYPE;
  v_effective_price_item public.supplier_price_list_items%ROWTYPE;
  v_effective_sku jsonb;
  v_sku_payload jsonb;
  v_effective_price jsonb;
  v_parent_request jsonb;
  v_parent_fingerprint text;
  v_parent_key text;
  v_child_key text;
  v_child_response jsonb;
  v_catalog_response jsonb;
  v_catalog_item jsonb;
  v_current_price jsonb;
  v_response jsonb;
  v_price_list_id uuid;
  v_price_item_id uuid;
  v_effective_price_list_id uuid;
  v_effective_price_item_id uuid;
  v_price_list_version integer;
  v_purchase_unit_id uuid;
  v_catalog_base_unit_id uuid;
  v_locked_catalog_base_unit_id uuid;
  v_unit_price numeric(14, 2);
  v_tax_rate numeric(7, 6);
  v_priced_at timestamptz;
  v_immediate_effective_until timestamptz;
  v_effective_from timestamptz;
  v_effective_until timestamptz;
  v_current_count integer;
  v_sku_fields_changed boolean := false;
  v_price_changed boolean := true;
  v_price_version_created boolean := false;
  v_constraint_name text;
  v_error_message text;
  v_error_detail text;
BEGIN
  -- Direct RPC callers receive the same strict validation as HTTP callers,
  -- and every validation branch intentionally precedes the parent lock.
  IF p_action IS NULL
    OR p_action NOT IN ('create', 'update')
    OR p_tenant_id IS NULL
    OR p_tenant_supplier_id IS NULL
    OR p_supplier_id IS NULL
    OR p_supplier_product_id IS NULL
    OR p_supplier_sku_id IS NULL
    OR p_supplier_product_id = p_supplier_sku_id
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_sku IS NULL
    OR jsonb_typeof(p_sku) <> 'object'
    OR p_price IS NULL
    OR jsonb_typeof(p_price) <> 'object'
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
    OR (p_action = 'create' AND p_expected_sku_version IS NOT NULL)
    OR (p_action = 'update' AND COALESCE(p_expected_sku_version, 0) < 1)
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'idempotent', false,
      'error_code', 'SUPPLIER_PURCHASABLE_SKU_SAVE_FAILED',
      'reason', 'invalid_request'
    );
  END IF;

  IF (p_expected_price_list_id IS NULL) <>
      (p_expected_price_list_version IS NULL)
    OR (
      p_expected_price_list_version IS NOT NULL
      AND p_expected_price_list_version < 1
    )
    OR (
      p_action = 'create'
      AND p_expected_price_list_id IS NOT NULL
    )
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'idempotent', false,
      'error_code', 'SUPPLIER_PRICE_LIST_VERSION_CONFLICT',
      'reason', 'invalid_expected_price_version'
    );
  END IF;

  IF p_action = 'update' AND (p_sku ? 'purchase_unit_id') THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'idempotent', false,
      'error_code', 'SUPPLIER_SKU_STATE_CONFLICT',
      'reason', 'purchase_unit_update_not_allowed'
    );
  END IF;

  IF EXISTS (
      SELECT 1
      FROM jsonb_object_keys(p_sku) AS field(key)
      WHERE field.key NOT IN (
        'sku_code', 'name', 'specification', 'model', 'purchase_unit_id',
        'batch_managed', 'color_managed', 'serial_managed', 'spec_values'
      )
    )
    OR (
      p_action = 'create'
      AND (
        NOT (p_sku ? 'name')
        OR NOT (p_sku ? 'purchase_unit_id')
        OR NOT (p_sku ? 'spec_values')
      )
    )
    OR (
      p_sku ? 'name'
      AND (
        jsonb_typeof(p_sku -> 'name') <> 'string'
        OR NULLIF(btrim(p_sku ->> 'name'), '') IS NULL
        OR btrim(p_sku ->> 'name') IS DISTINCT FROM p_sku ->> 'name'
        OR char_length(p_sku ->> 'name') > 160
      )
    )
    OR (
      p_sku ? 'purchase_unit_id'
      AND (
        jsonb_typeof(p_sku -> 'purchase_unit_id') <> 'string'
        OR COALESCE(p_sku ->> 'purchase_unit_id', '') !~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      )
    )
    OR (
      p_sku ? 'specification'
      AND jsonb_typeof(p_sku -> 'specification') NOT IN ('string', 'null')
    )
    OR (
      jsonb_typeof(p_sku -> 'specification') = 'string'
      AND (
        NULLIF(btrim(p_sku ->> 'specification'), '') IS NULL
        OR btrim(p_sku ->> 'specification') IS DISTINCT FROM
          p_sku ->> 'specification'
        OR char_length(p_sku ->> 'specification') > 240
      )
    )
    OR (
      p_sku ? 'model'
      AND jsonb_typeof(p_sku -> 'model') NOT IN ('string', 'null')
    )
    OR (
      jsonb_typeof(p_sku -> 'model') = 'string'
      AND (
        NULLIF(btrim(p_sku ->> 'model'), '') IS NULL
        OR btrim(p_sku ->> 'model') IS DISTINCT FROM p_sku ->> 'model'
        OR char_length(p_sku ->> 'model') > 160
      )
    )
    OR (
      p_sku ? 'batch_managed'
      AND jsonb_typeof(p_sku -> 'batch_managed') <> 'boolean'
    )
    OR (
      p_sku ? 'color_managed'
      AND jsonb_typeof(p_sku -> 'color_managed') <> 'boolean'
    )
    OR (
      p_sku ? 'serial_managed'
      AND jsonb_typeof(p_sku -> 'serial_managed') <> 'boolean'
    )
    OR (
      p_sku ? 'spec_values'
      AND jsonb_typeof(p_sku -> 'spec_values') <> 'object'
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_each(
        CASE
          WHEN jsonb_typeof(p_sku -> 'spec_values') = 'object'
            THEN p_sku -> 'spec_values'
          ELSE '{}'::jsonb
        END
      )
        AS spec(key, value)
      WHERE CASE jsonb_typeof(spec.value)
        WHEN 'string' THEN false
        WHEN 'number' THEN false
        WHEN 'boolean' THEN false
        WHEN 'array' THEN EXISTS (
          SELECT 1
          FROM jsonb_array_elements(spec.value) AS element(value)
          WHERE jsonb_typeof(element.value) <> 'string'
        )
        ELSE true
      END
    )
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'idempotent', false,
      'error_code', 'SUPPLIER_SKU_STATE_CONFLICT',
      'reason', 'invalid_sku'
    );
  END IF;

  IF NOT (p_price ? 'unit_price')
    OR NOT (p_price ? 'tax_rate')
    OR NOT (p_price ? 'tax_inclusive')
    OR jsonb_typeof(p_price -> 'unit_price') <> 'string'
    OR jsonb_typeof(p_price -> 'tax_rate') <> 'string'
    OR jsonb_typeof(p_price -> 'tax_inclusive') <> 'boolean'
    OR COALESCE(p_price ->> 'unit_price', '') !~
      '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$'
    OR COALESCE(p_price ->> 'tax_rate', '') !~
      '^(0(\.[0-9]{1,6})?|1(\.0{1,6})?)$'
    OR EXISTS (
      SELECT 1
      FROM jsonb_object_keys(p_price) AS field(key)
      WHERE field.key NOT IN ('unit_price', 'tax_rate', 'tax_inclusive')
    )
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'idempotent', false,
      'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION',
      'reason', 'invalid_price'
    );
  END IF;

  v_unit_price := (p_price ->> 'unit_price')::numeric(14, 2);
  v_tax_rate := (p_price ->> 'tax_rate')::numeric(7, 6);
  IF v_unit_price <= 0
    OR v_unit_price > 999999999999.99::numeric
    OR v_tax_rate < 0
    OR v_tax_rate > 1
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'idempotent', false,
      'error_code', 'SUPPLIER_PRICE_LIST_INVALID_ACTION',
      'reason', 'invalid_price'
    );
  END IF;

  v_effective_sku := (p_sku - 'sku_code') || jsonb_build_object(
    'sku_code', 'TS-' || upper(replace(p_supplier_sku_id::text, '-', ''))
  );
  v_sku_payload := (v_effective_sku - 'sku_code') - 'purchase_unit_id';
  v_effective_price := jsonb_build_object(
    'unit_price', v_unit_price::text,
    'tax_rate', v_tax_rate::text,
    'tax_inclusive', p_price -> 'tax_inclusive'
  );
  v_priced_at := pg_catalog.transaction_timestamp();

  v_parent_request := jsonb_build_object(
    'action', p_action,
    'tenant_id', p_tenant_id,
    'tenant_supplier_id', p_tenant_supplier_id,
    'supplier_id', p_supplier_id,
    'supplier_product_id', p_supplier_product_id,
    'supplier_sku_id', p_supplier_sku_id,
    'expected_sku_version', p_expected_sku_version,
    'sku', v_effective_sku,
    'price', v_effective_price,
    'expected_price_list_id', p_expected_price_list_id,
    'expected_price_list_version', p_expected_price_list_version,
    'actor_user_id', p_actor_user_id,
    'actor_employee_id', p_actor_employee_id,
    'idempotency_key', btrim(p_idempotency_key)
  );
  v_parent_fingerprint := pg_catalog.md5(v_parent_request::text);
  v_parent_key := 'supplier-purchasable-sku:' ||
    pg_catalog.md5(btrim(p_idempotency_key));

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_parent_key, 20260901130000)
  );

  SELECT event.*
  INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = v_parent_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_sku'
      OR v_event.resource_id <> p_supplier_sku_id
      OR v_event.command <> 'supplier_purchasable_sku_v1:' || p_action
      OR v_event.from_state ->> '_fingerprint' IS DISTINCT FROM
        v_parent_fingerprint
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_parent_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;

    RETURN jsonb_set(
      v_event.to_state,
      '{idempotent}',
      'true'::jsonb,
      true
    );
  END IF;

  PERFORM employee.id
  FROM public.employees AS employee
  WHERE employee.id = p_actor_employee_id
    AND employee.user_id = p_actor_user_id
    AND employee.tenant_id = p_tenant_id
    AND employee.status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'idempotent', false,
      'error_code', 'SUPPLIER_PROXY_ACTOR_INVALID',
      'reason', 'actor_invalid'
    );
  END IF;

  PERFORM relationship.id
  FROM public.tenant_suppliers AS relationship
  JOIN public.suppliers AS supplier
    ON supplier.id = relationship.supplier_id
  WHERE relationship.id = p_tenant_supplier_id
    AND relationship.tenant_id = p_tenant_id
    AND relationship.supplier_id = p_supplier_id
    AND relationship.relationship_status = 'active'
    AND relationship.default_currency = 'CNY'
    AND supplier.onboarding_status = 'approved'
    AND supplier.operational_status = 'active'
    AND (
      (supplier.ownership_scope = 'platform' AND supplier.owner_tenant_id IS NULL)
      OR (
        supplier.ownership_scope = 'tenant'
        AND supplier.owner_tenant_id = p_tenant_id
      )
    )
  FOR UPDATE OF relationship
  FOR SHARE OF supplier;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'idempotent', false,
      'error_code', 'TENANT_SUPPLIER_NOT_FOUND',
      'reason', 'tenant_supplier_unavailable'
    );
  END IF;

  -- command_supplier_price_list_v2(publish) takes this advisory before its row
  -- lock. Taking it here first prevents a row-to-advisory inversion later.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-price-publish:' || p_tenant_id::text || ':' ||
        p_supplier_id::text,
      6720240729160000
    )
  );

  IF p_action = 'update' THEN
    SELECT price_list.*
    INTO v_current_price_list
    FROM public.supplier_price_lists AS price_list
    JOIN public.supplier_price_list_items AS item
      ON item.supplier_price_list_id = price_list.id
      AND item.tenant_id = p_tenant_id
      AND item.supplier_id = p_supplier_id
    WHERE price_list.tenant_id = p_tenant_id
      AND price_list.tenant_supplier_id = p_tenant_supplier_id
      AND price_list.supplier_id = p_supplier_id
      AND upper(btrim(price_list.price_list_code)) = 'DEFAULT'
      AND price_list.scope_type = 'default'
      AND price_list.currency = 'CNY'
      AND price_list.lifecycle_status = 'published'
      AND price_list.effective_from <= v_priced_at
      AND (
        price_list.effective_until IS NULL
        OR price_list.effective_until > v_priced_at
      )
      AND item.supplier_product_id = p_supplier_product_id
      AND item.supplier_sku_id = p_supplier_sku_id
    ORDER BY price_list.version_number DESC, price_list.id DESC
    LIMIT 1
    FOR UPDATE OF price_list;

    v_source_price_list := v_current_price_list;
  END IF;

  IF v_source_price_list.id IS NULL THEN
    -- A SKU without a current item still needs a deterministic source so the
    -- list-level v2 command can preserve existing prices for other SKUs.
    SELECT price_list.*
    INTO v_source_price_list
    FROM public.supplier_price_lists AS price_list
    WHERE price_list.tenant_id = p_tenant_id
      AND price_list.tenant_supplier_id = p_tenant_supplier_id
      AND price_list.supplier_id = p_supplier_id
      AND upper(btrim(price_list.price_list_code)) = 'DEFAULT'
      AND price_list.scope_type = 'default'
      AND price_list.currency = 'CNY'
      AND (
        (
          price_list.lifecycle_status = 'published'
          AND price_list.effective_from <= v_priced_at
          AND (
            price_list.effective_until IS NULL
            OR price_list.effective_until > v_priced_at
          )
        )
        OR price_list.lifecycle_status = 'retired'
      )
    ORDER BY
      CASE WHEN price_list.lifecycle_status = 'published' THEN 0 ELSE 1 END,
      price_list.version_number DESC,
      price_list.id DESC
    LIMIT 1
    FOR UPDATE OF price_list;
  END IF;

  -- new_version takes its source row before this series advisory. The source
  -- above follows that order; a first list has no source and starts here.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-price-series:' || p_tenant_id::text || ':' ||
        p_supplier_id::text || ':default',
      6720240729160000
    )
  );

  IF p_action = 'update' THEN
    SELECT price_list.*
    INTO v_future_price_list
    FROM public.supplier_price_lists AS price_list
    JOIN public.supplier_price_list_items AS item
      ON item.supplier_price_list_id = price_list.id
      AND item.tenant_id = p_tenant_id
      AND item.supplier_id = p_supplier_id
    WHERE price_list.tenant_id = p_tenant_id
      AND price_list.tenant_supplier_id = p_tenant_supplier_id
      AND price_list.supplier_id = p_supplier_id
      AND upper(btrim(price_list.price_list_code)) = 'DEFAULT'
      AND price_list.scope_type = 'default'
      AND price_list.currency = 'CNY'
      AND price_list.lifecycle_status = 'published'
      AND price_list.effective_from > v_priced_at
      AND item.supplier_product_id = p_supplier_product_id
      AND item.supplier_sku_id = p_supplier_sku_id
    ORDER BY price_list.effective_from, price_list.version_number, price_list.id
    LIMIT 1;

    IF v_current_price_list.id IS NOT NULL THEN
      SELECT item.*
      INTO v_current_price_item
      FROM public.supplier_price_list_items AS item
      WHERE item.supplier_price_list_id = v_current_price_list.id
        AND item.tenant_id = p_tenant_id
        AND item.supplier_id = p_supplier_id
        AND item.supplier_product_id = p_supplier_product_id
        AND item.supplier_sku_id = p_supplier_sku_id;
    END IF;

    IF v_current_price_item.id IS NULL THEN
      IF p_expected_price_list_id IS NOT NULL THEN
        RETURN jsonb_build_object(
          'status', 'version_conflict',
          'idempotent', false,
          'error_code', 'SUPPLIER_PRICE_LIST_VERSION_CONFLICT',
          'reason', 'current_price_missing'
        );
      END IF;
    ELSIF p_expected_price_list_id IS NULL
      OR v_current_price_list.id IS DISTINCT FROM p_expected_price_list_id
      OR v_current_price_list.row_version IS DISTINCT FROM
        p_expected_price_list_version
    THEN
      RETURN jsonb_build_object(
        'status', 'version_conflict',
        'idempotent', false,
        'error_code', 'SUPPLIER_PRICE_LIST_VERSION_CONFLICT',
        'version', v_current_price_list.row_version,
        'current_price_list_id', v_current_price_list.id
      );
    END IF;

    SELECT sku.*
    INTO v_sku
    FROM public.supplier_skus AS sku
    WHERE sku.id = p_supplier_sku_id;

    IF v_current_price_item.id IS NOT NULL
      AND v_current_price_item.minimum_quantity = 1
      AND v_current_price_item.maximum_quantity IS NULL
      AND v_current_price_item.purchase_unit_id = v_sku.purchase_unit_id
      AND v_current_price_item.base_unit_id = v_sku.base_unit_id
      AND v_current_price_item.base_unit_conversion = v_sku.base_unit_conversion
      AND v_current_price_item.unit_price = v_unit_price
      AND v_current_price_item.tax_rate = v_tax_rate
      AND v_current_price_item.tax_inclusive =
        (p_price ->> 'tax_inclusive')::boolean
    THEN
      v_price_changed := false;
    END IF;
  END IF;

  v_immediate_effective_until := v_future_price_list.effective_from;

  IF v_current_price_list.id IS NOT NULL
    AND v_future_price_list.id IS NOT NULL
    AND (
      v_current_price_list.effective_until IS NULL
      OR v_current_price_list.effective_until >
        v_future_price_list.effective_from
    )
  THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'idempotent', false,
      'error_code', 'SUPPLIER_PRICE_PERIOD_CONFLICT'
    );
  END IF;

  IF v_price_changed THEN
    -- Only a new price version needs every target-SKU list row locked. This
    -- remains before product/SKU locks to match the standalone price commands.
    PERFORM price_list.id
    FROM public.supplier_price_lists AS price_list
    JOIN public.supplier_price_list_items AS item
      ON item.supplier_price_list_id = price_list.id
      AND item.tenant_id = p_tenant_id
      AND item.supplier_id = p_supplier_id
    WHERE price_list.tenant_id = p_tenant_id
      AND price_list.tenant_supplier_id = p_tenant_supplier_id
      AND price_list.supplier_id = p_supplier_id
      AND upper(btrim(price_list.price_list_code)) = 'DEFAULT'
      AND price_list.scope_type = 'default'
      AND price_list.currency = 'CNY'
      AND price_list.id IS DISTINCT FROM v_source_price_list.id
      AND item.supplier_product_id = p_supplier_product_id
      AND item.supplier_sku_id = p_supplier_sku_id
    ORDER BY price_list.version_number, price_list.id
    FOR UPDATE OF price_list;

    IF EXISTS (
      SELECT 1
      FROM public.supplier_price_lists AS draft
      WHERE draft.tenant_id = p_tenant_id
        AND draft.tenant_supplier_id = p_tenant_supplier_id
        AND draft.supplier_id = p_supplier_id
        AND upper(btrim(draft.price_list_code)) = 'DEFAULT'
        AND draft.scope_type = 'default'
        AND draft.currency = 'CNY'
        AND draft.lifecycle_status = 'draft'
    ) OR EXISTS (
      SELECT 1
      FROM public.supplier_price_list_items AS earlier_item
      JOIN public.supplier_price_lists AS earlier
        ON earlier.id = earlier_item.supplier_price_list_id
        AND earlier.tenant_id = p_tenant_id
        AND earlier.tenant_supplier_id = p_tenant_supplier_id
        AND earlier.supplier_id = p_supplier_id
        AND upper(btrim(earlier.price_list_code)) = 'DEFAULT'
        AND earlier.scope_type = 'default'
        AND earlier.currency = 'CNY'
        AND earlier.lifecycle_status = 'published'
      JOIN public.supplier_price_list_items AS later_item
        ON later_item.supplier_sku_id = earlier_item.supplier_sku_id
        AND later_item.supplier_product_id = earlier_item.supplier_product_id
        AND later_item.tenant_id = earlier_item.tenant_id
        AND later_item.supplier_id = earlier_item.supplier_id
        AND later_item.supplier_price_list_id <>
          earlier_item.supplier_price_list_id
      JOIN public.supplier_price_lists AS later
        ON later.id = later_item.supplier_price_list_id
        AND later.tenant_id = earlier.tenant_id
        AND later.tenant_supplier_id = earlier.tenant_supplier_id
        AND later.supplier_id = earlier.supplier_id
        AND upper(btrim(later.price_list_code)) =
          upper(btrim(earlier.price_list_code))
        AND later.scope_type = earlier.scope_type
        AND later.currency = earlier.currency
        AND later.lifecycle_status = 'published'
        AND (earlier.effective_from, earlier.id) <
          (later.effective_from, later.id)
      WHERE earlier_item.tenant_id = p_tenant_id
        AND earlier_item.supplier_id = p_supplier_id
        AND earlier_item.supplier_product_id = p_supplier_product_id
        AND earlier_item.supplier_sku_id = p_supplier_sku_id
        AND earlier.effective_from <
          COALESCE(later.effective_until, 'infinity'::timestamptz)
        AND COALESCE(
          earlier.effective_until,
          'infinity'::timestamptz
        ) > later.effective_from
    ) THEN
      RETURN jsonb_build_object(
        'status', 'state_conflict',
        'idempotent', false,
        'error_code', 'SUPPLIER_PRICE_PERIOD_CONFLICT'
      );
    END IF;

    IF p_action = 'update' THEN
      SELECT count(*)
      INTO v_current_count
      FROM public.supplier_price_lists AS price_list
      JOIN public.supplier_price_list_items AS item
        ON item.supplier_price_list_id = price_list.id
        AND item.tenant_id = p_tenant_id
        AND item.supplier_id = p_supplier_id
      WHERE price_list.tenant_id = p_tenant_id
        AND price_list.tenant_supplier_id = p_tenant_supplier_id
        AND price_list.supplier_id = p_supplier_id
        AND upper(btrim(price_list.price_list_code)) = 'DEFAULT'
        AND price_list.scope_type = 'default'
        AND price_list.currency = 'CNY'
        AND price_list.lifecycle_status = 'published'
        AND price_list.effective_from <= v_priced_at
        AND (
          price_list.effective_until IS NULL
          OR price_list.effective_until > v_priced_at
        )
        AND item.supplier_product_id = p_supplier_product_id
        AND item.supplier_sku_id = p_supplier_sku_id;

      IF v_current_count > 1 THEN
        RETURN jsonb_build_object(
          'status', 'state_conflict',
          'idempotent', false,
          'error_code', 'SUPPLIER_PRICE_PERIOD_CONFLICT'
        );
      END IF;
    END IF;
  END IF;

  SELECT product.*
  INTO v_product
  FROM public.supplier_products AS product
  WHERE product.id = p_supplier_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'idempotent', false,
      'error_code', 'SUPPLIER_PRODUCT_NOT_FOUND'
    );
  END IF;
  IF v_product.supplier_id IS DISTINCT FROM p_supplier_id
    OR v_product.ownership_scope IS DISTINCT FROM 'tenant'
    OR v_product.owner_tenant_id IS DISTINCT FROM p_tenant_id
  THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'idempotent', false,
      'error_code', 'SHARED_RESOURCE_READ_ONLY'
    );
  END IF;
  IF v_product.status = 'inactive'
    OR v_product.status NOT IN ('draft', 'active')
  THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'idempotent', false,
      'error_code', 'SUPPLIER_PRODUCT_STATE_CONFLICT',
      'current_status', v_product.status
    );
  END IF;

  SELECT sku.*
  INTO v_sku
  FROM public.supplier_skus AS sku
  WHERE sku.id = p_supplier_sku_id
  FOR UPDATE;

  IF p_action = 'create' AND v_sku.id IS NOT NULL THEN
    IF v_sku.supplier_id IS DISTINCT FROM p_supplier_id
      OR v_sku.supplier_product_id IS DISTINCT FROM p_supplier_product_id
      OR v_sku.ownership_scope IS DISTINCT FROM 'tenant'
      OR v_sku.owner_tenant_id IS DISTINCT FROM p_tenant_id
    THEN
      RETURN jsonb_build_object(
        'status', 'state_conflict',
        'idempotent', false,
        'error_code', 'SHARED_RESOURCE_READ_ONLY'
      );
    END IF;
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'idempotent', false,
      'error_code', 'SUPPLIER_SKU_STATE_CONFLICT',
      'current_status', v_sku.status
    );
  ELSIF p_action = 'update' AND v_sku.id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'idempotent', false,
      'error_code', 'SUPPLIER_SKU_NOT_FOUND'
    );
  ELSIF p_action = 'update' AND (
    v_sku.supplier_id IS DISTINCT FROM p_supplier_id
    OR v_sku.supplier_product_id IS DISTINCT FROM p_supplier_product_id
    OR v_sku.ownership_scope IS DISTINCT FROM 'tenant'
    OR v_sku.owner_tenant_id IS DISTINCT FROM p_tenant_id
  ) THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'idempotent', false,
      'error_code', 'SHARED_RESOURCE_READ_ONLY'
    );
  END IF;

  IF p_action = 'update'
    AND v_sku.version IS DISTINCT FROM p_expected_sku_version
  THEN
    RETURN jsonb_build_object(
      'status', 'version_conflict',
      'idempotent', false,
      'error_code', 'SUPPLIER_SKU_VERSION_CONFLICT',
      'version', v_sku.version,
      'current_status', v_sku.status
    );
  END IF;
  IF p_action = 'update' AND v_sku.status = 'inactive' THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'idempotent', false,
      'error_code', 'SUPPLIER_SKU_STATE_CONFLICT',
      'version', v_sku.version,
      'current_status', v_sku.status
    );
  END IF;

  IF p_action = 'create' THEN
    v_purchase_unit_id := (p_sku ->> 'purchase_unit_id')::uuid;

    SELECT purchase_unit.base_unit_id
    INTO v_catalog_base_unit_id
    FROM public.catalog_units AS purchase_unit
    WHERE purchase_unit.id = v_purchase_unit_id;

    PERFORM unit_record.id
    FROM public.catalog_units AS unit_record
    WHERE unit_record.id = ANY (ARRAY[
      v_purchase_unit_id,
      v_catalog_base_unit_id
    ])
    ORDER BY unit_record.id
    FOR SHARE;

    SELECT purchase_unit.base_unit_id
    INTO v_locked_catalog_base_unit_id
    FROM public.catalog_units AS purchase_unit
    WHERE purchase_unit.id = v_purchase_unit_id
      AND purchase_unit.status = 'active';

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'status', 'state_conflict',
        'idempotent', false,
        'error_code', 'SUPPLIER_PURCHASABLE_SKU_SAVE_FAILED',
        'reason', 'purchase_unit_not_found'
      );
    END IF;

    IF v_locked_catalog_base_unit_id IS DISTINCT FROM v_catalog_base_unit_id THEN
      RETURN jsonb_build_object(
        'status', 'state_conflict',
        'idempotent', false,
        'error_code', 'SUPPLIER_PURCHASABLE_SKU_SAVE_FAILED',
        'reason', 'purchase_unit_base_changed'
      );
    END IF;

    IF v_catalog_base_unit_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.catalog_units AS base_unit
        WHERE base_unit.id = v_catalog_base_unit_id
          AND base_unit.status = 'active'
      )
    THEN
      RETURN jsonb_build_object(
        'status', 'state_conflict',
        'idempotent', false,
        'error_code', 'SUPPLIER_PURCHASABLE_SKU_SAVE_FAILED',
        'reason', 'purchase_unit_base_not_active'
      );
    END IF;
  ELSIF p_action = 'update' THEN
    PERFORM unit_record.id
    FROM public.catalog_units AS unit_record
    WHERE unit_record.id = ANY (ARRAY[
      v_sku.purchase_unit_id,
      v_sku.base_unit_id
    ])
    ORDER BY unit_record.id
    FOR SHARE;

    IF v_sku.purchase_unit_id IS NULL
      OR v_sku.base_unit_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.catalog_units AS purchase_unit
        WHERE purchase_unit.id = v_sku.purchase_unit_id
          AND purchase_unit.status = 'active'
      )
      OR NOT EXISTS (
        SELECT 1
        FROM public.catalog_units AS base_unit
        WHERE base_unit.id = v_sku.base_unit_id
          AND base_unit.status = 'active'
      )
    THEN
      RETURN jsonb_build_object(
        'status', 'state_conflict',
        'idempotent', false,
        'error_code', 'SUPPLIER_PURCHASABLE_SKU_SAVE_FAILED',
        'reason', 'current_unit_not_active'
      );
    END IF;
  END IF;

  IF p_action = 'update' THEN
    v_sku_fields_changed :=
      (p_sku ? 'name' AND btrim(p_sku ->> 'name') IS DISTINCT FROM v_sku.name)
      OR (
        p_sku ? 'specification'
        AND p_sku ->> 'specification' IS DISTINCT FROM v_sku.specification
      )
      OR (
        p_sku ? 'model'
        AND p_sku ->> 'model' IS DISTINCT FROM v_sku.model
      )
      OR (
        p_sku ? 'batch_managed'
        AND (p_sku ->> 'batch_managed')::boolean IS DISTINCT FROM
          v_sku.batch_managed
      )
      OR (
        p_sku ? 'color_managed'
        AND (p_sku ->> 'color_managed')::boolean IS DISTINCT FROM
          v_sku.color_managed
      )
      OR (
        p_sku ? 'serial_managed'
        AND (p_sku ->> 'serial_managed')::boolean IS DISTINCT FROM
          v_sku.serial_managed
      )
      OR (
        p_sku ? 'spec_values'
        AND p_sku -> 'spec_values' IS DISTINCT FROM v_sku.spec_values
      );
  END IF;

  v_price_version_created := false;

  -- Every mutation lives in this subtransaction. Raising from a child failure
  -- rolls back all preceding child writes before an error envelope is returned.
  BEGIN
    IF p_action = 'create' THEN
      v_child_key := v_parent_key || ':sku-create';
      SELECT public.command_supplier_sku_v3(
        p_action => 'create',
        p_ownership_scope => 'tenant',
        p_tenant_id => p_tenant_id,
        p_tenant_supplier_id => p_tenant_supplier_id,
        p_supplier_id => p_supplier_id,
        p_supplier_product_id => p_supplier_product_id,
        p_sku_id => p_supplier_sku_id,
        p_expected_version => NULL::integer,
        p_payload => v_effective_sku,
        p_actor_user_id => p_actor_user_id,
        p_actor_employee_id => p_actor_employee_id,
        p_idempotency_key => v_child_key
      ) INTO v_child_response;
      IF v_child_response ->> 'status' IS DISTINCT FROM 'created' THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'SUPPLIER_PURCHASABLE_SKU_SAVE_FAILED',
          DETAIL = COALESCE(v_child_response ->> 'error_code', 'sku_create_failed');
      END IF;
    ELSE
      IF v_sku_fields_changed THEN
        v_child_key := v_parent_key || ':sku-update';
        SELECT public.command_supplier_sku_v3(
          p_action => 'update',
          p_ownership_scope => 'tenant',
          p_tenant_id => p_tenant_id,
          p_tenant_supplier_id => p_tenant_supplier_id,
          p_supplier_id => p_supplier_id,
          p_supplier_product_id => p_supplier_product_id,
          p_sku_id => p_supplier_sku_id,
          p_expected_version => v_sku.version,
          p_payload => v_sku_payload,
          p_actor_user_id => p_actor_user_id,
          p_actor_employee_id => p_actor_employee_id,
          p_idempotency_key => v_child_key
        ) INTO v_child_response;
        IF v_child_response ->> 'status' IS DISTINCT FROM 'updated' THEN
          RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'SUPPLIER_PURCHASABLE_SKU_SAVE_FAILED',
            DETAIL = COALESCE(
              v_child_response ->> 'error_code',
              'sku_update_failed'
            );
        END IF;
      END IF;
    END IF;

    SELECT sku.*
    INTO v_sku
    FROM public.supplier_skus AS sku
    WHERE sku.id = p_supplier_sku_id
      AND sku.supplier_id = p_supplier_id
      AND sku.supplier_product_id = p_supplier_product_id
      AND sku.ownership_scope = 'tenant'
      AND sku.owner_tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASABLE_SKU_SAVE_FAILED',
        DETAIL = 'sku_not_found_after_write';
    END IF;

    IF p_action = 'create' OR v_sku.status = 'draft' THEN
      v_child_key := v_parent_key || ':sku-activate';
      SELECT public.command_supplier_sku_v3(
        p_action => 'activate',
        p_ownership_scope => 'tenant',
        p_tenant_id => p_tenant_id,
        p_tenant_supplier_id => p_tenant_supplier_id,
        p_supplier_id => p_supplier_id,
        p_supplier_product_id => p_supplier_product_id,
        p_sku_id => p_supplier_sku_id,
        p_expected_version => v_sku.version,
        p_payload => '{}'::jsonb,
        p_actor_user_id => p_actor_user_id,
        p_actor_employee_id => p_actor_employee_id,
        p_idempotency_key => v_child_key
      ) INTO v_child_response;
      IF v_child_response ->> 'status' IS DISTINCT FROM 'updated'
        OR v_child_response -> 'sku' ->> 'status' IS DISTINCT FROM 'active'
      THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'SUPPLIER_PURCHASABLE_SKU_SAVE_FAILED',
          DETAIL = COALESCE(v_child_response ->> 'error_code', 'sku_activate_failed');
      END IF;
    END IF;

    SELECT sku.*
    INTO v_sku
    FROM public.supplier_skus AS sku
    WHERE sku.id = p_supplier_sku_id
      AND sku.supplier_id = p_supplier_id
      AND sku.supplier_product_id = p_supplier_product_id
      AND sku.ownership_scope = 'tenant'
      AND sku.owner_tenant_id = p_tenant_id
    FOR UPDATE;

    IF v_product.status = 'draft' THEN
      v_child_key := v_parent_key || ':product-activate';
      SELECT public.command_supplier_product_v2(
        p_action => 'activate',
        p_ownership_scope => 'tenant',
        p_tenant_id => p_tenant_id,
        p_tenant_supplier_id => p_tenant_supplier_id,
        p_supplier_id => p_supplier_id,
        p_product_id => p_supplier_product_id,
        p_expected_version => v_product.version,
        p_payload => '{}'::jsonb,
        p_actor_user_id => p_actor_user_id,
        p_actor_employee_id => p_actor_employee_id,
        p_idempotency_key => v_child_key
      ) INTO v_child_response;
      IF v_child_response ->> 'status' IS DISTINCT FROM 'updated'
        OR v_child_response -> 'product' ->> 'status' IS DISTINCT FROM 'active'
      THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'SUPPLIER_PURCHASABLE_SKU_SAVE_FAILED',
          DETAIL = COALESCE(
            v_child_response ->> 'error_code',
            'product_activate_failed'
          );
      END IF;
    END IF;

    SELECT product.*
    INTO v_product
    FROM public.supplier_products AS product
    WHERE product.id = p_supplier_product_id
      AND product.supplier_id = p_supplier_id
      AND product.ownership_scope = 'tenant'
      AND product.owner_tenant_id = p_tenant_id
    FOR UPDATE;

    IF v_price_changed THEN
      IF v_future_price_list.id IS NOT NULL
        AND (
          v_current_price_list.id IS NULL
          OR v_source_price_list.id IS DISTINCT FROM v_current_price_list.id
          OR EXISTS (
            SELECT 1
            FROM public.supplier_price_lists AS occupied
            WHERE occupied.tenant_id = p_tenant_id
              AND occupied.tenant_supplier_id = p_tenant_supplier_id
              AND occupied.supplier_id = p_supplier_id
              AND upper(btrim(occupied.price_list_code)) = 'DEFAULT'
              AND occupied.scope_type = 'default'
              AND occupied.currency = 'CNY'
              AND occupied.version_number =
                v_source_price_list.version_number + 1
          )
          OR EXISTS (
            SELECT 1
            FROM public.supplier_price_list_items AS source_item
            WHERE source_item.supplier_price_list_id = v_source_price_list.id
              AND source_item.tenant_id = p_tenant_id
              AND source_item.supplier_id = p_supplier_id
              AND source_item.supplier_sku_id <> p_supplier_sku_id
          )
        )
      THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'SUPPLIER_PRICE_PERIOD_CONFLICT',
          DETAIL = 'future_version_cannot_be_preserved_by_v2';
      END IF;

      v_price_list_id := gen_random_uuid();
      IF v_source_price_list.id IS NULL THEN
        v_child_key := v_parent_key || ':price-list-create';
        SELECT public.command_supplier_price_list_v2(
          p_action => 'create',
          p_price_list_id => v_price_list_id,
          p_new_price_list_id => NULL::uuid,
          p_tenant_id => p_tenant_id,
          p_tenant_supplier_id => p_tenant_supplier_id,
          p_supplier_id => p_supplier_id,
          p_expected_version => NULL::integer,
          p_payload => jsonb_build_object(
            'price_list_code', 'DEFAULT',
            'name', '默认供货价',
            'currency', 'CNY',
            'effective_from', v_priced_at,
            'effective_until', v_immediate_effective_until
          ),
          p_actor_user_id => p_actor_user_id,
          p_actor_employee_id => p_actor_employee_id,
          p_idempotency_key => v_child_key
        ) INTO v_child_response;
      ELSE
        v_child_key := v_parent_key || ':price-list-new-version';
        SELECT public.command_supplier_price_list_v2(
          p_action => 'new_version',
          p_price_list_id => v_source_price_list.id,
          p_new_price_list_id => v_price_list_id,
          p_tenant_id => p_tenant_id,
          p_tenant_supplier_id => p_tenant_supplier_id,
          p_supplier_id => p_supplier_id,
          p_expected_version => v_source_price_list.row_version,
          p_payload => '{}'::jsonb,
          p_actor_user_id => p_actor_user_id,
          p_actor_employee_id => p_actor_employee_id,
          p_idempotency_key => v_child_key
        ) INTO v_child_response;
      END IF;

      IF v_child_response ->> 'status' IS DISTINCT FROM 'created' THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'SUPPLIER_PURCHASABLE_SKU_SAVE_FAILED',
          DETAIL = COALESCE(
            v_child_response ->> 'error_code',
            'price_list_prepare_failed'
          );
      END IF;
      v_price_list_version := (v_child_response ->> 'version')::integer;

      IF v_source_price_list.id IS NOT NULL THEN
        -- v2 already copies in one INSERT ... SELECT. This idempotent set repair
        -- also makes the composite contract independent of partial legacy data.
        INSERT INTO public.supplier_price_list_items (
          id, tenant_id, supplier_id, supplier_price_list_id,
          supplier_product_id, supplier_sku_id,
          minimum_quantity, maximum_quantity,
          purchase_unit_id, base_unit_id, base_unit_conversion,
          unit_price, tax_rate, tax_inclusive,
          acting_tenant_id, acting_employee_id, operation_source, proxy_reason,
          created_by_employee_id, updated_by_employee_id
        )
        SELECT
          gen_random_uuid(), p_tenant_id, p_supplier_id, v_price_list_id,
          source_item.supplier_product_id, source_item.supplier_sku_id,
          source_item.minimum_quantity, source_item.maximum_quantity,
          source_item.purchase_unit_id, source_item.base_unit_id,
          source_item.base_unit_conversion,
          source_item.unit_price, source_item.tax_rate,
          source_item.tax_inclusive,
          p_tenant_id, p_actor_employee_id, 'tenant', NULL,
          p_actor_employee_id, p_actor_employee_id
        FROM public.supplier_price_list_items AS source_item
        WHERE source_item.supplier_price_list_id = v_source_price_list.id
          AND source_item.tenant_id = p_tenant_id
          AND source_item.supplier_id = p_supplier_id
          AND NOT EXISTS (
            SELECT 1
            FROM public.supplier_price_list_items AS target_item
            WHERE target_item.supplier_price_list_id = v_price_list_id
              AND target_item.tenant_id = p_tenant_id
              AND target_item.supplier_id = p_supplier_id
              AND target_item.supplier_sku_id = source_item.supplier_sku_id
          );

        IF EXISTS (
          SELECT 1
          FROM public.supplier_price_list_items AS source_item
          WHERE source_item.supplier_price_list_id = v_source_price_list.id
            AND source_item.tenant_id = p_tenant_id
            AND source_item.supplier_id = p_supplier_id
            AND NOT EXISTS (
              SELECT 1
              FROM public.supplier_price_list_items AS target_item
              WHERE target_item.supplier_price_list_id = v_price_list_id
                AND target_item.tenant_id = source_item.tenant_id
                AND target_item.supplier_id = source_item.supplier_id
                AND target_item.supplier_product_id =
                  source_item.supplier_product_id
                AND target_item.supplier_sku_id = source_item.supplier_sku_id
                AND target_item.minimum_quantity = source_item.minimum_quantity
                AND target_item.maximum_quantity IS NOT DISTINCT FROM
                  source_item.maximum_quantity
                AND target_item.purchase_unit_id = source_item.purchase_unit_id
                AND target_item.base_unit_id = source_item.base_unit_id
                AND target_item.base_unit_conversion =
                  source_item.base_unit_conversion
                AND target_item.unit_price = source_item.unit_price
                AND target_item.tax_rate = source_item.tax_rate
                AND target_item.tax_inclusive = source_item.tax_inclusive
            )
        ) THEN
          RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'SUPPLIER_PURCHASABLE_SKU_SAVE_FAILED',
            DETAIL = 'price_list_copy_incomplete';
        END IF;

        v_child_key := v_parent_key || ':price-list-effective-period';
        SELECT public.command_supplier_price_list_v2(
          p_action => 'update',
          p_price_list_id => v_price_list_id,
          p_new_price_list_id => NULL::uuid,
          p_tenant_id => p_tenant_id,
          p_tenant_supplier_id => p_tenant_supplier_id,
          p_supplier_id => p_supplier_id,
          p_expected_version => v_price_list_version,
          p_payload => jsonb_build_object(
            'effective_from', v_priced_at,
            'effective_until', v_immediate_effective_until
          ),
          p_actor_user_id => p_actor_user_id,
          p_actor_employee_id => p_actor_employee_id,
          p_idempotency_key => v_child_key
        ) INTO v_child_response;
        IF v_child_response ->> 'status' IS DISTINCT FROM 'updated' THEN
          RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'SUPPLIER_PURCHASABLE_SKU_SAVE_FAILED',
            DETAIL = COALESCE(
              v_child_response ->> 'error_code',
              'price_period_update_failed'
            );
        END IF;
        v_price_list_version := (v_child_response ->> 'version')::integer;
      END IF;

      SELECT item.id
      INTO v_price_item_id
      FROM public.supplier_price_list_items AS item
      WHERE item.supplier_price_list_id = v_price_list_id
        AND item.tenant_id = p_tenant_id
        AND item.supplier_id = p_supplier_id
        AND item.supplier_sku_id = p_supplier_sku_id
      FOR UPDATE;
      v_price_item_id := COALESCE(v_price_item_id, gen_random_uuid());

      v_child_key := v_parent_key || ':price-item-upsert';
      SELECT public.command_supplier_price_item_v2(
        p_action => 'upsert',
        p_item_id => v_price_item_id,
        p_price_list_id => v_price_list_id,
        p_tenant_id => p_tenant_id,
        p_tenant_supplier_id => p_tenant_supplier_id,
        p_supplier_id => p_supplier_id,
        p_expected_version => v_price_list_version,
        p_payload => jsonb_build_object(
          'sku_id', p_supplier_sku_id,
          'unit_price', v_unit_price::text,
          'tax_rate', v_tax_rate::text,
          'tax_inclusive', p_price -> 'tax_inclusive'
        ),
        p_actor_user_id => p_actor_user_id,
        p_actor_employee_id => p_actor_employee_id,
        p_idempotency_key => v_child_key
      ) INTO v_child_response;
      IF v_child_response ->> 'status' IS DISTINCT FROM 'updated' THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'SUPPLIER_PURCHASABLE_SKU_SAVE_FAILED',
          DETAIL = COALESCE(
            v_child_response ->> 'error_code',
            'price_item_upsert_failed'
          );
      END IF;
      v_price_list_version := (v_child_response ->> 'version')::integer;

      IF v_source_price_list.id IS NOT NULL
        AND v_source_price_list.lifecycle_status = 'published'
        AND v_source_price_list.effective_from <= v_priced_at
        AND (
          v_source_price_list.effective_until IS NULL
          OR v_source_price_list.effective_until > v_priced_at
        )
      THEN
        v_child_key := v_parent_key || ':price-list-retire-source';
        SELECT public.command_supplier_price_list_v2(
          p_action => 'retire',
          p_price_list_id => v_source_price_list.id,
          p_new_price_list_id => NULL::uuid,
          p_tenant_id => p_tenant_id,
          p_tenant_supplier_id => p_tenant_supplier_id,
          p_supplier_id => p_supplier_id,
          p_expected_version => v_source_price_list.row_version,
          p_payload => '{}'::jsonb,
          p_actor_user_id => p_actor_user_id,
          p_actor_employee_id => p_actor_employee_id,
          p_idempotency_key => v_child_key
        ) INTO v_child_response;
        IF v_child_response ->> 'status' IS DISTINCT FROM 'retired' THEN
          RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'SUPPLIER_PURCHASABLE_SKU_SAVE_FAILED',
            DETAIL = COALESCE(
              v_child_response ->> 'error_code',
              'price_list_retire_failed'
            );
        END IF;
      END IF;

      v_child_key := v_parent_key || ':price-list-publish';
      SELECT public.command_supplier_price_list_v2(
        p_action => 'publish',
        p_price_list_id => v_price_list_id,
        p_new_price_list_id => NULL::uuid,
        p_tenant_id => p_tenant_id,
        p_tenant_supplier_id => p_tenant_supplier_id,
        p_supplier_id => p_supplier_id,
        p_expected_version => v_price_list_version,
        p_payload => '{}'::jsonb,
        p_actor_user_id => p_actor_user_id,
        p_actor_employee_id => p_actor_employee_id,
        p_idempotency_key => v_child_key
      ) INTO v_child_response;
      IF v_child_response ->> 'status' IS DISTINCT FROM 'published' THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'SUPPLIER_PURCHASABLE_SKU_SAVE_FAILED',
          DETAIL = COALESCE(
            v_child_response ->> 'error_code',
            'price_list_publish_failed'
          );
      END IF;

      SELECT price_list.*
      INTO v_effective_price_list
      FROM public.supplier_price_lists AS price_list
      WHERE price_list.id = v_price_list_id
        AND price_list.tenant_id = p_tenant_id
        AND price_list.tenant_supplier_id = p_tenant_supplier_id
        AND price_list.supplier_id = p_supplier_id
        AND price_list.lifecycle_status = 'published'
      FOR UPDATE;

      SELECT item.*
      INTO v_effective_price_item
      FROM public.supplier_price_list_items AS item
      WHERE item.id = v_price_item_id
        AND item.supplier_price_list_id = v_price_list_id
        AND item.tenant_id = p_tenant_id
        AND item.supplier_id = p_supplier_id
        AND item.supplier_product_id = p_supplier_product_id
        AND item.supplier_sku_id = p_supplier_sku_id;

      v_price_version_created := true;
    ELSE
      v_current_price := jsonb_build_object(
        'supplier_price_list_id', v_current_price_list.id,
        'supplier_price_list_version', v_current_price_list.version_number,
        'supplier_price_list_row_version', v_current_price_list.row_version,
        'supplier_price_list_item_id', v_current_price_item.id,
        'unit_price', v_current_price_item.unit_price::text,
        'tax_rate', v_current_price_item.tax_rate::text,
        'tax_inclusive', v_current_price_item.tax_inclusive,
        'effective_from', v_current_price_list.effective_from,
        'effective_until', v_current_price_list.effective_until
      );
      v_effective_price_list := v_current_price_list;
      v_effective_price_item := v_current_price_item;
    END IF;

    IF v_effective_price_list.id IS NULL
      OR v_effective_price_item.id IS NULL
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASABLE_SKU_SAVE_FAILED',
        DETAIL = 'effective_price_missing';
    END IF;

    v_effective_price_list_id := v_effective_price_list.id;
    v_effective_price_item_id := v_effective_price_item.id;
    v_effective_from := v_effective_price_list.effective_from;
    v_effective_until := v_effective_price_list.effective_until;
    v_purchase_unit_id := v_sku.purchase_unit_id;

    IF v_price_changed THEN
      v_current_price := jsonb_build_object(
        'supplier_price_list_id', v_effective_price_list.id,
        'supplier_price_list_version', v_effective_price_list.version_number,
        'supplier_price_list_row_version', v_effective_price_list.row_version,
        'supplier_price_list_item_id', v_effective_price_item.id,
        'unit_price', v_effective_price_item.unit_price::text,
        'tax_rate', v_effective_price_item.tax_rate::text,
        'tax_inclusive', v_effective_price_item.tax_inclusive,
        'effective_from', v_effective_price_list.effective_from,
        'effective_until', v_effective_price_list.effective_until
      );
    END IF;

    SELECT public.resolve_supplier_purchase_order_catalog(
      p_tenant_id,
      p_tenant_supplier_id,
      v_priced_at,
      v_effective_sku ->> 'sku_code',
      1,
      1
    ) INTO v_catalog_response;

    IF jsonb_typeof(v_catalog_response) <> 'object'
      OR jsonb_typeof(v_catalog_response -> 'total') <> 'number'
      OR COALESCE(v_catalog_response ->> 'total', '') !~ '^[0-9]+$'
      OR jsonb_typeof(v_catalog_response -> 'items') <> 'array'
      OR (v_catalog_response ->> 'total')::bigint <> 1
      OR jsonb_array_length(v_catalog_response -> 'items') <> 1
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASABLE_SKU_SAVE_FAILED',
        DETAIL = 'catalog_result_not_exact';
    END IF;

    v_catalog_item := v_catalog_response -> 'items' -> 0;
    IF jsonb_typeof(v_catalog_item) <> 'object'
      OR v_catalog_item ->> 'supplier_product_id' IS DISTINCT FROM
        p_supplier_product_id::text
      OR v_catalog_item ->> 'supplier_sku_id' IS DISTINCT FROM
        p_supplier_sku_id::text
      OR v_catalog_item ->> 'supplier_price_list_id' IS DISTINCT FROM
        v_effective_price_list_id::text
      OR v_catalog_item ->> 'supplier_price_list_item_id' IS DISTINCT FROM
        v_effective_price_item_id::text
      OR v_catalog_item ->> 'purchase_unit_id' IS DISTINCT FROM
        v_purchase_unit_id::text
      OR v_catalog_item ->> 'base_unit_id' IS DISTINCT FROM
        v_sku.base_unit_id::text
      OR (v_catalog_item ->> 'base_unit_conversion')::numeric(18, 8) <>
        v_sku.base_unit_conversion
      OR (v_catalog_item ->> 'unit_price')::numeric(14, 2) <> v_unit_price
      OR (v_catalog_item ->> 'tax_rate')::numeric(7, 6) <> v_tax_rate
      OR v_catalog_item -> 'tax_inclusive' IS DISTINCT FROM
        p_price -> 'tax_inclusive'
      OR (v_catalog_item ->> 'effective_from')::timestamptz IS DISTINCT FROM
        v_effective_from
      OR (v_catalog_item ->> 'effective_until')::timestamptz IS DISTINCT FROM
        v_effective_until
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASABLE_SKU_SAVE_FAILED',
        DETAIL = 'catalog_item_mismatch';
    END IF;

    v_response := jsonb_build_object(
      'status', 'saved',
      'idempotent', false,
      'price_version_created', v_price_version_created,
      'currency', 'CNY',
      'product', to_jsonb(v_product),
      'sku', to_jsonb(v_sku),
      'current_price', v_current_price,
      'catalog_item', v_catalog_item,
      'next_scheduled_effective_from', v_future_price_list.effective_from,
      'available_actions', jsonb_build_array('edit', 'deactivate')
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
    ) VALUES (
      p_tenant_id,
      'supplier_sku',
      p_supplier_sku_id,
      'supplier_purchasable_sku_v1:' || p_action,
      jsonb_build_object(
        '_fingerprint', v_parent_fingerprint,
        '_request', v_parent_request
      ),
      v_response,
      NULL,
      p_actor_user_id,
      p_actor_employee_id,
      v_parent_key,
      v_sku.version
    );
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
      IF v_constraint_name =
        'supplier_command_events_actor_user_id_idempotency_key_key'
      THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
      ELSIF v_constraint_name IN (
        'supplier_skus_pkey',
        'supplier_skus_id_supplier_key',
        'supplier_skus_tenant_code_unique_idx',
        'supplier_price_lists_pkey',
        'supplier_price_lists_id_supplier_key',
        'supplier_price_lists_id_tenant_supplier_key',
        'supplier_price_lists_tenant_series_version_uidx',
        'supplier_price_lists_tenant_one_draft_uidx',
        'supplier_price_list_items_pkey',
        'supplier_price_list_items_list_sku_key'
      ) THEN
        RETURN jsonb_build_object(
          'status', 'state_conflict',
          'idempotent', false,
          'error_code', 'SUPPLIER_PURCHASABLE_SKU_SAVE_FAILED',
          'reason', 'unique_conflict'
        );
      ELSE
        RAISE;
      END IF;
    WHEN SQLSTATE 'P0001' THEN
      GET STACKED DIAGNOSTICS
        v_error_message = MESSAGE_TEXT,
        v_error_detail = PG_EXCEPTION_DETAIL;
      IF v_error_message = 'SUPPLIER_IDEMPOTENCY_CONFLICT' THEN
        RAISE;
      ELSIF v_error_message = 'SUPPLIER_PRICE_PERIOD_CONFLICT' THEN
        RETURN jsonb_build_object(
          'status', 'state_conflict',
          'idempotent', false,
          'error_code', 'SUPPLIER_PRICE_PERIOD_CONFLICT',
          'reason', COALESCE(v_error_detail, 'period_conflict')
        );
      ELSIF v_error_message = 'SUPPLIER_PURCHASABLE_SKU_SAVE_FAILED' THEN
        RETURN jsonb_build_object(
          'status', 'state_conflict',
          'idempotent', false,
          'error_code', 'SUPPLIER_PURCHASABLE_SKU_SAVE_FAILED',
          'reason', COALESCE(v_error_detail, 'state_conflict')
        );
      ELSIF v_error_message IN (
        'SUPPLIER_PRODUCT_STATE_CONFLICT',
        'SUPPLIER_SKU_STATE_CONFLICT',
        'SUPPLIER_PRICE_LIST_INVALID_ACTION',
        'SUPPLIER_PRICE_LIST_VERSION_CONFLICT',
        'TENANT_SUPPLIER_NOT_FOUND',
        'SUPPLIER_ORDER_NOT_ELIGIBLE',
        'SUPPLIER_PROXY_ACTOR_INVALID',
        'SHARED_RESOURCE_READ_ONLY'
      ) THEN
        RETURN jsonb_build_object(
          'status', 'state_conflict',
          'idempotent', false,
          'error_code', v_error_message,
          'reason', COALESCE(v_error_detail, 'state_conflict')
        );
      ELSE
        RAISE;
      END IF;
  END;

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.get_supplier_purchasable_sku_price_context_v1(
  uuid, uuid, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_supplier_purchasable_sku_price_context_v1(
  uuid, uuid, uuid, uuid, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.command_supplier_purchasable_sku_v1(
  text, uuid, uuid, uuid, uuid, uuid, integer, jsonb, jsonb,
  uuid, integer, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.command_supplier_purchasable_sku_v1(
  text, uuid, uuid, uuid, uuid, uuid, integer, jsonb, jsonb,
  uuid, integer, uuid, uuid, text
) TO service_role;

COMMIT;
