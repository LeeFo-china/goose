import type { SavepointSQL, TransactionSQL } from "bun";

export type BatchSmokeSql = Bun.SQL | TransactionSQL | SavepointSQL;

export type BatchSmokeFixture = {
  runToken: string;
  tenantId: string;
  actorUserId: string;
  actorEmployeeId: string;
  reviewerUserId: string;
  reviewerEmployeeId: string;
  secondReviewerUserId: string;
  secondReviewerEmployeeId: string;
  projectId: string;
  catalogCategoryId: string;
  platformCategoryId: string;
  catalogBrandId: string;
  purchaseUnitId: string;
  costCategoryIds: [string, string];
  supplierIds: [string, string];
  relationshipIds: [string, string];
  productIds: [string, string, string];
  skuIds: [string, string, string];
  batchIds: string[];
};

type CommandRow = { result: unknown };

export class SupplierPurchaseBatchSmokeError extends Error {}

export const SUPPLIER_PURCHASE_BATCH_FIXTURE_TABLE_ORDER = [
  "auth.users",
  "public.employees",
  "public.projects",
  "public.tenant_supplier_settings",
  "public.suppliers",
  "public.tenant_suppliers",
] as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parsePgUuidArray(value: unknown): string[] {
  const items = Array.isArray(value)
    ? value
    : typeof value === "string" && value.startsWith("{") &&
        value.endsWith("}")
    ? value.slice(1, -1).split(",").filter(Boolean)
    : [];
  if (!items.every((item) => typeof item === "string" && UUID_PATTERN.test(item))) {
    throw new SupplierPurchaseBatchSmokeError("invalid PostgreSQL UUID array");
  }
  return items as string[];
}

export function createPurchasableCodes(productId: string, skuId: string) {
  return {
    productCode: `TP-${productId.replaceAll("-", "").slice(0, 16)}`,
    skuCode: `TS-${skuId.replaceAll("-", "").slice(0, 16)}`,
  };
}

export function requireSmokeRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SupplierPurchaseBatchSmokeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertStatus(value: unknown, expected: string, label: string) {
  const result = requireSmokeRecord(value, label);
  if (result.status !== expected) {
    throw new SupplierPurchaseBatchSmokeError(
      `${label} expected ${expected}, received ${JSON.stringify(result)}`,
    );
  }
  return result;
}

export async function createRuntimeBatchSmokeFixture(
  sql: BatchSmokeSql,
  runToken: string,
): Promise<BatchSmokeFixture> {
  const rows = await sql<{
    tenant_id: string;
    catalog_category_id: string;
    catalog_brand_id: string;
    purchase_unit_id: string;
    cost_category_ids: unknown;
  }[]>`
    select tenant.id as tenant_id,
      category.id as catalog_category_id,
      brand.id as catalog_brand_id,
      purchase_unit.id as purchase_unit_id,
      costs.ids as cost_category_ids
    from public.tenants as tenant
    cross join lateral (
      select category.id from public.catalog_categories as category
      where category.status = 'active'
        and category.ownership_scope = 'platform'
        and category.owner_tenant_id is null
      order by category.id limit 1
    ) as category
    cross join lateral (
      select brand.id from public.catalog_brands as brand
      where brand.status = 'active'
        and brand.ownership_scope = 'platform'
        and brand.owner_tenant_id is null
      order by brand.id limit 1
    ) as brand
    cross join lateral (
      select unit_record.id from public.catalog_units as unit_record
      where unit_record.status = 'active'
      order by unit_record.id limit 1
    ) as purchase_unit
    cross join lateral (
      select array_agg(cost.id order by cost.id) as ids
      from (
        select cost.id from public.finance_cost_categories as cost
        where cost.tenant_id = tenant.id and cost.status = 'active'
        order by cost.id limit 2
      ) as cost
    ) as costs
    where cardinality(costs.ids) = 2
      and not exists (
        select 1 from public.tenant_supplier_settings as existing_settings
        where existing_settings.tenant_id = tenant.id
      )
    order by tenant.id limit 1;
  `;
  const row = rows[0];
  const costCategoryIds = parsePgUuidArray(row?.cost_category_ids);
  if (!row || costCategoryIds.length !== 2) {
    throw new SupplierPurchaseBatchSmokeError(
      "local database has no bounded batch fixture references",
    );
  }
  return {
    runToken,
    tenantId: row.tenant_id,
    actorUserId: crypto.randomUUID(),
    actorEmployeeId: crypto.randomUUID(),
    reviewerUserId: crypto.randomUUID(),
    reviewerEmployeeId: crypto.randomUUID(),
    secondReviewerUserId: crypto.randomUUID(),
    secondReviewerEmployeeId: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    catalogCategoryId: crypto.randomUUID(),
    platformCategoryId: row.catalog_category_id,
    catalogBrandId: row.catalog_brand_id,
    purchaseUnitId: row.purchase_unit_id,
    costCategoryIds: costCategoryIds as [string, string],
    supplierIds: [crypto.randomUUID(), crypto.randomUUID()],
    relationshipIds: [crypto.randomUUID(), crypto.randomUUID()],
    productIds: [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()],
    skuIds: [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()],
    batchIds: [],
  };
}

async function createPurchasableSku(
  sql: BatchSmokeSql,
  fixture: BatchSmokeFixture,
  index: 0 | 1 | 2,
) {
  const supplierIndex = index === 2 ? 1 : 0;
  const codes = createPurchasableCodes(
    fixture.productIds[index],
    fixture.skuIds[index],
  );
  const product = {
    product_code: codes.productCode,
    name: `采购批次验证商品 ${fixture.runToken} ${index + 1}`,
    category_id: fixture.catalogCategoryId,
    brand_id: fixture.catalogBrandId,
  };
  const sku = {
    sku_code: codes.skuCode,
    name: `采购批次验证 SKU ${fixture.runToken} ${index + 1}`,
    purchase_unit_id: fixture.purchaseUnitId,
    spec_values: {},
  };
  const price = {
    unit_price: ["10.00", "20.00", "30.00"][index],
    tax_rate: "0.130000",
    tax_inclusive: true,
  };
  const rows = await sql<CommandRow[]>`
    select public.command_supplier_purchasable_product_v1(
      ${fixture.productIds[index]}::uuid, ${fixture.skuIds[index]}::uuid,
      ${fixture.tenantId}::uuid,
      ${fixture.relationshipIds[supplierIndex]}::uuid,
      ${fixture.supplierIds[supplierIndex]}::uuid,
      ${product}::jsonb, ${sku}::jsonb, ${price}::jsonb,
      ${fixture.actorUserId}::uuid, ${fixture.actorEmployeeId}::uuid,
      ${`batch-fixture:${fixture.runToken}:${index}`}::text
    ) as result;
  `;
  assertStatus(rows[0]?.result, "created", `purchasable SKU ${index + 1}`);
}

export async function seedRuntimeBatchSmokeFixture(
  sql: BatchSmokeSql,
  fixture: BatchSmokeFixture,
): Promise<void> {
  await sql`
    insert into auth.users(
      id, aud, role, email, encrypted_password,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (${fixture.actorUserId}::uuid, 'authenticated', 'authenticated',
      ${`batch-${fixture.runToken}@smoke.invalid`}, '', '{}'::jsonb,
      '{}'::jsonb, now(), now());
  `;
  await sql`
    insert into auth.users(
      id, aud, role, email, encrypted_password,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (${fixture.secondReviewerUserId}::uuid,
      'authenticated', 'authenticated',
      ${`batch-review-2-${fixture.runToken}@smoke.invalid`}, '', '{}'::jsonb,
      '{}'::jsonb, now(), now());
  `;
  await sql`
    insert into auth.users(
      id, aud, role, email, encrypted_password,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (${fixture.reviewerUserId}::uuid,
      'authenticated', 'authenticated',
      ${`batch-review-${fixture.runToken}@smoke.invalid`}, '', '{}'::jsonb,
      '{}'::jsonb, now(), now());
  `;
  await sql`
    insert into public.employees(id, name, status, user_id, tenant_id)
    values (${fixture.actorEmployeeId}::uuid,
      ${`采购批次验证员工 ${fixture.runToken}`}, 'active',
      ${fixture.actorUserId}::uuid, ${fixture.tenantId}::uuid);
  `;
  await sql`
    insert into public.employees(id, name, status, user_id, tenant_id)
    values (${fixture.reviewerEmployeeId}::uuid,
      ${`采购批次验证审批员工 ${fixture.runToken}`}, 'active',
      ${fixture.reviewerUserId}::uuid, ${fixture.tenantId}::uuid);
  `;
  await sql`
    insert into public.employees(id, name, status, user_id, tenant_id)
    values (${fixture.secondReviewerEmployeeId}::uuid,
      ${`采购批次验证审批员工 2 ${fixture.runToken}`}, 'active',
      ${fixture.secondReviewerUserId}::uuid, ${fixture.tenantId}::uuid);
  `;
  await sql`
    insert into public.projects(id, name, status, tenant_id)
    values (${fixture.projectId}::uuid,
      ${`采购批次验证项目 ${fixture.runToken}`}, 'designing',
      ${fixture.tenantId}::uuid);
  `;
  await sql`
    insert into public.catalog_categories(
      id, parent_id, code, name, full_name, level, status, is_leaf,
      ownership_scope, owner_tenant_id, mapped_platform_category_id,
      created_by_employee_id, updated_by_employee_id
    ) values (${fixture.catalogCategoryId}::uuid, null,
      ${`BATCH-${fixture.runToken}-CATEGORY`.toUpperCase()},
      ${`采购批次验证分类 ${fixture.runToken}`},
      ${`采购批次验证分类 ${fixture.runToken}`}, 1, 'active', true,
      'tenant', ${fixture.tenantId}::uuid,
      ${fixture.platformCategoryId}::uuid,
      ${fixture.actorEmployeeId}::uuid, ${fixture.actorEmployeeId}::uuid);
  `;
  await sql`
    insert into public.tenant_supplier_settings(
      tenant_id, module_enabled, require_active_contract_for_new_order,
      enabled_by_employee_id, enabled_at
    ) values (${fixture.tenantId}::uuid, true, false,
      ${fixture.actorEmployeeId}::uuid, now());
  `;
  for (const index of [0, 1] as const) {
    const code = `B${fixture.runToken.replaceAll("-", "").slice(0, 12)}S${index + 1}`
      .toUpperCase();
    await sql`
      insert into public.suppliers(
        id, code, name, legal_name, supplier_type, ownership_scope,
        owner_tenant_id, onboarding_status, operational_status,
        reviewed_by_employee_id, reviewed_at,
        created_by_employee_id, updated_by_employee_id
      ) values (${fixture.supplierIds[index]}::uuid, ${code},
        ${`采购批次验证供应商 ${index + 1}`},
        ${`采购批次验证供应商 ${index + 1} 有限公司`},
        'manufacturer', 'tenant', ${fixture.tenantId}::uuid,
        'approved', 'active', ${fixture.actorEmployeeId}::uuid, now(),
        ${fixture.actorEmployeeId}::uuid, ${fixture.actorEmployeeId}::uuid);
    `;
    await sql`
      insert into public.tenant_suppliers(
        id, tenant_id, supplier_id, relationship_status, default_currency,
        internal_supplier_code, started_at,
        created_by_employee_id, updated_by_employee_id
      ) values (${fixture.relationshipIds[index]}::uuid,
        ${fixture.tenantId}::uuid, ${fixture.supplierIds[index]}::uuid,
        'active', 'CNY', ${code}, current_date,
        ${fixture.actorEmployeeId}::uuid, ${fixture.actorEmployeeId}::uuid);
    `;
  }
  for (const index of [0, 1, 2] as const) {
    await createPurchasableSku(sql, fixture, index);
  }
  for (const costCategoryId of fixture.costCategoryIds) {
    await sql`
      insert into public.project_cost_budgets(
        tenant_id, project_id, cost_category_id, budget_amount,
        created_by, updated_by
      ) values (${fixture.tenantId}::uuid, ${fixture.projectId}::uuid,
        ${costCategoryId}::uuid, 100000,
        ${fixture.actorEmployeeId}::uuid, ${fixture.actorEmployeeId}::uuid);
    `;
  }
}

export function createBatchItems(fixture: BatchSmokeFixture) {
  return [
    {
      supplier_sku_id: fixture.skuIds[0],
      cost_category_id: fixture.costCategoryIds[0],
      quantity: "2.0000",
    },
    {
      supplier_sku_id: fixture.skuIds[1],
      cost_category_id: fixture.costCategoryIds[1],
      quantity: "3.0000",
    },
    {
      supplier_sku_id: fixture.skuIds[2],
      cost_category_id: fixture.costCategoryIds[0],
      quantity: "4.0000",
    },
  ];
}

export async function saveRuntimeBatch(
  sql: BatchSmokeSql,
  fixture: BatchSmokeFixture,
  batchId: string,
  idempotencyKey: string,
) {
  const rows = await sql<CommandRow[]>`
    select public.save_supplier_purchase_batch_draft(
      ${batchId}::uuid, ${fixture.tenantId}::uuid,
      ${fixture.projectId}::uuid, 0, '采购批次原子拆单验证', null::date,
      ${`fixture:${fixture.runToken}`}, ${createBatchItems(fixture)}::jsonb,
      ${fixture.actorUserId}::uuid, ${fixture.actorEmployeeId}::uuid,
      ${idempotencyKey}
    ) as result;
  `;
  return rows[0]?.result;
}

export async function submitRuntimeBatch(
  sql: BatchSmokeSql,
  fixture: BatchSmokeFixture,
  batchId: string,
  idempotencyKey: string,
) {
  const rows = await sql<CommandRow[]>`
    select public.submit_supplier_purchase_batch(
      ${batchId}::uuid, ${fixture.tenantId}::uuid, 1,
      ${fixture.actorUserId}::uuid, ${fixture.actorEmployeeId}::uuid,
      ${idempotencyKey}
    ) as result;
  `;
  return rows[0]?.result;
}

export async function reviewRuntimeBatch(
  sql: BatchSmokeSql,
  fixture: BatchSmokeFixture,
  batchId: string,
  idempotencyKey: string,
  reviewer: "first" | "second" = "first",
) {
  const reviewerUserId = reviewer === "first"
    ? fixture.reviewerUserId
    : fixture.secondReviewerUserId;
  const reviewerEmployeeId = reviewer === "first"
    ? fixture.reviewerEmployeeId
    : fixture.secondReviewerEmployeeId;
  const rows = await sql<CommandRow[]>`
    select public.review_supplier_purchase_batch(
      ${batchId}::uuid, ${fixture.tenantId}::uuid, 2, 'approve', null::text,
      false, ${reviewerUserId}::uuid,
      ${reviewerEmployeeId}::uuid, ${idempotencyKey}
    ) as result;
  `;
  return rows[0]?.result;
}

export async function prepareSubmittedBatch(
  sql: BatchSmokeSql,
  fixture: BatchSmokeFixture,
  label: string,
) {
  const batchId = crypto.randomUUID();
  fixture.batchIds.push(batchId);
  const saved = assertStatus(
    await saveRuntimeBatch(sql, fixture, batchId, `${label}:save`),
    "saved",
    `${label} save`,
  );
  const submitted = assertStatus(
    await submitRuntimeBatch(sql, fixture, batchId, `${label}:submit`),
    "submitted",
    `${label} submit`,
  );
  return { batchId, saved, submitted };
}

export async function countRuntimeOrders(
  sql: BatchSmokeSql,
  fixture: BatchSmokeFixture,
  batchId: string,
): Promise<number> {
  const rows = await sql<{ count: number }[]>`
    select count(*)::integer as count
    from public.supplier_purchase_orders
    where tenant_id = ${fixture.tenantId}::uuid
      and purchase_batch_id = ${batchId}::uuid
    limit 1;
  `;
  return rows[0]?.count ?? -1;
}
