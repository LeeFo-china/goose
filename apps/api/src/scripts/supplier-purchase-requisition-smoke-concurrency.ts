import type { SmokeSql } from "./supplier-purchase-order-smoke-fixture";
import {
  saveRequisition,
  submitRequisition,
  type RequisitionSmokeFixture,
} from "./supplier-purchase-requisition-smoke-sql";
import type {
  assertRequisitionCommandResult,
  observeBlockedUntilRelease,
  runWithForcedRollback,
} from "./supplier-purchase-requisition-smoke";

type ConcurrentIds = {
  concurrentA: string;
  concurrentB: string;
};

class SupplierPurchaseRequisitionConcurrencyError extends Error {}

async function findConcurrentFixture(sql: SmokeSql) {
  const rows = await sql<RequisitionSmokeFixture[]>`
    select employee.tenant_id, employee.id as employee_id,
      employee.user_id, project.id as project_id,
      employee.id as reviewer_employee_id,
      employee.user_id as reviewer_user_id,
      category.id as cost_category_id,
      relationship.id as relationship_id,
      sku.id as sku_id,
      employee.tenant_id as other_tenant_id,
      employee.id as other_employee_id,
      employee.user_id as other_user_id,
      project.id as other_project_id,
      gen_random_uuid()::text as qualification_type_id,
      gen_random_uuid()::text as file_id
    from public.employees as employee
    join public.projects as project on project.tenant_id = employee.tenant_id
    join public.project_cost_budgets as budget
      on budget.tenant_id = project.tenant_id
      and budget.project_id = project.id and budget.status = 'active'
    join public.finance_cost_categories as category
      on category.id = budget.cost_category_id
      and category.tenant_id = budget.tenant_id and category.status = 'active'
    join public.tenant_suppliers as relationship
      on relationship.tenant_id = employee.tenant_id
      and relationship.relationship_status = 'active'
    join lateral public.get_tenant_supplier_order_eligibility_set(
      relationship.tenant_id, now(), relationship.id
    ) as eligibility
      on eligibility.eligible
      and eligibility.supplier_id = relationship.supplier_id
    join public.supplier_price_lists as price_list
      on price_list.supplier_id = relationship.supplier_id
      and price_list.lifecycle_status = 'published'
      and price_list.scope_type = 'default'
      and price_list.effective_from <= now()
      and (price_list.effective_until is null
        or price_list.effective_until > now())
    join public.supplier_price_list_items as price_item
      on price_item.supplier_price_list_id = price_list.id
    join public.supplier_skus as sku
      on sku.id = price_item.supplier_sku_id and sku.status = 'active'
    join public.supplier_products as product
      on product.id = sku.supplier_product_id and product.status = 'active'
    where employee.status = 'active' and employee.user_id is not null
    order by employee.tenant_id, project.id, category.id, sku.id
    limit 1;
  `;
  if (!rows[0]) {
    throw new SupplierPurchaseRequisitionConcurrencyError(
      "SMOKE_CONCURRENT_FIXTURE_MISSING",
    );
  }
  return rows[0];
}

export async function runConcurrentBudgetSmoke(
  databaseUrl: string,
  ids: ConcurrentIds,
  rollback: typeof runWithForcedRollback,
  observe: typeof observeBlockedUntilRelease,
  assertSubmitted: typeof assertRequisitionCommandResult,
) {
  const lookup = new Bun.SQL(databaseUrl, { prepare: false });
  const databaseA = new Bun.SQL(databaseUrl, { prepare: false });
  const databaseB = new Bun.SQL(databaseUrl, { prepare: false });
  let releaseA: (() => void) | undefined;
  let operationA: Promise<boolean> | undefined;
  let operationB: Promise<unknown> | undefined;
  try {
    const fixture = await findConcurrentFixture(lookup as SmokeSql);
    let markSubmitted!: () => void;
    const holdA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    const aSubmitted = new Promise<void>((resolve) => {
      markSubmitted = resolve;
    });
    operationA = rollback(databaseA, async (transaction) => {
      const sql = transaction as SmokeSql;
      await saveRequisition(
        sql, fixture, ids.concurrentA, 0,
        "requisition-smoke-concurrent-a",
      );
      assertSubmitted(await submitRequisition(
        sql, fixture, ids.concurrentA, 1,
        "requisition-smoke-concurrent-a-submit",
      ), { status: "submitted", idempotent: false, version: 2 });
      markSubmitted();
      await holdA;
      return true;
    });
    const aReady = await Promise.race([
      aSubmitted.then(() => "submitted" as const),
      operationA.then(
        () => "settled" as const,
        (error) => Promise.reject(error),
      ),
      new Promise<"timeout">((resolve) => {
        setTimeout(() => resolve("timeout"), 5_000);
      }),
    ]);
    if (aReady !== "submitted") {
      throw new SupplierPurchaseRequisitionConcurrencyError(
        `SMOKE_CONCURRENT_A_${aReady.toUpperCase()}`,
      );
    }
    operationB = rollback(databaseB, async (transaction) => {
      const sql = transaction as SmokeSql;
      await saveRequisition(
        sql, fixture, ids.concurrentB, 0,
        "requisition-smoke-concurrent-b",
      );
      return submitRequisition(
        sql, fixture, ids.concurrentB, 1,
        "requisition-smoke-concurrent-b-submit",
      );
    });
    const bResult = await observe(operationB, async () => releaseA?.());
    assertSubmitted(bResult, {
      status: "submitted",
      idempotent: false,
      version: 2,
    });
    const aResult = await operationA;
    const rows = await lookup<{ count: number }[]>`
      select count(*)::integer as count
      from public.supplier_purchase_requisitions
      where id in (${ids.concurrentA}::uuid, ${ids.concurrentB}::uuid);
    `;
    if (rows[0]?.count !== 0) {
      throw new SupplierPurchaseRequisitionConcurrencyError(
        "SMOKE_CONCURRENT_FIXTURE_NOT_ROLLED_BACK",
      );
    }
    return aResult;
  } finally {
    releaseA?.();
    await Promise.allSettled([
      ...(operationA ? [operationA] : []),
      ...(operationB ? [operationB] : []),
    ]);
    await Promise.all([
      lookup.close(),
      databaseA.close(),
      databaseB.close(),
    ]);
  }
}
