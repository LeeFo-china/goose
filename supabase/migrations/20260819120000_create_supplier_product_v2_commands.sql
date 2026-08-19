-- Rollback: forward-only. Disable the three v2 API write routes, revoke EXECUTE
-- on the v2 commands, then replace the product/SKU operation_source checks with
-- their previous ('tenant_proxy', 'platform') definitions. Preserve all product,
-- SKU, conversion and supplier_command_events rows; never reopen legacy writers.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

ALTER TABLE public.supplier_products
  DROP CONSTRAINT supplier_products_operation_source_check,
  ADD CONSTRAINT supplier_products_operation_source_check
    CHECK (operation_source IN ('tenant_proxy', 'platform', 'tenant'));

ALTER TABLE public.supplier_skus
  DROP CONSTRAINT supplier_skus_operation_source_check,
  ADD CONSTRAINT supplier_skus_operation_source_check
    CHECK (operation_source IN ('tenant_proxy', 'platform', 'tenant'));

CREATE FUNCTION public.assert_supplier_product_v2_context(
  p_ownership_scope text,
  p_tenant_id uuid,
  p_tenant_supplier_id uuid,
  p_supplier_id uuid,
  p_actor_user_id uuid,
  p_actor_employee_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_snapshot_role_ids uuid[];
  v_current_role_ids uuid[];
  v_platform_role_ids uuid[];
  v_platform_role_codes text[];
  v_permission_id uuid;
  v_has_role_permission boolean;
  v_override_effect text;
BEGIN
  IF p_ownership_scope NOT IN ('platform', 'tenant')
    OR p_supplier_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_PROXY_ACTOR_INVALID';
  END IF;

  IF p_ownership_scope = 'platform' THEN
    IF p_tenant_id IS NOT NULL OR p_tenant_supplier_id IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_PROXY_ACTOR_INVALID';
    END IF;

    SELECT COALESCE(array_agg(
      employee_role.role_id ORDER BY employee_role.role_id
    ), '{}'::uuid[])
    INTO v_snapshot_role_ids
    FROM public.employee_roles AS employee_role
    WHERE employee_role.employee_id = p_actor_employee_id;

    SELECT
      COALESCE(array_agg(locked.id ORDER BY locked.id), '{}'::uuid[]),
      COALESCE(array_agg(locked.code ORDER BY locked.code), '{}'::text[])
    INTO v_platform_role_ids, v_platform_role_codes
    FROM (
      SELECT role.id, role.code
      FROM public.roles AS role
      WHERE role.id = ANY(v_snapshot_role_ids)
        AND role.tenant_id IS NULL
        AND role.status = 'active'
      ORDER BY role.id
      FOR SHARE
    ) AS locked;

    IF NOT (
      'platform_admin' = ANY(v_platform_role_codes)
      OR 'platform_staff' = ANY(v_platform_role_codes)
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'PLATFORM_PERMISSION_REQUIRED';
    END IF;

    PERFORM employee.id
    FROM public.employees AS employee
    WHERE employee.id = p_actor_employee_id
      AND employee.user_id = p_actor_user_id
      AND employee.tenant_id IS NULL
      AND employee.status = 'active'
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'PLATFORM_PERMISSION_REQUIRED';
    END IF;

    SELECT COALESCE(array_agg(
      locked.role_id ORDER BY locked.role_id, locked.id
    ), '{}'::uuid[])
    INTO v_current_role_ids
    FROM (
      SELECT employee_role.id, employee_role.role_id
      FROM public.employee_roles AS employee_role
      WHERE employee_role.employee_id = p_actor_employee_id
      ORDER BY employee_role.role_id, employee_role.id
      FOR SHARE
    ) AS locked;

    IF v_current_role_ids IS DISTINCT FROM v_snapshot_role_ids THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'PLATFORM_PERMISSION_REQUIRED';
    END IF;

    SELECT permission.id INTO v_permission_id
    FROM public.permissions AS permission
    WHERE permission.code = 'platform.supplier-product.manage'
      AND permission.status = 'active'
    FOR SHARE;

    IF v_permission_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'PLATFORM_PERMISSION_REQUIRED';
    END IF;

    SELECT COALESCE(bool_or(true), false)
    INTO v_has_role_permission
    FROM (
      SELECT role_permission.id
      FROM public.role_permissions AS role_permission
      WHERE role_permission.role_id = ANY(v_platform_role_ids)
        AND role_permission.permission_id = v_permission_id
      ORDER BY role_permission.id
      FOR SHARE
    ) AS locked;

    SELECT override_record.effect
    INTO v_override_effect
    FROM public.employee_permission_overrides AS override_record
    WHERE override_record.employee_id = p_actor_employee_id
      AND override_record.permission_id = v_permission_id
    FOR SHARE;

    IF COALESCE(v_override_effect = 'deny', false)
      OR NOT (
        'platform_admin' = ANY(v_platform_role_codes)
        OR v_has_role_permission
        OR COALESCE(v_override_effect = 'allow', false)
      )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'PLATFORM_PERMISSION_REQUIRED';
    END IF;

    PERFORM supplier.id
    FROM public.suppliers AS supplier
    WHERE supplier.id = p_supplier_id
      AND supplier.ownership_scope = 'platform'
      AND supplier.owner_tenant_id IS NULL
      AND supplier.onboarding_status = 'approved'
      AND supplier.operational_status = 'active'
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_NOT_FOUND';
    END IF;
    RETURN;
  END IF;

  IF p_tenant_id IS NULL OR p_tenant_supplier_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'TENANT_SUPPLIER_NOT_FOUND';
  END IF;

  PERFORM employee.id
  FROM public.employees AS employee
  WHERE employee.id = p_actor_employee_id
    AND employee.user_id = p_actor_user_id
    AND employee.tenant_id = p_tenant_id
    AND employee.status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_PROXY_ACTOR_INVALID';
  END IF;

  PERFORM tenant_supplier.id
  FROM public.tenant_suppliers AS tenant_supplier
  JOIN public.suppliers AS supplier
    ON supplier.id = tenant_supplier.supplier_id
  WHERE tenant_supplier.id = p_tenant_supplier_id
    AND tenant_supplier.tenant_id = p_tenant_id
    AND tenant_supplier.supplier_id = p_supplier_id
    AND tenant_supplier.relationship_status = 'active'
    AND supplier.onboarding_status = 'approved'
    AND supplier.operational_status = 'active'
    AND (
      (supplier.ownership_scope = 'platform' AND supplier.owner_tenant_id IS NULL)
      OR (
        supplier.ownership_scope = 'tenant'
        AND supplier.owner_tenant_id = p_tenant_id
      )
    )
  FOR SHARE OF tenant_supplier, supplier;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'TENANT_SUPPLIER_NOT_FOUND';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_supplier_product_v2_context(
  text, uuid, uuid, uuid, uuid, uuid
)
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.command_supplier_product_v2(
  p_action text,
  p_ownership_scope text,
  p_tenant_id uuid,
  p_tenant_supplier_id uuid,
  p_supplier_id uuid,
  p_product_id uuid,
  p_expected_version integer,
  p_payload jsonb,
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
  v_product public.supplier_products%ROWTYPE;
  v_event public.supplier_command_events%ROWTYPE;
  v_request jsonb;
  v_before jsonb;
  v_response jsonb;
  v_next_status text;
BEGIN
  IF p_action NOT IN ('create', 'update', 'activate', 'deactivate')
    OR p_product_id IS NULL
    OR p_payload IS NULL
    OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
    OR (p_action = 'create' AND p_expected_version IS NOT NULL)
    OR (p_action <> 'create' AND COALESCE(p_expected_version, 0) < 1)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_PRODUCT_STATE_CONFLICT';
  END IF;

  PERFORM public.assert_supplier_product_v2_context(
    p_ownership_scope,
    p_tenant_id,
    p_tenant_supplier_id,
    p_supplier_id,
    p_actor_user_id,
    p_actor_employee_id
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        btrim(p_idempotency_key),
      0
    )
  );

  SELECT product.* INTO v_product
  FROM public.supplier_products AS product
  WHERE product.id = p_product_id
    AND product.supplier_id = p_supplier_id
    AND product.ownership_scope = p_ownership_scope
    AND product.owner_tenant_id IS NOT DISTINCT FROM CASE
      WHEN p_ownership_scope = 'tenant' THEN p_tenant_id
      ELSE NULL
    END
  FOR UPDATE;

  IF p_action <> 'create' AND NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PRODUCT_NOT_FOUND'
    );
  END IF;

  v_request := jsonb_build_object(
    'action', p_action,
    'ownership_scope', p_ownership_scope,
    'tenant_id', p_tenant_id,
    'tenant_supplier_id', p_tenant_supplier_id,
    'supplier_id', p_supplier_id,
    'product_id', p_product_id,
    'expected_version', p_expected_version,
    'payload', p_payload,
    'actor_employee_id', p_actor_employee_id
  );

  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = btrim(p_idempotency_key)
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.id IS NOT NULL AND v_product.id IS NULL THEN
      RETURN jsonb_build_object(
        'status', 'not_found',
        'error_code', 'SUPPLIER_PRODUCT_NOT_FOUND'
      );
    END IF;
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_product'
      OR v_event.resource_id <> p_product_id
      OR v_event.command <> 'supplier_product_v2:' || p_action
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_set(v_event.to_state, '{idempotent}', 'true'::jsonb, true);
  END IF;

  IF p_action = 'create' THEN
    IF v_product.id IS NOT NULL
      OR NULLIF(btrim(p_payload ->> 'product_code'), '') IS NULL
      OR NULLIF(btrim(p_payload ->> 'name'), '') IS NULL
      OR NULLIF(p_payload ->> 'category_id', '') IS NULL
      OR NULLIF(p_payload ->> 'brand_id', '') IS NULL
      OR EXISTS (
        SELECT 1
        FROM jsonb_object_keys(p_payload) AS field(key)
        WHERE field.key NOT IN (
          'product_code', 'name', 'category_id', 'brand_id', 'description'
        )
      )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_PRODUCT_STATE_CONFLICT';
    END IF;

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
      ownership_scope,
      owner_tenant_id,
      acting_tenant_id,
      acting_employee_id,
      operation_source,
      proxy_reason,
      created_by_employee_id,
      updated_by_employee_id
    ) VALUES (
      p_product_id,
      p_supplier_id,
      btrim(p_payload ->> 'product_code'),
      btrim(p_payload ->> 'name'),
      (p_payload ->> 'category_id')::uuid,
      (p_payload ->> 'brand_id')::uuid,
      p_payload ->> 'description',
      'draft',
      1,
      p_ownership_scope,
      CASE WHEN p_ownership_scope = 'tenant' THEN p_tenant_id ELSE NULL END,
      CASE WHEN p_ownership_scope = 'tenant' THEN p_tenant_id ELSE NULL END,
      p_actor_employee_id,
      CASE WHEN p_ownership_scope = 'tenant' THEN 'tenant' ELSE 'platform' END,
      NULL,
      p_actor_employee_id,
      p_actor_employee_id
    )
    RETURNING * INTO v_product;

    v_before := NULL;
  ELSE
    IF v_product.version IS DISTINCT FROM p_expected_version THEN
      RETURN jsonb_build_object(
        'status', 'version_conflict',
        'error_code', 'SUPPLIER_PRODUCT_VERSION_CONFLICT',
        'version', v_product.version,
        'current_status', v_product.status
      );
    END IF;

    v_before := to_jsonb(v_product);
    IF p_action = 'update' THEN
      IF p_payload = '{}'::jsonb
        OR EXISTS (
          SELECT 1
          FROM jsonb_object_keys(p_payload) AS field(key)
          WHERE field.key NOT IN (
            'product_code', 'name', 'category_id', 'brand_id', 'description'
          )
        )
      THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_PRODUCT_STATE_CONFLICT';
      END IF;

      IF p_payload ? 'category_id'
        AND (p_payload ->> 'category_id')::uuid
          IS DISTINCT FROM v_product.category_id
        AND EXISTS (
          SELECT 1
          FROM public.supplier_skus AS sku
          WHERE sku.supplier_id = p_supplier_id
            AND sku.supplier_product_id = p_product_id
          LIMIT 1
        )
      THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'PRODUCT_CATEGORY_CHANGE_REQUIRES_SKU_MIGRATION';
      END IF;

      UPDATE public.supplier_products AS product
      SET product_code = CASE WHEN p_payload ? 'product_code'
            THEN btrim(p_payload ->> 'product_code') ELSE product.product_code END,
        name = CASE WHEN p_payload ? 'name'
            THEN btrim(p_payload ->> 'name') ELSE product.name END,
        category_id = CASE WHEN p_payload ? 'category_id'
            THEN (p_payload ->> 'category_id')::uuid ELSE product.category_id END,
        brand_id = CASE WHEN p_payload ? 'brand_id'
            THEN (p_payload ->> 'brand_id')::uuid ELSE product.brand_id END,
        description = CASE WHEN p_payload ? 'description'
            THEN p_payload ->> 'description' ELSE product.description END,
        version = product.version + 1,
        acting_tenant_id = CASE
          WHEN p_ownership_scope = 'tenant' THEN p_tenant_id ELSE NULL END,
        acting_employee_id = p_actor_employee_id,
        operation_source = CASE
          WHEN p_ownership_scope = 'tenant' THEN 'tenant' ELSE 'platform' END,
        proxy_reason = NULL,
        updated_by_employee_id = p_actor_employee_id,
        updated_at = pg_catalog.now()
      WHERE product.id = p_product_id
      RETURNING * INTO v_product;
    ELSE
      IF p_payload <> '{}'::jsonb THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_PRODUCT_STATE_CONFLICT';
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

      UPDATE public.supplier_products AS product
      SET status = v_next_status,
        version = product.version + 1,
        acting_tenant_id = CASE
          WHEN p_ownership_scope = 'tenant' THEN p_tenant_id ELSE NULL END,
        acting_employee_id = p_actor_employee_id,
        operation_source = CASE
          WHEN p_ownership_scope = 'tenant' THEN 'tenant' ELSE 'platform' END,
        proxy_reason = NULL,
        updated_by_employee_id = p_actor_employee_id,
        updated_at = pg_catalog.now()
      WHERE product.id = p_product_id
      RETURNING * INTO v_product;
    END IF;
  END IF;

  v_response := jsonb_build_object(
    'status', CASE WHEN p_action = 'create' THEN 'created' ELSE 'updated' END,
    'idempotent', false,
    'product', to_jsonb(v_product),
    'version', v_product.version
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
    'supplier_product_v2:' || p_action,
    COALESCE(v_before, '{}'::jsonb) || jsonb_build_object('_request', v_request),
    v_response,
    NULL,
    p_actor_user_id,
    p_actor_employee_id,
    btrim(p_idempotency_key),
    v_product.version
  );

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.command_supplier_product_v2(
  text, text, uuid, uuid, uuid, uuid, integer, jsonb, uuid, uuid, text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.command_supplier_product_v2(
  text, text, uuid, uuid, uuid, uuid, integer, jsonb, uuid, uuid, text
)
TO service_role;

CREATE FUNCTION public.command_supplier_sku_v2(
  p_action text,
  p_ownership_scope text,
  p_tenant_id uuid,
  p_tenant_supplier_id uuid,
  p_supplier_id uuid,
  p_supplier_product_id uuid,
  p_sku_id uuid,
  p_expected_version integer,
  p_payload jsonb,
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
  v_product public.supplier_products%ROWTYPE;
  v_sku public.supplier_skus%ROWTYPE;
  v_event public.supplier_command_events%ROWTYPE;
  v_request jsonb;
  v_before jsonb;
  v_response jsonb;
  v_next_status text;
BEGIN
  IF p_action NOT IN ('create', 'update', 'activate', 'deactivate')
    OR p_supplier_product_id IS NULL
    OR p_sku_id IS NULL
    OR p_payload IS NULL
    OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
    OR (p_action = 'create' AND p_expected_version IS NOT NULL)
    OR (p_action <> 'create' AND COALESCE(p_expected_version, 0) < 1)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_SKU_STATE_CONFLICT';
  END IF;

  PERFORM public.assert_supplier_product_v2_context(
    p_ownership_scope,
    p_tenant_id,
    p_tenant_supplier_id,
    p_supplier_id,
    p_actor_user_id,
    p_actor_employee_id
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        btrim(p_idempotency_key),
      0
    )
  );

  SELECT product.* INTO v_product
  FROM public.supplier_products AS product
  WHERE product.id = p_supplier_product_id
    AND product.supplier_id = p_supplier_id
    AND product.ownership_scope = p_ownership_scope
    AND product.owner_tenant_id IS NOT DISTINCT FROM CASE
      WHEN p_ownership_scope = 'tenant' THEN p_tenant_id
      ELSE NULL
    END
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PRODUCT_NOT_FOUND'
    );
  END IF;

  SELECT sku.* INTO v_sku
  FROM public.supplier_skus AS sku
  WHERE sku.id = p_sku_id
    AND sku.supplier_id = p_supplier_id
    AND sku.supplier_product_id = p_supplier_product_id
    AND sku.ownership_scope = p_ownership_scope
    AND sku.owner_tenant_id IS NOT DISTINCT FROM CASE
      WHEN p_ownership_scope = 'tenant' THEN p_tenant_id
      ELSE NULL
    END
  FOR UPDATE;

  IF p_action <> 'create' AND NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_SKU_NOT_FOUND'
    );
  END IF;

  v_request := jsonb_build_object(
    'action', p_action,
    'ownership_scope', p_ownership_scope,
    'tenant_id', p_tenant_id,
    'tenant_supplier_id', p_tenant_supplier_id,
    'supplier_id', p_supplier_id,
    'supplier_product_id', p_supplier_product_id,
    'sku_id', p_sku_id,
    'expected_version', p_expected_version,
    'payload', p_payload,
    'actor_employee_id', p_actor_employee_id
  );

  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = btrim(p_idempotency_key)
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.id IS NOT NULL AND v_sku.id IS NULL THEN
      RETURN jsonb_build_object(
        'status', 'not_found',
        'error_code', 'SUPPLIER_SKU_NOT_FOUND'
      );
    END IF;
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_sku'
      OR v_event.resource_id <> p_sku_id
      OR v_event.command <> 'supplier_sku_v2:' || p_action
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_set(v_event.to_state, '{idempotent}', 'true'::jsonb, true);
  END IF;

  IF p_action = 'create' THEN
    IF v_sku.id IS NOT NULL
      OR NULLIF(btrim(p_payload ->> 'sku_code'), '') IS NULL
      OR NULLIF(btrim(p_payload ->> 'name'), '') IS NULL
      OR NULLIF(p_payload ->> 'purchase_unit_id', '') IS NULL
      OR COALESCE(jsonb_typeof(p_payload -> 'spec_values'), 'object') <> 'object'
      OR EXISTS (
        SELECT 1
        FROM jsonb_object_keys(p_payload) AS field(key)
        WHERE field.key NOT IN (
          'sku_code', 'name', 'specification', 'model', 'purchase_unit_id',
          'batch_managed', 'color_managed', 'serial_managed', 'spec_values'
        )
      )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_SKU_STATE_CONFLICT';
    END IF;

    INSERT INTO public.supplier_skus (
      id,
      supplier_id,
      supplier_product_id,
      sku_code,
      name,
      specification,
      model,
      spec_values,
      purchase_unit_id,
      base_unit_id,
      base_unit_conversion,
      batch_managed,
      color_managed,
      serial_managed,
      status,
      version,
      ownership_scope,
      owner_tenant_id,
      acting_tenant_id,
      acting_employee_id,
      operation_source,
      proxy_reason,
      created_by_employee_id,
      updated_by_employee_id
    ) VALUES (
      p_sku_id,
      p_supplier_id,
      p_supplier_product_id,
      btrim(p_payload ->> 'sku_code'),
      btrim(p_payload ->> 'name'),
      p_payload ->> 'specification',
      p_payload ->> 'model',
      COALESCE(p_payload -> 'spec_values', '{}'::jsonb),
      (p_payload ->> 'purchase_unit_id')::uuid,
      (p_payload ->> 'purchase_unit_id')::uuid,
      1,
      COALESCE((p_payload ->> 'batch_managed')::boolean, false),
      COALESCE((p_payload ->> 'color_managed')::boolean, false),
      COALESCE((p_payload ->> 'serial_managed')::boolean, false),
      'draft',
      1,
      p_ownership_scope,
      CASE WHEN p_ownership_scope = 'tenant' THEN p_tenant_id ELSE NULL END,
      CASE WHEN p_ownership_scope = 'tenant' THEN p_tenant_id ELSE NULL END,
      p_actor_employee_id,
      CASE WHEN p_ownership_scope = 'tenant' THEN 'tenant' ELSE 'platform' END,
      NULL,
      p_actor_employee_id,
      p_actor_employee_id
    )
    RETURNING * INTO v_sku;
    v_before := NULL;
  ELSE
    IF v_sku.version IS DISTINCT FROM p_expected_version THEN
      RETURN jsonb_build_object(
        'status', 'version_conflict',
        'error_code', 'SUPPLIER_SKU_VERSION_CONFLICT',
        'version', v_sku.version,
        'current_status', v_sku.status
      );
    END IF;

    v_before := to_jsonb(v_sku);
    IF p_action = 'update' THEN
      IF p_payload = '{}'::jsonb
        OR EXISTS (
          SELECT 1
          FROM jsonb_object_keys(p_payload) AS field(key)
          WHERE field.key NOT IN (
            'sku_code', 'name', 'specification', 'model', 'purchase_unit_id',
            'batch_managed', 'color_managed', 'serial_managed', 'spec_values'
          )
        )
        OR (
          p_payload ? 'spec_values'
          AND jsonb_typeof(p_payload -> 'spec_values') <> 'object'
        )
      THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_SKU_STATE_CONFLICT';
      END IF;

      UPDATE public.supplier_skus AS sku
      SET sku_code = CASE WHEN p_payload ? 'sku_code'
            THEN btrim(p_payload ->> 'sku_code') ELSE sku.sku_code END,
        name = CASE WHEN p_payload ? 'name'
            THEN btrim(p_payload ->> 'name') ELSE sku.name END,
        specification = CASE WHEN p_payload ? 'specification'
            THEN p_payload ->> 'specification' ELSE sku.specification END,
        model = CASE WHEN p_payload ? 'model'
            THEN p_payload ->> 'model' ELSE sku.model END,
        spec_values = CASE WHEN p_payload ? 'spec_values'
            THEN p_payload -> 'spec_values' ELSE sku.spec_values END,
        purchase_unit_id = CASE WHEN p_payload ? 'purchase_unit_id'
            THEN (p_payload ->> 'purchase_unit_id')::uuid
            ELSE sku.purchase_unit_id END,
        batch_managed = CASE WHEN p_payload ? 'batch_managed'
            THEN (p_payload ->> 'batch_managed')::boolean
            ELSE sku.batch_managed END,
        color_managed = CASE WHEN p_payload ? 'color_managed'
            THEN (p_payload ->> 'color_managed')::boolean
            ELSE sku.color_managed END,
        serial_managed = CASE WHEN p_payload ? 'serial_managed'
            THEN (p_payload ->> 'serial_managed')::boolean
            ELSE sku.serial_managed END,
        version = sku.version + 1,
        acting_tenant_id = CASE
          WHEN p_ownership_scope = 'tenant' THEN p_tenant_id ELSE NULL END,
        acting_employee_id = p_actor_employee_id,
        operation_source = CASE
          WHEN p_ownership_scope = 'tenant' THEN 'tenant' ELSE 'platform' END,
        proxy_reason = NULL,
        updated_by_employee_id = p_actor_employee_id,
        updated_at = pg_catalog.now()
      WHERE sku.id = p_sku_id
      RETURNING * INTO v_sku;
    ELSE
      IF p_payload <> '{}'::jsonb THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_SKU_STATE_CONFLICT';
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

      UPDATE public.supplier_skus AS sku
      SET status = v_next_status,
        version = sku.version + 1,
        acting_tenant_id = CASE
          WHEN p_ownership_scope = 'tenant' THEN p_tenant_id ELSE NULL END,
        acting_employee_id = p_actor_employee_id,
        operation_source = CASE
          WHEN p_ownership_scope = 'tenant' THEN 'tenant' ELSE 'platform' END,
        proxy_reason = NULL,
        updated_by_employee_id = p_actor_employee_id,
        updated_at = pg_catalog.now()
      WHERE sku.id = p_sku_id
      RETURNING * INTO v_sku;
    END IF;
  END IF;

  v_response := jsonb_build_object(
    'status', CASE WHEN p_action = 'create' THEN 'created' ELSE 'updated' END,
    'idempotent', false,
    'sku', to_jsonb(v_sku),
    'version', v_sku.version
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
    p_sku_id,
    'supplier_sku_v2:' || p_action,
    COALESCE(v_before, '{}'::jsonb) || jsonb_build_object('_request', v_request),
    v_response,
    NULL,
    p_actor_user_id,
    p_actor_employee_id,
    btrim(p_idempotency_key),
    v_sku.version
  );

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.command_supplier_sku_v2(
  text, text, uuid, uuid, uuid, uuid, uuid, integer, jsonb, uuid, uuid, text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.command_supplier_sku_v2(
  text, text, uuid, uuid, uuid, uuid, uuid, integer, jsonb, uuid, uuid, text
)
TO service_role;

CREATE FUNCTION public.replace_supplier_sku_unit_conversions_v2(
  p_ownership_scope text,
  p_tenant_id uuid,
  p_tenant_supplier_id uuid,
  p_supplier_id uuid,
  p_supplier_product_id uuid,
  p_supplier_sku_id uuid,
  p_expected_sku_version integer,
  p_edges jsonb,
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
  v_sku public.supplier_skus%ROWTYPE;
  v_event public.supplier_command_events%ROWTYPE;
  v_request jsonb;
  v_before jsonb;
  v_response jsonb;
  v_factor numeric(18, 8);
BEGIN
  IF p_supplier_product_id IS NULL
    OR p_supplier_sku_id IS NULL
    OR COALESCE(p_expected_sku_version, 0) < 1
    OR jsonb_typeof(p_edges) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_edges) > 100
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'UNIT_CONVERSION_INVALID';
  END IF;

  PERFORM public.assert_supplier_product_v2_context(
    p_ownership_scope,
    p_tenant_id,
    p_tenant_supplier_id,
    p_supplier_id,
    p_actor_user_id,
    p_actor_employee_id
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        btrim(p_idempotency_key),
      0
    )
  );

  SELECT sku.* INTO v_sku
  FROM public.supplier_skus AS sku
  JOIN public.supplier_products AS product
    ON product.id = sku.supplier_product_id
    AND product.supplier_id = sku.supplier_id
  WHERE sku.id = p_supplier_sku_id
    AND sku.supplier_id = p_supplier_id
    AND sku.supplier_product_id = p_supplier_product_id
    AND sku.ownership_scope = p_ownership_scope
    AND sku.owner_tenant_id IS NOT DISTINCT FROM CASE
      WHEN p_ownership_scope = 'tenant' THEN p_tenant_id
      ELSE NULL
    END
    AND product.ownership_scope = p_ownership_scope
    AND product.owner_tenant_id IS NOT DISTINCT FROM sku.owner_tenant_id
  FOR UPDATE OF sku;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_SKU_NOT_FOUND'
    );
  END IF;

  v_request := jsonb_build_object(
    'ownership_scope', p_ownership_scope,
    'tenant_id', p_tenant_id,
    'tenant_supplier_id', p_tenant_supplier_id,
    'supplier_id', p_supplier_id,
    'supplier_product_id', p_supplier_product_id,
    'supplier_sku_id', p_supplier_sku_id,
    'expected_sku_version', p_expected_sku_version,
    'edges', p_edges,
    'actor_employee_id', p_actor_employee_id
  );

  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = btrim(p_idempotency_key)
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_sku'
      OR v_event.resource_id <> p_supplier_sku_id
      OR v_event.command <> 'supplier_sku_unit_conversions_v2'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_set(v_event.to_state, '{idempotent}', 'true'::jsonb, true);
  END IF;

  IF v_sku.version IS DISTINCT FROM p_expected_sku_version THEN
    RETURN jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_SKU_VERSION_CONFLICT',
      'version', v_sku.version,
      'current_status', v_sku.status
    );
  END IF;

  v_before := to_jsonb(v_sku);

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_edges) AS edge(value)
    WHERE jsonb_typeof(edge.value) <> 'object'
      OR NULLIF(edge.value ->> 'from_unit_id', '') IS NULL
      OR NULLIF(edge.value ->> 'to_unit_id', '') IS NULL
      OR NULLIF(edge.value ->> 'factor', '') IS NULL
      OR (edge.value ->> 'factor') !~
        '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$'
      OR (edge.value ->> 'factor')::numeric(18, 6) <= 0
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'UNIT_CONVERSION_INVALID';
  END IF;

  v_factor := public.validate_supplier_sku_unit_conversion_graph(
    p_supplier_sku_id,
    p_edges
  );

  DELETE FROM public.supplier_sku_unit_conversions AS conversion
  WHERE conversion.supplier_sku_id = p_supplier_sku_id;

  INSERT INTO public.supplier_sku_unit_conversions (
    supplier_sku_id,
    from_unit_id,
    to_unit_id,
    factor,
    status,
    version,
    created_by_employee_id,
    updated_by_employee_id
  )
  SELECT
    p_supplier_sku_id,
    (edge.value ->> 'from_unit_id')::uuid,
    (edge.value ->> 'to_unit_id')::uuid,
    (edge.value ->> 'factor')::numeric(18, 6),
    'active',
    1,
    p_actor_employee_id,
    p_actor_employee_id
  FROM jsonb_array_elements(p_edges) AS edge(value);

  UPDATE public.supplier_skus AS sku
  SET base_unit_conversion = v_factor,
    version = sku.version + 1,
    acting_tenant_id = CASE
      WHEN p_ownership_scope = 'tenant' THEN p_tenant_id ELSE NULL END,
    acting_employee_id = p_actor_employee_id,
    operation_source = CASE
      WHEN p_ownership_scope = 'tenant' THEN 'tenant' ELSE 'platform' END,
    proxy_reason = NULL,
    updated_by_employee_id = p_actor_employee_id,
    updated_at = pg_catalog.now()
  WHERE sku.id = p_supplier_sku_id
  RETURNING * INTO v_sku;

  v_response := jsonb_build_object(
    'status', 'updated',
    'idempotent', false,
    'sku', to_jsonb(v_sku),
    'version', v_sku.version,
    'base_unit_conversion', v_factor::text,
    'edges', p_edges
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
    'supplier_sku_unit_conversions_v2',
    v_before || jsonb_build_object('_request', v_request),
    v_response,
    NULL,
    p_actor_user_id,
    p_actor_employee_id,
    btrim(p_idempotency_key),
    v_sku.version
  );

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_supplier_sku_unit_conversions_v2(
  text, uuid, uuid, uuid, uuid, uuid, integer, jsonb, uuid, uuid, text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.replace_supplier_sku_unit_conversions_v2(
  text, uuid, uuid, uuid, uuid, uuid, integer, jsonb, uuid, uuid, text
)
TO service_role;

COMMIT;
