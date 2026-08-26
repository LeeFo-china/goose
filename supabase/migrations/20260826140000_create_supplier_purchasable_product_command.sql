-- Rollback: forward-only. Disable the purchasable-product API route and revoke
-- EXECUTE on command_supplier_purchasable_product_v1 in a reviewed forward
-- migration. Preserve all product, SKU, price-list, item, and command-event
-- rows because published prices may already be referenced by procurement.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE FUNCTION public.command_supplier_purchasable_product_v1(
  p_product_id uuid,
  p_sku_id uuid,
  p_tenant_id uuid,
  p_tenant_supplier_id uuid,
  p_supplier_id uuid,
  p_product jsonb,
  p_sku jsonb,
  p_price jsonb,
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
  v_relationship public.tenant_suppliers%ROWTYPE;
  v_source_price_list public.supplier_price_lists%ROWTYPE;
  v_parent_request jsonb;
  v_parent_fingerprint text;
  v_parent_key text;
  v_child_key text;
  v_product_response jsonb;
  v_sku_response jsonb;
  v_price_list_response jsonb;
  v_price_item_response jsonb;
  v_catalog_response jsonb;
  v_catalog_item jsonb;
  v_response jsonb;
  v_category_id uuid;
  v_brand_id uuid;
  v_purchase_unit_id uuid;
  v_price_list_id uuid;
  v_price_item_id uuid;
  v_price_list_version integer;
  v_constraint_name text;
  v_error_message text;
  v_error_detail text;
  v_unit_price numeric(14, 2);
  v_tax_rate numeric(7, 6);
  v_priced_at timestamptz := pg_catalog.transaction_timestamp();
BEGIN
  -- This entire validation block intentionally precedes every advisory or row
  -- lock. The HTTP schema is not a trust boundary for direct RPC callers.
  IF p_product_id IS NULL
    OR p_sku_id IS NULL
    OR p_product_id = p_sku_id
    OR p_tenant_id IS NULL
    OR p_tenant_supplier_id IS NULL
    OR p_supplier_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_product IS NULL
    OR jsonb_typeof(p_product) <> 'object'
    OR p_sku IS NULL
    OR jsonb_typeof(p_sku) <> 'object'
    OR p_price IS NULL
    OR jsonb_typeof(p_price) <> 'object'
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'idempotent', false,
      'error_code', 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
      'reason', 'validation_error'
    );
  END IF;

  IF NOT (p_product ? 'product_code')
    OR NOT (p_product ? 'name')
    OR NOT (p_product ? 'category_id')
    OR NOT (p_product ? 'brand_id')
    OR jsonb_typeof(p_product -> 'product_code') <> 'string'
    OR jsonb_typeof(p_product -> 'name') <> 'string'
    OR jsonb_typeof(p_product -> 'category_id') <> 'string'
    OR jsonb_typeof(p_product -> 'brand_id') <> 'string'
    OR NULLIF(btrim(p_product ->> 'name'), '') IS NULL
    OR btrim(p_product ->> 'name') IS DISTINCT FROM (p_product ->> 'name')
    OR char_length(p_product ->> 'name') > 160
    OR (p_product ->> 'product_code') IS DISTINCT FROM
      'TP-' || left(replace(p_product_id::text, '-', ''), 16)
    OR COALESCE(p_product ->> 'category_id', '') !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR COALESCE(p_product ->> 'brand_id', '') !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR (
      p_product ? 'description'
      AND jsonb_typeof(p_product -> 'description') NOT IN ('string', 'null')
    )
    OR (
      jsonb_typeof(p_product -> 'description') = 'string'
      AND (
        NULLIF(btrim(p_product ->> 'description'), '') IS NULL
        OR btrim(p_product ->> 'description') IS DISTINCT FROM
          (p_product ->> 'description')
      )
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_object_keys(p_product) AS field(key)
      WHERE field.key NOT IN (
        'product_code', 'name', 'category_id', 'brand_id', 'description'
      )
    )
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'idempotent', false,
      'error_code', 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
      'reason', 'invalid_product'
    );
  END IF;

  IF NOT (p_sku ? 'sku_code')
    OR NOT (p_sku ? 'name')
    OR NOT (p_sku ? 'purchase_unit_id')
    OR NOT (p_sku ? 'spec_values')
    OR jsonb_typeof(p_sku -> 'sku_code') <> 'string'
    OR jsonb_typeof(p_sku -> 'name') <> 'string'
    OR jsonb_typeof(p_sku -> 'purchase_unit_id') <> 'string'
    OR jsonb_typeof(p_sku -> 'spec_values') <> 'object'
    OR NULLIF(btrim(p_sku ->> 'name'), '') IS NULL
    OR btrim(p_sku ->> 'name') IS DISTINCT FROM (p_sku ->> 'name')
    OR char_length(p_sku ->> 'name') > 160
    OR (p_sku ->> 'sku_code') IS DISTINCT FROM
      'TS-' || left(replace(p_sku_id::text, '-', ''), 16)
    OR COALESCE(p_sku ->> 'purchase_unit_id', '') !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR (
      p_sku ? 'specification'
      AND jsonb_typeof(p_sku -> 'specification') NOT IN ('string', 'null')
    )
    OR (
      jsonb_typeof(p_sku -> 'specification') = 'string'
      AND (
        NULLIF(btrim(p_sku ->> 'specification'), '') IS NULL
        OR btrim(p_sku ->> 'specification') IS DISTINCT FROM
          (p_sku ->> 'specification')
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
        OR btrim(p_sku ->> 'model') IS DISTINCT FROM (p_sku ->> 'model')
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
    OR EXISTS (
      SELECT 1
      FROM jsonb_each(p_sku -> 'spec_values') AS spec(key, value)
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
    OR EXISTS (
      SELECT 1
      FROM jsonb_object_keys(p_sku) AS field(key)
      WHERE field.key NOT IN (
        'sku_code', 'name', 'specification', 'model', 'purchase_unit_id',
        'batch_managed', 'color_managed', 'serial_managed', 'spec_values'
      )
    )
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'idempotent', false,
      'error_code', 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
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
      '^(0|1)(\.[0-9]{1,6})?$'
    OR EXISTS (
      SELECT 1
      FROM jsonb_object_keys(p_price) AS field(key)
      WHERE field.key NOT IN ('unit_price', 'tax_rate', 'tax_inclusive')
    )
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'idempotent', false,
      'error_code', 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
      'reason', 'invalid_price'
    );
  END IF;

  v_category_id := (p_product ->> 'category_id')::uuid;
  v_brand_id := (p_product ->> 'brand_id')::uuid;
  v_purchase_unit_id := (p_sku ->> 'purchase_unit_id')::uuid;
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
      'error_code', 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
      'reason', 'invalid_price'
    );
  END IF;

  v_parent_request := jsonb_build_object(
    'product_id', p_product_id,
    'sku_id', p_sku_id,
    'tenant_id', p_tenant_id,
    'tenant_supplier_id', p_tenant_supplier_id,
    'supplier_id', p_supplier_id,
    'product', p_product,
    'sku', p_sku,
    'price', p_price,
    'actor_user_id', p_actor_user_id,
    'actor_employee_id', p_actor_employee_id,
    'idempotency_key', btrim(p_idempotency_key)
  );
  v_parent_fingerprint := pg_catalog.md5(v_parent_request::text);
  v_parent_key := 'supplier-purchasable-product:' ||
    pg_catalog.md5(btrim(p_idempotency_key));

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_parent_key, 20260826140000)
  );

  SELECT event.*
  INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = v_parent_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_product'
      OR v_event.resource_id <> p_product_id
      OR v_event.command <> 'supplier_purchasable_product_v1:create'
      OR v_event.from_state ->> '_fingerprint' IS DISTINCT FROM
        v_parent_fingerprint
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_parent_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;

    RETURN jsonb_set(v_event.to_state, '{idempotent}', 'true'::jsonb, true);
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

  SELECT relationship.*
  INTO v_relationship
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
  FOR UPDATE OF relationship;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'idempotent', false,
      'error_code', 'SUPPLIER_ORDER_NOT_ELIGIBLE',
      'reason', 'tenant_supplier_unavailable'
    );
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-price-series:' || p_tenant_id::text || ':' ||
        p_supplier_id::text || ':default',
      6720240729160000
    )
  );

  PERFORM price_list.id
  FROM public.supplier_price_lists AS price_list
  WHERE price_list.tenant_id = p_tenant_id
    AND price_list.tenant_supplier_id = p_tenant_supplier_id
    AND price_list.supplier_id = p_supplier_id
    AND upper(btrim(price_list.price_list_code)) = 'DEFAULT'
    AND price_list.scope_type = 'default'
    AND price_list.currency = 'CNY'
  ORDER BY price_list.version_number, price_list.id
  FOR UPDATE;

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
  ) THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'idempotent', false,
      'error_code', 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
      'reason', 'default_price_list_draft_exists'
    );
  END IF;

  SELECT price_list.*
  INTO v_source_price_list
  FROM public.supplier_price_lists AS price_list
  WHERE price_list.tenant_id = p_tenant_id
    AND price_list.tenant_supplier_id = p_tenant_supplier_id
    AND price_list.supplier_id = p_supplier_id
    AND upper(btrim(price_list.price_list_code)) = 'DEFAULT'
    AND price_list.scope_type = 'default'
    AND price_list.currency = 'CNY'
    AND price_list.lifecycle_status IN ('published', 'retired')
  ORDER BY
    CASE WHEN price_list.lifecycle_status = 'published' THEN 0 ELSE 1 END,
    price_list.version_number DESC,
    price_list.id DESC
  LIMIT 1;

  IF (
    SELECT count(*)
    FROM public.supplier_price_lists AS published
    WHERE published.tenant_id = p_tenant_id
      AND published.tenant_supplier_id = p_tenant_supplier_id
      AND published.supplier_id = p_supplier_id
      AND upper(btrim(published.price_list_code)) = 'DEFAULT'
      AND published.scope_type = 'default'
      AND published.currency = 'CNY'
      AND published.lifecycle_status = 'published'
  ) > 1 THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'idempotent', false,
      'error_code', 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
      'reason', 'multiple_published_default_price_lists'
    );
  END IF;

  PERFORM category.id
  FROM public.catalog_categories AS category
  WHERE category.id = v_category_id
    AND category.status = 'active'
    AND (
      (category.ownership_scope = 'platform' AND category.owner_tenant_id IS NULL)
      OR (
        category.ownership_scope = 'tenant'
        AND category.owner_tenant_id = p_tenant_id
      )
    )
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'idempotent', false,
      'error_code', 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
      'reason', 'category_not_found'
    );
  END IF;

  PERFORM brand.id
  FROM public.catalog_brands AS brand
  WHERE brand.id = v_brand_id
    AND brand.status = 'active'
    AND (
      (brand.ownership_scope = 'platform' AND brand.owner_tenant_id IS NULL)
      OR (
        brand.ownership_scope = 'tenant'
        AND brand.owner_tenant_id = p_tenant_id
      )
    )
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'idempotent', false,
      'error_code', 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
      'reason', 'brand_not_found'
    );
  END IF;

  PERFORM unit_record.id
  FROM public.catalog_units AS unit_record
  WHERE unit_record.id = v_purchase_unit_id
    AND unit_record.status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'idempotent', false,
      'error_code', 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
      'reason', 'purchase_unit_not_found'
    );
  END IF;

  PERFORM product.id
  FROM public.supplier_products AS product
  WHERE product.id = p_product_id
    OR (
      product.supplier_id = p_supplier_id
      AND product.ownership_scope = 'tenant'
      AND product.owner_tenant_id = p_tenant_id
      AND upper(btrim(product.product_code)) =
        upper(btrim(p_product ->> 'product_code'))
    )
  ORDER BY product.id
  FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'idempotent', false,
      'error_code', 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
      'reason', 'product_conflict'
    );
  END IF;

  PERFORM sku.id
  FROM public.supplier_skus AS sku
  WHERE sku.id = p_sku_id
    OR (
      sku.supplier_id = p_supplier_id
      AND sku.ownership_scope = 'tenant'
      AND sku.owner_tenant_id = p_tenant_id
      AND upper(btrim(sku.sku_code)) = upper(btrim(p_sku ->> 'sku_code'))
    )
  ORDER BY sku.id
  FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'idempotent', false,
      'error_code', 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
      'reason', 'sku_conflict'
    );
  END IF;

  BEGIN
    v_child_key := v_parent_key || ':product-create';
    SELECT public.command_supplier_product_v2(
      p_action => 'create',
      p_ownership_scope => 'tenant',
      p_tenant_id => p_tenant_id,
      p_tenant_supplier_id => p_tenant_supplier_id,
      p_supplier_id => p_supplier_id,
      p_product_id => p_product_id,
      p_expected_version => NULL::integer,
      p_payload => p_product,
      p_actor_user_id => p_actor_user_id,
      p_actor_employee_id => p_actor_employee_id,
      p_idempotency_key => v_child_key
    ) INTO v_product_response;
    IF v_product_response ->> 'status' IS DISTINCT FROM 'created' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
        DETAIL = COALESCE(
          v_product_response ->> 'error_code',
          'product_create_failed'
        );
    END IF;

    v_child_key := v_parent_key || ':product-activate';
    SELECT public.command_supplier_product_v2(
      p_action => 'activate',
      p_ownership_scope => 'tenant',
      p_tenant_id => p_tenant_id,
      p_tenant_supplier_id => p_tenant_supplier_id,
      p_supplier_id => p_supplier_id,
      p_product_id => p_product_id,
      p_expected_version => (v_product_response ->> 'version')::integer,
      p_payload => '{}'::jsonb,
      p_actor_user_id => p_actor_user_id,
      p_actor_employee_id => p_actor_employee_id,
      p_idempotency_key => v_child_key
    ) INTO v_product_response;
    IF v_product_response ->> 'status' IS DISTINCT FROM 'updated'
      OR v_product_response -> 'product' ->> 'status' IS DISTINCT FROM 'active'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
        DETAIL = COALESCE(
          v_product_response ->> 'error_code',
          'product_activate_failed'
        );
    END IF;

    v_child_key := v_parent_key || ':sku-create';
    SELECT public.command_supplier_sku_v2(
      p_action => 'create',
      p_ownership_scope => 'tenant',
      p_tenant_id => p_tenant_id,
      p_tenant_supplier_id => p_tenant_supplier_id,
      p_supplier_id => p_supplier_id,
      p_supplier_product_id => p_product_id,
      p_sku_id => p_sku_id,
      p_expected_version => NULL::integer,
      p_payload => p_sku,
      p_actor_user_id => p_actor_user_id,
      p_actor_employee_id => p_actor_employee_id,
      p_idempotency_key => v_child_key
    ) INTO v_sku_response;
    IF v_sku_response ->> 'status' IS DISTINCT FROM 'created' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
        DETAIL = COALESCE(v_sku_response ->> 'error_code', 'sku_create_failed');
    END IF;

    v_child_key := v_parent_key || ':sku-activate';
    SELECT public.command_supplier_sku_v2(
      p_action => 'activate',
      p_ownership_scope => 'tenant',
      p_tenant_id => p_tenant_id,
      p_tenant_supplier_id => p_tenant_supplier_id,
      p_supplier_id => p_supplier_id,
      p_supplier_product_id => p_product_id,
      p_sku_id => p_sku_id,
      p_expected_version => (v_sku_response ->> 'version')::integer,
      p_payload => '{}'::jsonb,
      p_actor_user_id => p_actor_user_id,
      p_actor_employee_id => p_actor_employee_id,
      p_idempotency_key => v_child_key
    ) INTO v_sku_response;
    IF v_sku_response ->> 'status' IS DISTINCT FROM 'updated'
      OR v_sku_response -> 'sku' ->> 'status' IS DISTINCT FROM 'active'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
        DETAIL = COALESCE(
          v_sku_response ->> 'error_code',
          'sku_activate_failed'
        );
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
          'effective_until', NULL
        ),
        p_actor_user_id => p_actor_user_id,
        p_actor_employee_id => p_actor_employee_id,
        p_idempotency_key => v_child_key
      ) INTO v_price_list_response;
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
      ) INTO v_price_list_response;

      IF v_price_list_response ->> 'status' IS DISTINCT FROM 'created' THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
          DETAIL = COALESCE(
            v_price_list_response ->> 'error_code',
            'price_list_version_failed'
          );
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.supplier_price_list_items AS old_item
        WHERE old_item.supplier_price_list_id = v_source_price_list.id
          AND old_item.tenant_id = p_tenant_id
          AND old_item.supplier_id = p_supplier_id
          AND NOT EXISTS (
            SELECT 1
            FROM public.supplier_price_list_items AS copied_item
            WHERE copied_item.supplier_price_list_id = v_price_list_id
              AND copied_item.tenant_id = old_item.tenant_id
              AND copied_item.supplier_id = old_item.supplier_id
              AND copied_item.supplier_product_id = old_item.supplier_product_id
              AND copied_item.supplier_sku_id = old_item.supplier_sku_id
              AND copied_item.minimum_quantity = old_item.minimum_quantity
              AND copied_item.maximum_quantity IS NOT DISTINCT FROM
                old_item.maximum_quantity
              AND copied_item.purchase_unit_id = old_item.purchase_unit_id
              AND copied_item.base_unit_id = old_item.base_unit_id
              AND copied_item.base_unit_conversion =
                old_item.base_unit_conversion
              AND copied_item.unit_price = old_item.unit_price
              AND copied_item.tax_rate = old_item.tax_rate
              AND copied_item.tax_inclusive = old_item.tax_inclusive
          )
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
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
        p_expected_version =>
          (v_price_list_response ->> 'version')::integer,
        p_payload => jsonb_build_object(
          'effective_from', v_priced_at,
          'effective_until', NULL
        ),
        p_actor_user_id => p_actor_user_id,
        p_actor_employee_id => p_actor_employee_id,
        p_idempotency_key => v_child_key
      ) INTO v_price_list_response;
    END IF;

    IF COALESCE(v_price_list_response ->> 'status', '') NOT IN (
      'created', 'updated'
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
        DETAIL = COALESCE(
          v_price_list_response ->> 'error_code',
          'price_list_prepare_failed'
        );
    END IF;
    v_price_list_version := (v_price_list_response ->> 'version')::integer;

    v_price_item_id := gen_random_uuid();
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
        'sku_id', p_sku_id,
        'unit_price', p_price ->> 'unit_price',
        'tax_rate', p_price ->> 'tax_rate',
        'tax_inclusive', p_price -> 'tax_inclusive'
      ),
      p_actor_user_id => p_actor_user_id,
      p_actor_employee_id => p_actor_employee_id,
      p_idempotency_key => v_child_key
    ) INTO v_price_item_response;
    IF v_price_item_response ->> 'status' IS DISTINCT FROM 'updated' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
        DETAIL = COALESCE(
          v_price_item_response ->> 'error_code',
          'price_item_upsert_failed'
        );
    END IF;
    v_price_list_version := (v_price_item_response ->> 'version')::integer;

    IF v_source_price_list.lifecycle_status = 'published' THEN
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
      ) INTO v_price_list_response;
      IF v_price_list_response ->> 'status' IS DISTINCT FROM 'retired' THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
          DETAIL = COALESCE(
            v_price_list_response ->> 'error_code',
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
    ) INTO v_price_list_response;
    IF v_price_list_response ->> 'status' IS DISTINCT FROM 'published' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
        DETAIL = COALESCE(
          v_price_list_response ->> 'error_code',
          'price_list_publish_failed'
        );
    END IF;

    SELECT public.resolve_supplier_purchase_order_catalog(
      p_tenant_id,
      p_tenant_supplier_id,
      v_priced_at,
      p_sku ->> 'sku_code',
      1,
      100
    ) INTO v_catalog_response;

    IF jsonb_typeof(v_catalog_response) <> 'object'
      OR jsonb_typeof(v_catalog_response -> 'total') <> 'number'
      OR COALESCE(v_catalog_response ->> 'total', '') !~ '^[0-9]+$'
      OR jsonb_typeof(v_catalog_response -> 'items') <> 'array'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
        DETAIL = 'catalog_result_not_exact';
    END IF;

    -- sku_code is UUID-derived and unique for this newly-created tenant SKU.
    -- The resolver is intentionally fuzzy, so its untruncated total must also
    -- prove that no product/name/code false-positive matched the same keyword.
    IF (v_catalog_response ->> 'total')::bigint <> 1
      OR jsonb_array_length(v_catalog_response -> 'items') <> 1
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
        DETAIL = 'catalog_result_not_exact';
    END IF;

    v_catalog_item := v_catalog_response -> 'items' -> 0;

    IF jsonb_typeof(v_catalog_item) <> 'object'
      OR v_catalog_item ->> 'supplier_product_id' IS DISTINCT FROM
        p_product_id::text
      OR v_catalog_item ->> 'supplier_sku_id' IS DISTINCT FROM p_sku_id::text
      OR v_catalog_item ->> 'supplier_price_list_id' IS DISTINCT FROM
        v_price_list_id::text
      OR v_catalog_item ->> 'supplier_price_list_item_id' IS DISTINCT FROM
        v_price_item_id::text
      OR v_catalog_item ->> 'purchase_unit_id' IS DISTINCT FROM
        v_purchase_unit_id::text
      OR jsonb_typeof(v_catalog_item -> 'tax_inclusive') <> 'boolean'
      OR v_catalog_item -> 'tax_inclusive' IS DISTINCT FROM
        p_price -> 'tax_inclusive'
      OR v_price_item_response -> 'item' ->> 'id' IS DISTINCT FROM
        v_price_item_id::text
      OR v_price_item_response -> 'item' ->> 'supplier_price_list_id'
        IS DISTINCT FROM v_price_list_id::text
      OR v_price_item_response -> 'item' ->> 'supplier_product_id'
        IS DISTINCT FROM p_product_id::text
      OR v_price_item_response -> 'item' ->> 'supplier_sku_id'
        IS DISTINCT FROM p_sku_id::text
      OR v_price_list_response -> 'price_list' ->> 'id' IS DISTINCT FROM
        v_price_list_id::text
      OR v_price_list_response -> 'price_list' ->> 'tenant_supplier_id'
        IS DISTINCT FROM p_tenant_supplier_id::text
      OR v_price_list_response -> 'price_list' ->> 'supplier_id'
        IS DISTINCT FROM p_supplier_id::text
      OR v_price_list_response -> 'price_list' ->> 'currency'
        IS DISTINCT FROM 'CNY'
      OR v_price_list_response -> 'price_list' ->> 'lifecycle_status'
        IS DISTINCT FROM 'published'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
        DETAIL = 'catalog_item_mismatch';
    END IF;

    IF COALESCE(v_catalog_item ->> 'unit_price', '') !~
        '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$'
      OR COALESCE(v_catalog_item ->> 'tax_rate', '') !~
        '^(0|1)(\.[0-9]{1,6})?$'
      OR COALESCE(v_price_item_response -> 'item' ->> 'unit_price', '') !~
        '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$'
      OR COALESCE(v_price_item_response -> 'item' ->> 'tax_rate', '') !~
        '^(0|1)(\.[0-9]{1,6})?$'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
        DETAIL = 'catalog_item_mismatch';
    END IF;

    IF (v_catalog_item ->> 'unit_price')::numeric(14, 2) <>
        v_unit_price
      OR (v_catalog_item ->> 'tax_rate')::numeric(7, 6) <> v_tax_rate
      OR (v_price_item_response -> 'item' ->> 'unit_price')::numeric(14, 2)
        <> v_unit_price
      OR (v_price_item_response -> 'item' ->> 'tax_rate')::numeric(7, 6)
        <> v_tax_rate
      OR v_price_item_response -> 'item' -> 'tax_inclusive'
        IS DISTINCT FROM p_price -> 'tax_inclusive'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
        DETAIL = 'catalog_item_mismatch';
    END IF;

    v_response := jsonb_build_object(
      'status', 'created',
      'idempotent', false,
      'product', v_product_response -> 'product',
      'sku', v_sku_response -> 'sku',
      'price', v_price_item_response -> 'item',
      'catalog_item', v_catalog_item
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
      'supplier_product',
      p_product_id,
      'supplier_purchasable_product_v1:create',
      jsonb_build_object(
        '_fingerprint', v_parent_fingerprint,
        '_request', v_parent_request
      ),
      v_response,
      NULL,
      p_actor_user_id,
      p_actor_employee_id,
      v_parent_key,
      (v_product_response ->> 'version')::integer
    );
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
      IF v_constraint_name IN (
        'supplier_products_pkey',
        'supplier_products_id_supplier_key',
        'supplier_products_tenant_code_unique_idx',
        'supplier_skus_pkey',
        'supplier_skus_id_supplier_key',
        'supplier_skus_tenant_code_unique_idx'
      ) THEN
        RETURN jsonb_build_object(
          'status', 'state_conflict',
          'idempotent', false,
          'error_code', 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
          'reason', 'unique_conflict'
        );
      ELSIF v_constraint_name =
        'supplier_command_events_actor_user_id_idempotency_key_key'
      THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
      ELSE
        RAISE;
      END IF;
    WHEN SQLSTATE 'P0001' THEN
      GET STACKED DIAGNOSTICS
        v_error_message = MESSAGE_TEXT,
        v_error_detail = PG_EXCEPTION_DETAIL;
      IF v_error_message = 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED' THEN
        RETURN jsonb_build_object(
          'status', 'state_conflict',
          'idempotent', false,
          'error_code', 'SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED',
          'reason', COALESCE(v_error_detail, 'state_conflict')
        );
      ELSIF v_error_message = 'SUPPLIER_PROXY_ACTOR_INVALID' THEN
        RETURN jsonb_build_object(
          'status', 'validation_error',
          'idempotent', false,
          'error_code', 'SUPPLIER_PROXY_ACTOR_INVALID',
          'reason', 'actor_invalid'
        );
      ELSIF v_error_message IN (
        'TENANT_SUPPLIER_NOT_FOUND',
        'SUPPLIER_NOT_FOUND',
        'SUPPLIER_ORDER_NOT_ELIGIBLE',
        'SUPPLIER_PRODUCT_STATE_CONFLICT',
        'SUPPLIER_SKU_STATE_CONFLICT',
        'SUPPLIER_PRICE_LIST_INVALID_ACTION',
        'UNIT_CONVERSION_INVALID'
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

REVOKE ALL ON FUNCTION public.command_supplier_purchasable_product_v1(
  uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, jsonb, uuid, uuid, text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.command_supplier_purchasable_product_v1(
  uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, jsonb, uuid, uuid, text
)
TO service_role;

COMMIT;
