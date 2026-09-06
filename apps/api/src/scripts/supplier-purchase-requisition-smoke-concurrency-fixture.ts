import type { SmokeSql } from "./supplier-purchase-order-smoke-fixture";
import type {
  RequisitionSmokeFixture,
} from "./supplier-purchase-requisition-smoke-sql";

export type ConcurrentIds = {
  concurrentA: string; concurrentB: string;
  concurrentSupplierA: string; concurrentSupplierB: string;
  concurrentRelationshipA: string; concurrentRelationshipB: string;
  concurrentProductA: string; concurrentProductB: string;
  concurrentSkuA: string; concurrentSkuB: string;
  concurrentPriceListA: string; concurrentPriceListB: string;
  concurrentPriceItemA: string; concurrentPriceItemB: string;
};

type ConcurrentSupplierIds = {
  supplier: string; relationship: string; product: string;
  sku: string; priceList: string; priceItem: string;
};

type ConcurrentBase = Omit<
  RequisitionSmokeFixture, "relationship_id" | "sku_id"
> & {
  catalog_brand_id: string; catalog_category_id: string; catalog_unit_id: string;
  file_id: string; requisition_amount: string;
};

class SupplierPurchaseRequisitionConcurrencyFixtureError extends Error {}

async function publishSupplierPriceList(
  sql: SmokeSql,
  fixture: ConcurrentBase,
  ids: ConcurrentSupplierIds,
  label: "A" | "B",
) {
  const versionRows = await sql<{ row_version: number }[]>`
    select row_version
    from public.supplier_price_lists
    where id = ${ids.priceList}::uuid
      and tenant_id = ${fixture.tenant_id}::uuid
      and tenant_supplier_id = ${ids.relationship}::uuid
      and supplier_id = ${ids.supplier}::uuid;
  `;
  const rowVersion = versionRows[0]?.row_version;
  if (!rowVersion) {
    throw new SupplierPurchaseRequisitionConcurrencyFixtureError(
      `SMOKE_CONCURRENT_PRICE_LIST_${label}_VERSION_MISSING`,
    );
  }
  const rows = await sql<{ result: unknown }[]>`
    select public.command_supplier_price_list_v2(
      'publish',
      ${ids.priceList}::uuid,
      null::uuid,
      ${fixture.tenant_id}::uuid,
      ${ids.relationship}::uuid,
      ${ids.supplier}::uuid,
      ${rowVersion}::integer,
      '{}'::jsonb,
      ${fixture.user_id}::uuid,
      ${fixture.employee_id}::uuid,
      ${`requisition-smoke-concurrent-price-${label}`}::text
    ) as result;
  `;
  const result = rows[0]?.result;
  if (
    typeof result !== "object" ||
    result === null ||
    Array.isArray(result) ||
    (result as Record<string, unknown>).status !== "published"
  ) {
    throw new SupplierPurchaseRequisitionConcurrencyFixtureError(
      `SMOKE_CONCURRENT_PRICE_LIST_${label}_PUBLISH_FAILED`,
    );
  }
}

export async function findConcurrentFixture(
  sql: SmokeSql,
): Promise<ConcurrentBase> {
  const rows = await sql<ConcurrentBase[]>`
    with candidates as (
      select employee.tenant_id, employee.id as employee_id,
        employee.user_id, project.id as project_id,
        reviewer.id as reviewer_employee_id,
        reviewer.user_id as reviewer_user_id,
        category.id as cost_category_id,
        employee.tenant_id as other_tenant_id,
        employee.id as other_employee_id,
        employee.user_id as other_user_id,
        project.id as other_project_id,
        gen_random_uuid()::text as qualification_type_id,
        file_record.id as file_id,
        catalog_brand.id as catalog_brand_id,
        catalog_category.id as catalog_category_id,
        catalog_unit.id as catalog_unit_id,
        budget.budget_amount -
          coalesce(expense.amount, 0) -
          coalesce(commitment.amount, 0) as available_amount
      from public.employees as employee
      join public.projects as project
        on project.tenant_id = employee.tenant_id
      join public.project_cost_budgets as budget
        on budget.tenant_id = project.tenant_id
        and budget.project_id = project.id
        and budget.status = 'active'
      join public.finance_cost_categories as category
        on category.id = budget.cost_category_id
        and category.tenant_id = budget.tenant_id
        and category.status = 'active'
      join public.tenant_supplier_settings as settings
        on settings.tenant_id = employee.tenant_id
        and settings.module_enabled
        and not settings.require_active_contract_for_new_order
      join lateral (
        select candidate.id, candidate.user_id
        from public.employees as candidate
        where candidate.tenant_id = employee.tenant_id
          and candidate.id <> employee.id
          and candidate.status = 'active'
          and candidate.user_id is not null
        order by candidate.id
        limit 1
      ) as reviewer on true
      join lateral (
        select id from public.catalog_brands
        where status = 'active' order by id limit 1
      ) as catalog_brand on true
      join lateral (
        select id
        from public.catalog_categories
        where status = 'active'
        order by id
        limit 1
      ) as catalog_category on true
      join lateral (
        select id
        from public.catalog_units
        where status = 'active'
        order by id
        limit 1
      ) as catalog_unit on true
      join lateral (
        select id
        from public.platform_file_objects
        order by id
        limit 1
      ) as file_record on true
      left join lateral (
        select sum(ledger.amount) as amount
        from public.finance_ledger_entries as ledger
        where ledger.tenant_id = budget.tenant_id
          and ledger.project_id = budget.project_id
          and ledger.cost_category_id = budget.cost_category_id
          and ledger.direction = 'out'
      ) as expense on true
      left join lateral (
        select sum(active.amount) as amount
        from public.project_cost_commitments as active
        where active.tenant_id = budget.tenant_id
          and active.project_id = budget.project_id
          and active.cost_category_id = budget.cost_category_id
          and active.status in ('reserved', 'converted')
      ) as commitment on true
      where employee.status = 'active'
        and employee.user_id is not null
    )
    select candidates.*,
      round(candidates.available_amount * 0.60, 2)::text
        as requisition_amount
    from candidates
    where candidates.available_amount between 100 and 1000000000
    order by candidates.tenant_id, candidates.project_id,
      candidates.cost_category_id
    limit 1;
  `;
  if (!rows[0]) {
    throw new SupplierPurchaseRequisitionConcurrencyFixtureError(
      "SMOKE_CONCURRENT_FIXTURE_MISSING",
    );
  }
  return rows[0];
}

export async function seedConcurrentSupplier(
  sql: SmokeSql,
  fixture: ConcurrentBase,
  ids: ConcurrentSupplierIds,
  label: "A" | "B",
): Promise<RequisitionSmokeFixture> {
  await sql`
    insert into public.suppliers (
      id, code, name, legal_name, supplier_type, onboarding_status,
      operational_status, reviewed_by_employee_id, reviewed_at,
      created_by_employee_id, updated_by_employee_id
    ) values (
      ${ids.supplier}::uuid, ${`SMOKE-REQ-CONCURRENT-${label}`},
      ${`采购申请并发供应商 ${label}`}, ${`采购申请并发供应商 ${label} 有限公司`},
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
    )
    select gen_random_uuid(), ${ids.supplier}::uuid, type.id,
      ${fixture.file_id}::uuid, 'verified', ${fixture.employee_id}::uuid,
      now(), ${fixture.employee_id}::uuid, ${fixture.employee_id}::uuid
    from public.supplier_qualification_types as type
    where type.status = 'active'
      and type.blocks_new_orders
      and (cardinality(type.applicable_supplier_types) = 0
        or 'manufacturer' = any(type.applicable_supplier_types));
  `;
  await sql`
    insert into public.tenant_suppliers (
      id, tenant_id, supplier_id, relationship_status, default_currency,
      internal_supplier_code, started_at, created_by_employee_id,
      updated_by_employee_id
    ) values (
      ${ids.relationship}::uuid, ${fixture.tenant_id}::uuid,
      ${ids.supplier}::uuid, 'active', 'CNY',
      ${`SMOKE-REQ-CONCURRENT-${label}`}, current_date,
      ${fixture.employee_id}::uuid, ${fixture.employee_id}::uuid
    );
  `;
  await sql`
    insert into public.supplier_products (
      id, supplier_id, product_code, name, category_id, brand_id, status,
      acting_tenant_id, acting_employee_id, proxy_reason,
      created_by_employee_id, updated_by_employee_id
    ) values (
      ${ids.product}::uuid, ${ids.supplier}::uuid,
      ${`SMOKE-REQ-PRODUCT-${label}`}, ${`采购申请并发商品 ${label}`},
      ${fixture.catalog_category_id}::uuid, ${fixture.catalog_brand_id}::uuid, 'draft',
      ${fixture.tenant_id}::uuid, ${fixture.employee_id}::uuid,
      '采购申请并发 smoke',
      ${fixture.employee_id}::uuid, ${fixture.employee_id}::uuid
    );
  `;
  await sql`
    insert into public.supplier_skus (
      id, supplier_id, supplier_product_id, sku_code, name,
      purchase_unit_id, base_unit_id, base_unit_conversion, status,
      acting_tenant_id, acting_employee_id, proxy_reason,
      created_by_employee_id, updated_by_employee_id, spec_values
    ) values (
      ${ids.sku}::uuid, ${ids.supplier}::uuid, ${ids.product}::uuid,
      ${`SMOKE-REQ-SKU-${label}`}, ${`采购申请并发 SKU ${label}`},
      ${fixture.catalog_unit_id}::uuid, ${fixture.catalog_unit_id}::uuid,
      1, 'active', ${fixture.tenant_id}::uuid,
      ${fixture.employee_id}::uuid, '采购申请并发 smoke',
      ${fixture.employee_id}::uuid, ${fixture.employee_id}::uuid,
      '{}'::jsonb
    );
  `;
  await sql`
    update public.supplier_products
    set status = 'active', version = version + 1
    where id = ${ids.product}::uuid;
  `;
  await sql`
    insert into public.supplier_price_lists (
      id, tenant_id, tenant_supplier_id, supplier_id, price_list_code,
      version_number, name, currency, lifecycle_status, effective_from,
      acting_tenant_id, acting_employee_id, operation_source, proxy_reason,
      created_by_employee_id, updated_by_employee_id
    ) values (
      ${ids.priceList}::uuid, ${fixture.tenant_id}::uuid,
      ${ids.relationship}::uuid, ${ids.supplier}::uuid,
      ${`SMOKE-REQ-PRICE-${label}`}, 1, ${`采购申请并发价格 ${label}`},
      'CNY', 'draft', now() - interval '1 day',
      ${fixture.tenant_id}::uuid, ${fixture.employee_id}::uuid,
      'tenant_proxy', '采购申请并发 smoke',
      ${fixture.employee_id}::uuid, ${fixture.employee_id}::uuid
    );
  `;
  await sql`
    insert into public.supplier_price_list_items (
      id, tenant_id, supplier_id, supplier_price_list_id,
      supplier_product_id, supplier_sku_id, minimum_quantity,
      purchase_unit_id, base_unit_id, base_unit_conversion, unit_price,
      tax_rate, tax_inclusive, acting_tenant_id, acting_employee_id,
      operation_source, proxy_reason, created_by_employee_id,
      updated_by_employee_id
    ) values (
      ${ids.priceItem}::uuid, ${fixture.tenant_id}::uuid,
      ${ids.supplier}::uuid, ${ids.priceList}::uuid,
      ${ids.product}::uuid, ${ids.sku}::uuid, 1,
      ${fixture.catalog_unit_id}::uuid,
      ${fixture.catalog_unit_id}::uuid, 1,
      ${fixture.requisition_amount}::numeric, 0, true,
      ${fixture.tenant_id}::uuid, ${fixture.employee_id}::uuid,
      'tenant_proxy', '采购申请并发 smoke',
      ${fixture.employee_id}::uuid, ${fixture.employee_id}::uuid
    );
  `;
  await publishSupplierPriceList(sql, fixture, ids, label);
  const eligibility = await sql<{ eligible: boolean }[]>`
    select eligible
    from public.get_tenant_supplier_order_eligibility_set(
      ${fixture.tenant_id}::uuid, now(), ${ids.relationship}::uuid
    )
    where supplier_id = ${ids.supplier}::uuid;
  `;
  if (eligibility[0]?.eligible !== true) {
    throw new SupplierPurchaseRequisitionConcurrencyFixtureError(
      `SMOKE_CONCURRENT_SUPPLIER_${label}_NOT_ELIGIBLE`,
    );
  }
  return { ...fixture, relationship_id: ids.relationship, sku_id: ids.sku };
}

export function supplierIds(ids: ConcurrentIds, side: "A" | "B") {
  return {
    supplier: ids[`concurrentSupplier${side}`],
    relationship: ids[`concurrentRelationship${side}`],
    product: ids[`concurrentProduct${side}`],
    sku: ids[`concurrentSku${side}`],
    priceList: ids[`concurrentPriceList${side}`],
    priceItem: ids[`concurrentPriceItem${side}`],
  };
}
