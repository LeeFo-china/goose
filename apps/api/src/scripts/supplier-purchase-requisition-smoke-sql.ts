import {
  SMOKE_IDS as PURCHASE_ORDER_IDS,
  type FixtureReferences,
  type SmokeSql,
} from "./supplier-purchase-order-smoke-fixture";

export type RequisitionSmokeFixture = FixtureReferences & {
  reviewer_employee_id: string;
  reviewer_user_id: string;
  cost_category_id: string;
  relationship_id: string;
  sku_id: string;
};

type ResultRow = { result: unknown };

class SupplierPurchaseRequisitionSmokeSqlError extends Error {}

export async function extendFixture(
  sql: SmokeSql,
  fixture: FixtureReferences,
  categoryId: string,
  budgetId: string,
): Promise<RequisitionSmokeFixture> {
  const reviewers = await sql<{
    reviewer_employee_id: string;
    reviewer_user_id: string;
  }[]>`
    select employee.id as reviewer_employee_id,
      employee.user_id as reviewer_user_id
    from public.employees as employee
    where employee.tenant_id = ${fixture.tenant_id}::uuid
      and employee.id <> ${fixture.employee_id}::uuid
      and employee.status = 'active'
      and employee.user_id is not null
    order by employee.id
    limit 1;
  `;
  const reviewer = reviewers[0];
  if (!reviewer) {
    throw new SupplierPurchaseRequisitionSmokeSqlError(
      "SMOKE_REVIEWER_FIXTURE_MISSING",
    );
  }
  await sql`
    insert into public.finance_cost_categories (
      id, tenant_id, code, name, status, sort_order, is_system,
      created_by, updated_by
    ) values (
      ${categoryId}::uuid, ${fixture.tenant_id}::uuid,
      'requisition_smoke', '采购申请 Smoke 成本分类',
      'active', 1, false, ${fixture.employee_id}::uuid,
      ${fixture.employee_id}::uuid
    );
  `;
  await sql`
    insert into public.project_cost_budgets (
      id, tenant_id, project_id, cost_category_id, budget_amount,
      warning_threshold_percent, status, remark, created_by, updated_by
    ) values (
      ${budgetId}::uuid, ${fixture.tenant_id}::uuid,
      ${fixture.project_id}::uuid, ${categoryId}::uuid, 1000,
      100, 'active', '采购申请数据库 smoke',
      ${fixture.employee_id}::uuid, ${fixture.employee_id}::uuid
    );
  `;
  return {
    ...fixture,
    ...reviewer,
    cost_category_id: categoryId,
    relationship_id: PURCHASE_ORDER_IDS.relationship,
    sku_id: PURCHASE_ORDER_IDS.sku,
  };
}

export async function saveRequisition(
  sql: SmokeSql,
  fixture: RequisitionSmokeFixture,
  requisitionId: string,
  expectedVersion: number,
  idempotencyKey: string,
  quantity = 20,
) {
  const items = [{
    supplier_sku_id: fixture.sku_id,
    cost_category_id: fixture.cost_category_id,
    quantity,
  }];
  const rows = await sql<ResultRow[]>`
    select public.save_supplier_purchase_requisition_draft(
      ${requisitionId}::uuid, ${fixture.tenant_id}::uuid,
      ${fixture.project_id}::uuid, ${fixture.relationship_id}::uuid,
      ${expectedVersion}::integer, null::date,
      '采购申请数据库 smoke', null::text, ${items}::jsonb,
      ${fixture.user_id}::uuid, ${fixture.employee_id}::uuid,
      ${idempotencyKey}
    ) as result;
  `;
  return rows[0]?.result;
}

export async function submitRequisition(
  sql: SmokeSql,
  fixture: RequisitionSmokeFixture,
  requisitionId: string,
  expectedVersion: number,
  idempotencyKey: string,
) {
  const rows = await sql<ResultRow[]>`
    select public.submit_supplier_purchase_requisition(
      ${requisitionId}::uuid, ${fixture.tenant_id}::uuid,
      ${expectedVersion}::integer, ${fixture.user_id}::uuid,
      ${fixture.employee_id}::uuid, ${idempotencyKey}
    ) as result;
  `;
  return rows[0]?.result;
}

export async function reviewRequisition(
  sql: SmokeSql,
  fixture: RequisitionSmokeFixture,
  requisitionId: string,
  expectedVersion: number,
  action: "approve" | "reject",
  idempotencyKey: string,
  selfReview = false,
) {
  const rows = await sql<ResultRow[]>`
    select public.review_supplier_purchase_requisition(
      ${requisitionId}::uuid, ${fixture.tenant_id}::uuid,
      ${expectedVersion}::integer, ${action}, '采购申请数据库 smoke 审批',
      ${selfReview ? fixture.user_id : fixture.reviewer_user_id}::uuid,
      ${selfReview
        ? fixture.employee_id
        : fixture.reviewer_employee_id}::uuid,
      ${idempotencyKey}
    ) as result;
  `;
  return rows[0]?.result;
}

export async function cancelRequisition(
  sql: SmokeSql,
  fixture: RequisitionSmokeFixture,
  requisitionId: string,
  expectedVersion: number,
  idempotencyKey: string,
  tenantId = fixture.tenant_id,
) {
  const rows = await sql<ResultRow[]>`
    select public.cancel_supplier_purchase_requisition(
      ${requisitionId}::uuid, ${tenantId}::uuid,
      ${expectedVersion}::integer, '采购申请数据库 smoke 取消',
      ${tenantId === fixture.tenant_id
        ? fixture.user_id
        : fixture.other_user_id}::uuid,
      ${tenantId === fixture.tenant_id
        ? fixture.employee_id
        : fixture.other_employee_id}::uuid,
      ${idempotencyKey}
    ) as result;
  `;
  return rows[0]?.result;
}

export async function convertRequisition(
  sql: SmokeSql,
  fixture: RequisitionSmokeFixture,
  requisitionId: string,
  purchaseOrderId: string,
  expectedVersion: number,
  idempotencyKey: string,
) {
  const rows = await sql<ResultRow[]>`
    select public.convert_supplier_purchase_requisition(
      ${requisitionId}::uuid, ${fixture.tenant_id}::uuid,
      ${expectedVersion}::integer, ${purchaseOrderId}::uuid,
      ${fixture.user_id}::uuid, ${fixture.employee_id}::uuid,
      ${idempotencyKey}
    ) as result;
  `;
  return rows[0]?.result;
}

export async function expectIdempotencyConflict(
  sql: SmokeSql,
  callback: (savepoint: SmokeSql) => Promise<unknown>,
) {
  try {
    await sql.savepoint(callback);
  } catch (error) {
    if (
      error instanceof Bun.SQL.PostgresError &&
      error.errno === "P0001" &&
      error.message === "SUPPLIER_IDEMPOTENCY_CONFLICT"
    ) return true;
    throw error;
  }
  throw new SupplierPurchaseRequisitionSmokeSqlError(
    "SMOKE_IDEMPOTENCY_CONFLICT_NOT_RAISED",
  );
}

export async function commitmentStatus(
  sql: SmokeSql,
  tenantId: string,
  requisitionId: string,
) {
  const rows = await sql<{ status: string }[]>`
    select commitment.status
    from public.project_cost_commitments as commitment
    where commitment.tenant_id = ${tenantId}::uuid
      and commitment.source_id = ${requisitionId}::uuid
    order by commitment.cost_category_id;
  `;
  return rows.map(({ status }) => status);
}

export async function commitmentEvidence(
  sql: SmokeSql,
  tenantId: string,
  requisitionId: string,
) {
  return sql<Array<{
    status: string;
    amount: string;
    available_amount_snapshot: string;
  }>>`
    select commitment.status, commitment.amount::text,
      commitment.available_amount_snapshot::text
    from public.project_cost_commitments as commitment
    where commitment.tenant_id = ${tenantId}::uuid
      and commitment.source_id = ${requisitionId}::uuid
    order by commitment.cost_category_id;
  `;
}

type ConcurrentFixtureIds = {
  concurrentA: string; concurrentB: string;
  concurrentSupplierA: string; concurrentSupplierB: string;
  concurrentRelationshipA: string; concurrentRelationshipB: string;
  concurrentProductA: string; concurrentProductB: string;
  concurrentSkuA: string; concurrentSkuB: string;
  concurrentPriceListA: string; concurrentPriceListB: string;
  concurrentPriceItemA: string; concurrentPriceItemB: string;
};

export async function countConcurrentFixtureRows(
  sql: SmokeSql,
  ids: ConcurrentFixtureIds,
) {
  const rows = await sql<{ remaining_fixture_count: number }[]>`
    select sum(residual.count)::integer as remaining_fixture_count
    from (
      select count(*) from public.supplier_purchase_requisitions
      where id in (${ids.concurrentA}::uuid, ${ids.concurrentB}::uuid)
      union all
      select count(*) from public.project_cost_commitments
      where source_id in (${ids.concurrentA}::uuid, ${ids.concurrentB}::uuid)
      union all
      select count(*) from public.suppliers
      where id in (
        ${ids.concurrentSupplierA}::uuid, ${ids.concurrentSupplierB}::uuid
      )
      union all
      select count(*) from public.supplier_qualifications
      where supplier_id in (
        ${ids.concurrentSupplierA}::uuid, ${ids.concurrentSupplierB}::uuid
      )
      union all
      select count(*) from public.tenant_suppliers
      where id in (
        ${ids.concurrentRelationshipA}::uuid,
        ${ids.concurrentRelationshipB}::uuid
      )
      union all
      select count(*) from public.supplier_products
      where id in (
        ${ids.concurrentProductA}::uuid, ${ids.concurrentProductB}::uuid
      )
      union all
      select count(*) from public.supplier_skus
      where id in (${ids.concurrentSkuA}::uuid, ${ids.concurrentSkuB}::uuid)
      union all
      select count(*) from public.supplier_price_lists
      where id in (
        ${ids.concurrentPriceListA}::uuid, ${ids.concurrentPriceListB}::uuid
      )
      union all
      select count(*) from public.supplier_price_list_items
      where id in (
        ${ids.concurrentPriceItemA}::uuid, ${ids.concurrentPriceItemB}::uuid
      )
    ) as residual;
  `;
  return rows[0]?.remaining_fixture_count ?? -1;
}
