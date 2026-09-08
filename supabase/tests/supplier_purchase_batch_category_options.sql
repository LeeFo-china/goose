\set ON_ERROR_STOP on

-- Apply 20260908110000_resolve_supplier_purchase_batch_category_options.sql
-- before this test. Every fixture row and ANALYZE statistic is rolled back.
BEGIN;

SET LOCAL statement_timeout = '3min';
SET LOCAL lock_timeout = '5s';
SET LOCAL session_replication_role = replica;

CREATE FUNCTION pg_temp.category_option_fixture_uuid(p_key text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (
    substr(md5('supplier-purchase-batch-category-options:' || p_key), 1, 8)
    || '-' || substr(md5('supplier-purchase-batch-category-options:' || p_key), 9, 4)
    || '-' || substr(md5('supplier-purchase-batch-category-options:' || p_key), 13, 4)
    || '-' || substr(md5('supplier-purchase-batch-category-options:' || p_key), 17, 4)
    || '-' || substr(md5('supplier-purchase-batch-category-options:' || p_key), 21, 12)
  )::uuid;
$$;

DO $preflight$
DECLARE
  v_function regprocedure := to_regprocedure(
    'public.resolve_supplier_purchase_batch_category_options(uuid,timestamptz,text,integer,integer)'
  );
BEGIN
  IF v_function IS NULL THEN
    RAISE EXCEPTION 'category options RPC migration is not applied';
  END IF;
  IF NOT has_function_privilege('service_role', v_function, 'EXECUTE')
    OR has_function_privilege('anon', v_function, 'EXECUTE')
    OR has_function_privilege('authenticated', v_function, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'category options RPC ACL mismatch';
  END IF;
END;
$preflight$;

INSERT INTO public.tenants (id, name, slug, status)
SELECT pg_temp.category_option_fixture_uuid(key), name, slug, 'active'
FROM (VALUES
  ('tenant-a', 'Category option tenant A', 'category-option-fixture-a'),
  ('tenant-b', 'Category option tenant B', 'category-option-fixture-b'),
  ('tenant-c', 'Category option tenant C', 'category-option-fixture-c')
) AS fixture(key, name, slug);

INSERT INTO public.employees (id, name, phone, status, tenant_id)
VALUES
  (pg_temp.category_option_fixture_uuid('employee-platform'),
    'Category option platform actor', '19988000001', 'active', NULL),
  (pg_temp.category_option_fixture_uuid('employee-a'),
    'Category option tenant A actor', '19988000002', 'active',
    pg_temp.category_option_fixture_uuid('tenant-a')),
  (pg_temp.category_option_fixture_uuid('employee-b'),
    'Category option tenant B actor', '19988000003', 'active',
    pg_temp.category_option_fixture_uuid('tenant-b')),
  (pg_temp.category_option_fixture_uuid('employee-c'),
    'Category option tenant C actor', '19988000004', 'active',
    pg_temp.category_option_fixture_uuid('tenant-c'));

INSERT INTO public.supplier_qualification_types (
  id, code, name, applicable_supplier_types, is_required,
  blocks_new_orders, status
)
VALUES (
  pg_temp.category_option_fixture_uuid('qualification-type'),
  'CATOPT_REQUIRED_MANUFACTURER', 'Category option required manufacturer',
  ARRAY['manufacturer']::text[], true, true, 'active'
);

-- Isolate the fixture from seed-specific global qualification types. This
-- update and every trigger bypass below live only inside this transaction.
UPDATE public.supplier_qualification_types
SET status = 'inactive'
WHERE id <> pg_temp.category_option_fixture_uuid('qualification-type');

INSERT INTO public.suppliers (
  id, code, name, legal_name, supplier_type, onboarding_status,
  operational_status, ownership_scope, owner_tenant_id,
  created_by_employee_id, updated_by_employee_id
)
VALUES
  (pg_temp.category_option_fixture_uuid('supplier-platform'),
    'CATOPT-PLATFORM', 'Category option platform supplier',
    'Category option platform supplier ltd', 'distributor', 'approved',
    'active', 'platform', NULL,
    pg_temp.category_option_fixture_uuid('employee-platform'),
    pg_temp.category_option_fixture_uuid('employee-platform')),
  (pg_temp.category_option_fixture_uuid('supplier-qualification-blocked'),
    'CATOPT-QUAL-BLOCKED', 'Category option qualification blocked',
    'Category option qualification blocked ltd', 'manufacturer', 'approved',
    'active', 'platform', NULL,
    pg_temp.category_option_fixture_uuid('employee-platform'),
    pg_temp.category_option_fixture_uuid('employee-platform')),
  (pg_temp.category_option_fixture_uuid('supplier-private-a'),
    'CATOPT-PRIVATE-A', 'Category option private supplier A',
    'Category option private supplier A ltd', 'manufacturer', 'approved',
    'active', 'tenant', pg_temp.category_option_fixture_uuid('tenant-a'),
    pg_temp.category_option_fixture_uuid('employee-a'),
    pg_temp.category_option_fixture_uuid('employee-a')),
  (pg_temp.category_option_fixture_uuid('supplier-private-c'),
    'CATOPT-PRIVATE-C', 'Category option private supplier C',
    'Category option private supplier C ltd', 'distributor', 'approved',
    'active', 'tenant', pg_temp.category_option_fixture_uuid('tenant-c'),
    pg_temp.category_option_fixture_uuid('employee-c'),
    pg_temp.category_option_fixture_uuid('employee-c'));

INSERT INTO public.tenant_supplier_settings (
  tenant_id, module_enabled, require_active_contract_for_new_order,
  enabled_by_employee_id, enabled_at
)
VALUES
  (pg_temp.category_option_fixture_uuid('tenant-a'), true, false,
    pg_temp.category_option_fixture_uuid('employee-a'), now()),
  (pg_temp.category_option_fixture_uuid('tenant-b'), true, true,
    pg_temp.category_option_fixture_uuid('employee-b'), now()),
  (pg_temp.category_option_fixture_uuid('tenant-c'), true, false,
    pg_temp.category_option_fixture_uuid('employee-c'), now());

INSERT INTO public.tenant_suppliers (
  id, tenant_id, supplier_id, relationship_status, internal_supplier_code,
  created_by_employee_id, updated_by_employee_id
)
VALUES
  (pg_temp.category_option_fixture_uuid('relationship-a-platform'),
    pg_temp.category_option_fixture_uuid('tenant-a'),
    pg_temp.category_option_fixture_uuid('supplier-platform'), 'active',
    'CATOPT-A-PLATFORM', pg_temp.category_option_fixture_uuid('employee-a'),
    pg_temp.category_option_fixture_uuid('employee-a')),
  (pg_temp.category_option_fixture_uuid('relationship-a-private'),
    pg_temp.category_option_fixture_uuid('tenant-a'),
    pg_temp.category_option_fixture_uuid('supplier-private-a'), 'active',
    'CATOPT-A-PRIVATE', pg_temp.category_option_fixture_uuid('employee-a'),
    pg_temp.category_option_fixture_uuid('employee-a')),
  (pg_temp.category_option_fixture_uuid('relationship-a-qualification'),
    pg_temp.category_option_fixture_uuid('tenant-a'),
    pg_temp.category_option_fixture_uuid('supplier-qualification-blocked'),
    'active', 'CATOPT-A-QUAL',
    pg_temp.category_option_fixture_uuid('employee-a'),
    pg_temp.category_option_fixture_uuid('employee-a')),
  (pg_temp.category_option_fixture_uuid('relationship-b-platform'),
    pg_temp.category_option_fixture_uuid('tenant-b'),
    pg_temp.category_option_fixture_uuid('supplier-platform'), 'active',
    'CATOPT-B-PLATFORM', pg_temp.category_option_fixture_uuid('employee-b'),
    pg_temp.category_option_fixture_uuid('employee-b')),
  (pg_temp.category_option_fixture_uuid('relationship-c-private'),
    pg_temp.category_option_fixture_uuid('tenant-c'),
    pg_temp.category_option_fixture_uuid('supplier-private-c'), 'active',
    'CATOPT-C-PRIVATE', pg_temp.category_option_fixture_uuid('employee-c'),
    pg_temp.category_option_fixture_uuid('employee-c'));

INSERT INTO public.catalog_categories (
  id, code, name, level, full_name, is_leaf, status, ownership_scope,
  owner_tenant_id, created_by_employee_id, updated_by_employee_id
)
SELECT
  pg_temp.category_option_fixture_uuid('category-' || key), code, name, 1,
  full_name, is_leaf, status, ownership_scope,
  CASE WHEN owner_key IS NULL THEN NULL
    ELSE pg_temp.category_option_fixture_uuid(owner_key) END,
  pg_temp.category_option_fixture_uuid('employee-platform'),
  pg_temp.category_option_fixture_uuid('employee-platform')
FROM (VALUES
  ('literal', 'CATOPT-LITERAL-' || chr(37) || chr(95) || chr(92),
    'Literal category', 'A / Literal category', true, 'active',
    'platform', NULL),
  ('tenant-a', 'CATOPT-TENANT-A', 'Tenant A category',
    'B / Tenant A category', true, 'active', 'tenant', 'tenant-a'),
  ('tenant-c', 'CATOPT-TENANT-C', 'Tenant C category',
    'Foreign / Tenant C category', true, 'active', 'tenant', 'tenant-c'),
  ('inactive-category', 'CATOPT-INACTIVE-CATEGORY', 'Inactive category',
    'Invalid / Inactive category', true, 'inactive', 'platform', NULL),
  ('non-leaf', 'CATOPT-NON-LEAF', 'Non leaf category',
    'Invalid / Non leaf category', false, 'active', 'platform', NULL),
  ('qualification', 'CATOPT-QUALIFICATION', 'Qualification category',
    'Invalid / Qualification category', true, 'active', 'platform', NULL),
  ('inactive-brand', 'CATOPT-INACTIVE-BRAND', 'Inactive brand category',
    'Invalid / Inactive brand category', true, 'active', 'platform', NULL),
  ('inactive-unit', 'CATOPT-INACTIVE-UNIT', 'Inactive unit category',
    'Invalid / Inactive unit category', true, 'active', 'platform', NULL),
  ('ownership-mismatch', 'CATOPT-OWNERSHIP-MISMATCH',
    'Ownership mismatch category', 'Invalid / Ownership mismatch category',
    true, 'active', 'platform', NULL),
  ('unit-mismatch', 'CATOPT-UNIT-MISMATCH', 'Unit mismatch category',
    'Invalid / Unit mismatch category', true, 'active', 'platform', NULL),
  ('duplicate-price', 'CATOPT-DUPLICATE-PRICE', 'Duplicate price category',
    'Invalid / Duplicate price category', true, 'active', 'platform', NULL),
  ('contract', 'CATOPT-CONTRACT', 'Contract category',
    'Invalid / Contract category', true, 'active', 'platform', NULL)
) AS fixture(
  key, code, name, full_name, is_leaf, status, ownership_scope, owner_key
);

INSERT INTO public.catalog_categories (
  id, code, name, level, full_name, is_leaf, status, ownership_scope,
  owner_tenant_id, created_by_employee_id, updated_by_employee_id
)
SELECT
  pg_temp.category_option_fixture_uuid('category-perf-' || series::text),
  'CATOPT-PERF-' || lpad(series::text, 4, '0'),
  'Performance category ' || lpad(series::text, 4, '0'), 1,
  'Performance / ' || lpad(series::text, 4, '0'), true, 'active',
  'platform', NULL, pg_temp.category_option_fixture_uuid('employee-platform'),
  pg_temp.category_option_fixture_uuid('employee-platform')
FROM generate_series(1, 300) AS series;

INSERT INTO public.catalog_brands (
  id, code, name, status, ownership_scope, owner_tenant_id,
  created_by_employee_id, updated_by_employee_id
)
VALUES
  (pg_temp.category_option_fixture_uuid('brand-active'), 'CATOPT-BRAND-ACTIVE',
    'Category option active brand', 'active', 'platform', NULL,
    pg_temp.category_option_fixture_uuid('employee-platform'),
    pg_temp.category_option_fixture_uuid('employee-platform')),
  (pg_temp.category_option_fixture_uuid('brand-inactive'),
    'CATOPT-BRAND-INACTIVE', 'Category option inactive brand', 'inactive',
    'platform', NULL, pg_temp.category_option_fixture_uuid('employee-platform'),
    pg_temp.category_option_fixture_uuid('employee-platform'));

INSERT INTO public.catalog_units (
  id, code, name, symbol, unit_dimension, status,
  created_by_employee_id, updated_by_employee_id
)
VALUES
  (pg_temp.category_option_fixture_uuid('unit-active-a'), 'CATOPT-UNIT-A',
    'Category option unit A', '件A', 'count', 'active',
    pg_temp.category_option_fixture_uuid('employee-platform'),
    pg_temp.category_option_fixture_uuid('employee-platform')),
  (pg_temp.category_option_fixture_uuid('unit-active-b'), 'CATOPT-UNIT-B',
    'Category option unit B', '件B', 'count', 'active',
    pg_temp.category_option_fixture_uuid('employee-platform'),
    pg_temp.category_option_fixture_uuid('employee-platform')),
  (pg_temp.category_option_fixture_uuid('unit-inactive'), 'CATOPT-UNIT-OFF',
    'Category option inactive unit', '停', 'count', 'inactive',
    pg_temp.category_option_fixture_uuid('employee-platform'),
    pg_temp.category_option_fixture_uuid('employee-platform'));

INSERT INTO public.supplier_products (
  id, supplier_id, product_code, name, category_id, brand_id, status,
  acting_tenant_id, acting_employee_id, operation_source, proxy_reason,
  created_by_employee_id, updated_by_employee_id, ownership_scope,
  owner_tenant_id
)
SELECT
  pg_temp.category_option_fixture_uuid('product-' || key),
  pg_temp.category_option_fixture_uuid(supplier_key),
  'CATOPT-PRODUCT-' || upper(key), 'Category option product ' || key,
  pg_temp.category_option_fixture_uuid('category-' || category_key),
  pg_temp.category_option_fixture_uuid(brand_key), 'active',
  pg_temp.category_option_fixture_uuid(acting_tenant_key),
  pg_temp.category_option_fixture_uuid(acting_employee_key),
  'tenant', NULL, pg_temp.category_option_fixture_uuid(acting_employee_key),
  pg_temp.category_option_fixture_uuid(acting_employee_key), ownership_scope,
  CASE WHEN owner_key IS NULL THEN NULL
    ELSE pg_temp.category_option_fixture_uuid(owner_key) END
FROM (VALUES
  ('literal', 'supplier-platform', 'literal', 'brand-active',
    'tenant-a', 'employee-a', 'platform', NULL),
  ('tenant-a', 'supplier-private-a', 'tenant-a', 'brand-active',
    'tenant-a', 'employee-a', 'tenant', 'tenant-a'),
  ('tenant-c', 'supplier-private-c', 'tenant-c', 'brand-active',
    'tenant-c', 'employee-c', 'tenant', 'tenant-c'),
  ('inactive-category', 'supplier-platform', 'inactive-category',
    'brand-active', 'tenant-a', 'employee-a', 'platform', NULL),
  ('non-leaf', 'supplier-platform', 'non-leaf', 'brand-active',
    'tenant-a', 'employee-a', 'platform', NULL),
  ('qualification', 'supplier-qualification-blocked', 'qualification',
    'brand-active', 'tenant-a', 'employee-a', 'platform', NULL),
  ('inactive-brand', 'supplier-platform', 'inactive-brand',
    'brand-inactive', 'tenant-a', 'employee-a', 'platform', NULL),
  ('inactive-unit', 'supplier-platform', 'inactive-unit', 'brand-active',
    'tenant-a', 'employee-a', 'platform', NULL),
  ('ownership-mismatch', 'supplier-platform', 'ownership-mismatch',
    'brand-active', 'tenant-a', 'employee-a', 'platform', NULL),
  ('unit-mismatch', 'supplier-platform', 'unit-mismatch', 'brand-active',
    'tenant-a', 'employee-a', 'platform', NULL),
  ('duplicate-price', 'supplier-platform', 'duplicate-price',
    'brand-active', 'tenant-a', 'employee-a', 'platform', NULL),
  ('contract', 'supplier-platform', 'contract', 'brand-active',
    'tenant-b', 'employee-b', 'platform', NULL)
) AS fixture(
  key, supplier_key, category_key, brand_key, acting_tenant_key,
  acting_employee_key, ownership_scope, owner_key
);

INSERT INTO public.supplier_products (
  id, supplier_id, product_code, name, category_id, brand_id, status,
  acting_tenant_id, acting_employee_id, operation_source, proxy_reason,
  created_by_employee_id, updated_by_employee_id, ownership_scope,
  owner_tenant_id
)
SELECT
  pg_temp.category_option_fixture_uuid('product-perf-' || series::text),
  pg_temp.category_option_fixture_uuid('supplier-platform'),
  'CATOPT-PERF-PRODUCT-' || lpad(series::text, 4, '0'),
  'Performance product ' || lpad(series::text, 4, '0'),
  pg_temp.category_option_fixture_uuid('category-perf-' || series::text),
  pg_temp.category_option_fixture_uuid('brand-active'), 'active',
  pg_temp.category_option_fixture_uuid('tenant-a'),
  pg_temp.category_option_fixture_uuid('employee-a'), 'tenant', NULL,
  pg_temp.category_option_fixture_uuid('employee-a'),
  pg_temp.category_option_fixture_uuid('employee-a'), 'platform', NULL
FROM generate_series(1, 300) AS series;

INSERT INTO public.supplier_skus (
  id, supplier_id, supplier_product_id, sku_code, name, purchase_unit_id,
  base_unit_id, base_unit_conversion, status, acting_tenant_id,
  acting_employee_id, operation_source, proxy_reason, created_by_employee_id,
  updated_by_employee_id, ownership_scope, owner_tenant_id
)
SELECT
  pg_temp.category_option_fixture_uuid('sku-' || key),
  pg_temp.category_option_fixture_uuid(supplier_key),
  pg_temp.category_option_fixture_uuid('product-' || product_key),
  'CATOPT-SKU-' || upper(key), 'Category option SKU ' || key,
  pg_temp.category_option_fixture_uuid(unit_key),
  pg_temp.category_option_fixture_uuid(unit_key), 1, 'active',
  pg_temp.category_option_fixture_uuid(acting_tenant_key),
  pg_temp.category_option_fixture_uuid(acting_employee_key), 'tenant', NULL,
  pg_temp.category_option_fixture_uuid(acting_employee_key),
  pg_temp.category_option_fixture_uuid(acting_employee_key), ownership_scope,
  CASE WHEN owner_key IS NULL THEN NULL
    ELSE pg_temp.category_option_fixture_uuid(owner_key) END
FROM (VALUES
  ('literal', 'supplier-platform', 'literal', 'unit-active-a',
    'tenant-a', 'employee-a', 'platform', NULL),
  ('tenant-a', 'supplier-private-a', 'tenant-a', 'unit-active-a',
    'tenant-a', 'employee-a', 'tenant', 'tenant-a'),
  ('tenant-c', 'supplier-private-c', 'tenant-c', 'unit-active-a',
    'tenant-c', 'employee-c', 'tenant', 'tenant-c'),
  ('inactive-category', 'supplier-platform', 'inactive-category',
    'unit-active-a', 'tenant-a', 'employee-a', 'platform', NULL),
  ('non-leaf', 'supplier-platform', 'non-leaf', 'unit-active-a',
    'tenant-a', 'employee-a', 'platform', NULL),
  ('qualification', 'supplier-qualification-blocked', 'qualification',
    'unit-active-a', 'tenant-a', 'employee-a', 'platform', NULL),
  ('inactive-brand', 'supplier-platform', 'inactive-brand', 'unit-active-a',
    'tenant-a', 'employee-a', 'platform', NULL),
  ('inactive-unit', 'supplier-platform', 'inactive-unit', 'unit-inactive',
    'tenant-a', 'employee-a', 'platform', NULL),
  ('ownership-mismatch', 'supplier-platform', 'ownership-mismatch',
    'unit-active-a', 'tenant-a', 'employee-a', 'tenant', 'tenant-a'),
  ('unit-mismatch', 'supplier-platform', 'unit-mismatch', 'unit-active-a',
    'tenant-a', 'employee-a', 'platform', NULL),
  ('duplicate-price', 'supplier-platform', 'duplicate-price', 'unit-active-a',
    'tenant-a', 'employee-a', 'platform', NULL),
  ('contract', 'supplier-platform', 'contract', 'unit-active-a',
    'tenant-b', 'employee-b', 'platform', NULL)
) AS fixture(
  key, supplier_key, product_key, unit_key, acting_tenant_key,
  acting_employee_key, ownership_scope, owner_key
);

INSERT INTO public.supplier_skus (
  id, supplier_id, supplier_product_id, sku_code, name, purchase_unit_id,
  base_unit_id, base_unit_conversion, status, acting_tenant_id,
  acting_employee_id, operation_source, proxy_reason, created_by_employee_id,
  updated_by_employee_id, ownership_scope, owner_tenant_id
)
SELECT
  pg_temp.category_option_fixture_uuid(
    'sku-perf-' || category_no::text || '-' || sku_no::text
  ),
  pg_temp.category_option_fixture_uuid('supplier-platform'),
  pg_temp.category_option_fixture_uuid('product-perf-' || category_no::text),
  'CATOPT-PERF-SKU-' || lpad(category_no::text, 4, '0') || '-'
    || lpad(sku_no::text, 2, '0'),
  'Performance SKU ' || category_no::text || '-' || sku_no::text,
  pg_temp.category_option_fixture_uuid('unit-active-a'),
  pg_temp.category_option_fixture_uuid('unit-active-a'), 1, 'active',
  pg_temp.category_option_fixture_uuid('tenant-a'),
  pg_temp.category_option_fixture_uuid('employee-a'), 'tenant', NULL,
  pg_temp.category_option_fixture_uuid('employee-a'),
  pg_temp.category_option_fixture_uuid('employee-a'), 'platform', NULL
FROM generate_series(1, 300) AS category_no
CROSS JOIN generate_series(1, 10) AS sku_no;

INSERT INTO public.supplier_price_lists (
  id, supplier_id, price_list_code, version_number, name, currency,
  lifecycle_status, effective_from, effective_until, published_at,
  acting_tenant_id, acting_employee_id, operation_source, proxy_reason,
  created_by_employee_id, updated_by_employee_id, tenant_id,
  tenant_supplier_id
)
SELECT
  pg_temp.category_option_fixture_uuid('price-list-' || key),
  pg_temp.category_option_fixture_uuid(supplier_key), code, version_number,
  name, 'CNY', 'published', '2026-01-01T00:00:00Z', NULL,
  '2026-01-01T00:00:00Z', pg_temp.category_option_fixture_uuid(tenant_key),
  pg_temp.category_option_fixture_uuid(employee_key), 'tenant', NULL,
  pg_temp.category_option_fixture_uuid(employee_key),
  pg_temp.category_option_fixture_uuid(employee_key),
  pg_temp.category_option_fixture_uuid(tenant_key),
  pg_temp.category_option_fixture_uuid(relationship_key)
FROM (VALUES
  ('a-platform', 'supplier-platform', 'CATOPT-A-PLATFORM', 1,
    'Category option A platform prices', 'tenant-a', 'employee-a',
    'relationship-a-platform'),
  ('a-platform-duplicate', 'supplier-platform', 'CATOPT-A-PLATFORM-DUP', 1,
    'Category option A duplicate prices', 'tenant-a', 'employee-a',
    'relationship-a-platform'),
  ('a-private', 'supplier-private-a', 'CATOPT-A-PRIVATE', 1,
    'Category option A private prices', 'tenant-a', 'employee-a',
    'relationship-a-private'),
  ('a-qualification', 'supplier-qualification-blocked', 'CATOPT-A-QUAL', 1,
    'Category option A qualification prices', 'tenant-a', 'employee-a',
    'relationship-a-qualification'),
  ('b-contract', 'supplier-platform', 'CATOPT-B-CONTRACT', 1,
    'Category option B contract prices', 'tenant-b', 'employee-b',
    'relationship-b-platform'),
  ('c-private', 'supplier-private-c', 'CATOPT-C-PRIVATE', 1,
    'Category option C private prices', 'tenant-c', 'employee-c',
    'relationship-c-private')
) AS fixture(
  key, supplier_key, code, version_number, name, tenant_key, employee_key,
  relationship_key
);

INSERT INTO public.supplier_price_list_items (
  id, supplier_id, supplier_price_list_id, supplier_sku_id, purchase_unit_id,
  base_unit_id, base_unit_conversion, unit_price, tax_rate, tax_inclusive,
  acting_tenant_id, acting_employee_id, operation_source, proxy_reason,
  created_by_employee_id, updated_by_employee_id, tenant_id,
  supplier_product_id
)
SELECT
  pg_temp.category_option_fixture_uuid('price-item-' || key),
  pg_temp.category_option_fixture_uuid(supplier_key),
  pg_temp.category_option_fixture_uuid('price-list-' || price_list_key),
  pg_temp.category_option_fixture_uuid('sku-' || sku_key),
  pg_temp.category_option_fixture_uuid(purchase_unit_key),
  pg_temp.category_option_fixture_uuid(base_unit_key), conversion, 10, 0.13,
  true, pg_temp.category_option_fixture_uuid(tenant_key),
  pg_temp.category_option_fixture_uuid(employee_key), 'tenant', NULL,
  pg_temp.category_option_fixture_uuid(employee_key),
  pg_temp.category_option_fixture_uuid(employee_key),
  pg_temp.category_option_fixture_uuid(tenant_key),
  pg_temp.category_option_fixture_uuid('product-' || product_key)
FROM (VALUES
  ('literal', 'supplier-platform', 'a-platform', 'literal', 'literal',
    'unit-active-a', 'unit-active-a', 1::numeric, 'tenant-a', 'employee-a'),
  ('inactive-category', 'supplier-platform', 'a-platform',
    'inactive-category', 'inactive-category', 'unit-active-a',
    'unit-active-a', 1::numeric, 'tenant-a', 'employee-a'),
  ('non-leaf', 'supplier-platform', 'a-platform', 'non-leaf', 'non-leaf',
    'unit-active-a', 'unit-active-a', 1::numeric, 'tenant-a', 'employee-a'),
  ('inactive-brand', 'supplier-platform', 'a-platform', 'inactive-brand',
    'inactive-brand', 'unit-active-a', 'unit-active-a', 1::numeric,
    'tenant-a', 'employee-a'),
  ('inactive-unit', 'supplier-platform', 'a-platform', 'inactive-unit',
    'inactive-unit', 'unit-inactive', 'unit-inactive', 1::numeric,
    'tenant-a', 'employee-a'),
  ('ownership-mismatch', 'supplier-platform', 'a-platform',
    'ownership-mismatch', 'ownership-mismatch', 'unit-active-a',
    'unit-active-a', 1::numeric, 'tenant-a', 'employee-a'),
  ('unit-mismatch', 'supplier-platform', 'a-platform', 'unit-mismatch',
    'unit-mismatch', 'unit-active-b', 'unit-active-b', 1::numeric,
    'tenant-a', 'employee-a'),
  ('duplicate-price-a', 'supplier-platform', 'a-platform', 'duplicate-price',
    'duplicate-price', 'unit-active-a', 'unit-active-a', 1::numeric,
    'tenant-a', 'employee-a'),
  ('duplicate-price-b', 'supplier-platform', 'a-platform-duplicate',
    'duplicate-price', 'duplicate-price', 'unit-active-a', 'unit-active-a',
    1::numeric, 'tenant-a', 'employee-a'),
  ('tenant-a', 'supplier-private-a', 'a-private', 'tenant-a', 'tenant-a',
    'unit-active-a', 'unit-active-a', 1::numeric, 'tenant-a', 'employee-a'),
  ('qualification', 'supplier-qualification-blocked', 'a-qualification',
    'qualification', 'qualification', 'unit-active-a', 'unit-active-a',
    1::numeric, 'tenant-a', 'employee-a'),
  ('contract', 'supplier-platform', 'b-contract', 'contract', 'contract',
    'unit-active-a', 'unit-active-a', 1::numeric, 'tenant-b', 'employee-b'),
  ('tenant-c', 'supplier-private-c', 'c-private', 'tenant-c', 'tenant-c',
    'unit-active-a', 'unit-active-a', 1::numeric, 'tenant-c', 'employee-c')
) AS fixture(
  key, supplier_key, price_list_key, sku_key, product_key,
  purchase_unit_key, base_unit_key, conversion, tenant_key, employee_key
);

INSERT INTO public.supplier_price_list_items (
  id, supplier_id, supplier_price_list_id, supplier_sku_id, purchase_unit_id,
  base_unit_id, base_unit_conversion, unit_price, tax_rate, tax_inclusive,
  acting_tenant_id, acting_employee_id, operation_source, proxy_reason,
  created_by_employee_id, updated_by_employee_id, tenant_id,
  supplier_product_id
)
SELECT
  pg_temp.category_option_fixture_uuid(
    'price-item-perf-' || category_no::text || '-' || sku_no::text
  ),
  pg_temp.category_option_fixture_uuid('supplier-platform'),
  pg_temp.category_option_fixture_uuid('price-list-a-platform'),
  pg_temp.category_option_fixture_uuid(
    'sku-perf-' || category_no::text || '-' || sku_no::text
  ),
  pg_temp.category_option_fixture_uuid('unit-active-a'),
  pg_temp.category_option_fixture_uuid('unit-active-a'), 1, 10, 0.13, true,
  pg_temp.category_option_fixture_uuid('tenant-a'),
  pg_temp.category_option_fixture_uuid('employee-a'), 'tenant', NULL,
  pg_temp.category_option_fixture_uuid('employee-a'),
  pg_temp.category_option_fixture_uuid('employee-a'),
  pg_temp.category_option_fixture_uuid('tenant-a'),
  pg_temp.category_option_fixture_uuid('product-perf-' || category_no::text)
FROM generate_series(1, 300) AS category_no
CROSS JOIN generate_series(1, 10) AS sku_no;

SET LOCAL session_replication_role = origin;

ANALYZE public.tenant_supplier_settings;
ANALYZE public.tenant_suppliers;
ANALYZE public.suppliers;
ANALYZE public.supplier_qualification_types;
ANALYZE public.supplier_qualifications;
ANALYZE public.supplier_contracts;
ANALYZE public.supplier_price_lists;
ANALYZE public.supplier_price_list_items;
ANALYZE public.supplier_products;
ANALYZE public.supplier_skus;
ANALYZE public.catalog_categories;
ANALYZE public.catalog_brands;
ANALYZE public.catalog_units;

CREATE TEMP TABLE category_option_results (
  label text PRIMARY KEY,
  result jsonb NOT NULL
) ON COMMIT DROP;
GRANT INSERT, SELECT ON category_option_results TO service_role;

SET LOCAL ROLE service_role;

INSERT INTO category_option_results VALUES
  ('page-1', public.resolve_supplier_purchase_batch_category_options(
    pg_temp.category_option_fixture_uuid('tenant-a'),
    '2026-09-08T00:00:00Z', NULL, 1, 100)),
  ('page-16', public.resolve_supplier_purchase_batch_category_options(
    pg_temp.category_option_fixture_uuid('tenant-a'),
    '2026-09-08T00:00:00Z', NULL, 16, 20)),
  ('literal', public.resolve_supplier_purchase_batch_category_options(
    pg_temp.category_option_fixture_uuid('tenant-a'),
    '2026-09-08T00:00:00Z', chr(37) || chr(95) || chr(92), 1, 20)),
  ('tenant-a', public.resolve_supplier_purchase_batch_category_options(
    pg_temp.category_option_fixture_uuid('tenant-a'),
    '2026-09-08T00:00:00Z', 'CATOPT-TENANT-A', 1, 20)),
  ('tenant-c-hidden', public.resolve_supplier_purchase_batch_category_options(
    pg_temp.category_option_fixture_uuid('tenant-a'),
    '2026-09-08T00:00:00Z', 'CATOPT-TENANT-C', 1, 20)),
  ('qualification', public.resolve_supplier_purchase_batch_category_options(
    pg_temp.category_option_fixture_uuid('tenant-a'),
    '2026-09-08T00:00:00Z', 'CATOPT-QUALIFICATION', 1, 20)),
  ('contract', public.resolve_supplier_purchase_batch_category_options(
    pg_temp.category_option_fixture_uuid('tenant-b'),
    '2026-09-08T00:00:00Z', 'CATOPT-CONTRACT', 1, 20)),
  ('inactive-category', public.resolve_supplier_purchase_batch_category_options(
    pg_temp.category_option_fixture_uuid('tenant-a'),
    '2026-09-08T00:00:00Z', 'CATOPT-INACTIVE-CATEGORY', 1, 20)),
  ('non-leaf', public.resolve_supplier_purchase_batch_category_options(
    pg_temp.category_option_fixture_uuid('tenant-a'),
    '2026-09-08T00:00:00Z', 'CATOPT-NON-LEAF', 1, 20)),
  ('inactive-brand', public.resolve_supplier_purchase_batch_category_options(
    pg_temp.category_option_fixture_uuid('tenant-a'),
    '2026-09-08T00:00:00Z', 'CATOPT-INACTIVE-BRAND', 1, 20)),
  ('inactive-unit', public.resolve_supplier_purchase_batch_category_options(
    pg_temp.category_option_fixture_uuid('tenant-a'),
    '2026-09-08T00:00:00Z', 'CATOPT-INACTIVE-UNIT', 1, 20)),
  ('ownership-mismatch', public.resolve_supplier_purchase_batch_category_options(
    pg_temp.category_option_fixture_uuid('tenant-a'),
    '2026-09-08T00:00:00Z', 'CATOPT-OWNERSHIP-MISMATCH', 1, 20)),
  ('unit-mismatch', public.resolve_supplier_purchase_batch_category_options(
    pg_temp.category_option_fixture_uuid('tenant-a'),
    '2026-09-08T00:00:00Z', 'CATOPT-UNIT-MISMATCH', 1, 20)),
  ('duplicate-price', public.resolve_supplier_purchase_batch_category_options(
    pg_temp.category_option_fixture_uuid('tenant-a'),
    '2026-09-08T00:00:00Z', 'CATOPT-DUPLICATE-PRICE', 1, 20));

RESET ROLE;

DO $assertions$
DECLARE
  v_result jsonb;
  v_label text;
BEGIN
  SELECT result INTO STRICT v_result FROM category_option_results
  WHERE label = 'page-1';
  IF (v_result ->> 'total')::integer <> 302
    OR jsonb_array_length(v_result -> 'items') <> 100
    OR (v_result ->> 'page')::integer <> 1
    OR (v_result ->> 'page_size')::integer <> 100
    OR (SELECT count(DISTINCT item ->> 'id')
      FROM jsonb_array_elements(v_result -> 'items') AS item) <> 100
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_result -> 'items') AS item
      WHERE ARRAY(SELECT jsonb_object_keys(item) ORDER BY 1)
        IS DISTINCT FROM ARRAY['code', 'full_name', 'id', 'name', 'status']
    )
  THEN
    RAISE EXCEPTION 'distinct page, total, or field whitelist failed: %',
      v_result;
  END IF;

  SELECT result INTO STRICT v_result FROM category_option_results
  WHERE label = 'page-16';
  IF (v_result ->> 'total')::integer <> 302
    OR jsonb_array_length(v_result -> 'items') <> 2
    OR (v_result ->> 'page')::integer <> 16
    OR (v_result ->> 'page_size')::integer <> 20
  THEN
    RAISE EXCEPTION 'last page accuracy failed: %', v_result;
  END IF;

  SELECT result INTO STRICT v_result FROM category_option_results
  WHERE label = 'literal';
  IF (v_result ->> 'total')::integer <> 1
    OR v_result #>> '{items,0,code}' IS DISTINCT FROM
      'CATOPT-LITERAL-' || chr(37) || chr(95) || chr(92)
  THEN
    RAISE EXCEPTION 'literal %% underscore backslash search failed: %',
      v_result;
  END IF;

  FOREACH v_label IN ARRAY ARRAY['tenant-a'] LOOP
    SELECT result INTO STRICT v_result FROM category_option_results
    WHERE label = v_label;
    IF (v_result ->> 'total')::integer <> 1 THEN
      RAISE EXCEPTION 'expected included category %: %', v_label, v_result;
    END IF;
  END LOOP;

  FOREACH v_label IN ARRAY ARRAY[
    'tenant-c-hidden', 'qualification', 'contract', 'inactive-category',
    'non-leaf', 'inactive-brand', 'inactive-unit', 'ownership-mismatch',
    'unit-mismatch', 'duplicate-price'
  ] LOOP
    SELECT result INTO STRICT v_result FROM category_option_results
    WHERE label = v_label;
    IF (v_result ->> 'total')::integer <> 0
      OR jsonb_array_length(v_result -> 'items') <> 0
    THEN
      RAISE EXCEPTION 'expected excluded category %: %', v_label, v_result;
    END IF;
  END LOOP;
END;
$assertions$;

\echo 'category-options integration assertions passed; performance fixture: 3011 tenant-A price candidates / 302 purchasable categories'

SET LOCAL ROLE service_role;
EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON)
SELECT public.resolve_supplier_purchase_batch_category_options(
  pg_temp.category_option_fixture_uuid('tenant-a'),
  '2026-09-08T00:00:00Z', NULL, 1, 20
);
RESET ROLE;

SELECT relname, seq_scan, idx_scan, seq_tup_read, idx_tup_fetch
FROM pg_stat_xact_user_tables
WHERE relname IN (
  'tenant_supplier_settings', 'tenant_suppliers', 'suppliers',
  'supplier_qualification_types', 'supplier_qualifications',
  'supplier_contracts', 'supplier_price_lists', 'supplier_price_list_items',
  'supplier_products', 'supplier_skus', 'catalog_categories',
  'catalog_brands', 'catalog_units'
)
ORDER BY relname;

ROLLBACK;
