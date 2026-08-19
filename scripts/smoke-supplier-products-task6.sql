\set ON_ERROR_STOP on

-- Local-only invocation (the caller must target 127.0.0.1:54322):
-- PGOPTIONS='-c task6.local_endpoint=127.0.0.1:54322' psql \
--   'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--   -X -v ON_ERROR_STOP=1 -f scripts/smoke-supplier-products-task6.sql

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

DO $task6_local_only$
BEGIN
  IF current_setting('task6.local_endpoint', true)
      IS DISTINCT FROM '127.0.0.1:54322'
    OR current_database() <> 'postgres'
  THEN
    RAISE EXCEPTION
      'Task 6 smoke only allows local 127.0.0.1:54322/postgres';
  END IF;
END
$task6_local_only$;

DO $task6_acl_contract$
DECLARE
  v_signature regprocedure;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.command_supplier_product_v2(text,text,uuid,uuid,uuid,uuid,integer,jsonb,uuid,uuid,text)'::regprocedure,
    'public.command_supplier_sku_v2(text,text,uuid,uuid,uuid,uuid,uuid,integer,jsonb,uuid,uuid,text)'::regprocedure,
    'public.replace_supplier_sku_unit_conversions_v3(text,uuid,uuid,uuid,uuid,uuid,integer,uuid,uuid,jsonb,uuid,uuid,text)'::regprocedure
  ]
  LOOP
    IF NOT has_function_privilege('service_role', v_signature, 'EXECUTE')
      OR has_function_privilege('authenticated', v_signature, 'EXECUTE')
      OR has_function_privilege('anon', v_signature, 'EXECUTE')
    THEN
      RAISE EXCEPTION 'Task 6 write function ACL invalid: %', v_signature;
    END IF;
  END LOOP;

  FOREACH v_signature IN ARRAY ARRAY[
    'public.replace_supplier_sku_unit_conversions(uuid,integer,jsonb,uuid,uuid,uuid,text)'::regprocedure,
    'public.replace_supplier_sku_unit_conversions_v2(text,uuid,uuid,uuid,uuid,uuid,integer,jsonb,uuid,uuid,text)'::regprocedure
  ]
  LOOP
    IF has_function_privilege('service_role', v_signature, 'EXECUTE')
      OR has_function_privilege('authenticated', v_signature, 'EXECUTE')
      OR has_function_privilege('anon', v_signature, 'EXECUTE')
    THEN
      RAISE EXCEPTION 'Task 6 unsafe conversion ACL is open: %', v_signature;
    END IF;
  END LOOP;
END
$task6_acl_contract$;

INSERT INTO public.tenants (id, name, slug, status)
VALUES
  (
    'a6000000-0000-4000-8000-000000000001',
    'Task 6 smoke tenant A', 'task6-smoke-a', 'active'
  ),
  (
    'a6000000-0000-4000-8000-000000000002',
    'Task 6 smoke tenant B', 'task6-smoke-b', 'active'
  );

INSERT INTO auth.users (id, role, created_at, updated_at)
VALUES
  (
    'a6000000-0000-4000-8000-000000000011',
    'authenticated', now(), now()
  ),
  (
    'a6000000-0000-4000-8000-000000000012',
    'authenticated', now(), now()
  ),
  (
    'a6000000-0000-4000-8000-000000000013',
    'authenticated', now(), now()
  );

INSERT INTO public.employees (
  id, name, phone, status, tenant_id, user_id
)
VALUES
  (
    'a6000000-0000-4000-8000-000000000021',
    'Task 6 platform actor', '19600000001', 'active', NULL,
    'a6000000-0000-4000-8000-000000000011'
  ),
  (
    'a6000000-0000-4000-8000-000000000022',
    'Task 6 tenant A actor', '19600000002', 'active',
    'a6000000-0000-4000-8000-000000000001',
    'a6000000-0000-4000-8000-000000000012'
  ),
  (
    'a6000000-0000-4000-8000-000000000023',
    'Task 6 tenant B actor', '19600000003', 'active',
    'a6000000-0000-4000-8000-000000000002',
    'a6000000-0000-4000-8000-000000000013'
  );

INSERT INTO public.employee_roles (id, employee_id, role_id)
SELECT
  'a6000000-0000-4000-8000-000000000024',
  'a6000000-0000-4000-8000-000000000021',
  role.id
FROM public.roles AS role
WHERE role.code = 'platform_staff'
  AND role.tenant_id IS NULL
  AND role.status = 'active';

INSERT INTO public.role_permissions (
  id, role_id, permission_id, access_scope
)
SELECT
  'a6000000-0000-4000-8000-000000000025',
  role.id,
  permission.id,
  'all'
FROM public.roles AS role
JOIN public.permissions AS permission
  ON permission.code = 'platform.supplier-product.manage'
  AND permission.status = 'active'
WHERE role.code = 'platform_staff'
  AND role.tenant_id IS NULL
  AND role.status = 'active';

DO $task6_platform_fixture_contract$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.employee_roles
    WHERE id = 'a6000000-0000-4000-8000-000000000024'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.role_permissions
    WHERE id = 'a6000000-0000-4000-8000-000000000025'
  )
  THEN
    RAISE EXCEPTION 'Task 6 platform RBAC prerequisites are missing';
  END IF;
END
$task6_platform_fixture_contract$;

INSERT INTO public.suppliers (
  id, code, name, legal_name, supplier_type,
  onboarding_status, operational_status,
  ownership_scope, owner_tenant_id,
  created_by_employee_id, updated_by_employee_id
)
VALUES (
  'a6000000-0000-4000-8000-000000000031',
  'TASK6-SUPPLIER', 'Task 6 supplier', 'Task 6 supplier ltd',
  'distributor', 'approved', 'active', 'platform', NULL,
  'a6000000-0000-4000-8000-000000000021',
  'a6000000-0000-4000-8000-000000000021'
);

INSERT INTO public.tenant_supplier_settings (
  tenant_id, module_enabled, ownership_reads_enabled,
  private_supplier_writes_enabled, private_catalog_writes_enabled,
  enabled_by_employee_id, enabled_at
)
VALUES
  (
    'a6000000-0000-4000-8000-000000000001',
    true, true, true, true,
    'a6000000-0000-4000-8000-000000000022', now()
  ),
  (
    'a6000000-0000-4000-8000-000000000002',
    true, true, true, true,
    'a6000000-0000-4000-8000-000000000023', now()
  );

INSERT INTO public.tenant_suppliers (
  id, tenant_id, supplier_id, relationship_status,
  internal_supplier_code, created_by_employee_id, updated_by_employee_id
)
VALUES
  (
    'a6000000-0000-4000-8000-000000000041',
    'a6000000-0000-4000-8000-000000000001',
    'a6000000-0000-4000-8000-000000000031', 'active', 'TASK6-A',
    'a6000000-0000-4000-8000-000000000022',
    'a6000000-0000-4000-8000-000000000022'
  ),
  (
    'a6000000-0000-4000-8000-000000000042',
    'a6000000-0000-4000-8000-000000000002',
    'a6000000-0000-4000-8000-000000000031', 'active', 'TASK6-B',
    'a6000000-0000-4000-8000-000000000023',
    'a6000000-0000-4000-8000-000000000023'
  );

INSERT INTO public.catalog_categories (
  id, code, name, level, full_name, is_leaf, status,
  ownership_scope, owner_tenant_id,
  created_by_employee_id, updated_by_employee_id
)
VALUES
  (
    'a6000000-0000-4000-8000-000000000051',
    'TASK6-CATEGORY-A', 'Task 6 category A', 1,
    'Task 6 category A', true, 'active', 'platform', NULL,
    'a6000000-0000-4000-8000-000000000021',
    'a6000000-0000-4000-8000-000000000021'
  ),
  (
    'a6000000-0000-4000-8000-000000000052',
    'TASK6-CATEGORY-B', 'Task 6 category B', 1,
    'Task 6 category B', true, 'active', 'platform', NULL,
    'a6000000-0000-4000-8000-000000000021',
    'a6000000-0000-4000-8000-000000000021'
  );

INSERT INTO public.catalog_brands (
  id, code, name, legal_name, status,
  ownership_scope, owner_tenant_id,
  created_by_employee_id, updated_by_employee_id
)
VALUES (
  'a6000000-0000-4000-8000-000000000053',
  'TASK6-BRAND', 'Task 6 brand', 'Task 6 brand ltd', 'active',
  'platform', NULL,
  'a6000000-0000-4000-8000-000000000021',
  'a6000000-0000-4000-8000-000000000021'
);

INSERT INTO public.catalog_units (
  id, code, name, symbol, unit_dimension, status,
  created_by_employee_id, updated_by_employee_id
)
VALUES
  (
    'a6000000-0000-4000-8000-000000000054',
    'TASK6-EACH', 'Task 6 each', '片', 'count', 'active',
    'a6000000-0000-4000-8000-000000000021',
    'a6000000-0000-4000-8000-000000000021'
  ),
  (
    'a6000000-0000-4000-8000-000000000055',
    'TASK6-BOX', 'Task 6 box', '箱', 'count', 'active',
    'a6000000-0000-4000-8000-000000000021',
    'a6000000-0000-4000-8000-000000000021'
  ),
  (
    'a6000000-0000-4000-8000-000000000056',
    'TASK6-SQM', 'Task 6 square metre', '㎡', 'area', 'active',
    'a6000000-0000-4000-8000-000000000021',
    'a6000000-0000-4000-8000-000000000021'
  ),
  (
    'a6000000-0000-4000-8000-000000000057',
    'TASK6-PALLET', 'Task 6 pallet', '托', 'count', 'active',
    'a6000000-0000-4000-8000-000000000021',
    'a6000000-0000-4000-8000-000000000021'
  ),
  (
    'a6000000-0000-4000-8000-000000000058',
    'TASK6-INACTIVE', 'Task 6 inactive unit', '停', 'count', 'inactive',
    'a6000000-0000-4000-8000-000000000021',
    'a6000000-0000-4000-8000-000000000021'
  );

DO $task6_behavior$
DECLARE
  v_result jsonb;
  v_count integer;
BEGIN
  v_result := public.command_supplier_product_v2(
    'create', 'platform', NULL, NULL,
    'a6000000-0000-4000-8000-000000000031',
    'a6000000-0000-4000-8000-000000000061', NULL,
    jsonb_build_object(
      'product_code', 'TASK6-PLATFORM',
      'name', 'Task 6 platform shared product',
      'category_id', 'a6000000-0000-4000-8000-000000000051',
      'brand_id', 'a6000000-0000-4000-8000-000000000053'
    ),
    'a6000000-0000-4000-8000-000000000011',
    'a6000000-0000-4000-8000-000000000021',
    'task6-platform-create'
  );
  IF v_result ->> 'status' <> 'created'
    OR v_result ->> 'idempotent' <> 'false'
  THEN
    RAISE EXCEPTION 'task6 platform create failed: %', v_result;
  END IF;

  v_result := public.command_supplier_product_v2(
    'create', 'tenant',
    'a6000000-0000-4000-8000-000000000001',
    'a6000000-0000-4000-8000-000000000041',
    'a6000000-0000-4000-8000-000000000031',
    'a6000000-0000-4000-8000-000000000064', NULL,
    jsonb_build_object(
      'product_code', 'TASK6-TENANT-A',
      'name', 'Task 6 tenant A private product',
      'category_id', 'a6000000-0000-4000-8000-000000000051',
      'brand_id', 'a6000000-0000-4000-8000-000000000053'
    ),
    'a6000000-0000-4000-8000-000000000012',
    'a6000000-0000-4000-8000-000000000022',
    'task6-tenant-create'
  );
  IF v_result ->> 'status' <> 'created' THEN
    RAISE EXCEPTION 'task6 tenant create failed: %', v_result;
  END IF;

  -- task6 idempotent replay
  v_result := public.command_supplier_product_v2(
    'create', 'tenant',
    'a6000000-0000-4000-8000-000000000001',
    'a6000000-0000-4000-8000-000000000041',
    'a6000000-0000-4000-8000-000000000031',
    'a6000000-0000-4000-8000-000000000064', NULL,
    jsonb_build_object(
      'product_code', 'TASK6-TENANT-A',
      'name', 'Task 6 tenant A private product',
      'category_id', 'a6000000-0000-4000-8000-000000000051',
      'brand_id', 'a6000000-0000-4000-8000-000000000053'
    ),
    'a6000000-0000-4000-8000-000000000012',
    'a6000000-0000-4000-8000-000000000022',
    'task6-tenant-create'
  );
  IF v_result ->> 'idempotent' <> 'true' THEN
    RAISE EXCEPTION 'task6 replay failed: %', v_result;
  END IF;

  -- task6 platform shared visibility
  SELECT count(*) INTO v_count
  FROM public.supplier_products AS product
  WHERE product.supplier_id = 'a6000000-0000-4000-8000-000000000031'
    AND product.ownership_scope = 'platform'
    AND product.owner_tenant_id IS NULL;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'task6 platform shared visibility failed: %', v_count;
  END IF;

  -- task6 tenant A private visibility
  SELECT count(*) INTO v_count
  FROM public.supplier_products AS product
  WHERE product.supplier_id = 'a6000000-0000-4000-8000-000000000031'
    AND (
      product.ownership_scope = 'platform'
      OR (
        product.ownership_scope = 'tenant'
        AND product.owner_tenant_id =
          'a6000000-0000-4000-8000-000000000001'
      )
    );
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'task6 tenant A private visibility failed: %', v_count;
  END IF;

  -- task6 tenant B private absence
  SELECT count(*) INTO v_count
  FROM public.supplier_products AS product
  WHERE product.id = 'a6000000-0000-4000-8000-000000000064'
    AND product.supplier_id = 'a6000000-0000-4000-8000-000000000031'
    AND (
      product.ownership_scope = 'platform'
      OR (
        product.ownership_scope = 'tenant'
        AND product.owner_tenant_id =
          'a6000000-0000-4000-8000-000000000002'
      )
    );
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'task6 tenant B private absence failed: %', v_count;
  END IF;

  v_result := public.command_supplier_product_v2(
    'update', 'tenant',
    'a6000000-0000-4000-8000-000000000002',
    'a6000000-0000-4000-8000-000000000042',
    'a6000000-0000-4000-8000-000000000031',
    'a6000000-0000-4000-8000-000000000064', 1,
    '{"name":"forbidden"}'::jsonb,
    'a6000000-0000-4000-8000-000000000013',
    'a6000000-0000-4000-8000-000000000023',
    'task6-tenant-b-update'
  );
  IF v_result ->> 'error_code' <> 'SUPPLIER_PRODUCT_NOT_FOUND' THEN
    RAISE EXCEPTION 'task6 tenant B write leaked resource: %', v_result;
  END IF;
END
$task6_behavior$;

DO $task6_replay_revalidation$
DECLARE
  v_result jsonb;
  v_payload jsonb := jsonb_build_object(
    'product_code', 'TASK6-TENANT-A',
    'name', 'Task 6 tenant A private product',
    'category_id', 'a6000000-0000-4000-8000-000000000051',
    'brand_id', 'a6000000-0000-4000-8000-000000000053'
  );
  v_count integer;
BEGIN
  UPDATE public.tenant_suppliers
  SET relationship_status = 'suspended'
  WHERE id = 'a6000000-0000-4000-8000-000000000041';

  -- task6 inactive relationship historical read
  SELECT count(*) INTO v_count
  FROM public.supplier_products AS product
  WHERE product.id = 'a6000000-0000-4000-8000-000000000064'
    AND product.supplier_id = 'a6000000-0000-4000-8000-000000000031'
    AND product.ownership_scope = 'tenant'
    AND product.owner_tenant_id =
      'a6000000-0000-4000-8000-000000000001';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'task6 inactive relationship historical read failed';
  END IF;

  -- task6 relationship suspension replay rejection
  BEGIN
    PERFORM public.command_supplier_product_v2(
      'create', 'tenant',
      'a6000000-0000-4000-8000-000000000001',
      'a6000000-0000-4000-8000-000000000041',
      'a6000000-0000-4000-8000-000000000031',
      'a6000000-0000-4000-8000-000000000064', NULL, v_payload,
      'a6000000-0000-4000-8000-000000000012',
      'a6000000-0000-4000-8000-000000000022',
      'task6-tenant-create'
    );
    RAISE EXCEPTION 'task6 suspended relationship replay was accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'TENANT_SUPPLIER_NOT_FOUND' THEN RAISE; END IF;
  END;

  UPDATE public.tenant_suppliers
  SET relationship_status = 'active'
  WHERE id = 'a6000000-0000-4000-8000-000000000041';

  UPDATE public.employees
  SET user_id = NULL
  WHERE id = 'a6000000-0000-4000-8000-000000000022';

  -- task6 actor unlink replay rejection
  BEGIN
    PERFORM public.command_supplier_product_v2(
      'create', 'tenant',
      'a6000000-0000-4000-8000-000000000001',
      'a6000000-0000-4000-8000-000000000041',
      'a6000000-0000-4000-8000-000000000031',
      'a6000000-0000-4000-8000-000000000064', NULL, v_payload,
      'a6000000-0000-4000-8000-000000000012',
      'a6000000-0000-4000-8000-000000000022',
      'task6-tenant-create'
    );
    RAISE EXCEPTION 'task6 unlinked actor replay was accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_PROXY_ACTOR_INVALID' THEN RAISE; END IF;
  END;

  UPDATE public.employees
  SET user_id = 'a6000000-0000-4000-8000-000000000012'
  WHERE id = 'a6000000-0000-4000-8000-000000000022';

  IF EXISTS (
    SELECT 1 FROM public.supplier_products
    WHERE id = 'a6000000-0000-4000-8000-000000000064'
      AND (
        operation_source <> 'tenant'
        OR proxy_reason IS NOT NULL
        OR ownership_scope <> 'tenant'
        OR owner_tenant_id IS DISTINCT FROM
          'a6000000-0000-4000-8000-000000000001'
      )
  )
  THEN
    RAISE EXCEPTION 'task6 tenant ownership or audit source is invalid';
  END IF;
END
$task6_replay_revalidation$;

DO $task6_platform_replay_revalidation$
DECLARE
  v_result jsonb;
  v_permission_id uuid;
  v_role_id uuid;
  v_revoke_payload jsonb := jsonb_build_object(
    'product_code', 'TASK6-PLATFORM-REVOKE',
    'name', 'Task 6 platform revoke replay',
    'category_id', 'a6000000-0000-4000-8000-000000000051',
    'brand_id', 'a6000000-0000-4000-8000-000000000053'
  );
  v_deny_payload jsonb := jsonb_build_object(
    'product_code', 'TASK6-PLATFORM-DENY',
    'name', 'Task 6 platform deny replay',
    'category_id', 'a6000000-0000-4000-8000-000000000051',
    'brand_id', 'a6000000-0000-4000-8000-000000000053'
  );
BEGIN
  SELECT id INTO STRICT v_permission_id
  FROM public.permissions
  WHERE code = 'platform.supplier-product.manage'
    AND status = 'active';

  SELECT id INTO STRICT v_role_id
  FROM public.roles
  WHERE code = 'platform_staff'
    AND tenant_id IS NULL
    AND status = 'active';

  v_result := public.command_supplier_product_v2(
    'create', 'platform', NULL, NULL,
    'a6000000-0000-4000-8000-000000000031',
    'a6000000-0000-4000-8000-000000000062', NULL, v_revoke_payload,
    'a6000000-0000-4000-8000-000000000011',
    'a6000000-0000-4000-8000-000000000021',
    'task6-platform-revoke'
  );
  v_result := public.command_supplier_product_v2(
    'create', 'platform', NULL, NULL,
    'a6000000-0000-4000-8000-000000000031',
    'a6000000-0000-4000-8000-000000000062', NULL, v_revoke_payload,
    'a6000000-0000-4000-8000-000000000011',
    'a6000000-0000-4000-8000-000000000021',
    'task6-platform-revoke'
  );
  IF v_result ->> 'idempotent' <> 'true' THEN
    RAISE EXCEPTION 'task6 platform revoke baseline replay failed: %', v_result;
  END IF;

  DELETE FROM public.role_permissions
  WHERE id = 'a6000000-0000-4000-8000-000000000025';

  IF EXISTS (
    SELECT 1
    FROM public.employee_roles AS employee_role
    JOIN public.roles AS role ON role.id = employee_role.role_id
    JOIN public.role_permissions AS role_permission
      ON role_permission.role_id = role.id
    WHERE employee_role.employee_id =
      'a6000000-0000-4000-8000-000000000021'
      AND role_permission.permission_id = v_permission_id
  )
  THEN
    RAISE EXCEPTION
      'task6 revoke fixture still has a role permission after delete';
  END IF;

  -- task6 platform permission revoke replay rejection
  BEGIN
    PERFORM public.command_supplier_product_v2(
      'create', 'platform', NULL, NULL,
      'a6000000-0000-4000-8000-000000000031',
      'a6000000-0000-4000-8000-000000000062', NULL, v_revoke_payload,
      'a6000000-0000-4000-8000-000000000011',
      'a6000000-0000-4000-8000-000000000021',
      'task6-platform-revoke'
    );
    RAISE EXCEPTION 'task6 revoked permission replay was accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'PLATFORM_PERMISSION_REQUIRED' THEN RAISE; END IF;
  END;

  INSERT INTO public.role_permissions (
    id, role_id, permission_id, access_scope
  ) VALUES (
    'a6000000-0000-4000-8000-000000000025',
    v_role_id, v_permission_id, 'all'
  );

  v_result := public.command_supplier_product_v2(
    'create', 'platform', NULL, NULL,
    'a6000000-0000-4000-8000-000000000031',
    'a6000000-0000-4000-8000-000000000063', NULL, v_deny_payload,
    'a6000000-0000-4000-8000-000000000011',
    'a6000000-0000-4000-8000-000000000021',
    'task6-platform-deny'
  );
  v_result := public.command_supplier_product_v2(
    'create', 'platform', NULL, NULL,
    'a6000000-0000-4000-8000-000000000031',
    'a6000000-0000-4000-8000-000000000063', NULL, v_deny_payload,
    'a6000000-0000-4000-8000-000000000011',
    'a6000000-0000-4000-8000-000000000021',
    'task6-platform-deny'
  );
  IF v_result ->> 'idempotent' <> 'true' THEN
    RAISE EXCEPTION 'task6 platform deny baseline replay failed: %', v_result;
  END IF;

  INSERT INTO public.employee_permission_overrides (
    id, employee_id, permission_id, effect, access_scope, reason
  ) VALUES (
    'a6000000-0000-4000-8000-000000000026',
    'a6000000-0000-4000-8000-000000000021',
    v_permission_id, 'deny', 'all', 'Task 6 replay deny smoke'
  );

  -- task6 platform deny override replay rejection
  BEGIN
    PERFORM public.command_supplier_product_v2(
      'create', 'platform', NULL, NULL,
      'a6000000-0000-4000-8000-000000000031',
      'a6000000-0000-4000-8000-000000000063', NULL, v_deny_payload,
      'a6000000-0000-4000-8000-000000000011',
      'a6000000-0000-4000-8000-000000000021',
      'task6-platform-deny'
    );
    RAISE EXCEPTION 'task6 deny override replay was accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'PLATFORM_PERMISSION_REQUIRED' THEN RAISE; END IF;
  END;

  DELETE FROM public.employee_permission_overrides
  WHERE id = 'a6000000-0000-4000-8000-000000000026';
END
$task6_platform_replay_revalidation$;

DO $task6_sku_and_category_guard$
DECLARE
  v_result jsonb;
  v_sku_snapshot jsonb;
  v_conversion_count bigint;
BEGIN
  v_result := public.command_supplier_sku_v2(
    'create', 'tenant',
    'a6000000-0000-4000-8000-000000000001',
    'a6000000-0000-4000-8000-000000000041',
    'a6000000-0000-4000-8000-000000000031',
    'a6000000-0000-4000-8000-000000000064',
    'a6000000-0000-4000-8000-000000000071', NULL,
    jsonb_build_object(
      'sku_code', 'TASK6-SKU-NEEDLE',
      'name', 'Task 6 SKU keyword needle',
      'purchase_unit_id', 'a6000000-0000-4000-8000-000000000054',
      'spec_values', '{}'::jsonb,
      'batch_managed', true,
      'color_managed', true,
      'serial_managed', true
    ),
    'a6000000-0000-4000-8000-000000000012',
    'a6000000-0000-4000-8000-000000000022',
    'task6-sku-create'
  );
  IF v_result ->> 'status' <> 'created' THEN
    RAISE EXCEPTION 'task6 SKU create failed: %', v_result;
  END IF;

  v_result := public.replace_supplier_sku_unit_conversions_v3(
    'tenant',
    'a6000000-0000-4000-8000-000000000001',
    'a6000000-0000-4000-8000-000000000041',
    'a6000000-0000-4000-8000-000000000031',
    'a6000000-0000-4000-8000-000000000064',
    'a6000000-0000-4000-8000-000000000071', 1,
    'a6000000-0000-4000-8000-000000000055',
    'a6000000-0000-4000-8000-000000000054',
    jsonb_build_array(
      jsonb_build_object(
        'from_unit_id', 'a6000000-0000-4000-8000-000000000055',
        'to_unit_id', 'a6000000-0000-4000-8000-000000000054',
        'factor', '12'
      ),
      jsonb_build_object(
        'from_unit_id', 'a6000000-0000-4000-8000-000000000054',
        'to_unit_id', 'a6000000-0000-4000-8000-000000000056',
        'factor', '0.18'
      )
    ),
    'a6000000-0000-4000-8000-000000000012',
    'a6000000-0000-4000-8000-000000000022',
    'task6-sku-conversion-v3'
  );
  IF v_result ->> 'status' <> 'updated'
    OR v_result ->> 'version' <> '2'
    OR v_result ->> 'base_unit_conversion' <> '12.00000000'
  THEN
    RAISE EXCEPTION 'task6 SKU conversion v3 failed: %', v_result;
  END IF;

  SELECT to_jsonb(sku) INTO v_sku_snapshot
  FROM public.supplier_skus AS sku
  WHERE sku.id = 'a6000000-0000-4000-8000-000000000071';

  SELECT count(*) INTO v_conversion_count
  FROM public.supplier_sku_unit_conversions AS conversion
  WHERE conversion.supplier_sku_id =
    'a6000000-0000-4000-8000-000000000071';

  IF NOT EXISTS (
    SELECT 1
    FROM public.supplier_skus AS sku
    WHERE sku.id = 'a6000000-0000-4000-8000-000000000071'
      AND sku.purchase_unit_id =
        'a6000000-0000-4000-8000-000000000055'
      AND sku.base_unit_id = 'a6000000-0000-4000-8000-000000000054'
      AND sku.base_unit_conversion = 12
      AND sku.version = 2
  ) OR v_conversion_count <> 2
  THEN
    RAISE EXCEPTION
      'task6 SKU conversion v3 did not persist atomically: sku=%, edges=%',
      v_sku_snapshot, v_conversion_count;
  END IF;

  -- The API repository emits this bounded sku_code ILIKE/name query.
  PERFORM 1
  FROM public.supplier_skus AS sku
  WHERE sku.supplier_id = 'a6000000-0000-4000-8000-000000000031'
    AND sku.supplier_product_id =
      'a6000000-0000-4000-8000-000000000064'
    AND sku.ownership_scope = 'tenant'
    AND sku.owner_tenant_id =
      'a6000000-0000-4000-8000-000000000001'
    AND (
      sku.sku_code ILIKE '%SKU-NEEDLE%'
      OR sku.name ILIKE '%SKU-NEEDLE%'
    )
  LIMIT 20;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'task6 sku_code ILIKE keyword query failed';
  END IF;

  BEGIN
    PERFORM public.command_supplier_product_v2(
      'update', 'tenant',
      'a6000000-0000-4000-8000-000000000001',
      'a6000000-0000-4000-8000-000000000041',
      'a6000000-0000-4000-8000-000000000031',
      'a6000000-0000-4000-8000-000000000064', 1,
      jsonb_build_object(
        'category_id', 'a6000000-0000-4000-8000-000000000052'
      ),
      'a6000000-0000-4000-8000-000000000012',
      'a6000000-0000-4000-8000-000000000022',
      'task6-product-category-change'
    );
    RAISE EXCEPTION 'task6 product category change with SKU was accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'PRODUCT_CATEGORY_CHANGE_REQUIRES_SKU_MIGRATION' THEN
      RAISE;
    END IF;
  END;
END
$task6_sku_and_category_guard$;

DO $task6_conversion_negative_graphs$
DECLARE
  v_case jsonb;
  v_cases jsonb := jsonb_build_array(
    jsonb_build_object(
      'marker', 'task6 conversion branch',
      'base_unit_id', 'a6000000-0000-4000-8000-000000000054',
      'edges', jsonb_build_array(
        jsonb_build_object(
          'from_unit_id', 'a6000000-0000-4000-8000-000000000055',
          'to_unit_id', 'a6000000-0000-4000-8000-000000000054',
          'factor', '12'
        ),
        jsonb_build_object(
          'from_unit_id', 'a6000000-0000-4000-8000-000000000055',
          'to_unit_id', 'a6000000-0000-4000-8000-000000000056',
          'factor', '1'
        )
      )
    ),
    jsonb_build_object(
      'marker', 'task6 conversion merge',
      'base_unit_id', 'a6000000-0000-4000-8000-000000000054',
      'edges', jsonb_build_array(
        jsonb_build_object(
          'from_unit_id', 'a6000000-0000-4000-8000-000000000055',
          'to_unit_id', 'a6000000-0000-4000-8000-000000000054',
          'factor', '12'
        ),
        jsonb_build_object(
          'from_unit_id', 'a6000000-0000-4000-8000-000000000056',
          'to_unit_id', 'a6000000-0000-4000-8000-000000000054',
          'factor', '1'
        )
      )
    ),
    jsonb_build_object(
      'marker', 'task6 conversion cycle',
      'base_unit_id', 'a6000000-0000-4000-8000-000000000054',
      'edges', jsonb_build_array(
        jsonb_build_object(
          'from_unit_id', 'a6000000-0000-4000-8000-000000000055',
          'to_unit_id', 'a6000000-0000-4000-8000-000000000054',
          'factor', '12'
        ),
        jsonb_build_object(
          'from_unit_id', 'a6000000-0000-4000-8000-000000000054',
          'to_unit_id', 'a6000000-0000-4000-8000-000000000055',
          'factor', '0.083333'
        )
      )
    ),
    jsonb_build_object(
      'marker', 'task6 conversion disconnected',
      'base_unit_id', 'a6000000-0000-4000-8000-000000000054',
      'edges', jsonb_build_array(
        jsonb_build_object(
          'from_unit_id', 'a6000000-0000-4000-8000-000000000055',
          'to_unit_id', 'a6000000-0000-4000-8000-000000000054',
          'factor', '12'
        ),
        jsonb_build_object(
          'from_unit_id', 'a6000000-0000-4000-8000-000000000056',
          'to_unit_id', 'a6000000-0000-4000-8000-000000000057',
          'factor', '1'
        )
      )
    ),
    jsonb_build_object(
      'marker', 'task6 conversion inactive unit',
      'base_unit_id', 'a6000000-0000-4000-8000-000000000058',
      'edges', jsonb_build_array(
        jsonb_build_object(
          'from_unit_id', 'a6000000-0000-4000-8000-000000000055',
          'to_unit_id', 'a6000000-0000-4000-8000-000000000058',
          'factor', '1'
        )
      )
    )
  );
BEGIN
  FOR v_case IN
    SELECT test_case.value
    FROM jsonb_array_elements(v_cases) AS test_case(value)
  LOOP
    BEGIN
      PERFORM public.validate_supplier_sku_unit_conversion_graph_v2(
        'a6000000-0000-4000-8000-000000000055',
        (v_case ->> 'base_unit_id')::uuid,
        v_case -> 'edges'
      );
      RAISE EXCEPTION '% was accepted', v_case ->> 'marker';
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM <> 'UNIT_CONVERSION_INVALID' THEN RAISE; END IF;
    END;
  END LOOP;
END
$task6_conversion_negative_graphs$;

DO $task6_conversion_replay_guards$
DECLARE
  v_edges jsonb := jsonb_build_array(
    jsonb_build_object(
      'from_unit_id', 'a6000000-0000-4000-8000-000000000055',
      'to_unit_id', 'a6000000-0000-4000-8000-000000000054',
      'factor', '12'
    ),
    jsonb_build_object(
      'from_unit_id', 'a6000000-0000-4000-8000-000000000054',
      'to_unit_id', 'a6000000-0000-4000-8000-000000000056',
      'factor', '0.18'
    )
  );
  v_result jsonb;
BEGIN
  v_result := public.replace_supplier_sku_unit_conversions_v3(
    'tenant',
    'a6000000-0000-4000-8000-000000000001',
    'a6000000-0000-4000-8000-000000000041',
    'a6000000-0000-4000-8000-000000000031',
    'a6000000-0000-4000-8000-000000000064',
    'a6000000-0000-4000-8000-000000000071', 1,
    'a6000000-0000-4000-8000-000000000055',
    'a6000000-0000-4000-8000-000000000054',
    v_edges,
    'a6000000-0000-4000-8000-000000000012',
    'a6000000-0000-4000-8000-000000000022',
    'task6-sku-conversion-v3'
  );
  IF v_result ->> 'idempotent' <> 'true' THEN
    RAISE EXCEPTION 'task6 conversion replay failed: %', v_result;
  END IF;

  -- task6 conversion version conflict
  v_result := public.replace_supplier_sku_unit_conversions_v3(
    'tenant',
    'a6000000-0000-4000-8000-000000000001',
    'a6000000-0000-4000-8000-000000000041',
    'a6000000-0000-4000-8000-000000000031',
    'a6000000-0000-4000-8000-000000000064',
    'a6000000-0000-4000-8000-000000000071', 1,
    'a6000000-0000-4000-8000-000000000055',
    'a6000000-0000-4000-8000-000000000054',
    v_edges,
    'a6000000-0000-4000-8000-000000000012',
    'a6000000-0000-4000-8000-000000000022',
    'task6-conversion-version-conflict'
  );
  IF v_result ->> 'error_code' <> 'SUPPLIER_SKU_VERSION_CONFLICT'
    OR v_result ->> 'version' <> '2'
  THEN
    RAISE EXCEPTION 'task6 conversion version conflict failed: %', v_result;
  END IF;

  -- task6 conversion idempotency conflict
  BEGIN
    PERFORM public.replace_supplier_sku_unit_conversions_v3(
      'tenant',
      'a6000000-0000-4000-8000-000000000001',
      'a6000000-0000-4000-8000-000000000041',
      'a6000000-0000-4000-8000-000000000031',
      'a6000000-0000-4000-8000-000000000064',
      'a6000000-0000-4000-8000-000000000071', 2,
      'a6000000-0000-4000-8000-000000000055',
      'a6000000-0000-4000-8000-000000000054',
      jsonb_set(v_edges, '{0,factor}', '"13"'::jsonb),
      'a6000000-0000-4000-8000-000000000012',
      'a6000000-0000-4000-8000-000000000022',
      'task6-sku-conversion-v3'
    );
    RAISE EXCEPTION 'task6 conversion idempotency conflict was accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF;
  END;
END
$task6_conversion_replay_guards$;

ROLLBACK;
