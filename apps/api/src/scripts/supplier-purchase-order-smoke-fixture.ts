export const SMOKE_IDS = {
  order: "23000000-0000-4000-8000-000000000001",
  otherOrder: "23000000-0000-4000-8000-000000000002",
  supplier: "23000000-0000-4000-8000-000000000003",
  relationship: "23000000-0000-4000-8000-000000000004",
  category: "23000000-0000-4000-8000-000000000005",
  brand: "23000000-0000-4000-8000-000000000006",
  unit: "23000000-0000-4000-8000-000000000007",
  product: "23000000-0000-4000-8000-000000000008",
  sku: "23000000-0000-4000-8000-000000000009",
  priceList: "23000000-0000-4000-8000-000000000010",
  priceItem: "23000000-0000-4000-8000-000000000011",
  replacementPriceList: "23000000-0000-4000-8000-000000000012",
  replacementPriceItem: "23000000-0000-4000-8000-000000000013",
  qualification: "23000000-0000-4000-8000-000000000014",
  otherRelationship: "23000000-0000-4000-8000-000000000015",
  overflowOrder: "23000000-0000-4000-8000-000000000016",
  overflowPriceList: "23000000-0000-4000-8000-000000000017",
  overflowPriceItem: "23000000-0000-4000-8000-000000000018",
} as const;

export type SmokeSql = Bun.SQL & {
  savepoint<T>(callback: (sql: SmokeSql) => Promise<T>): Promise<T>;
};

export type FixtureReferences = {
  tenant_id: string;
  employee_id: string;
  user_id: string;
  project_id: string;
  qualification_type_id: string;
  file_id: string;
  other_tenant_id: string;
  other_employee_id: string;
  other_user_id: string;
  other_project_id: string;
};

class SupplierPurchaseOrderSmokeFixtureError extends Error {}

export async function selectFixtureReferences(
  sql: SmokeSql,
): Promise<FixtureReferences> {
  const rows = await sql<FixtureReferences[]>`
    select
      employee.tenant_id,
      employee.id as employee_id,
      employee.user_id,
      project.id as project_id,
      qualification_type.id as qualification_type_id,
      file_record.id as file_id,
      other_actor.other_tenant_id,
      other_actor.other_employee_id,
      other_actor.other_user_id,
      other_actor.other_project_id
    from public.employees as employee
    join public.projects as project
      on project.tenant_id = employee.tenant_id
    cross join lateral (
      select qualification_type.id
      from public.supplier_qualification_types as qualification_type
      where qualification_type.code = 'business_license'
        and qualification_type.status = 'active'
      limit 1
    ) as qualification_type
    cross join lateral (
      select file_record.id
      from public.platform_file_objects as file_record
      limit 1
    ) as file_record
    cross join lateral (
      select
        other_employee.tenant_id as other_tenant_id,
        other_employee.id as other_employee_id,
        other_employee.user_id as other_user_id,
        other_project.id as other_project_id
      from public.employees as other_employee
      join public.projects as other_project
        on other_project.tenant_id = other_employee.tenant_id
      where other_employee.tenant_id <> employee.tenant_id
        and other_employee.status = 'active'
        and other_employee.user_id is not null
      order by other_employee.tenant_id, other_employee.id, other_project.id
      limit 1
    ) as other_actor
    where employee.status = 'active'
      and employee.user_id is not null
    order by employee.tenant_id, employee.id, project.id
    limit 1;
  `;
  if (!rows[0]) {
    throw new SupplierPurchaseOrderSmokeFixtureError(
      "database has no complete smoke fixture references",
    );
  }
  return rows[0];
}

export async function seedSupplierFixture(
  sql: SmokeSql,
  fixture: FixtureReferences,
) {
  await sql`
    insert into public.catalog_categories (
      id, parent_id, code, name, level, status,
      created_by_employee_id, updated_by_employee_id
    ) values (
      ${SMOKE_IDS.category}::uuid, null, 'SMOKE-PO-CATEGORY',
      '采购单 Smoke 分类', 1, 'active',
      ${fixture.employee_id}::uuid, ${fixture.employee_id}::uuid
    );
  `;
  await sql`
    insert into public.catalog_brands (
      id, code, name, status, created_by_employee_id, updated_by_employee_id
    ) values (
      ${SMOKE_IDS.brand}::uuid, 'SMOKE-PO-BRAND', '采购单 Smoke 品牌',
      'active', ${fixture.employee_id}::uuid, ${fixture.employee_id}::uuid
    );
  `;
  await sql`
    insert into public.catalog_units (
      id, code, name, symbol, status,
      created_by_employee_id, updated_by_employee_id
    ) values (
      ${SMOKE_IDS.unit}::uuid, 'SMOKE-PO-PCS', '件', '件', 'active',
      ${fixture.employee_id}::uuid, ${fixture.employee_id}::uuid
    );
  `;
  await sql`
    insert into public.suppliers (
      id, code, name, legal_name, supplier_type, onboarding_status,
      operational_status, reviewed_by_employee_id, reviewed_at,
      created_by_employee_id, updated_by_employee_id
    ) values (
      ${SMOKE_IDS.supplier}::uuid, 'SMOKE-PO-SUPPLIER',
      '采购单 Smoke 供应商', '采购单 Smoke 供应商有限公司',
      'manufacturer', 'approved', 'active',
      ${fixture.employee_id}::uuid, now(),
      ${fixture.employee_id}::uuid, ${fixture.employee_id}::uuid
    );
  `;
  await sql`
    insert into public.supplier_qualifications (
      id, supplier_id, qualification_type_id, document_file_id,
      verification_status, verified_by_employee_id, verified_at,
      created_by_employee_id, updated_by_employee_id
    ) values (
      ${SMOKE_IDS.qualification}::uuid, ${SMOKE_IDS.supplier}::uuid,
      ${fixture.qualification_type_id}::uuid, ${fixture.file_id}::uuid,
      'verified', ${fixture.employee_id}::uuid, now(),
      ${fixture.employee_id}::uuid, ${fixture.employee_id}::uuid
    );
  `;
  await sql`
    insert into public.tenant_supplier_settings (
      tenant_id, module_enabled, require_active_contract_for_new_order,
      enabled_by_employee_id, enabled_at
    ) values (
      ${fixture.tenant_id}::uuid, true, false,
      ${fixture.employee_id}::uuid, now()
    )
    on conflict (tenant_id) do update set
      module_enabled = true,
      require_active_contract_for_new_order = false,
      enabled_by_employee_id = excluded.enabled_by_employee_id,
      enabled_at = excluded.enabled_at;
  `;
  await sql`
    insert into public.tenant_supplier_settings (
      tenant_id, module_enabled, require_active_contract_for_new_order,
      enabled_by_employee_id, enabled_at
    ) values (
      ${fixture.other_tenant_id}::uuid, true, false,
      ${fixture.other_employee_id}::uuid, now()
    )
    on conflict (tenant_id) do update set
      module_enabled = true,
      require_active_contract_for_new_order = false,
      enabled_by_employee_id = excluded.enabled_by_employee_id,
      enabled_at = excluded.enabled_at;
  `;
  await sql`
    insert into public.tenant_suppliers (
      id, tenant_id, supplier_id, relationship_status, default_currency,
      started_at, created_by_employee_id, updated_by_employee_id
    ) values (
      ${SMOKE_IDS.relationship}::uuid, ${fixture.tenant_id}::uuid,
      ${SMOKE_IDS.supplier}::uuid, 'active', 'CNY', current_date,
      ${fixture.employee_id}::uuid, ${fixture.employee_id}::uuid
    );
  `;
  await sql`
    insert into public.tenant_suppliers (
      id, tenant_id, supplier_id, relationship_status, default_currency,
      started_at, created_by_employee_id, updated_by_employee_id
    ) values (
      ${SMOKE_IDS.otherRelationship}::uuid,
      ${fixture.other_tenant_id}::uuid,
      ${SMOKE_IDS.supplier}::uuid, 'active', 'CNY', current_date,
      ${fixture.other_employee_id}::uuid, ${fixture.other_employee_id}::uuid
    );
  `;
  await sql`
    insert into public.supplier_products (
      id, supplier_id, product_code, name, category_id, brand_id, status,
      acting_tenant_id, acting_employee_id, proxy_reason,
      created_by_employee_id, updated_by_employee_id
    ) values (
      ${SMOKE_IDS.product}::uuid, ${SMOKE_IDS.supplier}::uuid,
      'SMOKE-PO-PRODUCT', '采购单 Smoke 商品',
      ${SMOKE_IDS.category}::uuid, ${SMOKE_IDS.brand}::uuid, 'draft',
      ${fixture.tenant_id}::uuid, ${fixture.employee_id}::uuid, '数据库 smoke',
      ${fixture.employee_id}::uuid, ${fixture.employee_id}::uuid
    );
  `;
  await sql`
    insert into public.supplier_skus (
      id, supplier_id, supplier_product_id, sku_code, name,
      purchase_unit_id, base_unit_id, base_unit_conversion, status,
      acting_tenant_id, acting_employee_id, proxy_reason,
      created_by_employee_id, updated_by_employee_id
    ) values (
      ${SMOKE_IDS.sku}::uuid, ${SMOKE_IDS.supplier}::uuid,
      ${SMOKE_IDS.product}::uuid, 'SMOKE-PO-SKU', '采购单 Smoke SKU',
      ${SMOKE_IDS.unit}::uuid, ${SMOKE_IDS.unit}::uuid, 1, 'active',
      ${fixture.tenant_id}::uuid, ${fixture.employee_id}::uuid, '数据库 smoke',
      ${fixture.employee_id}::uuid, ${fixture.employee_id}::uuid
    );
  `;
  await sql`
    update public.supplier_products
    set status = 'active', version = version + 1
    where id = ${SMOKE_IDS.product}::uuid;
  `;
  await createPublishedPrice(
    sql,
    fixture,
    SMOKE_IDS.priceList,
    SMOKE_IDS.priceItem,
    1,
    "10.00",
  );
}

export async function createPublishedPrice(
  sql: SmokeSql,
  fixture: FixtureReferences,
  priceListId: string,
  priceItemId: string,
  version: number,
  unitPrice: string,
) {
  await sql`
    insert into public.supplier_price_lists (
      id, supplier_id, price_list_code, version_number, name, currency,
      lifecycle_status, effective_from, acting_tenant_id, acting_employee_id,
      proxy_reason, created_by_employee_id, updated_by_employee_id
    ) values (
      ${priceListId}::uuid, ${SMOKE_IDS.supplier}::uuid,
      'SMOKE-PO-BASE', ${version}, '采购单 Smoke 基础价', 'CNY',
      'draft', now() - interval '1 day',
      ${fixture.tenant_id}::uuid, ${fixture.employee_id}::uuid, '数据库 smoke',
      ${fixture.employee_id}::uuid, ${fixture.employee_id}::uuid
    );
  `;
  await sql`
    insert into public.supplier_price_list_items (
      id, supplier_id, supplier_price_list_id, supplier_sku_id,
      minimum_quantity, purchase_unit_id, base_unit_id, base_unit_conversion,
      unit_price, tax_rate, tax_inclusive, acting_tenant_id,
      acting_employee_id, proxy_reason, created_by_employee_id,
      updated_by_employee_id
    ) values (
      ${priceItemId}::uuid, ${SMOKE_IDS.supplier}::uuid, ${priceListId}::uuid,
      ${SMOKE_IDS.sku}::uuid, 1, ${SMOKE_IDS.unit}::uuid,
      ${SMOKE_IDS.unit}::uuid, 1, ${unitPrice}::numeric, 0.13, true,
      ${fixture.tenant_id}::uuid, ${fixture.employee_id}::uuid,
      '数据库 smoke', ${fixture.employee_id}::uuid, ${fixture.employee_id}::uuid
    );
  `;
  await sql`
    update public.supplier_price_lists
    set lifecycle_status = 'published', published_at = now(),
        row_version = row_version + 1
    where id = ${priceListId}::uuid;
  `;
}
