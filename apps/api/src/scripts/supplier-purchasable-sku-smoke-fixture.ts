import type { ReservedSQL, TransactionSQL } from "bun";

export type SupplierPurchasableSkuSmokeSql =
  Bun.SQL | ReservedSQL | TransactionSQL;

export type SupplierPurchasableSkuSmokeFixture = {
  token: string;
  tenantId: string;
  otherTenantId: string;
  actorUserId: string;
  otherUserId: string;
  platformUserId: string;
  actorEmployeeId: string;
  otherEmployeeId: string;
  platformEmployeeId: string;
  supplierId: string;
  platformSupplierId: string;
  relationshipId: string;
  categoryId: string;
  platformCategoryId: string;
  brandId: string;
  platformBrandId: string;
  unitId: string;
  productId: string;
  inactiveProductId: string;
  platformProductId: string;
  skuId: string;
  inactiveSkuId: string;
  platformSkuId: string;
  extraSkuId: string;
  futurePriceListId: string;
};

export function createSupplierPurchasableSkuSmokeFixture():
SupplierPurchasableSkuSmokeFixture {
  const id = () => crypto.randomUUID();
  return {
    token: id().replaceAll("-", "").slice(0, 16),
    tenantId: id(),
    otherTenantId: id(),
    actorUserId: id(),
    otherUserId: id(),
    platformUserId: id(),
    actorEmployeeId: id(),
    otherEmployeeId: id(),
    platformEmployeeId: id(),
    supplierId: id(),
    platformSupplierId: id(),
    relationshipId: id(),
    categoryId: id(),
    platformCategoryId: id(),
    brandId: id(),
    platformBrandId: id(),
    unitId: id(),
    productId: id(),
    inactiveProductId: id(),
    platformProductId: id(),
    skuId: id(),
    inactiveSkuId: id(),
    platformSkuId: id(),
    extraSkuId: id(),
    futurePriceListId: id(),
  };
}

export async function seedSupplierPurchasableSkuSmokeFixture(
  sql: SupplierPurchasableSkuSmokeSql,
  fixture: SupplierPurchasableSkuSmokeFixture,
): Promise<void> {
  const label = `task8-${fixture.token}`;
  await sql`
    insert into public.tenants(id, name, slug, status) values
      (${fixture.tenantId}::uuid, ${label}, ${label}, 'active'),
      (${fixture.otherTenantId}::uuid, ${`${label}-other`},
        ${`${label}-other`}, 'active')
  `;
  await sql`
    insert into auth.users(
      id, aud, role, email, encrypted_password,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values
      (${fixture.actorUserId}::uuid, 'authenticated', 'authenticated',
        ${`${label}@smoke.invalid`}, '', '{}'::jsonb, '{}'::jsonb, now(), now()),
      (${fixture.otherUserId}::uuid, 'authenticated', 'authenticated',
        ${`${label}-other@smoke.invalid`}, '', '{}'::jsonb, '{}'::jsonb,
        now(), now()),
      (${fixture.platformUserId}::uuid, 'authenticated', 'authenticated',
        ${`${label}-platform@smoke.invalid`}, '', '{}'::jsonb, '{}'::jsonb,
        now(), now())
  `;
  await sql`
    insert into public.employees(id, tenant_id, user_id, name, status) values
      (${fixture.actorEmployeeId}::uuid, ${fixture.tenantId}::uuid,
        ${fixture.actorUserId}::uuid, ${label}, 'active'),
      (${fixture.otherEmployeeId}::uuid, ${fixture.otherTenantId}::uuid,
        ${fixture.otherUserId}::uuid, ${`${label}-other`}, 'active'),
      (${fixture.platformEmployeeId}::uuid, null,
        ${fixture.platformUserId}::uuid, ${`${label}-platform`}, 'active')
  `;
  await sql`
    insert into public.catalog_categories(
      id, code, name, full_name, level, status, is_leaf,
      ownership_scope, owner_tenant_id,
      created_by_employee_id, updated_by_employee_id
    ) values
      (${fixture.categoryId}::uuid, ${`T8-${fixture.token}-CAT`}, ${label},
        ${label}, 1, 'active', true, 'tenant', ${fixture.tenantId}::uuid,
        ${fixture.actorEmployeeId}::uuid, ${fixture.actorEmployeeId}::uuid),
      (${fixture.platformCategoryId}::uuid, ${`T8-${fixture.token}-PCAT`},
        ${`${label}-platform`}, ${`${label}-platform`}, 1, 'active', true,
        'platform', null, ${fixture.platformEmployeeId}::uuid,
        ${fixture.platformEmployeeId}::uuid)
  `;
  await sql`
    insert into public.catalog_brands(
      id, code, name, status, ownership_scope, owner_tenant_id,
      created_by_employee_id, updated_by_employee_id
    ) values
      (${fixture.brandId}::uuid, ${`T8-${fixture.token}-BRAND`}, ${label},
        'active', 'tenant', ${fixture.tenantId}::uuid,
        ${fixture.actorEmployeeId}::uuid, ${fixture.actorEmployeeId}::uuid),
      (${fixture.platformBrandId}::uuid, ${`T8-${fixture.token}-PBRAND`},
        ${`${label}-platform`}, 'active', 'platform', null,
        ${fixture.platformEmployeeId}::uuid,
        ${fixture.platformEmployeeId}::uuid)
  `;
  await sql`
    insert into public.catalog_units(
      id, code, name, symbol, status,
      created_by_employee_id, updated_by_employee_id
    ) values (${fixture.unitId}::uuid, ${`T8-${fixture.token}-UNIT`},
      ${label}, '件', 'active', ${fixture.actorEmployeeId}::uuid,
      ${fixture.actorEmployeeId}::uuid)
  `;
  await sql`
    insert into public.suppliers(
      id, code, name, legal_name, supplier_type, ownership_scope,
      owner_tenant_id, onboarding_status, operational_status,
      reviewed_by_employee_id, reviewed_at,
      created_by_employee_id, updated_by_employee_id
    ) values
      (${fixture.supplierId}::uuid, ${`T8${fixture.token}S`}, ${label},
        ${`${label} Ltd`}, 'manufacturer', 'tenant', ${fixture.tenantId}::uuid,
        'approved', 'active', ${fixture.actorEmployeeId}::uuid, now(),
        ${fixture.actorEmployeeId}::uuid, ${fixture.actorEmployeeId}::uuid),
      (${fixture.platformSupplierId}::uuid, ${`T8${fixture.token}P`},
        ${`${label}-platform`}, ${`${label} Platform Ltd`}, 'manufacturer',
        'platform', null, 'approved', 'active',
        ${fixture.platformEmployeeId}::uuid, now(),
        ${fixture.platformEmployeeId}::uuid,
        ${fixture.platformEmployeeId}::uuid)
  `;
  await sql`
    insert into public.tenant_suppliers(
      id, tenant_id, supplier_id, relationship_status, default_currency,
      internal_supplier_code, started_at,
      created_by_employee_id, updated_by_employee_id
    ) values (${fixture.relationshipId}::uuid, ${fixture.tenantId}::uuid,
      ${fixture.supplierId}::uuid, 'active', 'CNY', ${`T8-${fixture.token}`},
      current_date, ${fixture.actorEmployeeId}::uuid,
      ${fixture.actorEmployeeId}::uuid)
  `;
  await sql`
    insert into public.tenant_supplier_settings(
      tenant_id, module_enabled, require_active_contract_for_new_order,
      enabled_by_employee_id, enabled_at
    ) values (${fixture.tenantId}::uuid, true, false,
      ${fixture.actorEmployeeId}::uuid, now())
  `;
  await sql`
    insert into public.supplier_products(
      id, supplier_id, product_code, name, category_id, brand_id, status,
      ownership_scope, owner_tenant_id, acting_tenant_id, acting_employee_id,
      operation_source, created_by_employee_id, updated_by_employee_id
    ) values
      (${fixture.productId}::uuid, ${fixture.supplierId}::uuid,
        ${`T8-${fixture.token}-PRODUCT`}, ${label}, ${fixture.categoryId}::uuid,
        ${fixture.brandId}::uuid, 'draft', 'tenant', ${fixture.tenantId}::uuid,
        ${fixture.tenantId}::uuid, ${fixture.actorEmployeeId}::uuid, 'tenant',
        ${fixture.actorEmployeeId}::uuid, ${fixture.actorEmployeeId}::uuid),
      (${fixture.inactiveProductId}::uuid, ${fixture.supplierId}::uuid,
        ${`T8-${fixture.token}-INACTIVE`}, ${`${label}-inactive`},
        ${fixture.categoryId}::uuid, ${fixture.brandId}::uuid, 'inactive',
        'tenant', ${fixture.tenantId}::uuid, ${fixture.tenantId}::uuid,
        ${fixture.actorEmployeeId}::uuid, 'tenant',
        ${fixture.actorEmployeeId}::uuid, ${fixture.actorEmployeeId}::uuid),
      (${fixture.platformProductId}::uuid, ${fixture.platformSupplierId}::uuid,
        ${`T8-${fixture.token}-PLATFORM`}, ${`${label}-platform`},
        ${fixture.platformCategoryId}::uuid, ${fixture.platformBrandId}::uuid,
        'active', 'platform', null, null, ${fixture.platformEmployeeId}::uuid,
        'platform', ${fixture.platformEmployeeId}::uuid,
        ${fixture.platformEmployeeId}::uuid)
  `;
  await sql`
    insert into public.supplier_skus(
      id, supplier_id, supplier_product_id, sku_code, name,
      purchase_unit_id, base_unit_id, base_unit_conversion, status, version,
      ownership_scope, owner_tenant_id, acting_tenant_id, acting_employee_id,
      operation_source, created_by_employee_id, updated_by_employee_id,
      spec_values
    ) values
      (${fixture.inactiveSkuId}::uuid, ${fixture.supplierId}::uuid,
        ${fixture.productId}::uuid, ${`TS-${fixture.token}0000000000000000`},
        ${`${label}-inactive-sku`}, ${fixture.unitId}::uuid,
        ${fixture.unitId}::uuid, 1, 'inactive', 1, 'tenant',
        ${fixture.tenantId}::uuid, ${fixture.tenantId}::uuid,
        ${fixture.actorEmployeeId}::uuid, 'tenant',
        ${fixture.actorEmployeeId}::uuid, ${fixture.actorEmployeeId}::uuid,
        '{}'::jsonb),
      (${fixture.platformSkuId}::uuid, ${fixture.platformSupplierId}::uuid,
        ${fixture.platformProductId}::uuid,
        ${`PS-${fixture.token}0000000000000000`}, ${`${label}-platform-sku`},
        ${fixture.unitId}::uuid, ${fixture.unitId}::uuid, 1, 'active', 1,
        'platform', null, null, ${fixture.platformEmployeeId}::uuid, 'platform',
        ${fixture.platformEmployeeId}::uuid,
        ${fixture.platformEmployeeId}::uuid, '{}'::jsonb)
  `;
}

export async function cleanupSupplierPurchasableSkuSmokeFixture(
  sql: SupplierPurchasableSkuSmokeSql,
  fixture: SupplierPurchasableSkuSmokeFixture,
): Promise<void> {
  const users = [fixture.actorUserId, fixture.otherUserId, fixture.platformUserId];
  const suppliers = [fixture.supplierId, fixture.platformSupplierId];
  await sql`delete from public.supplier_command_events
    where actor_user_id = any(${sql.array(users, "UUID")}) or tenant_id = any(
      ${sql.array([fixture.tenantId, fixture.otherTenantId], "UUID")})`;
  await sql`delete from public.supplier_sku_unit_conversions where
    supplier_sku_id in (select id from public.supplier_skus
      where supplier_id = any(${sql.array(suppliers, "UUID")}))`;
  await sql`delete from public.supplier_price_list_items
    where supplier_id = any(${sql.array(suppliers, "UUID")})`;
  await sql`delete from public.supplier_price_lists
    where supplier_id = any(${sql.array(suppliers, "UUID")})`;
  await sql`delete from public.supplier_skus where supplier_id = any(
    ${sql.array(suppliers, "UUID")})`;
  await sql`delete from public.supplier_products where supplier_id = any(
    ${sql.array(suppliers, "UUID")})`;
  await sql`delete from public.tenant_suppliers
    where id = ${fixture.relationshipId}::uuid`;
  await sql`delete from public.tenant_supplier_settings where tenant_id in
    (${fixture.tenantId}::uuid, ${fixture.otherTenantId}::uuid)`;
  await sql`delete from public.suppliers where id = any(
    ${sql.array(suppliers, "UUID")})`;
  await sql`delete from public.catalog_brands where id = any(
    ${sql.array([fixture.brandId, fixture.platformBrandId], "UUID")})`;
  await sql`delete from public.catalog_categories where id = any(
    ${sql.array([fixture.categoryId, fixture.platformCategoryId], "UUID")})`;
  await sql`delete from public.catalog_units where id = ${fixture.unitId}::uuid`;
  await sql`delete from public.employees where id = any(
    ${sql.array([fixture.actorEmployeeId, fixture.otherEmployeeId,
      fixture.platformEmployeeId], "UUID")})`;
  await sql`delete from auth.users where id = any(${sql.array(users, "UUID")})`;
  await sql`delete from public.tenants where id = any(
    ${sql.array([fixture.tenantId, fixture.otherTenantId], "UUID")})`;
}

export async function countSupplierPurchasableSkuSmokeResiduals(
  sql: SupplierPurchasableSkuSmokeSql,
  fixture: SupplierPurchasableSkuSmokeFixture,
): Promise<number> {
  const rows = await sql<{ count: number }[]>`
    select (
      (select count(*) from public.tenants where id in
        (${fixture.tenantId}::uuid, ${fixture.otherTenantId}::uuid)) +
      (select count(*) from public.employees where id = any(
        ${sql.array([fixture.actorEmployeeId, fixture.otherEmployeeId,
          fixture.platformEmployeeId], "UUID")})) +
      (select count(*) from public.suppliers where id = any(
        ${sql.array([fixture.supplierId, fixture.platformSupplierId], "UUID")})) +
      (select count(*) from public.supplier_products where supplier_id = any(
        ${sql.array([fixture.supplierId, fixture.platformSupplierId], "UUID")})) +
      (select count(*) from public.supplier_skus where supplier_id = any(
        ${sql.array([fixture.supplierId, fixture.platformSupplierId], "UUID")})) +
      (select count(*) from public.supplier_price_lists where supplier_id =
        ${fixture.supplierId}::uuid) +
      (select count(*) from public.supplier_price_list_items where supplier_id =
        ${fixture.supplierId}::uuid) +
      (select count(*) from public.supplier_command_events where tenant_id in
        (${fixture.tenantId}::uuid, ${fixture.otherTenantId}::uuid))
    )::integer as count
  `;
  return rows[0]?.count ?? -1;
}
