\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_signature text;
  v_function_oid regprocedure;
  v_is_security_definer boolean;
  v_function_config text[];
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.mutate_supplier_product_pre_v2_unsafe(uuid,uuid,uuid,text,integer,uuid,uuid,text,text)',
    'public.mutate_supplier_sku_for_product_pre_v2_unsafe(uuid,uuid,uuid,uuid,text,integer,uuid,uuid,text,text)',
    'public.publish_supplier_price_list_pre_v2_unsafe(uuid,uuid,uuid,integer,uuid,uuid,text,text)',
    'public.create_supplier_price_list_version_pre_v2_unsafe(uuid,uuid,uuid,uuid,integer,uuid,uuid,text,text)',
    'public.retire_supplier_price_list_pre_v2_unsafe(uuid,uuid,uuid,integer,uuid,uuid,text,text)',
    'public.upsert_supplier_price_list_item_pre_v2_unsafe(uuid,uuid,uuid,uuid,uuid,numeric,numeric,boolean,integer,uuid,uuid,text,text)',
    'public.delete_supplier_price_list_item_pre_v2_unsafe(uuid,uuid,uuid,uuid,integer,uuid,uuid,text,text)',
    'public.mutate_supplier_sku(uuid,uuid,uuid,text,integer,uuid,uuid,text,text)'
  ]
  LOOP
    v_function_oid := to_regprocedure(v_signature);
    IF v_function_oid IS NULL THEN
      RAISE EXCEPTION 'unsafe function missing: %', v_signature;
    END IF;
    IF has_function_privilege('service_role', v_function_oid, 'EXECUTE')
      OR has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
      OR has_function_privilege('anon', v_function_oid, 'EXECUTE')
      OR EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS procedure
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(
            procedure.proacl,
            pg_catalog.acldefault('f', procedure.proowner)
          )
        ) AS privilege
        WHERE procedure.oid = v_function_oid
          AND privilege.grantee = 0
          AND privilege.privilege_type = 'EXECUTE'
      )
    THEN
      RAISE EXCEPTION 'unsafe function has executable ACL: %', v_signature;
    END IF;
  END LOOP;

  FOREACH v_signature IN ARRAY ARRAY[
    'public.mutate_supplier_product(uuid,uuid,uuid,text,integer,uuid,uuid,text,text)',
    'public.mutate_supplier_sku_for_product(uuid,uuid,uuid,uuid,text,integer,uuid,uuid,text,text)',
    'public.publish_supplier_price_list(uuid,uuid,uuid,integer,uuid,uuid,text,text)',
    'public.create_supplier_price_list_version(uuid,uuid,uuid,uuid,integer,uuid,uuid,text,text)',
    'public.retire_supplier_price_list(uuid,uuid,uuid,integer,uuid,uuid,text,text)',
    'public.upsert_supplier_price_list_item(uuid,uuid,uuid,uuid,uuid,numeric,numeric,boolean,integer,uuid,uuid,text,text)',
    'public.delete_supplier_price_list_item(uuid,uuid,uuid,uuid,integer,uuid,uuid,text,text)'
  ]
  LOOP
    v_function_oid := to_regprocedure(v_signature);
    IF v_function_oid IS NULL THEN
      RAISE EXCEPTION 'safe wrapper missing: %', v_signature;
    END IF;

    SELECT procedure.prosecdef, procedure.proconfig
    INTO v_is_security_definer, v_function_config
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid = v_function_oid;

    IF v_is_security_definer IS DISTINCT FROM true
      OR NOT COALESCE(
        v_function_config @> ARRAY['search_path=pg_catalog, public'],
        false
      )
      OR NOT has_function_privilege(
        'service_role',
        v_function_oid,
        'EXECUTE'
      )
      OR has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
      OR has_function_privilege('anon', v_function_oid, 'EXECUTE')
      OR EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS procedure
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(
            procedure.proacl,
            pg_catalog.acldefault('f', procedure.proowner)
          )
        ) AS privilege
        WHERE procedure.oid = v_function_oid
          AND privilege.grantee = 0
          AND privilege.privilege_type = 'EXECUTE'
      )
    THEN
      RAISE EXCEPTION 'safe wrapper security contract failed: %', v_signature;
    END IF;
  END LOOP;
END;
$$;

INSERT INTO public.tenants (id, name, slug, status)
VALUES
  ('91000000-0000-4000-8000-000000000001', '兼容测试租户 A', 'catalog-compat-a', 'active'),
  ('91000000-0000-4000-8000-000000000002', '兼容测试租户 B', 'catalog-compat-b', 'active');

INSERT INTO auth.users (id)
VALUES
  ('91000000-0000-4000-8000-000000000061'),
  ('91000000-0000-4000-8000-000000000062');

INSERT INTO public.employees (id, name, phone, status, tenant_id, user_id)
VALUES
  (
    '91000000-0000-4000-8000-000000000011',
    '兼容测试员工 A',
    '19100000001',
    'active',
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000061'
  ),
  (
    '91000000-0000-4000-8000-000000000012',
    '兼容测试员工 B',
    '19100000002',
    'active',
    '91000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000062'
  );

INSERT INTO public.suppliers (
  id,
  code,
  name,
  legal_name,
  supplier_type,
  onboarding_status,
  operational_status,
  created_by_employee_id,
  updated_by_employee_id,
  ownership_scope,
  owner_tenant_id
)
VALUES (
  '91000000-0000-4000-8000-000000000021',
  'COMPAT-SUPPLIER',
  '兼容测试平台供应商',
  '兼容测试平台供应商有限公司',
  'distributor',
  'approved',
  'active',
  '91000000-0000-4000-8000-000000000011',
  '91000000-0000-4000-8000-000000000011',
  'platform',
  NULL
);

INSERT INTO public.tenant_supplier_settings (
  tenant_id,
  module_enabled,
  enabled_by_employee_id,
  enabled_at
)
VALUES
  (
    '91000000-0000-4000-8000-000000000001',
    true,
    '91000000-0000-4000-8000-000000000011',
    now()
  ),
  (
    '91000000-0000-4000-8000-000000000002',
    true,
    '91000000-0000-4000-8000-000000000012',
    now()
  );

INSERT INTO public.tenant_suppliers (
  id,
  tenant_id,
  supplier_id,
  relationship_status,
  internal_supplier_code,
  created_by_employee_id,
  updated_by_employee_id
)
VALUES
  (
    '91000000-0000-4000-8000-000000000031',
    '91000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000021',
    'active',
    'COMPAT-A',
    '91000000-0000-4000-8000-000000000011',
    '91000000-0000-4000-8000-000000000011'
  ),
  (
    '91000000-0000-4000-8000-000000000032',
    '91000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000021',
    'active',
    'COMPAT-B',
    '91000000-0000-4000-8000-000000000012',
    '91000000-0000-4000-8000-000000000012'
  );

INSERT INTO public.catalog_categories (
  id,
  code,
  name,
  level,
  status,
  is_leaf,
  ownership_scope,
  owner_tenant_id,
  created_by_employee_id,
  updated_by_employee_id
)
VALUES (
  '91000000-0000-4000-8000-000000000041',
  'COMPAT-CATEGORY',
  '兼容测试分类',
  1,
  'active',
  true,
  'platform',
  NULL,
  '91000000-0000-4000-8000-000000000011',
  '91000000-0000-4000-8000-000000000011'
);

INSERT INTO public.catalog_brands (
  id,
  code,
  name,
  status,
  ownership_scope,
  owner_tenant_id,
  created_by_employee_id,
  updated_by_employee_id
)
VALUES (
  '91000000-0000-4000-8000-000000000042',
  'COMPAT-BRAND',
  '兼容测试品牌',
  'active',
  'platform',
  NULL,
  '91000000-0000-4000-8000-000000000011',
  '91000000-0000-4000-8000-000000000011'
);

INSERT INTO public.catalog_units (
  id,
  code,
  name,
  symbol,
  status,
  created_by_employee_id,
  updated_by_employee_id
)
VALUES (
  '91000000-0000-4000-8000-000000000043',
  'COMPAT-UNIT',
  '兼容测试单位',
  '件',
  'active',
  '91000000-0000-4000-8000-000000000011',
  '91000000-0000-4000-8000-000000000011'
);

SET LOCAL session_replication_role = replica;

INSERT INTO public.supplier_products (
  id,
  supplier_id,
  product_code,
  name,
  category_id,
  brand_id,
  acting_tenant_id,
  acting_employee_id,
  operation_source,
  proxy_reason,
  created_by_employee_id,
  updated_by_employee_id,
  ownership_scope,
  owner_tenant_id
)
VALUES (
  '91000000-0000-4000-8000-000000000071',
  '91000000-0000-4000-8000-000000000021',
  'COMPAT-PLATFORM-PRODUCT',
  '兼容测试平台商品',
  '91000000-0000-4000-8000-000000000041',
  '91000000-0000-4000-8000-000000000042',
  '91000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000011',
  'tenant_proxy',
  '兼容性回滚测试',
  '91000000-0000-4000-8000-000000000011',
  '91000000-0000-4000-8000-000000000011',
  'platform',
  NULL
);

INSERT INTO public.supplier_products (
  id,
  supplier_id,
  product_code,
  name,
  category_id,
  brand_id,
  acting_tenant_id,
  acting_employee_id,
  operation_source,
  proxy_reason,
  created_by_employee_id,
  updated_by_employee_id,
  ownership_scope,
  owner_tenant_id
)
VALUES (
  '91000000-0000-4000-8000-000000000072',
  '91000000-0000-4000-8000-000000000021',
  'COMPAT-LEGACY-PRODUCT',
  '兼容测试历史商品',
  '91000000-0000-4000-8000-000000000041',
  '91000000-0000-4000-8000-000000000042',
  '91000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000011',
  'tenant_proxy',
  '兼容性回滚测试',
  '91000000-0000-4000-8000-000000000011',
  '91000000-0000-4000-8000-000000000011',
  NULL,
  NULL
);

INSERT INTO public.supplier_skus (
  id,
  supplier_id,
  supplier_product_id,
  sku_code,
  name,
  purchase_unit_id,
  base_unit_id,
  base_unit_conversion,
  acting_tenant_id,
  acting_employee_id,
  operation_source,
  proxy_reason,
  created_by_employee_id,
  updated_by_employee_id,
  ownership_scope,
  owner_tenant_id
)
VALUES (
  '91000000-0000-4000-8000-000000000073',
  '91000000-0000-4000-8000-000000000021',
  '91000000-0000-4000-8000-000000000072',
  'COMPAT-LEGACY-SKU',
  '兼容测试历史 SKU',
  '91000000-0000-4000-8000-000000000043',
  '91000000-0000-4000-8000-000000000043',
  1,
  '91000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000011',
  'tenant_proxy',
  '兼容性回滚测试',
  '91000000-0000-4000-8000-000000000011',
  '91000000-0000-4000-8000-000000000011',
  NULL,
  NULL
);

SET LOCAL session_replication_role = origin;

SET LOCAL ROLE service_role;

SELECT public.create_supplier_product(
  p_product_id => '91000000-0000-4000-8000-000000000051',
  p_tenant_id => '91000000-0000-4000-8000-000000000001',
  p_supplier_id => '91000000-0000-4000-8000-000000000021',
  p_product_code => 'COMPAT-PRODUCT',
  p_name => '兼容测试商品',
  p_category_id => '91000000-0000-4000-8000-000000000041',
  p_brand_id => '91000000-0000-4000-8000-000000000042',
  p_description => NULL,
  p_actor_user_id => '91000000-0000-4000-8000-000000000061',
  p_actor_employee_id => '91000000-0000-4000-8000-000000000011',
  p_idempotency_key => 'compat:create-product',
  p_proxy_reason => '兼容性回滚测试'
);

SELECT public.create_supplier_sku(
  p_sku_id => '91000000-0000-4000-8000-000000000052',
  p_tenant_id => '91000000-0000-4000-8000-000000000001',
  p_supplier_id => '91000000-0000-4000-8000-000000000021',
  p_product_id => '91000000-0000-4000-8000-000000000051',
  p_sku_code => 'COMPAT-SKU',
  p_name => '兼容测试 SKU',
  p_specification => NULL,
  p_model => NULL,
  p_purchase_unit_id => '91000000-0000-4000-8000-000000000043',
  p_batch_managed => false,
  p_color_managed => false,
  p_serial_managed => false,
  p_actor_user_id => '91000000-0000-4000-8000-000000000061',
  p_actor_employee_id => '91000000-0000-4000-8000-000000000011',
  p_idempotency_key => 'compat:create-sku',
  p_proxy_reason => '兼容性回滚测试'
);

SELECT public.create_supplier_price_list(
  p_price_list_id => '91000000-0000-4000-8000-000000000053',
  p_tenant_id => '91000000-0000-4000-8000-000000000001',
  p_supplier_id => '91000000-0000-4000-8000-000000000021',
  p_price_list_code => 'COMPAT-PRICE',
  p_name => '兼容测试价格簿',
  p_currency => 'CNY',
  p_effective_from => '2026-08-18T00:00:00Z',
  p_effective_until => NULL,
  p_actor_user_id => '91000000-0000-4000-8000-000000000061',
  p_actor_employee_id => '91000000-0000-4000-8000-000000000011',
  p_idempotency_key => 'compat:create-price-list',
  p_proxy_reason => '兼容性回滚测试'
);

SELECT public.upsert_supplier_price_list_item(
  p_item_id => '91000000-0000-4000-8000-000000000054',
  p_tenant_id => '91000000-0000-4000-8000-000000000001',
  p_supplier_id => '91000000-0000-4000-8000-000000000021',
  p_price_list_id => '91000000-0000-4000-8000-000000000053',
  p_sku_id => '91000000-0000-4000-8000-000000000052',
  p_unit_price => 12.34,
  p_tax_rate => 0.13,
  p_tax_inclusive => true,
  p_expected_version => 1,
  p_actor_user_id => '91000000-0000-4000-8000-000000000061',
  p_actor_employee_id => '91000000-0000-4000-8000-000000000011',
  p_idempotency_key => 'compat:upsert-price-item',
  p_proxy_reason => '兼容性回滚测试'
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.supplier_products
    WHERE id = '91000000-0000-4000-8000-000000000051'
      AND ownership_scope = 'tenant'
      AND owner_tenant_id = '91000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'product tenant ownership assertion failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.supplier_skus
    WHERE id = '91000000-0000-4000-8000-000000000052'
      AND ownership_scope = 'tenant'
      AND owner_tenant_id = '91000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'sku tenant ownership assertion failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.supplier_price_lists
    WHERE id = '91000000-0000-4000-8000-000000000053'
      AND tenant_id = '91000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'price list tenant assertion failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.supplier_price_list_items
    WHERE id = '91000000-0000-4000-8000-000000000054'
      AND tenant_id = '91000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'price item tenant assertion failed';
  END IF;
END;
$$;

DO $$
DECLARE
  v_product_mutation_result jsonb;
  v_sku_mutation_result jsonb;
  v_price_publish_result jsonb;
  v_price_version_result jsonb;
  v_price_retire_result jsonb;
  v_price_upsert_result jsonb;
  v_price_delete_result jsonb;
  v_replay_result jsonb;
BEGIN
  v_product_mutation_result := public.mutate_supplier_product(
    p_tenant_id => '91000000-0000-4000-8000-000000000002',
    p_supplier_id => '91000000-0000-4000-8000-000000000021',
    p_product_id => '91000000-0000-4000-8000-000000000051',
    p_action => 'activate',
    p_expected_version => 999,
    p_actor_user_id => '91000000-0000-4000-8000-000000000062',
    p_actor_employee_id => '91000000-0000-4000-8000-000000000012',
    p_idempotency_key => 'compat:cross-tenant-product-mutation',
    p_proxy_reason => '兼容性越权测试'
  );

  IF v_product_mutation_result IS NULL
    OR v_product_mutation_result ->> 'error_code'
      IS DISTINCT FROM 'SUPPLIER_PRODUCT_NOT_FOUND'
    OR v_product_mutation_result ? 'version'
    OR v_product_mutation_result ? 'current_status'
  THEN
    RAISE EXCEPTION 'cross-tenant product mutation exposed row state';
  END IF;

  v_sku_mutation_result := public.mutate_supplier_sku_for_product(
    p_tenant_id => '91000000-0000-4000-8000-000000000002',
    p_supplier_id => '91000000-0000-4000-8000-000000000021',
    p_product_id => '91000000-0000-4000-8000-000000000051',
    p_sku_id => '91000000-0000-4000-8000-000000000052',
    p_action => 'activate',
    p_expected_version => 999,
    p_actor_user_id => '91000000-0000-4000-8000-000000000062',
    p_actor_employee_id => '91000000-0000-4000-8000-000000000012',
    p_idempotency_key => 'compat:cross-tenant-sku-mutation',
    p_proxy_reason => '兼容性越权测试'
  );

  IF v_sku_mutation_result IS NULL
    OR v_sku_mutation_result ->> 'error_code'
      IS DISTINCT FROM 'SUPPLIER_SKU_NOT_FOUND'
    OR v_sku_mutation_result ? 'version'
    OR v_sku_mutation_result ? 'current_status'
  THEN
    RAISE EXCEPTION 'cross-tenant SKU mutation exposed row state';
  END IF;

  v_price_publish_result := public.publish_supplier_price_list(
    p_price_list_id => '91000000-0000-4000-8000-000000000053',
    p_tenant_id => '91000000-0000-4000-8000-000000000002',
    p_supplier_id => '91000000-0000-4000-8000-000000000021',
    p_expected_version => 999,
    p_actor_user_id => '91000000-0000-4000-8000-000000000062',
    p_actor_employee_id => '91000000-0000-4000-8000-000000000012',
    p_idempotency_key => 'compat:cross-tenant-price-publish',
    p_proxy_reason => '兼容性越权测试'
  );

  IF v_price_publish_result IS NULL
    OR v_price_publish_result ->> 'error_code'
      IS DISTINCT FROM 'SUPPLIER_PRICE_LIST_NOT_FOUND'
    OR v_price_publish_result ? 'version'
    OR v_price_publish_result ? 'current_status'
  THEN
    RAISE EXCEPTION 'cross-tenant price publish exposed row state';
  END IF;

  v_price_version_result := public.create_supplier_price_list_version(
    p_new_price_list_id => '91000000-0000-4000-8000-000000000055',
    p_tenant_id => '91000000-0000-4000-8000-000000000002',
    p_supplier_id => '91000000-0000-4000-8000-000000000021',
    p_source_price_list_id => '91000000-0000-4000-8000-000000000053',
    p_expected_version => 999,
    p_actor_user_id => '91000000-0000-4000-8000-000000000062',
    p_actor_employee_id => '91000000-0000-4000-8000-000000000012',
    p_idempotency_key => 'compat:cross-tenant-price-version',
    p_proxy_reason => '兼容性越权测试'
  );

  IF v_price_version_result IS NULL
    OR v_price_version_result ->> 'error_code'
      IS DISTINCT FROM 'SUPPLIER_PRICE_LIST_NOT_FOUND'
    OR v_price_version_result ? 'version'
    OR v_price_version_result ? 'current_status'
  THEN
    RAISE EXCEPTION 'cross-tenant price version exposed row state';
  END IF;

  v_price_retire_result := public.retire_supplier_price_list(
    p_price_list_id => '91000000-0000-4000-8000-000000000053',
    p_tenant_id => '91000000-0000-4000-8000-000000000002',
    p_supplier_id => '91000000-0000-4000-8000-000000000021',
    p_expected_version => 999,
    p_actor_user_id => '91000000-0000-4000-8000-000000000062',
    p_actor_employee_id => '91000000-0000-4000-8000-000000000012',
    p_idempotency_key => 'compat:cross-tenant-price-retire',
    p_proxy_reason => '兼容性越权测试'
  );

  IF v_price_retire_result IS NULL
    OR v_price_retire_result ->> 'error_code'
      IS DISTINCT FROM 'SUPPLIER_PRICE_LIST_NOT_FOUND'
    OR v_price_retire_result ? 'version'
    OR v_price_retire_result ? 'current_status'
  THEN
    RAISE EXCEPTION 'cross-tenant price retire exposed row state';
  END IF;

  v_price_upsert_result := public.upsert_supplier_price_list_item(
    p_item_id => '91000000-0000-4000-8000-000000000054',
    p_price_list_id => '91000000-0000-4000-8000-000000000053',
    p_tenant_id => '91000000-0000-4000-8000-000000000002',
    p_supplier_id => '91000000-0000-4000-8000-000000000021',
    p_sku_id => '91000000-0000-4000-8000-000000000052',
    p_unit_price => 99.99,
    p_tax_rate => 0.13,
    p_tax_inclusive => true,
    p_expected_version => 999,
    p_actor_user_id => '91000000-0000-4000-8000-000000000062',
    p_actor_employee_id => '91000000-0000-4000-8000-000000000012',
    p_idempotency_key => 'compat:cross-tenant-price-upsert',
    p_proxy_reason => '兼容性越权测试'
  );

  IF v_price_upsert_result IS NULL
    OR v_price_upsert_result ->> 'error_code'
      IS DISTINCT FROM 'SUPPLIER_PRICE_LIST_NOT_FOUND'
    OR v_price_upsert_result ? 'version'
    OR v_price_upsert_result ? 'current_status'
  THEN
    RAISE EXCEPTION 'cross-tenant price upsert exposed row state';
  END IF;

  v_price_delete_result := public.delete_supplier_price_list_item(
    p_item_id => '91000000-0000-4000-8000-000000000054',
    p_price_list_id => '91000000-0000-4000-8000-000000000053',
    p_tenant_id => '91000000-0000-4000-8000-000000000002',
    p_supplier_id => '91000000-0000-4000-8000-000000000021',
    p_expected_version => 999,
    p_actor_user_id => '91000000-0000-4000-8000-000000000062',
    p_actor_employee_id => '91000000-0000-4000-8000-000000000012',
    p_idempotency_key => 'compat:cross-tenant-price-delete',
    p_proxy_reason => '兼容性越权测试'
  );

  IF v_price_delete_result IS NULL
    OR v_price_delete_result ->> 'error_code'
      IS DISTINCT FROM 'SUPPLIER_PRICE_LIST_NOT_FOUND'
    OR v_price_delete_result ? 'version'
    OR v_price_delete_result ? 'current_status'
  THEN
    RAISE EXCEPTION 'cross-tenant price delete exposed row state';
  END IF;

  v_replay_result := public.upsert_supplier_price_list_item(
    p_item_id => '91000000-0000-4000-8000-000000000054',
    p_price_list_id => '91000000-0000-4000-8000-000000000053',
    p_tenant_id => '91000000-0000-4000-8000-000000000001',
    p_supplier_id => '91000000-0000-4000-8000-000000000021',
    p_sku_id => '91000000-0000-4000-8000-000000000052',
    p_unit_price => 12.34,
    p_tax_rate => 0.13,
    p_tax_inclusive => true,
    p_expected_version => 1,
    p_actor_user_id => '91000000-0000-4000-8000-000000000061',
    p_actor_employee_id => '91000000-0000-4000-8000-000000000011',
    p_idempotency_key => 'compat:upsert-price-item',
    p_proxy_reason => '兼容性回滚测试'
  );

  IF v_replay_result IS NULL
    OR (v_replay_result ->> 'idempotent')::boolean IS DISTINCT FROM true
    OR (v_replay_result ->> 'version')::integer IS DISTINCT FROM 2
  THEN
    RAISE EXCEPTION 'same-tenant idempotent replay assertion failed';
  END IF;

  BEGIN
    UPDATE public.supplier_products
    SET
      name = '租户 B 越权修改',
      acting_tenant_id = '91000000-0000-4000-8000-000000000002',
      acting_employee_id = '91000000-0000-4000-8000-000000000012',
      updated_by_employee_id = '91000000-0000-4000-8000-000000000012'
    WHERE id = '91000000-0000-4000-8000-000000000051';
    RAISE EXCEPTION 'cross-tenant product update was not rejected';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM <> 'PRODUCT_OWNERSHIP_CONFLICT' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    UPDATE public.supplier_products
    SET
      name = '空租户更新历史商品',
      acting_tenant_id = NULL,
      acting_employee_id = '91000000-0000-4000-8000-000000000011',
      updated_by_employee_id = '91000000-0000-4000-8000-000000000011'
    WHERE id = '91000000-0000-4000-8000-000000000072';
    RAISE EXCEPTION 'legacy product NULL-actor update was not rejected';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM <> 'PRODUCT_OWNERSHIP_CONFLICT' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    UPDATE public.supplier_skus
    SET
      name = '空租户更新历史 SKU',
      acting_tenant_id = NULL,
      acting_employee_id = '91000000-0000-4000-8000-000000000011',
      updated_by_employee_id = '91000000-0000-4000-8000-000000000011'
    WHERE id = '91000000-0000-4000-8000-000000000073';
    RAISE EXCEPTION 'legacy SKU NULL-actor update was not rejected';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM <> 'PRODUCT_OWNERSHIP_CONFLICT' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    UPDATE public.supplier_products
    SET
      name = '租户更新平台商品',
      acting_tenant_id = '91000000-0000-4000-8000-000000000001',
      acting_employee_id = '91000000-0000-4000-8000-000000000011',
      updated_by_employee_id = '91000000-0000-4000-8000-000000000011'
    WHERE id = '91000000-0000-4000-8000-000000000071';
    RAISE EXCEPTION 'platform product update was not rejected';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM <> 'PRODUCT_OWNERSHIP_CONFLICT' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    UPDATE public.supplier_products
    SET
      name = '租户更新历史商品',
      acting_tenant_id = '91000000-0000-4000-8000-000000000001',
      acting_employee_id = '91000000-0000-4000-8000-000000000011',
      updated_by_employee_id = '91000000-0000-4000-8000-000000000011'
    WHERE id = '91000000-0000-4000-8000-000000000072';
    RAISE EXCEPTION 'legacy product update was not rejected';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM <> 'PRODUCT_OWNERSHIP_CONFLICT' THEN
        RAISE;
      END IF;
  END;

  IF EXISTS (
    SELECT 1
    FROM public.supplier_price_lists
    WHERE id = '91000000-0000-4000-8000-000000000055'
  ) THEN
    RAISE EXCEPTION 'cross-tenant price version left a row';
  END IF;
END;
$$;

RESET ROLE;

\echo 'supplier catalog rollback compatibility smoke passed'

ROLLBACK;
