-- Rollback: forward-only. Recreate the previous tenant brand RPC overloads and drop
-- catalog_brands.category_id only after verifying no brand-category links are needed.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

ALTER TABLE public.catalog_brands
  ADD COLUMN IF NOT EXISTS category_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'catalog_brands_category_id_fkey'
      AND conrelid = 'public.catalog_brands'::regclass
  ) THEN
    ALTER TABLE public.catalog_brands
      ADD CONSTRAINT catalog_brands_category_id_fkey
      FOREIGN KEY (category_id)
      REFERENCES public.catalog_categories(id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS catalog_brands_category_status_sort_idx
  ON public.catalog_brands(category_id, status, sort_order, id)
  WHERE category_id IS NOT NULL;

DROP FUNCTION IF EXISTS public.create_tenant_catalog_brand(
  uuid, text, text, text, uuid, text, integer, uuid, uuid, uuid, uuid, text
);
DROP FUNCTION IF EXISTS public.update_tenant_catalog_brand(
  uuid, text, text, text, uuid, text, integer, uuid, integer, uuid, uuid, uuid, text
);

CREATE FUNCTION public.create_tenant_catalog_brand(
  p_brand_id uuid,
  p_category_id uuid,
  p_code text,
  p_name text,
  p_legal_name text,
  p_logo_file_id uuid,
  p_status text,
  p_sort_order integer,
  p_mapped_platform_brand_id uuid,
  p_tenant_id uuid,
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
  v_category public.catalog_categories%ROWTYPE;
  v_mapped public.catalog_brands%ROWTYPE;
  v_brand public.catalog_brands%ROWTYPE;
  v_request jsonb;
  v_snapshot jsonb;
BEGIN
  IF p_brand_id IS NULL
    OR p_category_id IS NULL
    OR p_tenant_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
    OR p_code IS NULL
    OR btrim(p_code) = ''
    OR p_name IS NULL
    OR btrim(p_name) = ''
    OR (p_legal_name IS NOT NULL AND btrim(p_legal_name) = '')
    OR p_status NOT IN ('active', 'inactive')
    OR p_sort_order IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_CATALOG_CONFLICT';
  END IF;

  PERFORM public.assert_tenant_supplier_actor(
    p_tenant_id,
    p_actor_user_id,
    p_actor_employee_id
  );

  PERFORM setting.tenant_id
  FROM public.tenant_supplier_settings AS setting
  WHERE setting.tenant_id = p_tenant_id
    AND setting.module_enabled
    AND setting.ownership_reads_enabled
    AND setting.private_supplier_writes_enabled
    AND setting.private_catalog_writes_enabled
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PRIVATE_CATALOG_WRITES_DISABLED';
  END IF;

  SELECT category.*
  INTO v_category
  FROM public.catalog_categories AS category
  WHERE category.id = p_category_id
  FOR SHARE;

  IF NOT FOUND
    OR v_category.status <> 'active'
    OR NOT (
      (v_category.ownership_scope = 'platform' AND v_category.owner_tenant_id IS NULL)
      OR (
        v_category.ownership_scope = 'tenant'
        AND v_category.owner_tenant_id IS NOT DISTINCT FROM p_tenant_id
      )
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'CATEGORY_OWNERSHIP_CONFLICT';
  END IF;

  v_request := jsonb_build_object(
    'brand_id', p_brand_id,
    'category_id', p_category_id,
    'code', btrim(p_code),
    'name', btrim(p_name),
    'legal_name', CASE
      WHEN p_legal_name IS NULL THEN NULL
      ELSE btrim(p_legal_name)
    END,
    'logo_file_id', p_logo_file_id,
    'status', p_status,
    'sort_order', p_sort_order,
    'mapped_platform_brand_id', p_mapped_platform_brand_id,
    'tenant_id', p_tenant_id,
    'actor_employee_id', p_actor_employee_id
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' || p_idempotency_key,
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
      OR v_event.command <> 'create_tenant_catalog_brand'
      OR v_event.resource_type <> 'catalog_brand'
      OR v_event.resource_id IS DISTINCT FROM p_brand_id
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;

    RETURN jsonb_build_object(
      'status', 'created',
      'idempotent', true,
      'catalog_brand', v_event.to_state,
      'version', v_event.result_version
    );
  END IF;

  IF p_mapped_platform_brand_id IS NOT NULL THEN
    SELECT brand.*
    INTO v_mapped
    FROM public.catalog_brands AS brand
    WHERE brand.id = p_mapped_platform_brand_id
    FOR SHARE;

    IF NOT FOUND
      OR v_mapped.ownership_scope <> 'platform'
      OR v_mapped.owner_tenant_id IS NOT NULL
      OR v_mapped.status <> 'active'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'BRAND_OWNERSHIP_CONFLICT';
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.catalog_brands (
      id,
      category_id,
      code,
      name,
      legal_name,
      logo_file_id,
      status,
      sort_order,
      version,
      created_by_employee_id,
      updated_by_employee_id,
      ownership_scope,
      owner_tenant_id,
      mapped_platform_brand_id
    )
    VALUES (
      p_brand_id,
      p_category_id,
      btrim(p_code),
      btrim(p_name),
      CASE
        WHEN p_legal_name IS NULL THEN NULL
        ELSE btrim(p_legal_name)
      END,
      p_logo_file_id,
      p_status,
      p_sort_order,
      1,
      p_actor_employee_id,
      p_actor_employee_id,
      'tenant',
      p_tenant_id,
      p_mapped_platform_brand_id
    )
    RETURNING * INTO v_brand;
  EXCEPTION
    WHEN unique_violation OR check_violation OR not_null_violation THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_CATALOG_CONFLICT';
    WHEN foreign_key_violation THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'CATEGORY_OWNERSHIP_CONFLICT';
  END;

  v_snapshot := to_jsonb(v_brand);

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
    'catalog_brand',
    v_brand.id,
    'create_tenant_catalog_brand',
    jsonb_build_object('_request', v_request),
    v_snapshot,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_brand.version
  );

  RETURN jsonb_build_object(
    'status', 'created',
    'idempotent', false,
    'catalog_brand', v_snapshot,
    'version', v_brand.version
  );
END;
$$;

CREATE FUNCTION public.update_tenant_catalog_brand(
  p_brand_id uuid,
  p_category_id uuid,
  p_code text,
  p_name text,
  p_legal_name text,
  p_logo_file_id uuid,
  p_status text,
  p_sort_order integer,
  p_mapped_platform_brand_id uuid,
  p_expected_version integer,
  p_tenant_id uuid,
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
  v_category public.catalog_categories%ROWTYPE;
  v_mapped public.catalog_brands%ROWTYPE;
  v_brand public.catalog_brands%ROWTYPE;
  v_request jsonb;
  v_before jsonb;
  v_snapshot jsonb;
BEGIN
  IF p_brand_id IS NULL
    OR p_tenant_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
    OR p_code IS NULL
    OR btrim(p_code) = ''
    OR p_name IS NULL
    OR btrim(p_name) = ''
    OR (p_legal_name IS NOT NULL AND btrim(p_legal_name) = '')
    OR p_status NOT IN ('active', 'inactive')
    OR p_sort_order IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version < 1
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_CATALOG_CONFLICT';
  END IF;

  PERFORM public.assert_tenant_supplier_actor(
    p_tenant_id,
    p_actor_user_id,
    p_actor_employee_id
  );

  PERFORM setting.tenant_id
  FROM public.tenant_supplier_settings AS setting
  WHERE setting.tenant_id = p_tenant_id
    AND setting.module_enabled
    AND setting.ownership_reads_enabled
    AND setting.private_supplier_writes_enabled
    AND setting.private_catalog_writes_enabled
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PRIVATE_CATALOG_WRITES_DISABLED';
  END IF;

  IF p_category_id IS NOT NULL THEN
    SELECT category.*
    INTO v_category
    FROM public.catalog_categories AS category
    WHERE category.id = p_category_id
    FOR SHARE;

    IF NOT FOUND
      OR v_category.status <> 'active'
      OR NOT (
        (v_category.ownership_scope = 'platform' AND v_category.owner_tenant_id IS NULL)
        OR (
          v_category.ownership_scope = 'tenant'
          AND v_category.owner_tenant_id IS NOT DISTINCT FROM p_tenant_id
        )
      )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'CATEGORY_OWNERSHIP_CONFLICT';
    END IF;
  END IF;

  v_request := jsonb_build_object(
    'brand_id', p_brand_id,
    'category_id', p_category_id,
    'code', btrim(p_code),
    'name', btrim(p_name),
    'legal_name', CASE
      WHEN p_legal_name IS NULL THEN NULL
      ELSE btrim(p_legal_name)
    END,
    'logo_file_id', p_logo_file_id,
    'status', p_status,
    'sort_order', p_sort_order,
    'mapped_platform_brand_id', p_mapped_platform_brand_id,
    'expected_version', p_expected_version,
    'tenant_id', p_tenant_id,
    'actor_employee_id', p_actor_employee_id
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' || p_idempotency_key,
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
      OR v_event.command <> 'update_tenant_catalog_brand'
      OR v_event.resource_type <> 'catalog_brand'
      OR v_event.resource_id IS DISTINCT FROM p_brand_id
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;

    RETURN jsonb_build_object(
      'status', 'updated',
      'idempotent', true,
      'catalog_brand', v_event.to_state,
      'previous_catalog_brand', v_event.from_state - '_request',
      'version', v_event.result_version
    );
  END IF;

  SELECT brand.*
  INTO v_brand
  FROM public.catalog_brands AS brand
  WHERE brand.id = p_brand_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRAND_OWNERSHIP_CONFLICT';
  END IF;

  IF v_brand.ownership_scope = 'platform' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SHARED_RESOURCE_READ_ONLY';
  END IF;

  IF v_brand.ownership_scope <> 'tenant'
    OR v_brand.owner_tenant_id IS DISTINCT FROM p_tenant_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRAND_OWNERSHIP_CONFLICT';
  END IF;

  IF v_brand.version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_VERSION_CONFLICT',
      'version', v_brand.version
    );
  END IF;

  IF p_mapped_platform_brand_id IS NOT NULL THEN
    SELECT brand.*
    INTO v_mapped
    FROM public.catalog_brands AS brand
    WHERE brand.id = p_mapped_platform_brand_id
    FOR SHARE;

    IF NOT FOUND
      OR v_mapped.ownership_scope <> 'platform'
      OR v_mapped.owner_tenant_id IS NOT NULL
      OR v_mapped.status <> 'active'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'BRAND_OWNERSHIP_CONFLICT';
    END IF;
  END IF;

  v_before := to_jsonb(v_brand);

  BEGIN
    UPDATE public.catalog_brands AS brand
    SET category_id = p_category_id,
        code = btrim(p_code),
        name = btrim(p_name),
        legal_name = CASE
          WHEN p_legal_name IS NULL THEN NULL
          ELSE btrim(p_legal_name)
        END,
        logo_file_id = p_logo_file_id,
        status = p_status,
        sort_order = p_sort_order,
        mapped_platform_brand_id = p_mapped_platform_brand_id,
        updated_by_employee_id = p_actor_employee_id,
        version = v_brand.version + 1
    WHERE brand.id = v_brand.id
    RETURNING * INTO v_brand;
  EXCEPTION
    WHEN unique_violation OR check_violation OR not_null_violation THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_CATALOG_CONFLICT';
    WHEN foreign_key_violation THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'CATEGORY_OWNERSHIP_CONFLICT';
  END;

  v_snapshot := to_jsonb(v_brand);

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
    'catalog_brand',
    v_brand.id,
    'update_tenant_catalog_brand',
    v_before || jsonb_build_object('_request', v_request),
    v_snapshot,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_brand.version
  );

  RETURN jsonb_build_object(
    'status', 'updated',
    'idempotent', false,
    'catalog_brand', v_snapshot,
    'previous_catalog_brand', v_before,
    'version', v_brand.version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_tenant_catalog_brand(
  uuid, uuid, text, text, text, uuid, text, integer, uuid, uuid, uuid, uuid, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_tenant_catalog_brand(
  uuid, uuid, text, text, text, uuid, text, integer, uuid, uuid, uuid, uuid, text
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_tenant_catalog_brand(
  uuid, uuid, text, text, text, uuid, text, integer, uuid, integer, uuid, uuid, uuid, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_tenant_catalog_brand(
  uuid, uuid, text, text, text, uuid, text, integer, uuid, integer, uuid, uuid, uuid, text
) TO authenticated, service_role;

COMMIT;
