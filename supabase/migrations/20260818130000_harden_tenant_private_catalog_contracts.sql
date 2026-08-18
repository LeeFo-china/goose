-- Rollback: forward-only. If this validation rejects the materialized schema,
-- correct the affected invariant in a later migration. Do not restore old
-- constraints, helper functions, indexes, or browser-role access.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

-- 122000 owns physical materialization. This migration is deliberately a
-- validation-only release gate and has no dependency on future command RPCs.
DO $$
DECLARE
  v_missing_constraints text[];
  v_missing_indexes text[];
  v_missing_triggers text[];
  v_catalog_trigger_count integer;
  v_duplicate_index_groups integer;
  v_no_brand_count integer;
  v_no_brand_identity_count integer;
BEGIN
  -- Production runner identity is checked by the release workflow before any
  -- SQL. Keeping it out of this gate lets Supabase CLI use its isolated shadow
  -- migration role while validating the same materialized schema.
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'catalog_spec_definitions'
      AND column_name = 'enum_options'
      AND udt_name = 'jsonb'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'catalog_unit_suggestions'
      AND column_name = 'version'
      AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'catalog_categories'
      AND column_name = 'full_name'
      AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_SCHEMA_PRECONDITION_FAILED',
      DETAIL = '122000 materialized columns are missing or incomplete';
  END IF;

  WITH expected_constraints(table_name, constraint_name) AS (
    VALUES
      ('catalog_categories', 'catalog_categories_v2_level_check'),
      ('catalog_categories', 'catalog_categories_v2_full_name_check'),
      ('catalog_categories', 'catalog_categories_v2_full_name_not_null'),
      ('catalog_categories', 'catalog_categories_v2_mapping_scope_check'),
      ('catalog_brands', 'catalog_brands_v2_mapping_scope_check'),
      ('catalog_spec_definitions', 'catalog_spec_definitions_v2_enum_options_check'),
      ('catalog_spec_definitions', 'catalog_spec_definitions_v2_unit_dimension_check'),
      ('catalog_spec_definitions', 'catalog_spec_definitions_v2_ownership_check'),
      ('catalog_unit_suggestions', 'catalog_unit_suggestions_v2_code_check'),
      ('catalog_unit_suggestions', 'catalog_unit_suggestions_v2_name_check'),
      ('catalog_unit_suggestions', 'catalog_unit_suggestions_v2_symbol_check'),
      ('catalog_unit_suggestions', 'catalog_unit_suggestions_v2_dimension_check'),
      ('catalog_unit_suggestions', 'catalog_unit_suggestions_v2_reason_check'),
      ('catalog_unit_suggestions', 'catalog_unit_suggestions_v2_status_check'),
      ('catalog_unit_suggestions', 'catalog_unit_suggestions_v2_version_check'),
      ('catalog_unit_suggestions', 'catalog_unit_suggestions_v2_review_remark_check'),
      ('catalog_unit_suggestions', 'catalog_unit_suggestions_v2_review_state_check'),
      ('catalog_units', 'catalog_units_v2_dimension_check'),
      ('catalog_units', 'catalog_units_v2_dimension_not_null')
  )
  SELECT array_agg(
    expected_constraint.table_name || '.' ||
      expected_constraint.constraint_name
    ORDER BY expected_constraint.table_name,
      expected_constraint.constraint_name
  )
  INTO v_missing_constraints
  FROM expected_constraints AS expected_constraint
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_definition
    WHERE constraint_definition.conrelid = to_regclass(
        format('public.%I', expected_constraint.table_name)
      )
      AND constraint_definition.conname =
        expected_constraint.constraint_name
      AND constraint_definition.convalidated
  );

  IF v_missing_constraints IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_SCHEMA_PRECONDITION_FAILED',
      DETAIL = 'missing or unvalidated v2 constraints: ' ||
        array_to_string(v_missing_constraints, ', ');
  END IF;

  SELECT array_agg(required_index ORDER BY required_index)
  INTO v_missing_indexes
  FROM unnest(ARRAY[
    'catalog_brands_active_platform_no_brand_idx',
    'catalog_brands_platform_no_brand_identity_idx',
    'catalog_brands_v2_mapping_lookup_idx',
    'catalog_brands_v2_platform_code_uidx',
    'catalog_brands_v2_tenant_code_uidx',
    'catalog_categories_v2_mapping_lookup_idx',
    'catalog_categories_v2_platform_code_uidx',
    'catalog_categories_v2_scope_path_idx',
    'catalog_categories_v2_tenant_code_uidx',
    'catalog_spec_definitions_v2_category_code_uidx',
    'catalog_spec_definitions_v2_category_page_idx',
    'catalog_spec_definitions_v2_ownership_lookup_idx',
    'catalog_spec_definitions_v2_source_copy_uidx',
    'catalog_unit_suggestions_v2_queue_idx',
    'catalog_unit_suggestions_v2_tenant_page_idx',
    'catalog_units_v2_dimension_status_idx',
    'supplier_products_active_brand_ref_idx',
    'supplier_products_active_category_ref_idx'
  ]::text[]) AS required_index
  WHERE to_regclass('public.' || required_index) IS NULL;

  IF v_missing_indexes IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_SCHEMA_PRECONDITION_FAILED',
      DETAIL = 'missing deterministic v2 indexes: ' ||
        array_to_string(v_missing_indexes, ', ');
  END IF;

  WITH expected_triggers(
    table_name,
    trigger_name,
    function_name,
    trigger_type,
    update_columns
  ) AS (
    VALUES
      ('catalog_categories', 'tr_catalog_categories_v2_lock_hierarchy', 'lock_catalog_category_hierarchy', 22, ARRAY[]::text[]),
      ('catalog_categories', 'tr_catalog_categories_v2_guard_ownership_immutable', 'guard_supplier_ownership_immutable', 19, ARRAY['ownership_scope', 'owner_tenant_id']::text[]),
      ('catalog_categories', 'tr_catalog_categories_v2_validate_hierarchy', 'validate_catalog_category_hierarchy', 23, ARRAY[]::text[]),
      ('catalog_categories', 'tr_catalog_categories_v2_refresh_descendants', 'refresh_catalog_category_descendants', 21, ARRAY['parent_id', 'name']::text[]),
      ('catalog_categories', 'tr_catalog_categories_v2_refresh_after_delete', 'refresh_catalog_category_descendants', 9, ARRAY[]::text[]),
      ('catalog_categories', 'tr_catalog_categories_v2_protect_references', 'protect_active_supplier_catalog_reference', 19, ARRAY['status']::text[]),
      ('catalog_categories', 'tr_catalog_categories_v2_updated_at', 'update_updated_at_column', 19, ARRAY[]::text[]),
      ('catalog_brands', 'tr_catalog_brands_v2_guard_ownership_immutable', 'guard_supplier_ownership_immutable', 19, ARRAY['ownership_scope', 'owner_tenant_id']::text[]),
      ('catalog_brands', 'tr_catalog_brands_v2_validate_mapping', 'validate_catalog_brand_mapping', 23, ARRAY['mapped_platform_brand_id', 'ownership_scope', 'owner_tenant_id', 'status']::text[]),
      ('catalog_brands', 'tr_catalog_brands_v2_protect_references', 'protect_active_supplier_catalog_reference', 19, ARRAY['status']::text[]),
      ('catalog_brands', 'tr_catalog_brands_v2_protect_platform_no_brand', 'protect_platform_no_brand_identity', 27, ARRAY[]::text[]),
      ('catalog_brands', 'tr_catalog_brands_v2_updated_at', 'update_updated_at_column', 19, ARRAY[]::text[]),
      ('catalog_spec_definitions', 'tr_catalog_spec_definitions_v2_validate_ownership', 'validate_catalog_spec_definition_ownership', 23, ARRAY[]::text[]),
      ('catalog_spec_definitions', 'tr_catalog_spec_definitions_v2_guard_ownership_immutable', 'guard_supplier_ownership_immutable', 19, ARRAY['ownership_scope', 'owner_tenant_id']::text[]),
      ('catalog_spec_definitions', 'tr_catalog_spec_definitions_v2_updated_at', 'update_updated_at_column', 19, ARRAY[]::text[]),
      ('catalog_unit_suggestions', 'tr_catalog_unit_suggestions_v2_validate_state', 'validate_catalog_unit_suggestion_state', 23, ARRAY[]::text[]),
      ('catalog_unit_suggestions', 'tr_catalog_unit_suggestions_v2_updated_at', 'update_updated_at_column', 19, ARRAY[]::text[]),
      ('catalog_units', 'tr_catalog_units_v2_validate_dimension', 'validate_catalog_unit_dimension', 23, ARRAY['base_unit_id', 'unit_dimension']::text[]),
      ('catalog_units', 'tr_catalog_units_v2_validate_base', 'validate_catalog_unit_base', 23, ARRAY[]::text[]),
      ('catalog_units', 'tr_catalog_units_v2_lock_hierarchy', 'lock_catalog_unit_hierarchy', 22, ARRAY[]::text[]),
      ('catalog_units', 'tr_catalog_units_v2_sync_base_dimension', 'sync_catalog_base_unit_dimension_to_derived', 17, ARRAY['unit_dimension']::text[]),
      ('catalog_units', 'tr_catalog_units_v2_updated_at', 'update_updated_at_column', 19, ARRAY[]::text[]),
      ('supplier_products', 'tr_supplier_products_v2_guard_ownership', 'guard_supplier_product_ownership', 23, ARRAY['supplier_id', 'category_id', 'brand_id', 'ownership_scope', 'owner_tenant_id']::text[]),
      ('supplier_products', 'tr_supplier_products_v2_validate_catalog', 'validate_supplier_product_catalog', 23, ARRAY['category_id', 'brand_id', 'status']::text[]),
      ('supplier_products', 'tr_supplier_products_v2_guard_tenant_write', 'guard_supplier_product_tenant_write', 19, ARRAY[]::text[])
  )
  SELECT array_agg(
    expected_trigger.table_name || '.' || expected_trigger.trigger_name
    ORDER BY expected_trigger.table_name, expected_trigger.trigger_name
  )
  INTO v_missing_triggers
  FROM expected_triggers AS expected_trigger
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_definition
    JOIN pg_proc AS procedure_definition
      ON procedure_definition.oid = trigger_definition.tgfoid
    JOIN pg_namespace AS procedure_namespace
      ON procedure_namespace.oid = procedure_definition.pronamespace
    WHERE trigger_definition.tgrelid = to_regclass(
        format('public.%I', expected_trigger.table_name)
      )
      AND trigger_definition.tgname = expected_trigger.trigger_name
      AND NOT trigger_definition.tgisinternal
      AND trigger_definition.tgenabled = 'O'
      AND trigger_definition.tgtype = expected_trigger.trigger_type
      AND procedure_namespace.nspname = 'public'
      AND procedure_definition.proname = expected_trigger.function_name
      AND procedure_definition.pronargs = 0
      AND ARRAY(
        SELECT attribute_definition.attname::text
        FROM unnest(trigger_definition.tgattr::smallint[]) WITH ORDINALITY
          AS trigger_column(attnum, ordinality)
        JOIN pg_attribute AS attribute_definition
          ON attribute_definition.attrelid = trigger_definition.tgrelid
         AND attribute_definition.attnum = trigger_column.attnum
        ORDER BY trigger_column.ordinality
      ) = expected_trigger.update_columns
  );

  IF v_missing_triggers IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_SCHEMA_PRECONDITION_FAILED',
      DETAIL = 'missing or invalid deterministic v2 triggers: ' ||
        array_to_string(v_missing_triggers, ', ');
  END IF;

  SELECT count(*)
  INTO v_catalog_trigger_count
  FROM pg_trigger AS trigger_definition
  WHERE trigger_definition.tgrelid = 'public.supplier_products'::regclass
    AND NOT trigger_definition.tgisinternal
    AND (
      trigger_definition.tgname IN (
        'tr_supplier_products_validate_catalog',
        'tr_supplier_products_v2_validate_catalog'
      )
      OR trigger_definition.tgfoid =
        'public.validate_supplier_product_catalog()'::regprocedure
    );

  IF v_catalog_trigger_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_SCHEMA_PRECONDITION_FAILED',
      DETAIL = format(
        'supplier product catalog trigger count=%s',
        v_catalog_trigger_count
      );
  END IF;

  SELECT count(*)
  INTO v_no_brand_count
  FROM public.catalog_brands AS brand
  WHERE brand.ownership_scope = 'platform'
    AND brand.owner_tenant_id IS NULL
    AND brand.code = 'NO_BRAND'
    AND brand.name = '无品牌'
    AND brand.status = 'active';

  SELECT count(*)
  INTO v_no_brand_identity_count
  FROM public.catalog_brands AS brand
  WHERE brand.ownership_scope = 'platform'
    AND brand.owner_tenant_id IS NULL
    AND (
      upper(btrim(brand.code)) = 'NO_BRAND'
      OR btrim(brand.name) = '无品牌'
    );

  IF v_no_brand_count <> 1 OR v_no_brand_identity_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_NO_BRAND_INVARIANT_FAILED',
      DETAIL = format(
        'canonical_count=%s identity_count=%s',
        v_no_brand_count,
        v_no_brand_identity_count
      );
  END IF;

  WITH normalized_indexes AS (
    SELECT regexp_replace(
      pg_get_indexdef(index_definition.indexrelid),
      '^CREATE (UNIQUE )?INDEX [^ ]+ ',
      'CREATE \1INDEX '
    ) AS definition
    FROM pg_index AS index_definition
    JOIN pg_class AS table_definition
      ON table_definition.oid = index_definition.indrelid
    JOIN pg_namespace AS namespace_definition
      ON namespace_definition.oid = table_definition.relnamespace
    LEFT JOIN pg_constraint AS constraint_definition
      ON constraint_definition.conindid = index_definition.indexrelid
    WHERE namespace_definition.nspname = 'public'
      AND constraint_definition.oid IS NULL
      AND table_definition.relname IN (
        'catalog_categories', 'catalog_brands', 'catalog_units',
        'catalog_spec_definitions', 'catalog_unit_suggestions',
        'supplier_products'
      )
  ), duplicate_index_groups AS (
    SELECT definition
    FROM normalized_indexes
    GROUP BY definition
    HAVING count(*) > 1
  )
  SELECT count(*)
  INTO v_duplicate_index_groups
  FROM duplicate_index_groups;

  IF v_duplicate_index_groups <> 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_SCHEMA_PRECONDITION_FAILED',
      DETAIL = format(
        'duplicate physical index groups=%s',
        v_duplicate_index_groups
      );
  END IF;
END;
$$;

DO $$
DECLARE
  v_role text;
  v_table text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH v_table IN ARRAY ARRAY[
      'catalog_categories',
      'catalog_brands',
      'catalog_units',
      'catalog_spec_definitions',
      'catalog_unit_suggestions'
    ] LOOP
      IF has_table_privilege(v_role, 'public.' || v_table, 'SELECT')
        OR has_table_privilege(v_role, 'public.' || v_table, 'INSERT')
        OR has_table_privilege(v_role, 'public.' || v_table, 'UPDATE')
        OR has_table_privilege(v_role, 'public.' || v_table, 'DELETE')
      THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'SUPPLIER_CATALOG_SCHEMA_PRECONDITION_FAILED',
          DETAIL = format('%s retains direct access to public.%s', v_role, v_table);
      END IF;
    END LOOP;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_class AS table_definition
    JOIN pg_namespace AS namespace_definition
      ON namespace_definition.oid = table_definition.relnamespace
    CROSS JOIN LATERAL aclexplode(
      coalesce(
        table_definition.relacl,
        acldefault('r', table_definition.relowner)
      )
    ) AS permission
    WHERE namespace_definition.nspname = 'public'
      AND table_definition.relname IN (
        'catalog_categories',
        'catalog_brands',
        'catalog_units',
        'catalog_spec_definitions',
        'catalog_unit_suggestions'
      )
      AND permission.grantee = 0
      AND permission.privilege_type IN (
        'SELECT', 'INSERT', 'UPDATE', 'DELETE'
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_SCHEMA_PRECONDITION_FAILED',
      DETAIL = 'PUBLIC retains direct catalog table access';
  END IF;

  IF has_table_privilege('service_role', 'public.employees', 'SELECT')
    OR has_table_privilege('service_role', 'public.supplier_products', 'SELECT')
    OR NOT has_column_privilege(
      'service_role', 'public.employees', 'id', 'SELECT'
    )
    OR NOT has_column_privilege(
      'service_role', 'public.employees', 'tenant_id', 'SELECT'
    )
    OR NOT has_column_privilege(
      'service_role', 'public.employees', 'status', 'SELECT'
    )
    OR NOT has_column_privilege(
      'service_role', 'public.supplier_products', 'category_id', 'SELECT'
    )
    OR NOT has_column_privilege(
      'service_role', 'public.supplier_products', 'brand_id', 'SELECT'
    )
    OR NOT has_column_privilege(
      'service_role', 'public.supplier_products', 'status', 'SELECT'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_CATALOG_SCHEMA_PRECONDITION_FAILED',
      DETAIL = 'reference-table grants are wider or narrower than the trigger contract';
  END IF;
END;
$$;

COMMIT;
