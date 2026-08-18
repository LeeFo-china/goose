-- Rollback: forward-only. Restore from backup and deploy a compensating migration.
-- Materializes the canonical supplier catalog command surface after
-- 20260818122000 and before the validation-only 20260818130000 gate.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

-- Accept only the deterministic 122000 schema and the known repository-chain,
-- granular-v2, or already-canonical command signatures.
DO $preflight$
DECLARE
  v_actual text[];
  v_repository_chain constant text[] := ARRAY[
    'copy_platform_category_specs(uuid, uuid, uuid, uuid, text)',
    'create_catalog_unit(uuid, text, text, text, uuid, text, text, integer, uuid, uuid, text)',
    'create_tenant_catalog_brand(uuid, uuid, text, text, uuid, uuid, uuid, text)',
    'create_tenant_catalog_category(uuid, uuid, uuid, text, text, uuid, uuid, uuid, text)',
    'submit_catalog_unit_suggestion(uuid, text, text, text, text, uuid, uuid, text)',
    'update_tenant_catalog_brand(uuid, uuid, text, uuid, integer, uuid, uuid, text)',
    'update_tenant_catalog_category(uuid, uuid, text, uuid, integer, uuid, uuid, text)'
  ]::text[];
  v_granular_v2 constant text[] := ARRAY[
    'copy_platform_category_specs(uuid, uuid, integer, uuid, uuid, uuid, text)',
    'create_catalog_spec_definition(uuid, uuid, text, text, text, jsonb, text, boolean, boolean, boolean, integer, text, uuid, uuid, uuid, text)',
    'create_catalog_unit(uuid, text, text, text, uuid, text, text, integer, uuid, uuid, text)',
    'create_catalog_unit(uuid, text, text, text, uuid, text, text, text, integer, uuid, uuid, text)',
    'create_tenant_catalog_brand(uuid, text, text, text, uuid, text, integer, uuid, uuid, uuid, uuid, text)',
    'create_tenant_catalog_category(uuid, uuid, text, text, text, integer, uuid, uuid, uuid, uuid, text)',
    'list_catalog_unit_suggestions(uuid, text, uuid, integer, integer)',
    'review_catalog_unit_suggestion(uuid, text, uuid, text, integer, uuid, uuid, text)',
    'submit_tenant_catalog_unit_suggestion(uuid, text, text, text, text, text, uuid, uuid, uuid, text)',
    'update_catalog_spec_definition(uuid, uuid, text, text, text, jsonb, text, boolean, boolean, boolean, integer, text, integer, uuid, uuid, uuid, text)',
    'update_tenant_catalog_brand(uuid, text, text, text, uuid, text, integer, uuid, integer, uuid, uuid, uuid, text)',
    'update_tenant_catalog_category(uuid, uuid, text, text, text, integer, uuid, integer, uuid, uuid, uuid, text)'
  ]::text[];
  v_canonical_v2 constant text[] := ARRAY[
    'copy_platform_category_specs(uuid, uuid, integer, uuid, uuid, uuid, text)',
    'create_catalog_spec_definition(uuid, uuid, text, text, text, jsonb, text, boolean, boolean, boolean, integer, text, uuid, uuid, uuid, text)',
    'create_catalog_unit(uuid, text, text, text, uuid, text, text, text, integer, uuid, uuid, text)',
    'create_tenant_catalog_brand(uuid, text, text, text, uuid, text, integer, uuid, uuid, uuid, uuid, text)',
    'create_tenant_catalog_category(uuid, uuid, text, text, text, integer, uuid, uuid, uuid, uuid, text)',
    'list_catalog_unit_suggestions(uuid, uuid, text, uuid, integer, integer)',
    'review_catalog_unit_suggestion(uuid, text, uuid, text, integer, uuid, uuid, text)',
    'submit_tenant_catalog_unit_suggestion(uuid, text, text, text, text, text, uuid, uuid, uuid, text)',
    'update_catalog_spec_definition(uuid, uuid, text, text, text, jsonb, text, boolean, boolean, boolean, integer, text, integer, uuid, uuid, uuid, text)',
    'update_tenant_catalog_brand(uuid, text, text, text, uuid, text, integer, uuid, integer, uuid, uuid, uuid, text)',
    'update_tenant_catalog_category(uuid, uuid, text, text, text, integer, uuid, integer, uuid, uuid, uuid, text)'
  ]::text[];
BEGIN
  IF to_regclass('public.catalog_categories') IS NULL
    OR to_regclass('public.catalog_brands') IS NULL
    OR to_regclass('public.catalog_units') IS NULL
    OR to_regclass('public.catalog_spec_definitions') IS NULL
    OR to_regclass('public.catalog_unit_suggestions') IS NULL
    OR to_regclass('public.supplier_command_events') IS NULL
    OR to_regprocedure('public.assert_tenant_supplier_actor(uuid,uuid,uuid)') IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.catalog_unit_suggestions'::regclass
        AND conname = 'catalog_unit_suggestions_v2_review_state_check'
        AND convalidated
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.catalog_spec_definitions'::regclass
        AND conname = 'catalog_spec_definitions_v2_ownership_check'
        AND convalidated
    )
    OR NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'catalog_units'
        AND column_name = 'unit_dimension'
        AND is_nullable = 'NO'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_COMMAND_SCHEMA_UNSUPPORTED',
      DETAIL = '20260818122000 deterministic schema is not materialized';
  END IF;

  SELECT COALESCE(
    array_agg(
      procedure.proname || '(' ||
        pg_catalog.oidvectortypes(procedure.proargtypes) || ')'
      ORDER BY procedure.proname, procedure.proargtypes::text
    ),
    ARRAY[]::text[]
  )
  INTO v_actual
  FROM pg_proc AS procedure
  JOIN pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname = ANY (ARRAY[
      'create_catalog_unit',
      'create_tenant_catalog_category',
      'update_tenant_catalog_category',
      'create_tenant_catalog_brand',
      'update_tenant_catalog_brand',
      'create_catalog_spec_definition',
      'update_catalog_spec_definition',
      'copy_platform_category_specs',
      'submit_catalog_unit_suggestion',
      'submit_tenant_catalog_unit_suggestion',
      'list_catalog_unit_suggestions',
      'review_catalog_unit_suggestion'
    ]::text[]);

  IF v_actual = v_repository_chain THEN
    RAISE NOTICE 'recognized command state: repository_chain';
  ELSIF v_actual = v_granular_v2 THEN
    RAISE NOTICE 'recognized command state: granular_v2';
  ELSIF v_actual = v_canonical_v2 THEN
    RAISE NOTICE 'recognized command state: canonical_v2';
  ELSE
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_COMMAND_SCHEMA_UNSUPPORTED',
      DETAIL = 'unknown command overload set: ' || array_to_string(v_actual, ', ');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    JOIN pg_depend AS dependency
      ON dependency.refclassid = 'pg_proc'::regclass
      AND dependency.refobjid = procedure.oid
      AND dependency.deptype NOT IN ('i', 'e')
    WHERE namespace.nspname = 'public'
      AND procedure.proname = ANY (ARRAY[
        'create_catalog_unit', 'create_tenant_catalog_category',
        'update_tenant_catalog_category', 'create_tenant_catalog_brand',
        'update_tenant_catalog_brand', 'create_catalog_spec_definition',
        'update_catalog_spec_definition', 'copy_platform_category_specs',
        'submit_catalog_unit_suggestion',
        'submit_tenant_catalog_unit_suggestion',
        'list_catalog_unit_suggestions', 'review_catalog_unit_suggestion',
        'assert_platform_catalog_actor'
      ]::text[])
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_COMMAND_DEPENDENCY_UNKNOWN';
  END IF;
END
$preflight$;

DROP FUNCTION IF EXISTS public.create_catalog_unit(
  uuid, text, text, text, uuid, text, text, integer, uuid, uuid, text
);
DROP FUNCTION IF EXISTS public.create_catalog_unit(
  uuid, text, text, text, uuid, text, text, text, integer, uuid, uuid, text
);
DROP FUNCTION IF EXISTS public.create_tenant_catalog_category(
  uuid, uuid, uuid, text, text, uuid, uuid, uuid, text
);
DROP FUNCTION IF EXISTS public.create_tenant_catalog_category(
  uuid, uuid, text, text, text, integer, uuid, uuid, uuid, uuid, text
);
DROP FUNCTION IF EXISTS public.update_tenant_catalog_category(
  uuid, uuid, text, uuid, integer, uuid, uuid, text
);
DROP FUNCTION IF EXISTS public.update_tenant_catalog_category(
  uuid, uuid, text, text, text, integer, uuid, integer, uuid, uuid, uuid, text
);
DROP FUNCTION IF EXISTS public.create_tenant_catalog_brand(
  uuid, uuid, text, text, uuid, uuid, uuid, text
);
DROP FUNCTION IF EXISTS public.create_tenant_catalog_brand(
  uuid, text, text, text, uuid, text, integer, uuid, uuid, uuid, uuid, text
);
DROP FUNCTION IF EXISTS public.update_tenant_catalog_brand(
  uuid, uuid, text, uuid, integer, uuid, uuid, text
);
DROP FUNCTION IF EXISTS public.update_tenant_catalog_brand(
  uuid, text, text, text, uuid, text, integer, uuid, integer, uuid, uuid, uuid, text
);
DROP FUNCTION IF EXISTS public.create_catalog_spec_definition(
  uuid, uuid, text, text, text, jsonb, text, boolean, boolean, boolean,
  integer, text, uuid, uuid, uuid, text
);
DROP FUNCTION IF EXISTS public.update_catalog_spec_definition(
  uuid, uuid, text, text, text, jsonb, text, boolean, boolean, boolean,
  integer, text, integer, uuid, uuid, uuid, text
);
DROP FUNCTION IF EXISTS public.copy_platform_category_specs(
  uuid, uuid, uuid, uuid, text
);
DROP FUNCTION IF EXISTS public.copy_platform_category_specs(
  uuid, uuid, integer, uuid, uuid, uuid, text
);
DROP FUNCTION IF EXISTS public.submit_catalog_unit_suggestion(
  uuid, text, text, text, text, uuid, uuid, text
);
DROP FUNCTION IF EXISTS public.submit_tenant_catalog_unit_suggestion(
  uuid, text, text, text, text, text, uuid, uuid, uuid, text
);
DROP FUNCTION IF EXISTS public.list_catalog_unit_suggestions(
  uuid, text, uuid, integer, integer
);
DROP FUNCTION IF EXISTS public.list_catalog_unit_suggestions(
  uuid, uuid, text, uuid, integer, integer
);
DROP FUNCTION IF EXISTS public.review_catalog_unit_suggestion(
  uuid, text, uuid, text, integer, uuid, uuid, text
);
DROP FUNCTION IF EXISTS public.assert_platform_catalog_actor(uuid, uuid);

-- A large event validation or non-concurrent index build must be split from
-- this bounded transaction and reviewed with production table statistics.
DO $capacity_preflight$
DECLARE
  v_event_bytes bigint;
  v_event_estimated_rows double precision;
  v_suggestion_bytes bigint;
  v_suggestion_estimated_rows double precision;
BEGIN
  SELECT
    pg_total_relation_size(table_definition.oid),
    greatest(table_definition.reltuples, 0)
  INTO v_event_bytes, v_event_estimated_rows
  FROM pg_class AS table_definition
  WHERE table_definition.oid =
    'public.supplier_command_events'::regclass;

  IF v_event_bytes > 536870912
    OR v_event_estimated_rows > 5000000
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_COMMAND_EVENT_VALIDATION_TOO_LARGE',
      DETAIL = format(
        'supplier_command_events bytes=%s estimated_rows=%s; use a separately reviewed validation migration',
        v_event_bytes,
        v_event_estimated_rows
      );
  END IF;

  SELECT
    pg_total_relation_size(table_definition.oid),
    greatest(table_definition.reltuples, 0)
  INTO v_suggestion_bytes, v_suggestion_estimated_rows
  FROM pg_class AS table_definition
  WHERE table_definition.oid =
    'public.catalog_unit_suggestions'::regclass;

  IF to_regclass(
      'public.catalog_unit_suggestions_v2_tenant_status_page_idx'
    ) IS NULL
    AND to_regclass(
      'public.catalog_unit_suggestions_tenant_status_idx'
    ) IS NULL
    AND (
      v_suggestion_bytes > 268435456
      OR v_suggestion_estimated_rows > 2000000
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_SUGGESTION_INDEX_TOO_LARGE',
      DETAIL = format(
        'catalog_unit_suggestions bytes=%s estimated_rows=%s; use CREATE INDEX CONCURRENTLY in a separate migration',
        v_suggestion_bytes,
        v_suggestion_estimated_rows
      );
  END IF;
END
$capacity_preflight$;

DO $resource_type_preflight$
DECLARE
  v_unknown text[];
BEGIN
  SELECT array_agg(DISTINCT event.resource_type ORDER BY event.resource_type)
  INTO v_unknown
  FROM public.supplier_command_events AS event
  WHERE event.resource_type <> ALL (ARRAY[
    'supplier', 'supplier_qualification_type', 'supplier_qualification',
    'supplier_service_region', 'supplier_address', 'supplier_contact',
    'catalog_category', 'catalog_brand', 'catalog_unit', 'tenant_supplier',
    'supplier_contract', 'supplier_product', 'supplier_sku',
    'supplier_price_list', 'supplier_purchase_order',
    'supplier_purchase_requisition', 'supplier_payment_request',
    'supplier_payment', 'catalog_spec_definition',
    'catalog_unit_suggestion'
  ]::text[]);

  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_COMMAND_RESOURCE_TYPE_UNKNOWN',
      DETAIL = array_to_string(v_unknown, ', ');
  END IF;
END
$resource_type_preflight$;

ALTER TABLE public.supplier_command_events
DROP CONSTRAINT supplier_command_events_resource_type_check;

ALTER TABLE public.supplier_command_events
ADD CONSTRAINT supplier_command_events_resource_type_check CHECK (
  resource_type IN (
    'supplier', 'supplier_qualification_type', 'supplier_qualification',
    'supplier_service_region', 'supplier_address', 'supplier_contact',
    'catalog_category', 'catalog_brand', 'catalog_unit', 'tenant_supplier',
    'supplier_contract', 'supplier_product', 'supplier_sku',
    'supplier_price_list', 'supplier_purchase_order',
    'supplier_purchase_requisition', 'supplier_payment_request',
    'supplier_payment', 'catalog_spec_definition',
    'catalog_unit_suggestion'
  )
) NOT VALID;

ALTER TABLE public.supplier_command_events
VALIDATE CONSTRAINT supplier_command_events_resource_type_check;

DO $suggestion_index$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_indexdef(index_definition.indexrelid)
  INTO v_definition
  FROM pg_index AS index_definition
  WHERE index_definition.indexrelid =
    to_regclass('public.catalog_unit_suggestions_v2_tenant_status_page_idx');

  IF v_definition IS NULL
    AND to_regclass(
      'public.catalog_unit_suggestions_tenant_status_idx'
    ) IS NOT NULL
  THEN
    SELECT pg_get_indexdef(
      'public.catalog_unit_suggestions_tenant_status_idx'::regclass
    )
    INTO v_definition;

    IF replace(v_definition, ' DESC', '') NOT LIKE
      '%(tenant_id, status, created_at, id)%'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_CATALOG_COMMAND_SCHEMA_UNSUPPORTED',
        DETAIL = 'catalog_unit_suggestions_tenant_status_idx mismatch';
    END IF;

    ALTER INDEX public.catalog_unit_suggestions_tenant_status_idx
      RENAME TO catalog_unit_suggestions_v2_tenant_status_page_idx;
  ELSIF v_definition IS NULL THEN
    EXECUTE $ddl$
      CREATE INDEX catalog_unit_suggestions_v2_tenant_status_page_idx
      ON public.catalog_unit_suggestions(
        tenant_id, status, created_at DESC, id DESC
      )
    $ddl$;
  ELSIF replace(v_definition, ' DESC', '') NOT LIKE
    '%(tenant_id, status, created_at, id)%'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_COMMAND_SCHEMA_UNSUPPORTED',
      DETAIL = 'catalog_unit_suggestions_v2_tenant_status_page_idx mismatch';
  END IF;
END
$suggestion_index$;

CREATE FUNCTION public.assert_platform_catalog_actor(
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
    AND employee.user_id = p_actor_user_id
    AND employee.status = 'active'
    AND employee.tenant_id IS NULL
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PLATFORM_CATALOG_ACTOR_INVALID';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_tenant_supplier_actor(uuid, uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assert_platform_catalog_actor(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.create_catalog_unit(
  p_unit_id uuid,
  p_code text,
  p_name text,
  p_symbol text,
  p_base_unit_id uuid,
  p_conversion_factor text,
  p_unit_dimension text,
  p_status text,
  p_sort_order integer,
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
  v_unit public.catalog_units%ROWTYPE;
  v_conversion_factor numeric(18, 6);
  v_conversion_factor_text text;
  v_request jsonb;
  v_snapshot jsonb;
BEGIN
  IF p_unit_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
    OR p_code IS NULL
    OR btrim(p_code) = ''
    OR p_name IS NULL
    OR btrim(p_name) = ''
    OR p_symbol IS NULL
    OR btrim(p_symbol) = ''
    OR p_conversion_factor IS NULL
    OR btrim(p_conversion_factor) !~ '^[0-9]+([.][0-9]+)?$'
    OR char_length(
      ltrim(split_part(btrim(p_conversion_factor), '.', 1), '0')
    ) > 12
    OR char_length(
      split_part(btrim(p_conversion_factor), '.', 2)
    ) > 6
    OR p_unit_dimension IS NULL
    OR btrim(p_unit_dimension) = ''
    OR btrim(p_unit_dimension) = 'legacy_unclassified'
    OR p_status NOT IN ('active', 'inactive')
    OR p_sort_order IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'UNIT_CONVERSION_INVALID';
  END IF;

  PERFORM public.assert_platform_catalog_actor(
    p_actor_user_id,
    p_actor_employee_id
  );

  BEGIN
    v_conversion_factor := btrim(p_conversion_factor)::numeric(18, 6);
  EXCEPTION
    WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'UNIT_CONVERSION_INVALID';
  END;

  IF v_conversion_factor <= 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'UNIT_CONVERSION_INVALID';
  END IF;

  v_conversion_factor_text := rtrim(
    rtrim(v_conversion_factor::text, '0'),
    '.'
  );

  v_request := jsonb_build_object(
    'unit_id', p_unit_id,
    'tenant_id', NULL,
    'code', btrim(p_code),
    'name', btrim(p_name),
    'symbol', btrim(p_symbol),
    'base_unit_id', p_base_unit_id,
    'conversion_factor', v_conversion_factor_text,
    'unit_dimension', btrim(p_unit_dimension),
    'status', p_status,
    'sort_order', p_sort_order,
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
    IF v_event.from_state -> '_request' IS DISTINCT FROM v_request
      OR v_event.resource_type <> 'catalog_unit'
      OR v_event.command <> 'create_catalog_unit'
      OR v_event.resource_id IS DISTINCT FROM p_unit_id
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'status', 'created',
      'idempotent', true,
      'unit', v_event.to_state,
      'version', v_event.result_version
    );
  END IF;

  BEGIN
    INSERT INTO public.catalog_units (
      id,
      code,
      name,
      symbol,
      base_unit_id,
      conversion_factor,
      unit_dimension,
      status,
      sort_order,
      version,
      created_by_employee_id,
      updated_by_employee_id
    )
    VALUES (
      p_unit_id,
      btrim(p_code),
      btrim(p_name),
      btrim(p_symbol),
      p_base_unit_id,
      v_conversion_factor,
      btrim(p_unit_dimension),
      p_status,
      p_sort_order,
      1,
      p_actor_employee_id,
      p_actor_employee_id
    )
    RETURNING * INTO v_unit;
  EXCEPTION
    WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'UNIT_CONVERSION_INVALID';
    WHEN unique_violation OR check_violation OR not_null_violation
      OR foreign_key_violation THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_CATALOG_CONFLICT';
  END;

  v_snapshot := to_jsonb(v_unit) || jsonb_build_object(
    'conversion_factor', v_unit.conversion_factor::text
  );

  INSERT INTO public.supplier_command_events (
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
    'catalog_unit',
    v_unit.id,
    'create_catalog_unit',
    jsonb_build_object('_request', v_request),
    v_snapshot,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_unit.version
  );

  RETURN jsonb_build_object(
    'status', 'created',
    'idempotent', false,
    'unit', v_snapshot,
    'version', v_unit.version
  );
END;
$$;

CREATE FUNCTION public.create_tenant_catalog_category(
  p_category_id uuid,
  p_parent_id uuid,
  p_code text,
  p_name text,
  p_status text,
  p_sort_order integer,
  p_mapped_platform_category_id uuid,
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
  v_parent public.catalog_categories%ROWTYPE;
  v_mapped public.catalog_categories%ROWTYPE;
  v_category public.catalog_categories%ROWTYPE;
  v_request jsonb;
  v_snapshot jsonb;
BEGIN
  IF p_category_id IS NULL
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

  v_request := jsonb_build_object(
    'category_id', p_category_id,
    'parent_id', p_parent_id,
    'code', btrim(p_code),
    'name', btrim(p_name),
    'status', p_status,
    'sort_order', p_sort_order,
    'mapped_platform_category_id', p_mapped_platform_category_id,
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
      OR v_event.command <> 'create_tenant_catalog_category'
      OR v_event.resource_type <> 'catalog_category'
      OR v_event.resource_id IS DISTINCT FROM p_category_id
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;

    RETURN jsonb_build_object(
      'status', 'created',
      'idempotent', true,
      'catalog_category', v_event.to_state,
      'version', v_event.result_version
    );
  END IF;

  IF p_parent_id IS NOT NULL THEN
    SELECT category.*
    INTO v_parent
    FROM public.catalog_categories AS category
    WHERE category.id = p_parent_id
    FOR UPDATE;

    IF NOT FOUND
      OR v_parent.ownership_scope <> 'tenant'
      OR v_parent.owner_tenant_id IS DISTINCT FROM p_tenant_id
      OR v_parent.status <> 'active'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'CATEGORY_OWNERSHIP_CONFLICT';
    END IF;
  END IF;

  IF p_mapped_platform_category_id IS NOT NULL THEN
    SELECT category.*
    INTO v_mapped
    FROM public.catalog_categories AS category
    WHERE category.id = p_mapped_platform_category_id
    FOR SHARE;

    IF NOT FOUND
      OR v_mapped.ownership_scope <> 'platform'
      OR v_mapped.owner_tenant_id IS NOT NULL
      OR v_mapped.status <> 'active'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'CATEGORY_OWNERSHIP_CONFLICT';
    END IF;
  END IF;

  -- The deterministic 122000 hierarchy trigger reports
  -- SUPPLIER_CATALOG_CYCLE and SUPPLIER_CATALOG_DEPTH_EXCEEDED.
  BEGIN
    INSERT INTO public.catalog_categories (
      id,
      parent_id,
      code,
      name,
      status,
      sort_order,
      version,
      created_by_employee_id,
      updated_by_employee_id,
      ownership_scope,
      owner_tenant_id,
      mapped_platform_category_id
    )
    VALUES (
      p_category_id,
      p_parent_id,
      btrim(p_code),
      btrim(p_name),
      p_status,
      p_sort_order,
      1,
      p_actor_employee_id,
      p_actor_employee_id,
      'tenant',
      p_tenant_id,
      p_mapped_platform_category_id
    )
    RETURNING * INTO v_category;
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

  v_snapshot := to_jsonb(v_category);

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
    'catalog_category',
    v_category.id,
    'create_tenant_catalog_category',
    jsonb_build_object('_request', v_request),
    v_snapshot,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_category.version
  );

  RETURN jsonb_build_object(
    'status', 'created',
    'idempotent', false,
    'catalog_category', v_snapshot,
    'version', v_category.version
  );
END;
$$;

CREATE FUNCTION public.update_tenant_catalog_category(
  p_category_id uuid,
  p_parent_id uuid,
  p_code text,
  p_name text,
  p_status text,
  p_sort_order integer,
  p_mapped_platform_category_id uuid,
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
  v_parent public.catalog_categories%ROWTYPE;
  v_mapped public.catalog_categories%ROWTYPE;
  v_category public.catalog_categories%ROWTYPE;
  v_request jsonb;
  v_before jsonb;
  v_snapshot jsonb;
BEGIN
  IF p_category_id IS NULL
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

  v_request := jsonb_build_object(
    'category_id', p_category_id,
    'parent_id', p_parent_id,
    'code', btrim(p_code),
    'name', btrim(p_name),
    'status', p_status,
    'sort_order', p_sort_order,
    'mapped_platform_category_id', p_mapped_platform_category_id,
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
      OR v_event.command <> 'update_tenant_catalog_category'
      OR v_event.resource_type <> 'catalog_category'
      OR v_event.resource_id IS DISTINCT FROM p_category_id
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;

    RETURN jsonb_build_object(
      'status', 'updated',
      'idempotent', true,
      'catalog_category', v_event.to_state,
      'previous_catalog_category', v_event.from_state - '_request',
      'version', v_event.result_version
    );
  END IF;

  SELECT category.*
  INTO v_category
  FROM public.catalog_categories AS category
  WHERE category.id = p_category_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'CATEGORY_OWNERSHIP_CONFLICT';
  END IF;

  IF v_category.ownership_scope = 'platform' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SHARED_RESOURCE_READ_ONLY';
  END IF;

  IF v_category.ownership_scope <> 'tenant'
    OR v_category.owner_tenant_id IS DISTINCT FROM p_tenant_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'CATEGORY_OWNERSHIP_CONFLICT';
  END IF;

  IF v_category.version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_VERSION_CONFLICT',
      'version', v_category.version
    );
  END IF;

  IF p_parent_id IS NOT NULL THEN
    SELECT category.*
    INTO v_parent
    FROM public.catalog_categories AS category
    WHERE category.id = p_parent_id
    FOR UPDATE;

    IF NOT FOUND
      OR v_parent.ownership_scope <> 'tenant'
      OR v_parent.owner_tenant_id IS DISTINCT FROM p_tenant_id
      OR v_parent.status <> 'active'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'CATEGORY_OWNERSHIP_CONFLICT';
    END IF;
  END IF;

  IF p_mapped_platform_category_id IS NOT NULL THEN
    SELECT category.*
    INTO v_mapped
    FROM public.catalog_categories AS category
    WHERE category.id = p_mapped_platform_category_id
    FOR SHARE;

    IF NOT FOUND
      OR v_mapped.ownership_scope <> 'platform'
      OR v_mapped.owner_tenant_id IS NOT NULL
      OR v_mapped.status <> 'active'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'CATEGORY_OWNERSHIP_CONFLICT';
    END IF;
  END IF;

  v_before := to_jsonb(v_category);

  -- The deterministic 122000 hierarchy trigger reports
  -- SUPPLIER_CATALOG_CYCLE and SUPPLIER_CATALOG_DEPTH_EXCEEDED.
  BEGIN
    UPDATE public.catalog_categories AS category
    SET parent_id = p_parent_id,
        code = btrim(p_code),
        name = btrim(p_name),
        status = p_status,
        sort_order = p_sort_order,
        mapped_platform_category_id = p_mapped_platform_category_id,
        updated_by_employee_id = p_actor_employee_id,
        version = v_category.version + 1
    WHERE category.id = v_category.id
    RETURNING * INTO v_category;
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

  v_snapshot := to_jsonb(v_category);

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
    'catalog_category',
    v_category.id,
    'update_tenant_catalog_category',
    v_before || jsonb_build_object('_request', v_request),
    v_snapshot,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_category.version
  );

  RETURN jsonb_build_object(
    'status', 'updated',
    'idempotent', false,
    'catalog_category', v_snapshot,
    'previous_catalog_category', v_before,
    'version', v_category.version
  );
END;
$$;

CREATE FUNCTION public.create_tenant_catalog_brand(
  p_brand_id uuid,
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
  v_mapped public.catalog_brands%ROWTYPE;
  v_brand public.catalog_brands%ROWTYPE;
  v_request jsonb;
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

  v_request := jsonb_build_object(
    'brand_id', p_brand_id,
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
        MESSAGE = 'BRAND_OWNERSHIP_CONFLICT';
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

  v_request := jsonb_build_object(
    'brand_id', p_brand_id,
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
    SET code = btrim(p_code),
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
        MESSAGE = 'BRAND_OWNERSHIP_CONFLICT';
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

CREATE FUNCTION public.create_catalog_spec_definition(
  p_spec_definition_id uuid,
  p_category_id uuid,
  p_code text,
  p_name text,
  p_value_type text,
  p_enum_options jsonb,
  p_unit_dimension text,
  p_is_required boolean,
  p_participates_in_sku_name boolean,
  p_is_filterable boolean,
  p_sort_order integer,
  p_status text,
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
  v_spec public.catalog_spec_definitions%ROWTYPE;
  v_request jsonb;
  v_snapshot jsonb;
  v_ownership_scope text := CASE
    WHEN p_tenant_id IS NULL THEN 'platform'
    ELSE 'tenant'
  END;
BEGIN
  IF p_spec_definition_id IS NULL
    OR p_category_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
    OR p_code IS NULL
    OR btrim(p_code) = ''
    OR p_name IS NULL
    OR btrim(p_name) = ''
    OR p_value_type IS NULL
    OR p_enum_options IS NULL
    OR p_is_required IS NULL
    OR p_participates_in_sku_name IS NULL
    OR p_is_filterable IS NULL
    OR p_sort_order IS NULL
    OR p_status IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SPEC_TEMPLATE_VALIDATION_ERROR';
  END IF;

  IF p_tenant_id IS NULL THEN
    PERFORM public.assert_platform_catalog_actor(
      p_actor_user_id,
      p_actor_employee_id
    );
  ELSE
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
  END IF;

  v_request := jsonb_build_object(
    'spec_definition_id', p_spec_definition_id,
    'category_id', p_category_id,
    'code', btrim(p_code),
    'name', btrim(p_name),
    'value_type', p_value_type,
    'enum_options', p_enum_options,
    'unit_dimension', CASE
      WHEN p_unit_dimension IS NULL THEN NULL
      ELSE btrim(p_unit_dimension)
    END,
    'is_required', p_is_required,
    'participates_in_sku_name', p_participates_in_sku_name,
    'is_filterable', p_is_filterable,
    'sort_order', p_sort_order,
    'status', p_status,
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
      OR v_event.command <> 'create_catalog_spec_definition'
      OR v_event.resource_type <> 'catalog_spec_definition'
      OR v_event.resource_id IS DISTINCT FROM p_spec_definition_id
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;

    RETURN jsonb_build_object(
      'status', 'created',
      'idempotent', true,
      'spec_definition', v_event.to_state,
      'version', v_event.result_version
    );
  END IF;

  SELECT category.*
  INTO v_category
  FROM public.catalog_categories AS category
  WHERE category.id = p_category_id
  FOR SHARE;

  IF NOT FOUND
    OR v_category.status <> 'active'
    OR NOT v_category.is_leaf
    OR v_category.ownership_scope IS DISTINCT FROM v_ownership_scope
    OR v_category.owner_tenant_id IS DISTINCT FROM p_tenant_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SPEC_TEMPLATE_VALIDATION_ERROR';
  END IF;

  BEGIN
    INSERT INTO public.catalog_spec_definitions (
      id,
      category_id,
      code,
      name,
      value_type,
      enum_options,
      unit_dimension,
      is_required,
      participates_in_sku_name,
      is_filterable,
      sort_order,
      status,
      version,
      ownership_scope,
      owner_tenant_id,
      source_platform_spec_id,
      created_by_employee_id,
      updated_by_employee_id
    )
    VALUES (
      p_spec_definition_id,
      p_category_id,
      btrim(p_code),
      btrim(p_name),
      p_value_type,
      p_enum_options,
      CASE
        WHEN p_unit_dimension IS NULL THEN NULL
        ELSE btrim(p_unit_dimension)
      END,
      p_is_required,
      p_participates_in_sku_name,
      p_is_filterable,
      p_sort_order,
      p_status,
      1,
      v_ownership_scope,
      p_tenant_id,
      NULL,
      p_actor_employee_id,
      p_actor_employee_id
    )
    RETURNING * INTO v_spec;
  EXCEPTION
    WHEN unique_violation OR check_violation OR not_null_violation
      OR foreign_key_violation THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SPEC_TEMPLATE_VALIDATION_ERROR';
  END;

  v_snapshot := to_jsonb(v_spec);

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
    'catalog_spec_definition',
    v_spec.id,
    'create_catalog_spec_definition',
    jsonb_build_object('_request', v_request),
    v_snapshot,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_spec.version
  );

  RETURN jsonb_build_object(
    'status', 'created',
    'idempotent', false,
    'spec_definition', v_snapshot,
    'version', v_spec.version
  );
END;
$$;

CREATE FUNCTION public.update_catalog_spec_definition(
  p_spec_definition_id uuid,
  p_category_id uuid,
  p_code text,
  p_name text,
  p_value_type text,
  p_enum_options jsonb,
  p_unit_dimension text,
  p_is_required boolean,
  p_participates_in_sku_name boolean,
  p_is_filterable boolean,
  p_sort_order integer,
  p_status text,
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
  v_spec public.catalog_spec_definitions%ROWTYPE;
  v_request jsonb;
  v_before jsonb;
  v_snapshot jsonb;
  v_ownership_scope text := CASE
    WHEN p_tenant_id IS NULL THEN 'platform'
    ELSE 'tenant'
  END;
BEGIN
  IF p_spec_definition_id IS NULL
    OR p_category_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
    OR p_code IS NULL
    OR btrim(p_code) = ''
    OR p_name IS NULL
    OR btrim(p_name) = ''
    OR p_value_type IS NULL
    OR p_enum_options IS NULL
    OR p_is_required IS NULL
    OR p_participates_in_sku_name IS NULL
    OR p_is_filterable IS NULL
    OR p_sort_order IS NULL
    OR p_status IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version < 1
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SPEC_TEMPLATE_VALIDATION_ERROR';
  END IF;

  IF p_tenant_id IS NULL THEN
    PERFORM public.assert_platform_catalog_actor(
      p_actor_user_id,
      p_actor_employee_id
    );
  ELSE
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
  END IF;

  v_request := jsonb_build_object(
    'spec_definition_id', p_spec_definition_id,
    'category_id', p_category_id,
    'code', btrim(p_code),
    'name', btrim(p_name),
    'value_type', p_value_type,
    'enum_options', p_enum_options,
    'unit_dimension', CASE
      WHEN p_unit_dimension IS NULL THEN NULL
      ELSE btrim(p_unit_dimension)
    END,
    'is_required', p_is_required,
    'participates_in_sku_name', p_participates_in_sku_name,
    'is_filterable', p_is_filterable,
    'sort_order', p_sort_order,
    'status', p_status,
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
      OR v_event.command <> 'update_catalog_spec_definition'
      OR v_event.resource_type <> 'catalog_spec_definition'
      OR v_event.resource_id IS DISTINCT FROM p_spec_definition_id
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;

    RETURN jsonb_build_object(
      'status', 'updated',
      'idempotent', true,
      'spec_definition', v_event.to_state,
      'previous_spec_definition', v_event.from_state - '_request',
      'version', v_event.result_version
    );
  END IF;

  SELECT definition.*
  INTO v_spec
  FROM public.catalog_spec_definitions AS definition
  WHERE definition.id = p_spec_definition_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_spec.category_id IS DISTINCT FROM p_category_id
    OR v_spec.ownership_scope IS DISTINCT FROM v_ownership_scope
    OR v_spec.owner_tenant_id IS DISTINCT FROM p_tenant_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = CASE
        WHEN p_tenant_id IS NULL THEN 'SPEC_TEMPLATE_VALIDATION_ERROR'
        ELSE 'SHARED_RESOURCE_READ_ONLY'
      END;
  END IF;

  IF v_spec.version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_VERSION_CONFLICT',
      'version', v_spec.version
    );
  END IF;

  SELECT category.*
  INTO v_category
  FROM public.catalog_categories AS category
  WHERE category.id = p_category_id
  FOR SHARE;

  IF NOT FOUND
    OR v_category.status <> 'active'
    OR NOT v_category.is_leaf
    OR v_category.ownership_scope IS DISTINCT FROM v_ownership_scope
    OR v_category.owner_tenant_id IS DISTINCT FROM p_tenant_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SPEC_TEMPLATE_VALIDATION_ERROR';
  END IF;

  v_before := to_jsonb(v_spec);

  BEGIN
    UPDATE public.catalog_spec_definitions AS definition
    SET code = btrim(p_code),
        name = btrim(p_name),
        value_type = p_value_type,
        enum_options = p_enum_options,
        unit_dimension = CASE
          WHEN p_unit_dimension IS NULL THEN NULL
          ELSE btrim(p_unit_dimension)
        END,
        is_required = p_is_required,
        participates_in_sku_name = p_participates_in_sku_name,
        is_filterable = p_is_filterable,
        sort_order = p_sort_order,
        status = p_status,
        updated_by_employee_id = p_actor_employee_id,
        version = v_spec.version + 1
    WHERE definition.id = v_spec.id
    RETURNING * INTO v_spec;
  EXCEPTION
    WHEN unique_violation OR check_violation OR not_null_violation
      OR foreign_key_violation THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SPEC_TEMPLATE_VALIDATION_ERROR';
  END;

  v_snapshot := to_jsonb(v_spec);

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
    'catalog_spec_definition',
    v_spec.id,
    'update_catalog_spec_definition',
    v_before || jsonb_build_object('_request', v_request),
    v_snapshot,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_spec.version
  );

  RETURN jsonb_build_object(
    'status', 'updated',
    'idempotent', false,
    'spec_definition', v_snapshot,
    'previous_spec_definition', v_before,
    'version', v_spec.version
  );
END;
$$;

CREATE FUNCTION public.copy_platform_category_specs(
  p_tenant_category_id uuid,
  p_platform_category_id uuid,
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
  tenant_category public.catalog_categories%ROWTYPE;
  platform_category public.catalog_categories%ROWTYPE;
  v_request jsonb;
  v_before jsonb;
  v_copied_count integer;
  v_copied_ids jsonb;
  v_result jsonb;
BEGIN
  IF p_tenant_category_id IS NULL
    OR p_platform_category_id IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version < 1
    OR p_tenant_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SPEC_TEMPLATE_VALIDATION_ERROR';
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

  v_request := jsonb_build_object(
    'tenant_category_id', p_tenant_category_id,
    'platform_category_id', p_platform_category_id,
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
      OR v_event.command <> 'copy_platform_category_specs'
      OR v_event.resource_type <> 'catalog_category'
      OR v_event.resource_id IS DISTINCT FROM p_tenant_category_id
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;

    RETURN (v_event.to_state -> '_result') ||
      jsonb_build_object('idempotent', true);
  END IF;

  SELECT category.*
  INTO tenant_category
  FROM public.catalog_categories AS category
  WHERE category.id = p_tenant_category_id
  FOR UPDATE;

  IF NOT FOUND
    OR tenant_category.ownership_scope <> 'tenant'
    OR tenant_category.owner_tenant_id IS DISTINCT FROM p_tenant_id
    OR tenant_category.status <> 'active'
    OR NOT tenant_category.is_leaf
    OR tenant_category.mapped_platform_category_id IS DISTINCT FROM
      p_platform_category_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'CATEGORY_OWNERSHIP_CONFLICT';
  END IF;

  IF tenant_category.version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_VERSION_CONFLICT',
      'version', tenant_category.version
    );
  END IF;

  SELECT category.*
  INTO platform_category
  FROM public.catalog_categories AS category
  WHERE category.id = p_platform_category_id
  FOR SHARE;

  IF NOT FOUND
    OR platform_category.ownership_scope <> 'platform'
    OR platform_category.owner_tenant_id IS NOT NULL
    OR platform_category.status <> 'active'
    OR NOT platform_category.is_leaf
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'CATEGORY_OWNERSHIP_CONFLICT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_spec_definitions AS source
    JOIN public.catalog_spec_definitions AS target
      ON target.category_id = tenant_category.id
      AND target.code = source.code
    WHERE source.category_id = platform_category.id
      AND source.ownership_scope = 'platform'
      AND source.owner_tenant_id IS NULL
      AND source.status = 'active'
      AND target.source_platform_spec_id IS DISTINCT FROM source.id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SPEC_TEMPLATE_VALIDATION_ERROR';
  END IF;

  v_before := to_jsonb(tenant_category);

  WITH inserted_specs AS (
    INSERT INTO public.catalog_spec_definitions (
      id,
      category_id,
      code,
      name,
      value_type,
      enum_options,
      unit_dimension,
      is_required,
      participates_in_sku_name,
      is_filterable,
      sort_order,
      status,
      version,
      ownership_scope,
      owner_tenant_id,
      source_platform_spec_id,
      created_by_employee_id,
      updated_by_employee_id
    )
    SELECT
      gen_random_uuid(),
      tenant_category.id,
      source.code,
      source.name,
      source.value_type,
      source.enum_options,
      source.unit_dimension,
      source.is_required,
      source.participates_in_sku_name,
      source.is_filterable,
      source.sort_order,
      source.status,
      1,
      'tenant',
      p_tenant_id,
      source.id,
      p_actor_employee_id,
      p_actor_employee_id
    FROM public.catalog_spec_definitions AS source
    WHERE source.category_id = platform_category.id
      AND source.ownership_scope = 'platform'
      AND source.owner_tenant_id IS NULL
      AND source.status = 'active'
    ON CONFLICT (category_id, source_platform_spec_id)
      WHERE source_platform_spec_id IS NOT NULL
    DO NOTHING
    RETURNING id
  )
  SELECT
    count(*)::integer,
    COALESCE(jsonb_agg(inserted_specs.id ORDER BY inserted_specs.id), '[]'::jsonb)
  INTO v_copied_count, v_copied_ids
  FROM inserted_specs;

  UPDATE public.catalog_categories AS category
  SET version = tenant_category.version + 1,
      updated_by_employee_id = p_actor_employee_id
  WHERE category.id = tenant_category.id
  RETURNING * INTO tenant_category;

  v_result := jsonb_build_object(
    'status', 'copied',
    'copied_count', v_copied_count,
    'ids', v_copied_ids,
    'idempotent', false,
    'version', tenant_category.version
  );

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
    'catalog_category',
    tenant_category.id,
    'copy_platform_category_specs',
    v_before || jsonb_build_object('_request', v_request),
    to_jsonb(tenant_category) || jsonb_build_object('_result', v_result),
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    tenant_category.version
  );

  RETURN v_result;
END;
$$;

CREATE FUNCTION public.submit_tenant_catalog_unit_suggestion(
  p_suggestion_id uuid,
  p_suggested_code text,
  p_suggested_name text,
  p_suggested_symbol text,
  p_unit_dimension text,
  p_reason text,
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
  v_suggestion public.catalog_unit_suggestions%ROWTYPE;
  v_request jsonb;
  v_snapshot jsonb;
BEGIN
  IF p_suggestion_id IS NULL
    OR p_tenant_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
    OR p_suggested_code IS NULL
    OR btrim(p_suggested_code) = ''
    OR p_suggested_name IS NULL
    OR btrim(p_suggested_name) = ''
    OR p_suggested_symbol IS NULL
    OR btrim(p_suggested_symbol) = ''
    OR p_unit_dimension IS NULL
    OR btrim(p_unit_dimension) = ''
    OR (p_reason IS NOT NULL AND btrim(p_reason) = '')
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

  v_request := jsonb_build_object(
    'suggestion_id', p_suggestion_id,
    'suggested_code', upper(btrim(p_suggested_code)),
    'suggested_name', btrim(p_suggested_name),
    'suggested_symbol', btrim(p_suggested_symbol),
    'unit_dimension', btrim(p_unit_dimension),
    'expected_version', NULL,
    'reason', CASE
      WHEN p_reason IS NULL THEN NULL
      ELSE btrim(p_reason)
    END,
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
      OR v_event.command <> 'submit_tenant_catalog_unit_suggestion'
      OR v_event.resource_type <> 'catalog_unit_suggestion'
      OR v_event.resource_id IS DISTINCT FROM p_suggestion_id
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;

    RETURN jsonb_build_object(
      'status', 'submitted',
      'idempotent', true,
      'catalog_unit_suggestion', v_event.to_state,
      'version', v_event.result_version
    );
  END IF;

  BEGIN
    INSERT INTO public.catalog_unit_suggestions (
      id,
      tenant_id,
      suggested_code,
      suggested_name,
      suggested_symbol,
      unit_dimension,
      reason,
      status,
      version,
      submitted_by_employee_id
    )
    VALUES (
      p_suggestion_id,
      p_tenant_id,
      upper(btrim(p_suggested_code)),
      btrim(p_suggested_name),
      btrim(p_suggested_symbol),
      btrim(p_unit_dimension),
      CASE
        WHEN p_reason IS NULL THEN NULL
        ELSE btrim(p_reason)
      END,
      'submitted',
      1,
      p_actor_employee_id
    )
    RETURNING * INTO v_suggestion;
  EXCEPTION
    WHEN unique_violation OR check_violation OR not_null_violation THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_CATALOG_CONFLICT';
    WHEN foreign_key_violation THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PROXY_ACTOR_INVALID';
  END;

  v_snapshot := to_jsonb(v_suggestion);

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
    'catalog_unit_suggestion',
    v_suggestion.id,
    'submit_tenant_catalog_unit_suggestion',
    jsonb_build_object('_request', v_request),
    v_snapshot,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_suggestion.version
  );

  RETURN jsonb_build_object(
    'status', 'submitted',
    'idempotent', false,
    'catalog_unit_suggestion', v_snapshot,
    'version', v_suggestion.version
  );
END;
$$;

CREATE FUNCTION public.list_catalog_unit_suggestions(
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_status text DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_tenant_id uuid;
  v_effective_tenant_id uuid;
  v_page integer := COALESCE(p_page, 1);
  v_page_size integer := COALESCE(p_page_size, 20);
  v_total bigint;
  v_list jsonb;
BEGIN
  IF p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR v_page < 1
    OR v_page_size < 1
    OR p_page_size > 100
    OR (
      p_status IS NOT NULL
      AND p_status NOT IN ('submitted', 'approved', 'rejected')
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_CATALOG_CONFLICT';
  END IF;

  SELECT employee.tenant_id
  INTO v_actor_tenant_id
  FROM public.employees AS employee
  WHERE employee.id = p_actor_employee_id
    AND employee.user_id = p_actor_user_id
    AND employee.status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PROXY_ACTOR_INVALID';
  END IF;

  IF v_actor_tenant_id IS NULL THEN
    PERFORM public.assert_platform_catalog_actor(
      p_actor_user_id,
      p_actor_employee_id
    );
    v_effective_tenant_id := p_tenant_id;
  ELSE
    PERFORM public.assert_tenant_supplier_actor(
      v_actor_tenant_id,
      p_actor_user_id,
      p_actor_employee_id
    );

    IF p_tenant_id IS NOT NULL
      AND p_tenant_id IS DISTINCT FROM v_actor_tenant_id
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PROXY_ACTOR_INVALID';
    END IF;

    v_effective_tenant_id := v_actor_tenant_id;

    PERFORM setting.tenant_id
    FROM public.tenant_supplier_settings AS setting
    WHERE setting.tenant_id = v_actor_tenant_id
      AND setting.module_enabled
      AND setting.ownership_reads_enabled
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_OWNERSHIP_READS_DISABLED';
    END IF;
  END IF;

  WITH filtered_total AS (
    SELECT count(*) AS total
    FROM public.catalog_unit_suggestions AS suggestion
    WHERE (p_status IS NULL OR suggestion.status = p_status)
      AND (
        v_effective_tenant_id IS NULL
        OR suggestion.tenant_id = v_effective_tenant_id
      )
  ), page_rows AS (
    SELECT suggestion.*
    FROM public.catalog_unit_suggestions AS suggestion
    WHERE (p_status IS NULL OR suggestion.status = p_status)
      AND (
        v_effective_tenant_id IS NULL
        OR suggestion.tenant_id = v_effective_tenant_id
      )
    ORDER BY suggestion.created_at DESC, suggestion.id DESC
    LIMIT v_page_size
    OFFSET (v_page::bigint - 1) * v_page_size
  )
  SELECT
    filtered_total.total,
    COALESCE(
      jsonb_agg(to_jsonb(page_rows) ORDER BY page_rows.created_at DESC, page_rows.id DESC)
        FILTER (WHERE page_rows.id IS NOT NULL),
      '[]'::jsonb
    )
  INTO v_total, v_list
  FROM filtered_total
  LEFT JOIN page_rows ON true
  GROUP BY filtered_total.total;

  RETURN jsonb_build_object(
    'list', v_list,
    'pagination', jsonb_build_object(
      'page', v_page,
      'pageSize', v_page_size,
      'total', v_total,
      'totalPages', CEIL(v_total::numeric / v_page_size)::integer
    )
  );
END;
$$;

CREATE FUNCTION public.review_catalog_unit_suggestion(
  p_suggestion_id uuid,
  p_action text,
  p_approved_catalog_unit_id uuid,
  p_review_remark text,
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
  v_suggestion public.catalog_unit_suggestions%ROWTYPE;
  v_request jsonb;
  v_before jsonb;
  v_snapshot jsonb;
  v_reviewed_at timestamptz := clock_timestamp();
BEGIN
  IF p_suggestion_id IS NULL
    OR p_action IS NULL
    OR p_action NOT IN ('approved', 'rejected')
    OR p_expected_version IS NULL
    OR p_expected_version < 1
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
    OR (p_review_remark IS NOT NULL AND btrim(p_review_remark) = '')
    OR (
      p_action = 'approved'
      AND p_approved_catalog_unit_id IS NULL
    )
    OR (
      p_action = 'rejected'
      AND (
        p_approved_catalog_unit_id IS NOT NULL
        OR p_review_remark IS NULL
        OR btrim(p_review_remark) = ''
      )
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_CATALOG_CONFLICT';
  END IF;

  PERFORM public.assert_platform_catalog_actor(
    p_actor_user_id,
    p_actor_employee_id
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' || p_idempotency_key,
      0
    )
  );

  SELECT suggestion.*
  INTO v_suggestion
  FROM public.catalog_unit_suggestions AS suggestion
  WHERE suggestion.id = p_suggestion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_CONFLICT';
  END IF;

  v_request := jsonb_build_object(
    'suggestion_id', p_suggestion_id,
    'tenant_id', v_suggestion.tenant_id,
    'action', p_action,
    'approved_catalog_unit_id', p_approved_catalog_unit_id,
    'review_remark', CASE
      WHEN p_review_remark IS NULL THEN NULL
      ELSE btrim(p_review_remark)
    END,
    'expected_version', p_expected_version,
    'actor_employee_id', p_actor_employee_id
  );

  SELECT event.*
  INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.command <> 'review_catalog_unit_suggestion'
      OR v_event.resource_type <> 'catalog_unit_suggestion'
      OR v_event.resource_id IS DISTINCT FROM p_suggestion_id
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;

    RETURN jsonb_build_object(
      'status', p_action,
      'idempotent', true,
      'catalog_unit_suggestion', v_event.to_state,
      'previous_catalog_unit_suggestion', v_event.from_state - '_request',
      'version', v_event.result_version
    );
  END IF;

  IF v_suggestion.version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_VERSION_CONFLICT',
      'version', v_suggestion.version
    );
  END IF;

  IF v_suggestion.status <> 'submitted' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_STATE_CONFLICT';
  END IF;

  IF p_action = 'approved' THEN
    PERFORM approved_unit.id
    FROM public.catalog_units AS approved_unit
    WHERE approved_unit.id = p_approved_catalog_unit_id
      AND approved_unit.status = 'active'
      AND approved_unit.unit_dimension IS NOT DISTINCT FROM
        v_suggestion.unit_dimension
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_CATALOG_CONFLICT';
    END IF;
  END IF;

  v_before := to_jsonb(v_suggestion);

  UPDATE public.catalog_unit_suggestions AS suggestion
  SET status = p_action,
      reviewed_by_employee_id = p_actor_employee_id,
      reviewed_at = v_reviewed_at,
      review_remark = CASE
        WHEN p_review_remark IS NULL THEN NULL
        ELSE btrim(p_review_remark)
      END,
      approved_catalog_unit_id = p_approved_catalog_unit_id,
      version = v_suggestion.version + 1
  WHERE suggestion.id = v_suggestion.id
  RETURNING * INTO v_suggestion;

  v_snapshot := to_jsonb(v_suggestion);

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
    v_suggestion.tenant_id,
    'catalog_unit_suggestion',
    v_suggestion.id,
    'review_catalog_unit_suggestion',
    v_before || jsonb_build_object('_request', v_request),
    v_snapshot,
    CASE
      WHEN p_review_remark IS NULL THEN NULL
      ELSE btrim(p_review_remark)
    END,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_suggestion.version
  );

  RETURN jsonb_build_object(
    'status', p_action,
    'idempotent', false,
    'catalog_unit_suggestion', v_snapshot,
    'previous_catalog_unit_suggestion', v_before,
    'version', v_suggestion.version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_catalog_unit(
  uuid, text, text, text, uuid, text, text, text, integer, uuid, uuid, text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_catalog_unit(
  uuid, text, text, text, uuid, text, text, text, integer, uuid, uuid, text
)
TO service_role;

REVOKE ALL ON FUNCTION public.create_tenant_catalog_category(
  uuid, uuid, text, text, text, integer, uuid, uuid, uuid, uuid, text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_tenant_catalog_category(
  uuid, uuid, text, text, text, integer, uuid, uuid, uuid, uuid, text
)
TO service_role;

REVOKE ALL ON FUNCTION public.update_tenant_catalog_category(
  uuid, uuid, text, text, text, integer, uuid, integer, uuid, uuid, uuid, text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.update_tenant_catalog_category(
  uuid, uuid, text, text, text, integer, uuid, integer, uuid, uuid, uuid, text
)
TO service_role;

REVOKE ALL ON FUNCTION public.create_tenant_catalog_brand(
  uuid, text, text, text, uuid, text, integer, uuid, uuid, uuid, uuid, text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_tenant_catalog_brand(
  uuid, text, text, text, uuid, text, integer, uuid, uuid, uuid, uuid, text
)
TO service_role;

REVOKE ALL ON FUNCTION public.update_tenant_catalog_brand(
  uuid, text, text, text, uuid, text, integer, uuid, integer, uuid, uuid, uuid, text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.update_tenant_catalog_brand(
  uuid, text, text, text, uuid, text, integer, uuid, integer, uuid, uuid, uuid, text
)
TO service_role;

REVOKE ALL ON FUNCTION public.create_catalog_spec_definition(
  uuid, uuid, text, text, text, jsonb, text, boolean, boolean, boolean, integer, text, uuid, uuid, uuid, text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_catalog_spec_definition(
  uuid, uuid, text, text, text, jsonb, text, boolean, boolean, boolean, integer, text, uuid, uuid, uuid, text
)
TO service_role;

REVOKE ALL ON FUNCTION public.update_catalog_spec_definition(
  uuid, uuid, text, text, text, jsonb, text, boolean, boolean, boolean, integer, text, integer, uuid, uuid, uuid, text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.update_catalog_spec_definition(
  uuid, uuid, text, text, text, jsonb, text, boolean, boolean, boolean, integer, text, integer, uuid, uuid, uuid, text
)
TO service_role;

REVOKE ALL ON FUNCTION public.copy_platform_category_specs(
  uuid, uuid, integer, uuid, uuid, uuid, text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.copy_platform_category_specs(
  uuid, uuid, integer, uuid, uuid, uuid, text
)
TO service_role;

REVOKE ALL ON FUNCTION public.submit_tenant_catalog_unit_suggestion(
  uuid, text, text, text, text, text, uuid, uuid, uuid, text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.submit_tenant_catalog_unit_suggestion(
  uuid, text, text, text, text, text, uuid, uuid, uuid, text
)
TO service_role;

REVOKE ALL ON FUNCTION public.list_catalog_unit_suggestions(
  uuid, uuid, text, uuid, integer, integer
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.list_catalog_unit_suggestions(
  uuid, uuid, text, uuid, integer, integer
)
TO service_role;

REVOKE ALL ON FUNCTION public.review_catalog_unit_suggestion(
  uuid, text, uuid, text, integer, uuid, uuid, text
)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.review_catalog_unit_suggestion(
  uuid, text, uuid, text, integer, uuid, uuid, text
)
TO service_role;


DO $canonical_command_signatures$
DECLARE
  v_unexpected text[];
  v_bad_owners text[];
BEGIN
  SELECT array_agg(
    procedure.proname || '(' ||
      pg_catalog.oidvectortypes(procedure.proargtypes) || ')'
    ORDER BY procedure.proname, procedure.proargtypes::text
  )
  INTO v_unexpected
  FROM pg_proc AS procedure
  JOIN pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname = ANY (ARRAY[
      'create_catalog_unit', 'create_tenant_catalog_category',
      'update_tenant_catalog_category', 'create_tenant_catalog_brand',
      'update_tenant_catalog_brand', 'create_catalog_spec_definition',
      'update_catalog_spec_definition', 'copy_platform_category_specs',
      'submit_catalog_unit_suggestion',
      'submit_tenant_catalog_unit_suggestion',
      'list_catalog_unit_suggestions', 'review_catalog_unit_suggestion'
    ]::text[])
    AND procedure.oid <> ALL (ARRAY[
      'public.create_catalog_unit(uuid,text,text,text,uuid,text,text,text,integer,uuid,uuid,text)'::regprocedure,
      'public.create_tenant_catalog_category(uuid,uuid,text,text,text,integer,uuid,uuid,uuid,uuid,text)'::regprocedure,
      'public.update_tenant_catalog_category(uuid,uuid,text,text,text,integer,uuid,integer,uuid,uuid,uuid,text)'::regprocedure,
      'public.create_tenant_catalog_brand(uuid,text,text,text,uuid,text,integer,uuid,uuid,uuid,uuid,text)'::regprocedure,
      'public.update_tenant_catalog_brand(uuid,text,text,text,uuid,text,integer,uuid,integer,uuid,uuid,uuid,text)'::regprocedure,
      'public.create_catalog_spec_definition(uuid,uuid,text,text,text,jsonb,text,boolean,boolean,boolean,integer,text,uuid,uuid,uuid,text)'::regprocedure,
      'public.update_catalog_spec_definition(uuid,uuid,text,text,text,jsonb,text,boolean,boolean,boolean,integer,text,integer,uuid,uuid,uuid,text)'::regprocedure,
      'public.copy_platform_category_specs(uuid,uuid,integer,uuid,uuid,uuid,text)'::regprocedure,
      'public.submit_tenant_catalog_unit_suggestion(uuid,text,text,text,text,text,uuid,uuid,uuid,text)'::regprocedure,
      'public.list_catalog_unit_suggestions(uuid,uuid,text,uuid,integer,integer)'::regprocedure,
      'public.review_catalog_unit_suggestion(uuid,text,uuid,text,integer,uuid,uuid,text)'::regprocedure
    ]);

  IF v_unexpected IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_COMMAND_SCHEMA_UNSUPPORTED',
      DETAIL = 'unexpected command overloads remain: ' ||
        array_to_string(v_unexpected, ', ');
  END IF;

  SELECT array_agg(procedure.proname ORDER BY procedure.proname)
  INTO v_bad_owners
  FROM pg_proc AS procedure
  JOIN pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  JOIN pg_roles AS owner_role
    ON owner_role.oid = procedure.proowner
  WHERE namespace.nspname = 'public'
    AND procedure.proname = ANY (ARRAY[
      'assert_tenant_supplier_actor', 'assert_platform_catalog_actor',
      'create_catalog_unit', 'create_tenant_catalog_category',
      'update_tenant_catalog_category', 'create_tenant_catalog_brand',
      'update_tenant_catalog_brand', 'create_catalog_spec_definition',
      'update_catalog_spec_definition', 'copy_platform_category_specs',
      'submit_tenant_catalog_unit_suggestion',
      'list_catalog_unit_suggestions', 'review_catalog_unit_suggestion'
    ]::text[])
    AND owner_role.rolname = ANY (
      ARRAY['anon', 'authenticated', 'service_role']
    );

  IF v_bad_owners IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'FUNCTION_OWNER_INVALID',
      DETAIL = array_to_string(v_bad_owners, ', ');
  END IF;
END
$canonical_command_signatures$;

COMMIT;
