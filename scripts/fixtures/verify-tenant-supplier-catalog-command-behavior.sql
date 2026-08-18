-- All fixtures and assertions run inside the verifier's outer transaction.
SELECT set_config(
  'supplier_catalog_command_verifier.tenant_a',
  (SELECT id::text FROM public.tenants ORDER BY id LIMIT 1),
  true
);

INSERT INTO public.tenants(id, name, slug, status)
VALUES (
  '90000000-0000-0000-0000-000000000002',
  'Catalog verifier tenant B',
  'catalog-verifier-tenant-b',
  'active'
);

INSERT INTO auth.users(id, role, created_at, updated_at)
VALUES
  ('91000000-0000-0000-0000-000000000001', 'authenticated', now(), now()),
  ('91000000-0000-0000-0000-000000000002', 'authenticated', now(), now()),
  ('91000000-0000-0000-0000-000000000003', 'authenticated', now(), now());

INSERT INTO public.employees(id, name, status, user_id, tenant_id)
VALUES
  (
    '92000000-0000-0000-0000-000000000001',
    'Catalog verifier platform', 'active',
    '91000000-0000-0000-0000-000000000001', NULL
  ),
  (
    '92000000-0000-0000-0000-000000000002',
    'Catalog verifier tenant A', 'active',
    '91000000-0000-0000-0000-000000000002',
    current_setting('supplier_catalog_command_verifier.tenant_a')::uuid
  ),
  (
    '92000000-0000-0000-0000-000000000003',
    'Catalog verifier tenant B', 'active',
    '91000000-0000-0000-0000-000000000003',
    '90000000-0000-0000-0000-000000000002'
  );

INSERT INTO public.tenant_supplier_settings(
  tenant_id, module_enabled, ownership_reads_enabled,
  private_supplier_writes_enabled, private_catalog_writes_enabled,
  enabled_by_employee_id, enabled_at
)
VALUES
  (
    current_setting('supplier_catalog_command_verifier.tenant_a')::uuid,
    true, true, true, true,
    '92000000-0000-0000-0000-000000000002', now()
  ),
  (
    '90000000-0000-0000-0000-000000000002',
    true, true, true, true,
    '92000000-0000-0000-0000-000000000003', now()
  )
ON CONFLICT (tenant_id) DO UPDATE
SET module_enabled = EXCLUDED.module_enabled,
    ownership_reads_enabled = EXCLUDED.ownership_reads_enabled,
    private_supplier_writes_enabled = EXCLUDED.private_supplier_writes_enabled,
    private_catalog_writes_enabled = EXCLUDED.private_catalog_writes_enabled,
    enabled_by_employee_id = EXCLUDED.enabled_by_employee_id,
    enabled_at = EXCLUDED.enabled_at;

INSERT INTO public.catalog_categories(
  id, parent_id, code, name, level, full_name, is_leaf, status, sort_order,
  version, ownership_scope, owner_tenant_id,
  created_by_employee_id, updated_by_employee_id
)
VALUES (
  '93000000-0000-0000-0000-000000000001',
  NULL, 'VERIFY_PLATFORM_ROOT', 'Verifier platform root', 1,
  'Verifier platform root', true, 'active', 10, 1, 'platform', NULL,
  '92000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000001'
);

INSERT INTO public.catalog_categories(
  id, parent_id, code, name, level, full_name, is_leaf, status, sort_order,
  version, ownership_scope, owner_tenant_id,
  created_by_employee_id, updated_by_employee_id
)
VALUES (
  '93000000-0000-0000-0000-000000000002',
  '93000000-0000-0000-0000-000000000001',
  'VERIFY_PLATFORM_LEAF', 'Verifier platform leaf', 2,
  'Verifier platform root / Verifier platform leaf', true, 'active', 20, 1,
  'platform', NULL,
  '92000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000001'
);

INSERT INTO public.catalog_brands(
  id, code, name, legal_name, status, sort_order, version,
  ownership_scope, owner_tenant_id,
  created_by_employee_id, updated_by_employee_id
)
VALUES (
  '94000000-0000-0000-0000-000000000001',
  'VERIFY_PLATFORM_BRAND', 'Verifier platform brand',
  'Verifier platform brand ltd', 'active', 10, 1, 'platform', NULL,
  '92000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000001'
);

SET LOCAL ROLE service_role;

SELECT public.create_catalog_spec_definition(
  '95000000-0000-0000-0000-000000000001',
  '93000000-0000-0000-0000-000000000002',
  'PLATFORM_COLOR', 'Platform color', 'single_enum', '["red","blue"]'::jsonb,
  NULL, true, true, true, 10, 'active', NULL,
  '91000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000001',
  'verify-platform-spec-create'
);

SELECT public.update_catalog_spec_definition(
  '95000000-0000-0000-0000-000000000001',
  '93000000-0000-0000-0000-000000000002',
  'PLATFORM_COLOR', 'Platform colour', 'single_enum', '["red","blue"]'::jsonb,
  NULL, true, true, true, 11, 'active', 1, NULL,
  '91000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000001',
  'verify-platform-spec-update'
);

SELECT public.create_catalog_unit(
  '96000000-0000-0000-0000-000000000001',
  'VERIFY_KG', 'Verifier kilogram', 'vkg', NULL, '1.000000', 'mass',
  'active', 10,
  '91000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000001',
  'verify-platform-unit-create'
);

-- Deprecated eleven-argument RPC remains executable only for the old API
-- during the Task 3 rollout window.
SELECT public.create_catalog_unit(
  '96000000-0000-0000-0000-000000000002',
  'VERIFY_LEGACY_EACH', 'Verifier legacy each', 'vea', NULL, '1',
  'active', 11,
  '91000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000001',
  'verify-platform-unit-compat-base'
);
SELECT public.create_catalog_unit(
  '96000000-0000-0000-0000-000000000002',
  'VERIFY_LEGACY_EACH', 'Verifier legacy each', 'vea', NULL, '1',
  'active', 11,
  '91000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000001',
  'verify-platform-unit-compat-base'
);
SELECT public.create_catalog_unit(
  '96000000-0000-0000-0000-000000000003',
  'VERIFY_LEGACY_GRAM', 'Verifier legacy gram', 'veg',
  '96000000-0000-0000-0000-000000000001', '0.001',
  'active', 12,
  '91000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000001',
  'verify-platform-unit-compat-derived'
);

DO $unit_factor_validation$
DECLARE
  v_factor text;
BEGIN
  FOREACH v_factor IN ARRAY ARRAY[
    '1e3', '+1', '-1', '1.1234567', '0', '1000000000000'
  ]::text[] LOOP
    BEGIN
      PERFORM public.create_catalog_unit(
        '96000000-0000-0000-0000-000000000099',
        'VERIFY_BAD_FACTOR', 'Verifier bad factor', 'vbf', NULL,
        v_factor, 'mass', 'active', 99,
        '91000000-0000-0000-0000-000000000001',
        '92000000-0000-0000-0000-000000000001',
        'verify-platform-unit-invalid-factor'
      );
      RAISE EXCEPTION 'noncanonical unit factor accepted: %', v_factor;
    EXCEPTION WHEN SQLSTATE '22023' OR SQLSTATE 'P0001' THEN
      IF SQLERRM <> 'UNIT_CONVERSION_INVALID' THEN RAISE; END IF;
    END;
  END LOOP;

  FOREACH v_factor IN ARRAY ARRAY[
    '1e3', '+1', '-1', '1.1234567', '0', '1000000000000'
  ]::text[] LOOP
    BEGIN
      PERFORM public.create_catalog_unit(
        '96000000-0000-0000-0000-000000000098',
        'VERIFY_BAD_COMPAT_FACTOR', 'Verifier bad compat factor', 'vbcf',
        NULL, v_factor, 'active', 98,
        '91000000-0000-0000-0000-000000000001',
        '92000000-0000-0000-0000-000000000001',
        'verify-platform-unit-invalid-compat-factor'
      );
      RAISE EXCEPTION 'noncanonical compatibility factor accepted: %', v_factor;
    EXCEPTION WHEN SQLSTATE '22023' OR SQLSTATE 'P0001' THEN
      IF SQLERRM <> 'UNIT_CONVERSION_INVALID' THEN RAISE; END IF;
    END;
  END LOOP;
END
$unit_factor_validation$;

SELECT public.create_tenant_catalog_category(
  '93000000-0000-0000-0000-000000000011',
  NULL, 'TENANT_A_ROOT', 'Tenant A root', 'active', 10, NULL,
  current_setting('supplier_catalog_command_verifier.tenant_a')::uuid,
  '91000000-0000-0000-0000-000000000002',
  '92000000-0000-0000-0000-000000000002',
  'verify-tenant-a-root'
);

SELECT public.create_tenant_catalog_category(
  '93000000-0000-0000-0000-000000000011',
  NULL, 'TENANT_A_ROOT', 'Tenant A root', 'active', 10, NULL,
  current_setting('supplier_catalog_command_verifier.tenant_a')::uuid,
  '91000000-0000-0000-0000-000000000002',
  '92000000-0000-0000-0000-000000000002',
  'verify-tenant-a-root'
);

SELECT public.create_tenant_catalog_category(
  '93000000-0000-0000-0000-000000000012',
  '93000000-0000-0000-0000-000000000011',
  'TENANT_A_LEAF', 'Tenant A leaf', 'active', 20,
  '93000000-0000-0000-0000-000000000002',
  current_setting('supplier_catalog_command_verifier.tenant_a')::uuid,
  '91000000-0000-0000-0000-000000000002',
  '92000000-0000-0000-0000-000000000002',
  'verify-tenant-a-leaf'
);

SELECT public.update_tenant_catalog_category(
  '93000000-0000-0000-0000-000000000012',
  '93000000-0000-0000-0000-000000000011',
  'TENANT_A_LEAF', 'Tenant A leaf updated', 'active', 21,
  '93000000-0000-0000-0000-000000000002', 1,
  current_setting('supplier_catalog_command_verifier.tenant_a')::uuid,
  '91000000-0000-0000-0000-000000000002',
  '92000000-0000-0000-0000-000000000002',
  'verify-tenant-a-leaf-update'
);

SELECT public.create_tenant_catalog_brand(
  '94000000-0000-0000-0000-000000000011',
  'TENANT_A_BRAND', 'Tenant A brand', 'Tenant A brand ltd', NULL,
  'active', 10, '94000000-0000-0000-0000-000000000001',
  current_setting('supplier_catalog_command_verifier.tenant_a')::uuid,
  '91000000-0000-0000-0000-000000000002',
  '92000000-0000-0000-0000-000000000002',
  'verify-tenant-a-brand'
);

SELECT public.update_tenant_catalog_brand(
  '94000000-0000-0000-0000-000000000011',
  'TENANT_A_BRAND', 'Tenant A brand updated', 'Tenant A brand ltd', NULL,
  'active', 11, '94000000-0000-0000-0000-000000000001', 1,
  current_setting('supplier_catalog_command_verifier.tenant_a')::uuid,
  '91000000-0000-0000-0000-000000000002',
  '92000000-0000-0000-0000-000000000002',
  'verify-tenant-a-brand-update'
);

SELECT public.create_catalog_spec_definition(
  '95000000-0000-0000-0000-000000000011',
  '93000000-0000-0000-0000-000000000012',
  'TENANT_WEIGHT', 'Tenant weight', 'number', '[]'::jsonb, 'mass',
  true, true, true, 20, 'active',
  current_setting('supplier_catalog_command_verifier.tenant_a')::uuid,
  '91000000-0000-0000-0000-000000000002',
  '92000000-0000-0000-0000-000000000002',
  'verify-tenant-a-spec'
);

SELECT public.update_catalog_spec_definition(
  '95000000-0000-0000-0000-000000000011',
  '93000000-0000-0000-0000-000000000012',
  'TENANT_WEIGHT', 'Tenant weight updated', 'number', '[]'::jsonb, 'mass',
  true, true, true, 21, 'active', 1,
  current_setting('supplier_catalog_command_verifier.tenant_a')::uuid,
  '91000000-0000-0000-0000-000000000002',
  '92000000-0000-0000-0000-000000000002',
  'verify-tenant-a-spec-update'
);

SELECT public.copy_platform_category_specs(
  '93000000-0000-0000-0000-000000000012',
  '93000000-0000-0000-0000-000000000002', 2,
  current_setting('supplier_catalog_command_verifier.tenant_a')::uuid,
  '91000000-0000-0000-0000-000000000002',
  '92000000-0000-0000-0000-000000000002',
  'verify-tenant-a-copy'
);

SELECT public.create_tenant_catalog_category(
  '93000000-0000-0000-0000-000000000021',
  NULL, 'TENANT_B_ROOT', 'Tenant B root', 'active', 10, NULL,
  '90000000-0000-0000-0000-000000000002',
  '91000000-0000-0000-0000-000000000003',
  '92000000-0000-0000-0000-000000000003',
  'verify-tenant-b-root'
);

SELECT public.submit_tenant_catalog_unit_suggestion(
  '97000000-0000-0000-0000-000000000011',
  'TENANT_A_KG', 'Tenant A kilogram', 'takg', 'mass', 'needed',
  current_setting('supplier_catalog_command_verifier.tenant_a')::uuid,
  '91000000-0000-0000-0000-000000000002',
  '92000000-0000-0000-0000-000000000002',
  'verify-tenant-a-suggestion-1'
);
SELECT public.submit_tenant_catalog_unit_suggestion(
  '97000000-0000-0000-0000-000000000012',
  'TENANT_A_G', 'Tenant A gram', 'tag', 'mass', 'needed',
  current_setting('supplier_catalog_command_verifier.tenant_a')::uuid,
  '91000000-0000-0000-0000-000000000002',
  '92000000-0000-0000-0000-000000000002',
  'verify-tenant-a-suggestion-2'
);
SELECT public.submit_tenant_catalog_unit_suggestion(
  '97000000-0000-0000-0000-000000000021',
  'TENANT_B_KG', 'Tenant B kilogram', 'tbkg', 'mass', 'needed',
  '90000000-0000-0000-0000-000000000002',
  '91000000-0000-0000-0000-000000000003',
  '92000000-0000-0000-0000-000000000003',
  'verify-tenant-b-suggestion-1'
);

RESET ROLE;

DO $behavior$
DECLARE
  v_result jsonb;
  v_events_before bigint;
  v_units_before bigint;
  v_row_before jsonb;
BEGIN
  IF (
    SELECT event.from_state #>> '{_request,conversion_factor}'
    FROM public.supplier_command_events AS event
    WHERE event.command = 'create_catalog_unit'
      AND event.idempotency_key = 'verify-platform-unit-create'
  ) <> '1' THEN
    RAISE EXCEPTION 'unit factor request was not normalized';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_units AS unit
    WHERE unit.id = '96000000-0000-0000-0000-000000000002'
      AND unit.unit_dimension = 'legacy_unclassified'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.catalog_units AS unit
    WHERE unit.id = '96000000-0000-0000-0000-000000000003'
      AND unit.unit_dimension = 'mass'
  ) OR (
    SELECT count(*)
    FROM public.supplier_command_events AS event
    WHERE event.idempotency_key = 'verify-platform-unit-compat-base'
  ) <> 1 OR NOT EXISTS (
    SELECT 1
    FROM public.supplier_command_events AS event
    WHERE event.idempotency_key = 'verify-platform-unit-compat-derived'
      AND event.from_state #>> '{_request,unit_dimension}' = 'mass'
      AND event.from_state #>> '{_request,conversion_factor}' = '0.001'
  ) THEN
    RAISE EXCEPTION 'eleven-argument unit rollout behavior invalid';
  END IF;

  v_result := public.create_tenant_catalog_category(
    '93000000-0000-0000-0000-000000000011',
    NULL, 'TENANT_A_ROOT', 'Tenant A root', 'active', 10, NULL,
    current_setting('supplier_catalog_command_verifier.tenant_a')::uuid,
    '91000000-0000-0000-0000-000000000002',
    '92000000-0000-0000-0000-000000000002',
    'verify-tenant-a-root'
  );
  IF v_result ->> 'idempotent' <> 'true' THEN
    RAISE EXCEPTION 'idempotent replay was not reported';
  END IF;

  BEGIN
    PERFORM public.create_tenant_catalog_category(
      '93000000-0000-0000-0000-000000000011',
      NULL, 'TENANT_A_ROOT', 'different request', 'active', 10, NULL,
      current_setting('supplier_catalog_command_verifier.tenant_a')::uuid,
      '91000000-0000-0000-0000-000000000002',
      '92000000-0000-0000-0000-000000000002',
      'verify-tenant-a-root'
    );
    RAISE EXCEPTION 'idempotency conflict accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF;
  END;

  SELECT count(*) INTO v_events_before
  FROM public.supplier_command_events;
  SELECT to_jsonb(category) INTO v_row_before
  FROM public.catalog_categories AS category
  WHERE category.id = '93000000-0000-0000-0000-000000000012';

  v_result := public.update_tenant_catalog_category(
    '93000000-0000-0000-0000-000000000012',
    '93000000-0000-0000-0000-000000000011',
    'TENANT_A_LEAF', 'must not write', 'active', 21,
    '93000000-0000-0000-0000-000000000002', 2,
    current_setting('supplier_catalog_command_verifier.tenant_a')::uuid,
    '91000000-0000-0000-0000-000000000002',
    '92000000-0000-0000-0000-000000000002',
    'verify-version-conflict'
  );
  IF v_result ->> 'status' <> 'version_conflict'
    OR v_result ->> 'error_code' <> 'SUPPLIER_VERSION_CONFLICT'
    OR v_events_before <> (SELECT count(*) FROM public.supplier_command_events)
    OR v_row_before IS DISTINCT FROM (
      SELECT to_jsonb(category) FROM public.catalog_categories AS category
      WHERE category.id = '93000000-0000-0000-0000-000000000012'
    )
  THEN
    RAISE EXCEPTION 'version conflict wrote data or audit';
  END IF;

  BEGIN
    PERFORM public.update_tenant_catalog_category(
      '93000000-0000-0000-0000-000000000021',
      NULL, 'TENANT_B_ROOT', 'cross tenant', 'active', 10, NULL, 1,
      current_setting('supplier_catalog_command_verifier.tenant_a')::uuid,
      '91000000-0000-0000-0000-000000000002',
      '92000000-0000-0000-0000-000000000002',
      'verify-cross-tenant'
    );
    RAISE EXCEPTION 'cross tenant category update accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM NOT LIKE '%OWNERSHIP_CONFLICT' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.update_tenant_catalog_category(
      '93000000-0000-0000-0000-000000000002',
      '93000000-0000-0000-0000-000000000001',
      'VERIFY_PLATFORM_LEAF', 'platform write', 'active', 20, NULL, 1,
      current_setting('supplier_catalog_command_verifier.tenant_a')::uuid,
      '91000000-0000-0000-0000-000000000002',
      '92000000-0000-0000-0000-000000000002',
      'verify-platform-write'
    );
    RAISE EXCEPTION 'platform category update accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SHARED_RESOURCE_READ_ONLY' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.update_catalog_spec_definition(
      '95000000-0000-0000-0000-000000000001',
      '93000000-0000-0000-0000-000000000002',
      'PLATFORM_COLOR', 'tenant platform write', 'single_enum',
      '["red","blue"]'::jsonb, NULL, true, true, true, 11, 'active', 2,
      current_setting('supplier_catalog_command_verifier.tenant_a')::uuid,
      '91000000-0000-0000-0000-000000000002',
      '92000000-0000-0000-0000-000000000002',
      'verify-platform-spec-write'
    );
    RAISE EXCEPTION 'platform spec tenant update accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SHARED_RESOURCE_READ_ONLY' THEN RAISE; END IF;
  END;

  v_result := public.list_catalog_unit_suggestions(
    '91000000-0000-0000-0000-000000000002',
    '92000000-0000-0000-0000-000000000002',
    'submitted',
    current_setting('supplier_catalog_command_verifier.tenant_a')::uuid,
    1, 1
  );
  IF v_result #>> '{pagination,total}' <> '2'
    OR jsonb_array_length(v_result -> 'list') <> 1
  THEN
    RAISE EXCEPTION 'tenant pagination or isolation failed: %', v_result;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_result -> 'list') AS item
    WHERE (
      SELECT array_agg(field_name ORDER BY field_name)
      FROM jsonb_object_keys(item) AS field_name
    ) IS DISTINCT FROM ARRAY[
      'approved_catalog_unit_id', 'created_at', 'id', 'reason',
      'review_remark', 'reviewed_at', 'status', 'suggested_code',
      'suggested_name', 'suggested_symbol', 'tenant_id', 'unit_dimension',
      'updated_at', 'version'
    ]::text[]
  ) THEN
    RAISE EXCEPTION 'suggestion DTO exposed unexpected fields: %', v_result;
  END IF;

  v_result := public.list_catalog_unit_suggestions(
    '91000000-0000-0000-0000-000000000001',
    '92000000-0000-0000-0000-000000000001',
    'submitted', NULL, 1, 20
  );
  IF v_result #>> '{pagination,total}' <> '3' THEN
    RAISE EXCEPTION 'platform queue total failed: %', v_result;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_result -> 'list') AS item
    WHERE (
      SELECT array_agg(field_name ORDER BY field_name)
      FROM jsonb_object_keys(item) AS field_name
    ) IS DISTINCT FROM ARRAY[
      'approved_catalog_unit_id', 'created_at', 'id', 'reason',
      'review_remark', 'reviewed_at', 'status', 'suggested_code',
      'suggested_name', 'suggested_symbol', 'tenant_id', 'unit_dimension',
      'updated_at', 'version'
    ]::text[]
  ) THEN
    RAISE EXCEPTION 'suggestion DTO exposed unexpected fields: %', v_result;
  END IF;

  UPDATE public.tenant_supplier_settings
  SET ownership_reads_enabled = false,
      private_supplier_writes_enabled = false,
      private_catalog_writes_enabled = false
  WHERE tenant_id =
    current_setting('supplier_catalog_command_verifier.tenant_a')::uuid;
  BEGIN
    PERFORM public.list_catalog_unit_suggestions(
      '91000000-0000-0000-0000-000000000002',
      '92000000-0000-0000-0000-000000000002',
      NULL,
      current_setting('supplier_catalog_command_verifier.tenant_a')::uuid,
      1, 20
    );
    RAISE EXCEPTION 'tenant list ignored ownership read switch';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_OWNERSHIP_READS_DISABLED' THEN RAISE; END IF;
  END;
  UPDATE public.tenant_supplier_settings
  SET ownership_reads_enabled = true,
      private_supplier_writes_enabled = true,
      private_catalog_writes_enabled = true
  WHERE tenant_id =
    current_setting('supplier_catalog_command_verifier.tenant_a')::uuid;

  v_result := public.list_catalog_unit_suggestions(
    '91000000-0000-0000-0000-000000000001',
    '92000000-0000-0000-0000-000000000001',
    'submitted',
    current_setting('supplier_catalog_command_verifier.tenant_a')::uuid,
    1, 20
  );
  IF v_result #>> '{pagination,total}' <> '2'
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_result -> 'list') AS item
      WHERE item ->> 'tenant_id' <>
        current_setting('supplier_catalog_command_verifier.tenant_a')
    )
  THEN
    RAISE EXCEPTION 'platform tenant filter failed: %', v_result;
  END IF;

  v_result := public.list_catalog_unit_suggestions(
    '91000000-0000-0000-0000-000000000002',
    '92000000-0000-0000-0000-000000000002',
    'submitted', NULL, 1, 20
  );
  IF v_result #>> '{pagination,total}' <> '2' THEN
    RAISE EXCEPTION 'tenant NULL filter was not normalized: %', v_result;
  END IF;

  BEGIN
    PERFORM public.list_catalog_unit_suggestions(
      '91000000-0000-0000-0000-000000000002',
      '92000000-0000-0000-0000-000000000002',
      NULL, '90000000-0000-0000-0000-000000000002', 1, 20
    );
    RAISE EXCEPTION 'tenant actor read another tenant queue';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_PROXY_ACTOR_INVALID' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.list_catalog_unit_suggestions(
      '91000000-0000-0000-0000-000000000002',
      '92000000-0000-0000-0000-000000000002',
      NULL,
      current_setting('supplier_catalog_command_verifier.tenant_a')::uuid,
      1, 101
    );
    RAISE EXCEPTION 'page size above 100 accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;

  SELECT count(*) INTO v_units_before FROM public.catalog_units;
  PERFORM public.review_catalog_unit_suggestion(
    '97000000-0000-0000-0000-000000000011',
    'approved', '96000000-0000-0000-0000-000000000001',
    'approved existing unit', 1,
    '91000000-0000-0000-0000-000000000001',
    '92000000-0000-0000-0000-000000000001',
    'verify-review-approve'
  );
  PERFORM public.review_catalog_unit_suggestion(
    '97000000-0000-0000-0000-000000000012',
    'rejected', NULL, 'not needed', 1,
    '91000000-0000-0000-0000-000000000001',
    '92000000-0000-0000-0000-000000000001',
    'verify-review-reject'
  );

  IF v_units_before <> (SELECT count(*) FROM public.catalog_units)
    OR NOT EXISTS (
      SELECT 1 FROM public.catalog_unit_suggestions
      WHERE id = '97000000-0000-0000-0000-000000000011'
        AND status = 'approved'
        AND approved_catalog_unit_id =
          '96000000-0000-0000-0000-000000000001'
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.catalog_unit_suggestions
      WHERE id = '97000000-0000-0000-0000-000000000012'
        AND status = 'rejected'
        AND approved_catalog_unit_id IS NULL
    )
  THEN
    RAISE EXCEPTION 'review created a unit or stored an invalid result';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_spec_definitions
    WHERE category_id = '93000000-0000-0000-0000-000000000012'
      AND source_platform_spec_id =
        '95000000-0000-0000-0000-000000000001'
      AND ownership_scope = 'tenant'
      AND owner_tenant_id =
        current_setting('supplier_catalog_command_verifier.tenant_a')::uuid
  ) THEN
    RAISE EXCEPTION 'copy did not preserve source_platform_spec_id';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.supplier_command_events AS event
    WHERE event.command = ANY (ARRAY[
      'create_catalog_spec_definition', 'update_catalog_spec_definition'
    ]::text[])
      AND (
        event.resource_type <> 'catalog_spec_definition'
        OR event.resource_id IS DISTINCT FROM
          (event.to_state ->> 'id')::uuid
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.supplier_command_events AS event
    WHERE event.command = ANY (ARRAY[
      'submit_tenant_catalog_unit_suggestion',
      'review_catalog_unit_suggestion'
    ]::text[])
      AND event.resource_type <> 'catalog_unit_suggestion'
  ) OR EXISTS (
    SELECT 1
    FROM public.supplier_command_events
    WHERE from_state -> '_request' IS NULL
      OR result_version < 1
  ) THEN
    RAISE EXCEPTION 'audit resource identity or request snapshot invalid';
  END IF;
END
$behavior$;

RESET ROLE;

-- Tenant spec writes require all four switches, independently of platform writes.
UPDATE public.tenant_supplier_settings
SET private_catalog_writes_enabled = false
WHERE tenant_id =
  current_setting('supplier_catalog_command_verifier.tenant_a')::uuid;

SET LOCAL ROLE service_role;
DO $tenant_spec_switch$
BEGIN
  BEGIN
    PERFORM public.create_catalog_spec_definition(
      '95000000-0000-0000-0000-000000000012',
      '93000000-0000-0000-0000-000000000012',
      'DISABLED_SPEC', 'Disabled spec', 'text', '[]'::jsonb, NULL,
      false, false, false, 30, 'active',
      current_setting('supplier_catalog_command_verifier.tenant_a')::uuid,
      '91000000-0000-0000-0000-000000000002',
      '92000000-0000-0000-0000-000000000002',
      'verify-disabled-tenant-spec'
    );
    RAISE EXCEPTION 'tenant spec write ignored private catalog switch';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'PRIVATE_CATALOG_WRITES_DISABLED' THEN RAISE; END IF;
  END;
END
$tenant_spec_switch$;
RESET ROLE;

-- Remove the competing tenant-only page index inside this rollback-only
-- transaction so EXPLAIN deterministically proves the tenant+status index.
DROP INDEX public.catalog_unit_suggestions_v2_tenant_page_idx;
DROP INDEX public.catalog_unit_suggestions_v2_queue_idx;

DO $metadata$
DECLARE
  v_command_count integer;
  v_guard_count integer;
  v_plan text := '';
  v_plan_line text;
BEGIN
  SELECT count(*)
  INTO v_command_count
  FROM pg_proc AS procedure
  JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
  JOIN pg_roles AS owner_role ON owner_role.oid = procedure.proowner
  WHERE namespace.nspname = 'public'
    AND procedure.proname = ANY (ARRAY[
      'create_catalog_unit', 'create_tenant_catalog_category',
      'update_tenant_catalog_category', 'create_tenant_catalog_brand',
      'update_tenant_catalog_brand', 'create_catalog_spec_definition',
      'update_catalog_spec_definition', 'copy_platform_category_specs',
      'submit_tenant_catalog_unit_suggestion',
      'list_catalog_unit_suggestions', 'review_catalog_unit_suggestion'
    ]::text[])
    AND procedure.prosecdef
    AND procedure.proconfig @> ARRAY['search_path=pg_catalog, public']
    AND owner_role.rolname <> ALL (
      ARRAY['anon', 'authenticated', 'service_role']
    )
    AND procedure.proacl IS NOT NULL;

  IF v_command_count <> 12 THEN
    RAISE EXCEPTION 'pg_proc/proacl/proowner canonical count=%', v_command_count;
  END IF;

  SELECT count(*)
  INTO v_guard_count
  FROM pg_proc AS procedure
  JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
  JOIN pg_roles AS owner_role ON owner_role.oid = procedure.proowner
  WHERE namespace.nspname = 'public'
    AND procedure.proname = ANY (ARRAY[
      'assert_tenant_supplier_actor', 'assert_platform_catalog_actor'
    ]::text[])
    AND procedure.prosecdef
    AND procedure.proconfig @> ARRAY['search_path=pg_catalog, public']
    AND owner_role.rolname <> ALL (
      ARRAY['anon', 'authenticated', 'service_role']
    )
    AND procedure.proacl IS NOT NULL;

  IF v_guard_count <> 2 THEN
    RAISE EXCEPTION 'pg_proc/proacl/proowner guard count=%', v_guard_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = ANY (ARRAY[
        'submit_catalog_unit_suggestion', 'create_catalog_unit',
        'create_tenant_catalog_category', 'update_tenant_catalog_category',
        'create_tenant_catalog_brand', 'update_tenant_catalog_brand',
        'create_catalog_spec_definition', 'update_catalog_spec_definition',
        'copy_platform_category_specs',
        'submit_tenant_catalog_unit_suggestion',
        'list_catalog_unit_suggestions', 'review_catalog_unit_suggestion'
      ]::text[])
      AND procedure.oid <> ALL (ARRAY[
        'public.create_catalog_unit(uuid,text,text,text,uuid,text,text,integer,uuid,uuid,text)'::regprocedure,
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
      ])
  ) THEN
    RAISE EXCEPTION 'old overload remains in pg_proc';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = ANY (ARRAY[
        'create_catalog_unit', 'create_tenant_catalog_category',
        'update_tenant_catalog_category', 'create_tenant_catalog_brand',
        'update_tenant_catalog_brand', 'create_catalog_spec_definition',
        'update_catalog_spec_definition', 'copy_platform_category_specs',
        'submit_tenant_catalog_unit_suggestion',
        'list_catalog_unit_suggestions', 'review_catalog_unit_suggestion'
      ]::text[])
      AND (
        NOT has_function_privilege('service_role', procedure.oid, 'EXECUTE')
        OR has_function_privilege('anon', procedure.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
      )
  ) THEN
    RAISE EXCEPTION 'public command ACL invalid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    CROSS JOIN LATERAL aclexplode(procedure.proacl) AS permission
    JOIN pg_roles AS grantee ON grantee.oid = permission.grantee
    WHERE namespace.nspname = 'public'
      AND procedure.proname = ANY (ARRAY[
        'assert_tenant_supplier_actor', 'assert_platform_catalog_actor'
      ]::text[])
      AND grantee.rolname = ANY (
        ARRAY['anon', 'authenticated', 'service_role']
      )
      AND permission.privilege_type = 'EXECUTE'
  ) OR EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = ANY (ARRAY[
        'assert_tenant_supplier_actor', 'assert_platform_catalog_actor'
      ]::text[])
      AND (
        has_function_privilege('service_role', procedure.oid, 'EXECUTE')
        OR has_function_privilege('anon', procedure.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
      )
  ) THEN
    RAISE EXCEPTION 'internal guard ACL invalid';
  END IF;

  PERFORM set_config('enable_seqscan', 'off', true);
  FOR v_plan_line IN EXECUTE $explain$
    EXPLAIN (COSTS OFF)
    SELECT id
    FROM public.catalog_unit_suggestions
    WHERE tenant_id = '90000000-0000-0000-0000-000000000002'::uuid
      AND status = 'submitted'
    ORDER BY created_at DESC, id DESC
    LIMIT 20
  $explain$ LOOP
    v_plan := v_plan || E'\n' || v_plan_line;
  END LOOP;
  IF position(
    'catalog_unit_suggestions_v2_tenant_status_page_idx' IN v_plan
  ) = 0 THEN
    RAISE EXCEPTION 'bounded suggestion query plan missed index: %', v_plan;
  END IF;
END
$metadata$;
