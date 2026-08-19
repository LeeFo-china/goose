\set ON_ERROR_STOP on

-- Local-only invocation (the caller must target 127.0.0.1:54322):
-- docker exec -i -e PGOPTIONS='-c task7.local_endpoint=127.0.0.1:54322' \
--   supabase_db_gooes psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 \
--   < scripts/smoke-supplier-prices-task7.sql

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

DO $task7_local_only$
BEGIN
  IF current_setting('task7.local_endpoint', true)
      IS DISTINCT FROM '127.0.0.1:54322'
    OR current_database() <> 'postgres'
  THEN
    RAISE EXCEPTION
      'Task 7 smoke only allows local 127.0.0.1:54322/postgres';
  END IF;
END
$task7_local_only$;

DO $task7_fixture_residue$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.tenants
  WHERE id IN (
    'b7000000-0000-4000-8000-000000000001',
    'b7000000-0000-4000-8000-000000000002'
  );
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'task7 fixture residue: %', v_count;
  END IF;
END
$task7_fixture_residue$;

DO $task7_acl_contract$
DECLARE
  v_signature regprocedure;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.command_supplier_price_list_v2(text,uuid,uuid,uuid,uuid,uuid,integer,jsonb,uuid,uuid,text)'::regprocedure,
    'public.command_supplier_price_item_v2(text,uuid,uuid,uuid,uuid,uuid,integer,jsonb,uuid,uuid,text)'::regprocedure
  ]
  LOOP
    IF NOT has_function_privilege('service_role', v_signature, 'EXECUTE')
      OR has_function_privilege('authenticated', v_signature, 'EXECUTE')
      OR has_function_privilege('anon', v_signature, 'EXECUTE')
    THEN
      RAISE EXCEPTION 'Task 7 v2 function ACL invalid: %', v_signature;
    END IF;
  END LOOP;

  FOREACH v_signature IN ARRAY ARRAY[
    'public.create_supplier_price_list(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,uuid,uuid,text,text)'::regprocedure,
    'public.publish_supplier_price_list(uuid,uuid,uuid,integer,uuid,uuid,text,text)'::regprocedure,
    'public.create_supplier_price_list_version(uuid,uuid,uuid,uuid,integer,uuid,uuid,text,text)'::regprocedure,
    'public.retire_supplier_price_list(uuid,uuid,uuid,integer,uuid,uuid,text,text)'::regprocedure,
    'public.upsert_supplier_price_list_item(uuid,uuid,uuid,uuid,uuid,numeric,numeric,boolean,integer,uuid,uuid,text,text)'::regprocedure,
    'public.delete_supplier_price_list_item(uuid,uuid,uuid,uuid,integer,uuid,uuid,text,text)'::regprocedure
  ]
  LOOP
    IF has_function_privilege('service_role', v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'Task 7 legacy function is still executable: %', v_signature;
    END IF;
  END LOOP;
END
$task7_acl_contract$;

-- Runtime PostgREST embedding depends on these named composite relationships.
DO $task7_postgrest_relationships$
DECLARE
  v_source_columns text[];
  v_target_table oid;
  v_target_columns text[];
BEGIN
  SELECT
    array_agg(source_column.attname ORDER BY key_position.position),
    constraint_row.confrelid,
    array_agg(target_column.attname ORDER BY key_position.position)
  INTO v_source_columns, v_target_table, v_target_columns
  FROM pg_catalog.pg_constraint AS constraint_row
  CROSS JOIN LATERAL pg_catalog.generate_subscripts(
    constraint_row.conkey,
    1
  ) AS key_position(position)
  JOIN pg_catalog.pg_attribute AS source_column
    ON source_column.attrelid = constraint_row.conrelid
    AND source_column.attnum = constraint_row.conkey[key_position.position]
  JOIN pg_catalog.pg_attribute AS target_column
    ON target_column.attrelid = constraint_row.confrelid
    AND target_column.attnum = constraint_row.confkey[key_position.position]
  WHERE constraint_row.conrelid =
      'public.supplier_price_list_items'::regclass
    AND constraint_row.conname =
      'supplier_price_items_list_tenant_supplier_fkey'
    AND constraint_row.contype = 'f'
  GROUP BY constraint_row.confrelid;

  IF v_source_columns IS DISTINCT FROM ARRAY[
      'supplier_price_list_id', 'tenant_id', 'supplier_id'
    ]::text[]
    OR v_target_table IS DISTINCT FROM
      'public.supplier_price_lists'::regclass
    OR v_target_columns IS DISTINCT FROM ARRAY[
      'id', 'tenant_id', 'supplier_id'
    ]::text[]
  THEN
    RAISE EXCEPTION 'Task 7 price-list PostgREST relationship invalid';
  END IF;

  SELECT
    array_agg(source_column.attname ORDER BY key_position.position),
    constraint_row.confrelid,
    array_agg(target_column.attname ORDER BY key_position.position)
  INTO v_source_columns, v_target_table, v_target_columns
  FROM pg_catalog.pg_constraint AS constraint_row
  CROSS JOIN LATERAL pg_catalog.generate_subscripts(
    constraint_row.conkey,
    1
  ) AS key_position(position)
  JOIN pg_catalog.pg_attribute AS source_column
    ON source_column.attrelid = constraint_row.conrelid
    AND source_column.attnum = constraint_row.conkey[key_position.position]
  JOIN pg_catalog.pg_attribute AS target_column
    ON target_column.attrelid = constraint_row.confrelid
    AND target_column.attnum = constraint_row.confkey[key_position.position]
  WHERE constraint_row.conrelid =
      'public.supplier_price_list_items'::regclass
    AND constraint_row.conname = 'supplier_price_items_sku_supplier_fkey'
    AND constraint_row.contype = 'f'
  GROUP BY constraint_row.confrelid;

  IF v_source_columns IS DISTINCT FROM ARRAY[
      'supplier_sku_id', 'supplier_id'
    ]::text[]
    OR v_target_table IS DISTINCT FROM 'public.supplier_skus'::regclass
    OR v_target_columns IS DISTINCT FROM ARRAY[
      'id', 'supplier_id'
    ]::text[]
  THEN
    RAISE EXCEPTION 'Task 7 SKU PostgREST relationship invalid';
  END IF;
END
$task7_postgrest_relationships$;

INSERT INTO public.tenants (id, name, slug, status)
VALUES
  (
    'b7000000-0000-4000-8000-000000000001',
    'Task 7 tenant A', 'task7-smoke-a', 'active'
  ),
  (
    'b7000000-0000-4000-8000-000000000002',
    'Task 7 tenant B', 'task7-smoke-b', 'active'
  );

-- task7 tenant A
-- task7 tenant B
INSERT INTO auth.users (id, role, created_at, updated_at)
VALUES
  (
    'b7000000-0000-4000-8000-000000000011',
    'authenticated', now(), now()
  ),
  (
    'b7000000-0000-4000-8000-000000000012',
    'authenticated', now(), now()
  ),
  (
    'b7000000-0000-4000-8000-000000000013',
    'authenticated', now(), now()
  );

INSERT INTO public.employees (
  id, name, phone, status, tenant_id, user_id
)
VALUES
  (
    'b7000000-0000-4000-8000-000000000021',
    'Task 7 platform actor', '19700000001', 'active', NULL,
    'b7000000-0000-4000-8000-000000000011'
  ),
  (
    'b7000000-0000-4000-8000-000000000022',
    'Task 7 tenant A actor', '19700000002', 'active',
    'b7000000-0000-4000-8000-000000000001',
    'b7000000-0000-4000-8000-000000000012'
  ),
  (
    'b7000000-0000-4000-8000-000000000023',
    'Task 7 tenant B actor', '19700000003', 'active',
    'b7000000-0000-4000-8000-000000000002',
    'b7000000-0000-4000-8000-000000000013'
  );

INSERT INTO public.employee_roles (id, employee_id, role_id)
SELECT
  'b7000000-0000-4000-8000-000000000024',
  'b7000000-0000-4000-8000-000000000021',
  role.id
FROM public.roles AS role
WHERE role.code = 'platform_admin'
  AND role.tenant_id IS NULL
  AND role.status = 'active';

INSERT INTO public.suppliers (
  id, code, name, legal_name, supplier_type,
  onboarding_status, operational_status,
  ownership_scope, owner_tenant_id,
  created_by_employee_id, updated_by_employee_id
)
VALUES (
  'b7000000-0000-4000-8000-000000000031',
  'TASK7-SUPPLIER', 'Task 7 supplier', 'Task 7 supplier ltd',
  'distributor', 'approved', 'active', 'platform', NULL,
  'b7000000-0000-4000-8000-000000000021',
  'b7000000-0000-4000-8000-000000000021'
);

INSERT INTO public.tenant_supplier_settings (
  tenant_id, module_enabled, ownership_reads_enabled,
  private_supplier_writes_enabled, private_catalog_writes_enabled,
  enabled_by_employee_id, enabled_at
)
VALUES
  (
    'b7000000-0000-4000-8000-000000000001',
    true, true, true, true,
    'b7000000-0000-4000-8000-000000000022', now()
  ),
  (
    'b7000000-0000-4000-8000-000000000002',
    true, true, true, true,
    'b7000000-0000-4000-8000-000000000023', now()
  );

INSERT INTO public.tenant_suppliers (
  id, tenant_id, supplier_id, relationship_status,
  internal_supplier_code, created_by_employee_id, updated_by_employee_id
)
VALUES
  (
    'b7000000-0000-4000-8000-000000000041',
    'b7000000-0000-4000-8000-000000000001',
    'b7000000-0000-4000-8000-000000000031', 'active', 'TASK7-A',
    'b7000000-0000-4000-8000-000000000022',
    'b7000000-0000-4000-8000-000000000022'
  ),
  (
    'b7000000-0000-4000-8000-000000000042',
    'b7000000-0000-4000-8000-000000000002',
    'b7000000-0000-4000-8000-000000000031', 'active', 'TASK7-B',
    'b7000000-0000-4000-8000-000000000023',
    'b7000000-0000-4000-8000-000000000023'
  );

-- task7 active relationship
INSERT INTO public.catalog_categories (
  id, code, name, level, full_name, is_leaf, status,
  ownership_scope, owner_tenant_id,
  created_by_employee_id, updated_by_employee_id
)
VALUES (
  'b7000000-0000-4000-8000-000000000051',
  'TASK7-CATEGORY', 'Task 7 category', 1,
  'Task 7 category', true, 'active', 'platform', NULL,
  'b7000000-0000-4000-8000-000000000021',
  'b7000000-0000-4000-8000-000000000021'
);

INSERT INTO public.catalog_brands (
  id, code, name, legal_name, status,
  ownership_scope, owner_tenant_id,
  created_by_employee_id, updated_by_employee_id
)
VALUES (
  'b7000000-0000-4000-8000-000000000052',
  'TASK7-BRAND', 'Task 7 brand', 'Task 7 brand ltd', 'active',
  'platform', NULL,
  'b7000000-0000-4000-8000-000000000021',
  'b7000000-0000-4000-8000-000000000021'
);

INSERT INTO public.catalog_units (
  id, code, name, symbol, unit_dimension, status,
  created_by_employee_id, updated_by_employee_id
)
VALUES (
  'b7000000-0000-4000-8000-000000000053',
  'TASK7-EACH', 'Task 7 each', '件', 'count', 'active',
  'b7000000-0000-4000-8000-000000000021',
  'b7000000-0000-4000-8000-000000000021'
);

DO $task7_catalog_fixture$
DECLARE
  v_result jsonb;
  v_product_payload jsonb;
  v_sku_payload jsonb;
BEGIN
  v_product_payload := jsonb_build_object(
    'product_code', 'TASK7-PLATFORM-PRODUCT',
    'name', 'Task 7 platform shared product',
    'category_id', 'b7000000-0000-4000-8000-000000000051',
    'brand_id', 'b7000000-0000-4000-8000-000000000052'
  );
  v_result := public.command_supplier_product_v2(
    'create', 'platform', NULL, NULL,
    'b7000000-0000-4000-8000-000000000031',
    'b7000000-0000-4000-8000-000000000061', NULL,
    v_product_payload,
    'b7000000-0000-4000-8000-000000000011',
    'b7000000-0000-4000-8000-000000000021',
    'task7-platform-product-create'
  );
  IF v_result ->> 'status' <> 'created' THEN
    RAISE EXCEPTION 'Task 7 platform product create failed: %', v_result;
  END IF;
  v_product_payload := jsonb_build_object(
    'product_code', 'TASK7-TENANT-PRODUCT',
    'name', 'Task 7 tenant A private product',
    'category_id', 'b7000000-0000-4000-8000-000000000051',
    'brand_id', 'b7000000-0000-4000-8000-000000000052'
  );
  v_result := public.command_supplier_product_v2(
    'create', 'tenant',
    'b7000000-0000-4000-8000-000000000001',
    'b7000000-0000-4000-8000-000000000041',
    'b7000000-0000-4000-8000-000000000031',
    'b7000000-0000-4000-8000-000000000062', NULL,
    v_product_payload,
    'b7000000-0000-4000-8000-000000000012',
    'b7000000-0000-4000-8000-000000000022',
    'task7-tenant-product-create'
  );
  v_sku_payload := jsonb_build_object(
    'sku_code', 'TASK7-PLATFORM-SKU',
    'name', 'Task 7 platform shared SKU',
    'purchase_unit_id', 'b7000000-0000-4000-8000-000000000053',
    'spec_values', '{}'::jsonb
  );
  v_result := public.command_supplier_sku_v2(
    'create', 'platform', NULL, NULL,
    'b7000000-0000-4000-8000-000000000031',
    'b7000000-0000-4000-8000-000000000061',
    'b7000000-0000-4000-8000-000000000071', NULL, v_sku_payload,
    'b7000000-0000-4000-8000-000000000011',
    'b7000000-0000-4000-8000-000000000021',
    'task7-platform-sku-create'
  );
  v_result := public.command_supplier_sku_v2(
    'activate', 'platform', NULL, NULL,
    'b7000000-0000-4000-8000-000000000031',
    'b7000000-0000-4000-8000-000000000061',
    'b7000000-0000-4000-8000-000000000071', 1, '{}'::jsonb,
    'b7000000-0000-4000-8000-000000000011',
    'b7000000-0000-4000-8000-000000000021',
    'task7-platform-sku-activate'
  );

  v_sku_payload := jsonb_build_object(
    'sku_code', 'TASK7-TENANT-SKU',
    'name', 'Task 7 tenant A private SKU',
    'purchase_unit_id', 'b7000000-0000-4000-8000-000000000053',
    'spec_values', '{}'::jsonb
  );
  v_result := public.command_supplier_sku_v2(
    'create', 'tenant',
    'b7000000-0000-4000-8000-000000000001',
    'b7000000-0000-4000-8000-000000000041',
    'b7000000-0000-4000-8000-000000000031',
    'b7000000-0000-4000-8000-000000000062',
    'b7000000-0000-4000-8000-000000000072', NULL, v_sku_payload,
    'b7000000-0000-4000-8000-000000000012',
    'b7000000-0000-4000-8000-000000000022',
    'task7-tenant-sku-create'
  );
  v_result := public.command_supplier_sku_v2(
    'activate', 'tenant',
    'b7000000-0000-4000-8000-000000000001',
    'b7000000-0000-4000-8000-000000000041',
    'b7000000-0000-4000-8000-000000000031',
    'b7000000-0000-4000-8000-000000000062',
    'b7000000-0000-4000-8000-000000000072', 1, '{}'::jsonb,
    'b7000000-0000-4000-8000-000000000012',
    'b7000000-0000-4000-8000-000000000022',
    'task7-tenant-sku-activate'
  );

  -- Active products require an active SKU, so activate products last.
  v_result := public.command_supplier_product_v2(
    'activate', 'platform', NULL, NULL,
    'b7000000-0000-4000-8000-000000000031',
    'b7000000-0000-4000-8000-000000000061', 1, '{}'::jsonb,
    'b7000000-0000-4000-8000-000000000011',
    'b7000000-0000-4000-8000-000000000021',
    'task7-platform-product-activate'
  );
  v_result := public.command_supplier_product_v2(
    'activate', 'tenant',
    'b7000000-0000-4000-8000-000000000001',
    'b7000000-0000-4000-8000-000000000041',
    'b7000000-0000-4000-8000-000000000031',
    'b7000000-0000-4000-8000-000000000062', 1, '{}'::jsonb,
    'b7000000-0000-4000-8000-000000000012',
    'b7000000-0000-4000-8000-000000000022',
    'task7-tenant-product-activate'
  );
END
$task7_catalog_fixture$;

DO $task7_legacy_proxy_retire$
DECLARE
  v_result jsonb;
  v_operation_source text;
  v_proxy_reason text;
BEGIN
  v_result := public.create_supplier_price_list(
    'b7000000-0000-4000-8000-000000000083',
    'b7000000-0000-4000-8000-000000000001',
    'b7000000-0000-4000-8000-000000000031',
    'TASK7-LEGACY-PROXY', 'Task 7 legacy proxy price', 'CNY',
    '2035-01-01T00:00:00+08:00', '2035-12-31T00:00:00+08:00',
    'b7000000-0000-4000-8000-000000000012',
    'b7000000-0000-4000-8000-000000000022',
    'task7-legacy-price-create', 'Task 7 legacy create provenance'
  );
  IF v_result ->> 'status' <> 'created'
    OR v_result ->> 'version' <> '1'
  THEN
    RAISE EXCEPTION 'Task 7 legacy price create failed: %', v_result;
  END IF;

  v_result := public.upsert_supplier_price_list_item(
    'b7000000-0000-4000-8000-000000000093',
    'b7000000-0000-4000-8000-000000000083',
    'b7000000-0000-4000-8000-000000000001',
    'b7000000-0000-4000-8000-000000000031',
    'b7000000-0000-4000-8000-000000000071',
    77.00, 0.13, true, 1,
    'b7000000-0000-4000-8000-000000000012',
    'b7000000-0000-4000-8000-000000000022',
    'task7-legacy-item-upsert', 'Task 7 legacy item provenance'
  );
  IF v_result ->> 'version' <> '2' THEN
    RAISE EXCEPTION 'Task 7 legacy item upsert failed: %', v_result;
  END IF;

  v_result := public.publish_supplier_price_list(
    'b7000000-0000-4000-8000-000000000083',
    'b7000000-0000-4000-8000-000000000001',
    'b7000000-0000-4000-8000-000000000031', 2,
    'b7000000-0000-4000-8000-000000000012',
    'b7000000-0000-4000-8000-000000000022',
    'task7-legacy-price-publish', 'Task 7 legacy publish provenance'
  );
  IF v_result ->> 'status' <> 'published'
    OR v_result ->> 'version' <> '3'
  THEN
    RAISE EXCEPTION 'Task 7 legacy publish failed: %', v_result;
  END IF;

  SELECT operation_source, proxy_reason
  INTO v_operation_source, v_proxy_reason
  FROM public.supplier_price_lists
  WHERE id = 'b7000000-0000-4000-8000-000000000083';
  IF v_operation_source <> 'tenant_proxy'
    OR v_proxy_reason <> 'Task 7 legacy publish provenance'
  THEN
    RAISE EXCEPTION 'Task 7 legacy provenance fixture invalid';
  END IF;

  v_result := public.command_supplier_price_list_v2(
    'retire', 'b7000000-0000-4000-8000-000000000083', NULL,
    'b7000000-0000-4000-8000-000000000001',
    'b7000000-0000-4000-8000-000000000041',
    'b7000000-0000-4000-8000-000000000031', 3, '{}'::jsonb,
    'b7000000-0000-4000-8000-000000000012',
    'b7000000-0000-4000-8000-000000000022',
    'task7-legacy-v2-retire'
  );
  IF v_result ->> 'status' <> 'retired'
    OR v_result ->> 'version' <> '4'
  THEN
    RAISE EXCEPTION 'Task 7 legacy v2 retire failed: %', v_result;
  END IF;

  -- task7 legacy proxy provenance preserved
  IF NOT EXISTS (
    SELECT 1
    FROM public.supplier_price_lists
    WHERE id = 'b7000000-0000-4000-8000-000000000083'
      AND operation_source IS NOT DISTINCT FROM v_operation_source
      AND proxy_reason IS NOT DISTINCT FROM v_proxy_reason
      AND lifecycle_status = 'retired'
  ) THEN
    RAISE EXCEPTION 'Task 7 legacy proxy provenance changed';
  END IF;
END
$task7_legacy_proxy_retire$;

DO $task7_price_behavior$
DECLARE
  v_result jsonb;
  v_count integer;
  v_create_payload jsonb := jsonb_build_object(
    'price_list_code', 'TASK7-DEFAULT',
    'name', 'Task 7 tenant purchase price',
    'currency', 'CNY',
    'effective_from', '2036-01-01T00:00:00+08:00',
    'effective_until', NULL
  );
  v_platform_item jsonb := jsonb_build_object(
    'sku_id', 'b7000000-0000-4000-8000-000000000071',
    'unit_price', 88.00,
    'tax_rate', 0.13,
    'tax_inclusive', true
  );
  v_tenant_item jsonb := jsonb_build_object(
    'sku_id', 'b7000000-0000-4000-8000-000000000072',
    'unit_price', 99.00,
    'tax_rate', 0.13,
    'tax_inclusive', true
  );
BEGIN
  v_result := public.command_supplier_price_list_v2(
    'create', 'b7000000-0000-4000-8000-000000000081', NULL,
    'b7000000-0000-4000-8000-000000000001',
    'b7000000-0000-4000-8000-000000000041',
    'b7000000-0000-4000-8000-000000000031', NULL, v_create_payload,
    'b7000000-0000-4000-8000-000000000012',
    'b7000000-0000-4000-8000-000000000022',
    'task7-price-create'
  );
  IF v_result ->> 'status' <> 'created' THEN
    RAISE EXCEPTION 'Task 7 price create failed: %', v_result;
  END IF;

  v_result := public.command_supplier_price_list_v2(
    'update', 'b7000000-0000-4000-8000-000000000081', NULL,
    'b7000000-0000-4000-8000-000000000001',
    'b7000000-0000-4000-8000-000000000041',
    'b7000000-0000-4000-8000-000000000031', 1,
    '{"name":"Task 7 updated tenant purchase price"}'::jsonb,
    'b7000000-0000-4000-8000-000000000012',
    'b7000000-0000-4000-8000-000000000022',
    'task7-price-update'
  );
  IF v_result ->> 'version' <> '2' THEN
    RAISE EXCEPTION 'Task 7 draft update failed: %', v_result;
  END IF;

  -- task7 platform SKU price
  v_result := public.command_supplier_price_item_v2(
    'upsert', 'b7000000-0000-4000-8000-000000000091',
    'b7000000-0000-4000-8000-000000000081',
    'b7000000-0000-4000-8000-000000000001',
    'b7000000-0000-4000-8000-000000000041',
    'b7000000-0000-4000-8000-000000000031', 2, v_platform_item,
    'b7000000-0000-4000-8000-000000000012',
    'b7000000-0000-4000-8000-000000000022',
    'task7-platform-item-upsert'
  );
  IF v_result ->> 'version' <> '3' THEN
    RAISE EXCEPTION 'Task 7 platform SKU price failed: %', v_result;
  END IF;

  -- task7 idempotent replay
  v_result := public.command_supplier_price_item_v2(
    'upsert', 'b7000000-0000-4000-8000-000000000091',
    'b7000000-0000-4000-8000-000000000081',
    'b7000000-0000-4000-8000-000000000001',
    'b7000000-0000-4000-8000-000000000041',
    'b7000000-0000-4000-8000-000000000031', 2, v_platform_item,
    'b7000000-0000-4000-8000-000000000012',
    'b7000000-0000-4000-8000-000000000022',
    'task7-platform-item-upsert'
  );
  IF v_result ->> 'idempotent' <> 'true' THEN
    RAISE EXCEPTION 'Task 7 idempotent replay failed: %', v_result;
  END IF;

  -- task7 tenant A SKU price
  v_result := public.command_supplier_price_item_v2(
    'upsert', 'b7000000-0000-4000-8000-000000000092',
    'b7000000-0000-4000-8000-000000000081',
    'b7000000-0000-4000-8000-000000000001',
    'b7000000-0000-4000-8000-000000000041',
    'b7000000-0000-4000-8000-000000000031', 3, v_tenant_item,
    'b7000000-0000-4000-8000-000000000012',
    'b7000000-0000-4000-8000-000000000022',
    'task7-tenant-item-upsert'
  );
  IF v_result ->> 'version' <> '4' THEN
    RAISE EXCEPTION 'Task 7 tenant SKU price failed: %', v_result;
  END IF;

  v_result := public.command_supplier_price_item_v2(
    'delete', 'b7000000-0000-4000-8000-000000000092',
    'b7000000-0000-4000-8000-000000000081',
    'b7000000-0000-4000-8000-000000000001',
    'b7000000-0000-4000-8000-000000000041',
    'b7000000-0000-4000-8000-000000000031', 4, '{}'::jsonb,
    'b7000000-0000-4000-8000-000000000012',
    'b7000000-0000-4000-8000-000000000022',
    'task7-tenant-item-delete'
  );
  v_result := public.command_supplier_price_item_v2(
    'upsert', 'b7000000-0000-4000-8000-000000000092',
    'b7000000-0000-4000-8000-000000000081',
    'b7000000-0000-4000-8000-000000000001',
    'b7000000-0000-4000-8000-000000000041',
    'b7000000-0000-4000-8000-000000000031', 5, v_tenant_item,
    'b7000000-0000-4000-8000-000000000012',
    'b7000000-0000-4000-8000-000000000022',
    'task7-tenant-item-recreate'
  );

  -- task7 operation source tenant
  -- task7 proxy reason null
  SELECT count(*) INTO v_count
  FROM (
    SELECT operation_source, proxy_reason
    FROM public.supplier_price_lists
    WHERE id = 'b7000000-0000-4000-8000-000000000081'
    UNION ALL
    SELECT operation_source, proxy_reason
    FROM public.supplier_price_list_items
    WHERE supplier_price_list_id =
      'b7000000-0000-4000-8000-000000000081'
  ) AS audit
  WHERE audit.operation_source = 'tenant'
    AND audit.proxy_reason IS NULL;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'Task 7 tenant audit failed: %', v_count;
  END IF;

  -- task7 tenant B price absence
  SELECT count(*) INTO v_count
  FROM public.supplier_price_lists AS price_list
  WHERE price_list.tenant_id =
      'b7000000-0000-4000-8000-000000000002'
    AND price_list.id = 'b7000000-0000-4000-8000-000000000081';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Task 7 tenant B price absence failed';
  END IF;

  -- task7 tenant B write not found
  v_result := public.command_supplier_price_list_v2(
    'update', 'b7000000-0000-4000-8000-000000000081', NULL,
    'b7000000-0000-4000-8000-000000000002',
    'b7000000-0000-4000-8000-000000000042',
    'b7000000-0000-4000-8000-000000000031', 6,
    '{"name":"forbidden"}'::jsonb,
    'b7000000-0000-4000-8000-000000000013',
    'b7000000-0000-4000-8000-000000000023',
    'task7-tenant-b-update'
  );
  IF v_result ->> 'error_code' <> 'SUPPLIER_PRICE_LIST_NOT_FOUND' THEN
    RAISE EXCEPTION 'Task 7 tenant B write leaked resource: %', v_result;
  END IF;

  v_result := public.command_supplier_price_list_v2(
    'publish', 'b7000000-0000-4000-8000-000000000081', NULL,
    'b7000000-0000-4000-8000-000000000001',
    'b7000000-0000-4000-8000-000000000041',
    'b7000000-0000-4000-8000-000000000031', 6, '{}'::jsonb,
    'b7000000-0000-4000-8000-000000000012',
    'b7000000-0000-4000-8000-000000000022',
    'task7-price-publish'
  );
  IF v_result ->> 'status' <> 'published'
    OR v_result ->> 'version' <> '7'
  THEN
    RAISE EXCEPTION 'Task 7 publish failed: %', v_result;
  END IF;

  -- task7 published update rejection
  v_result := public.command_supplier_price_list_v2(
    'update', 'b7000000-0000-4000-8000-000000000081', NULL,
    'b7000000-0000-4000-8000-000000000001',
    'b7000000-0000-4000-8000-000000000041',
    'b7000000-0000-4000-8000-000000000031', 7,
    '{"name":"forbidden"}'::jsonb,
    'b7000000-0000-4000-8000-000000000012',
    'b7000000-0000-4000-8000-000000000022',
    'task7-published-update'
  );
  IF v_result ->> 'error_code' <> 'SUPPLIER_PRICE_LIST_INVALID_ACTION' THEN
    RAISE EXCEPTION 'Task 7 published update was accepted: %', v_result;
  END IF;

  -- task7 published item mutation rejection
  v_result := public.command_supplier_price_item_v2(
    'upsert', 'b7000000-0000-4000-8000-000000000091',
    'b7000000-0000-4000-8000-000000000081',
    'b7000000-0000-4000-8000-000000000001',
    'b7000000-0000-4000-8000-000000000041',
    'b7000000-0000-4000-8000-000000000031', 7, v_platform_item,
    'b7000000-0000-4000-8000-000000000012',
    'b7000000-0000-4000-8000-000000000022',
    'task7-published-item-update'
  );
  IF v_result ->> 'error_code' <> 'SUPPLIER_PRICE_LIST_INVALID_ACTION' THEN
    RAISE EXCEPTION 'Task 7 published item mutation was accepted: %', v_result;
  END IF;

  v_result := public.command_supplier_price_list_v2(
    'retire', 'b7000000-0000-4000-8000-000000000081', NULL,
    'b7000000-0000-4000-8000-000000000001',
    'b7000000-0000-4000-8000-000000000041',
    'b7000000-0000-4000-8000-000000000031', 7, '{}'::jsonb,
    'b7000000-0000-4000-8000-000000000012',
    'b7000000-0000-4000-8000-000000000022',
    'task7-price-retire'
  );
  IF v_result ->> 'status' <> 'retired'
    OR v_result ->> 'version' <> '8'
  THEN
    RAISE EXCEPTION 'Task 7 retire failed: %', v_result;
  END IF;

  -- task7 new version success
  v_result := public.command_supplier_price_list_v2(
    'new_version', 'b7000000-0000-4000-8000-000000000081',
    'b7000000-0000-4000-8000-000000000082',
    'b7000000-0000-4000-8000-000000000001',
    'b7000000-0000-4000-8000-000000000041',
    'b7000000-0000-4000-8000-000000000031', 8, '{}'::jsonb,
    'b7000000-0000-4000-8000-000000000012',
    'b7000000-0000-4000-8000-000000000022',
    'task7-price-new-version'
  );
  IF v_result ->> 'status' <> 'created'
    OR v_result ->> 'version' <> '1'
  THEN
    RAISE EXCEPTION 'Task 7 new version failed: %', v_result;
  END IF;

  -- task7 new version idempotent replay
  v_result := public.command_supplier_price_list_v2(
    'new_version', 'b7000000-0000-4000-8000-000000000081',
    'b7000000-0000-4000-8000-000000000082',
    'b7000000-0000-4000-8000-000000000001',
    'b7000000-0000-4000-8000-000000000041',
    'b7000000-0000-4000-8000-000000000031', 8, '{}'::jsonb,
    'b7000000-0000-4000-8000-000000000012',
    'b7000000-0000-4000-8000-000000000022',
    'task7-price-new-version'
  );
  IF v_result ->> 'idempotent' <> 'true'
    OR v_result ->> 'status' <> 'created'
  THEN
    RAISE EXCEPTION 'Task 7 new version replay failed: %', v_result;
  END IF;

  -- task7 existing new-version target conflict
  v_result := public.command_supplier_price_list_v2(
    'new_version', 'b7000000-0000-4000-8000-000000000081',
    'b7000000-0000-4000-8000-000000000082',
    'b7000000-0000-4000-8000-000000000001',
    'b7000000-0000-4000-8000-000000000041',
    'b7000000-0000-4000-8000-000000000031', 8, '{}'::jsonb,
    'b7000000-0000-4000-8000-000000000012',
    'b7000000-0000-4000-8000-000000000022',
    'task7-existing-new-version-target'
  );
  IF v_result ->> 'status' <> 'state_conflict'
    OR v_result ->> 'error_code' <> 'SUPPLIER_PRICE_LIST_INVALID_ACTION'
    OR v_result ->> 'reason' <> 'target_already_exists'
  THEN
    RAISE EXCEPTION 'Task 7 existing target conflict failed: %', v_result;
  END IF;

  -- task7 new version copied item facts
  SELECT count(*) INTO v_count
  FROM public.supplier_price_list_items
  WHERE supplier_price_list_id =
    'b7000000-0000-4000-8000-000000000082';
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Task 7 new version copied item count failed: %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.supplier_price_list_items AS source_item
  JOIN public.supplier_price_list_items AS copied_item
    ON copied_item.supplier_price_list_id =
      'b7000000-0000-4000-8000-000000000082'
    AND copied_item.supplier_sku_id = source_item.supplier_sku_id
  WHERE source_item.supplier_price_list_id =
      'b7000000-0000-4000-8000-000000000081'
    AND copied_item.supplier_product_id IS NOT DISTINCT FROM
      source_item.supplier_product_id
    AND copied_item.supplier_sku_id IS NOT DISTINCT FROM
      source_item.supplier_sku_id
    AND copied_item.minimum_quantity IS NOT DISTINCT FROM
      source_item.minimum_quantity
    AND copied_item.maximum_quantity IS NOT DISTINCT FROM
      source_item.maximum_quantity
    AND copied_item.purchase_unit_id IS NOT DISTINCT FROM
      source_item.purchase_unit_id
    AND copied_item.base_unit_id IS NOT DISTINCT FROM
      source_item.base_unit_id
    AND copied_item.base_unit_conversion IS NOT DISTINCT FROM
      source_item.base_unit_conversion
    AND copied_item.unit_price IS NOT DISTINCT FROM source_item.unit_price
    AND copied_item.tax_rate IS NOT DISTINCT FROM source_item.tax_rate
    AND copied_item.tax_inclusive IS NOT DISTINCT FROM
      source_item.tax_inclusive;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Task 7 new version copied item facts failed: %', v_count;
  END IF;
END
$task7_price_behavior$;

DO $task7_inactive_relationship$
DECLARE
  v_result jsonb;
  v_count integer;
BEGIN
  UPDATE public.tenant_suppliers
  SET relationship_status = 'suspended'
  WHERE id = 'b7000000-0000-4000-8000-000000000041';

  -- task7 inactive relationship
  -- task7 inactive relationship historical read
  SELECT count(*) INTO v_count
  FROM public.supplier_price_lists AS price_list
  WHERE price_list.tenant_id =
      'b7000000-0000-4000-8000-000000000001'
    AND price_list.tenant_supplier_id =
      'b7000000-0000-4000-8000-000000000041'
    AND price_list.supplier_id =
      'b7000000-0000-4000-8000-000000000031';
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'Task 7 inactive historical read failed: %', v_count;
  END IF;

  -- task7 inactive relationship replay rejection
  BEGIN
    PERFORM public.command_supplier_price_item_v2(
      'upsert', 'b7000000-0000-4000-8000-000000000091',
      'b7000000-0000-4000-8000-000000000081',
      'b7000000-0000-4000-8000-000000000001',
      'b7000000-0000-4000-8000-000000000041',
      'b7000000-0000-4000-8000-000000000031', 2,
      jsonb_build_object(
        'sku_id', 'b7000000-0000-4000-8000-000000000071',
        'unit_price', 88.00,
        'tax_rate', 0.13,
        'tax_inclusive', true
      ),
      'b7000000-0000-4000-8000-000000000012',
      'b7000000-0000-4000-8000-000000000022',
      'task7-platform-item-upsert'
    );
    RAISE EXCEPTION 'Task 7 inactive replay was accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_ORDER_NOT_ELIGIBLE' THEN RAISE; END IF;
  END;

  -- task7 inactive relationship write rejection
  BEGIN
    PERFORM public.command_supplier_price_list_v2(
      'update', 'b7000000-0000-4000-8000-000000000082', NULL,
      'b7000000-0000-4000-8000-000000000001',
      'b7000000-0000-4000-8000-000000000041',
      'b7000000-0000-4000-8000-000000000031', 1,
      '{"name":"forbidden while suspended"}'::jsonb,
      'b7000000-0000-4000-8000-000000000012',
      'b7000000-0000-4000-8000-000000000022',
      'task7-suspended-write'
    );
    RAISE EXCEPTION 'Task 7 inactive write was accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_ORDER_NOT_ELIGIBLE' THEN RAISE; END IF;
  END;
END
$task7_inactive_relationship$;

ROLLBACK;
