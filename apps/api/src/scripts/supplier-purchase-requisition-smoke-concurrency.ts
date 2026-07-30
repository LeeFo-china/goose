import type { SmokeSql } from "./supplier-purchase-order-smoke-fixture";
import {
  cleanupConcurrentBudgetResources,
  readBackendPid,
  waitForBudgetAdvisoryLock,
  waitForFirstSubmission,
  waitForOperationCompletion,
  waitForSavedBackendPid,
} from "./supplier-purchase-requisition-smoke-budget-lock";
import {
  commitmentEvidence,
  countConcurrentFixtureRows,
  saveRequisition,
  submitRequisition,
  type RequisitionSmokeFixture,
} from "./supplier-purchase-requisition-smoke-sql";
import type {
  assertRequisitionCommandResult,
  runWithForcedRollback,
} from "./supplier-purchase-requisition-smoke";

type ConcurrentIds = {
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

type BudgetEvidenceSide = {
  requisition: Record<string, unknown>;
  commitments: Array<{
    status: string;
    amount: string;
    available_amount_snapshot: string;
  }>;
};

type ConcurrentBudgetEvidence = { a: BudgetEvidenceSide; b: BudgetEvidenceSide };
type SubmittedBudgetEvidence = {
  commandResult: Record<string, unknown>; evidence: BudgetEvidenceSide;
};

class SupplierPurchaseRequisitionConcurrencyError extends Error {}

function cents(value: unknown, label: string) {
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new SupplierPurchaseRequisitionConcurrencyError(
      `${label} must be a monetary string`,
    );
  }
  return Math.round(Number(value) * 100);
}

function assertAffordableReservedSide(side: BudgetEvidenceSide, label: string) {
  if (side.requisition.budget_status !== "within_budget") {
    throw new SupplierPurchaseRequisitionConcurrencyError(
      `${label} budget_status must be within_budget`,
    );
  }
  if (side.commitments.length === 0 ||
    side.commitments.some(({ status }) => status !== "reserved")) {
    throw new SupplierPurchaseRequisitionConcurrencyError(
      `${label} commitments must be reserved`,
    );
  }
  const total = cents(side.requisition.total_amount, `${label} total`);
  const reserved = side.commitments.reduce(
    (sum, commitment) => sum + cents(commitment.amount, `${label} amount`),
    0,
  );
  const available = side.commitments.reduce(
    (sum, commitment) =>
      sum + cents(
        commitment.available_amount_snapshot,
        `${label} available`,
      ),
    0,
  );
  if (reserved !== total || total > available) {
    throw new SupplierPurchaseRequisitionConcurrencyError(
      `${label} must be individually affordable and fully reserved`,
    );
  }
  return { total, available };
}

export function assertConcurrentBudgetEvidence(
  evidence: ConcurrentBudgetEvidence,
) {
  if (evidence.a.requisition.supplier_id ===
    evidence.b.requisition.supplier_id) {
    throw new SupplierPurchaseRequisitionConcurrencyError(
      "concurrent submissions must use distinct suppliers",
    );
  }
  const a = assertAffordableReservedSide(evidence.a, "A");
  const b = assertAffordableReservedSide(evidence.b, "B");
  if (a.total + b.total <= Math.min(a.available, b.available)) {
    throw new SupplierPurchaseRequisitionConcurrencyError(
      "combined submissions must exceed the shared available budget",
    );
  }
  return true;
}

async function findConcurrentFixture(
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
      join lateral (select id from public.catalog_brands where status = 'active' order by id limit 1) as catalog_brand on true
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
    throw new SupplierPurchaseRequisitionConcurrencyError(
      "SMOKE_CONCURRENT_FIXTURE_MISSING",
    );
  }
  return rows[0];
}

async function seedConcurrentSupplier(
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
      started_at, created_by_employee_id, updated_by_employee_id
    ) values (
      ${ids.relationship}::uuid, ${fixture.tenant_id}::uuid,
      ${ids.supplier}::uuid, 'active', 'CNY', current_date,
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
      created_by_employee_id, updated_by_employee_id
    ) values (
      ${ids.sku}::uuid, ${ids.supplier}::uuid, ${ids.product}::uuid,
      ${`SMOKE-REQ-SKU-${label}`}, ${`采购申请并发 SKU ${label}`},
      ${fixture.catalog_unit_id}::uuid, ${fixture.catalog_unit_id}::uuid,
      1, 'active', ${fixture.tenant_id}::uuid,
      ${fixture.employee_id}::uuid, '采购申请并发 smoke',
      ${fixture.employee_id}::uuid, ${fixture.employee_id}::uuid
    );
  `;
  await sql`
    update public.supplier_products
    set status = 'active', version = version + 1
    where id = ${ids.product}::uuid;
  `;
  await sql`
    insert into public.supplier_price_lists (
      id, supplier_id, price_list_code, version_number, name, currency,
      lifecycle_status, effective_from, acting_tenant_id, acting_employee_id,
      proxy_reason, created_by_employee_id, updated_by_employee_id
    ) values (
      ${ids.priceList}::uuid, ${ids.supplier}::uuid,
      ${`SMOKE-REQ-PRICE-${label}`}, 1, ${`采购申请并发价格 ${label}`},
      'CNY', 'draft', now() - interval '1 day',
      ${fixture.tenant_id}::uuid, ${fixture.employee_id}::uuid,
      '采购申请并发 smoke',
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
      ${ids.priceItem}::uuid, ${ids.supplier}::uuid, ${ids.priceList}::uuid,
      ${ids.sku}::uuid, 1, ${fixture.catalog_unit_id}::uuid,
      ${fixture.catalog_unit_id}::uuid, 1,
      ${fixture.requisition_amount}::numeric, 0, true,
      ${fixture.tenant_id}::uuid, ${fixture.employee_id}::uuid,
      '采购申请并发 smoke',
      ${fixture.employee_id}::uuid, ${fixture.employee_id}::uuid
    );
  `;
  await sql`
    update public.supplier_price_lists
    set lifecycle_status = 'published', published_at = now(),
      row_version = row_version + 1
    where id = ${ids.priceList}::uuid;
  `;
  const eligibility = await sql<{ eligible: boolean }[]>`
    select eligible
    from public.get_tenant_supplier_order_eligibility_set(
      ${fixture.tenant_id}::uuid, now(), ${ids.relationship}::uuid
    )
    where supplier_id = ${ids.supplier}::uuid;
  `;
  if (eligibility[0]?.eligible !== true) {
    throw new SupplierPurchaseRequisitionConcurrencyError(
      `SMOKE_CONCURRENT_SUPPLIER_${label}_NOT_ELIGIBLE`,
    );
  }
  return {
    ...fixture,
    relationship_id: ids.relationship,
    sku_id: ids.sku,
  };
}

function supplierIds(ids: ConcurrentIds, side: "A" | "B") {
  return {
    supplier: ids[`concurrentSupplier${side}`],
    relationship: ids[`concurrentRelationship${side}`],
    product: ids[`concurrentProduct${side}`],
    sku: ids[`concurrentSku${side}`],
    priceList: ids[`concurrentPriceList${side}`],
    priceItem: ids[`concurrentPriceItem${side}`],
  };
}

export async function runConcurrentBudgetSmoke(
  databaseUrl: string,
  ids: ConcurrentIds,
  rollback: typeof runWithForcedRollback,
  assertSubmitted: typeof assertRequisitionCommandResult,
) {
  const lookup = new Bun.SQL(databaseUrl, { max: 1, prepare: false });
  const databaseA = new Bun.SQL(databaseUrl, { max: 1, prepare: false });
  const databaseB = new Bun.SQL(databaseUrl, { max: 1, prepare: false });
  let releaseA: (() => void) | undefined;
  let activeOperationA: Promise<SubmittedBudgetEvidence> | undefined;
  let activeOperationB: Promise<SubmittedBudgetEvidence> | undefined;
  let primaryFailure: unknown;
  try {
    const base = await findConcurrentFixture(lookup as SmokeSql);
    let markASubmitted!: () => void;
    let markBSaved!: (pid: number) => void;
    const holdA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    const aSubmitted = new Promise<void>((resolve) => {
      markASubmitted = resolve;
    });
    const bSaved = new Promise<number>((resolve) => {
      markBSaved = resolve;
    });
    const operationA = activeOperationA = rollback(databaseA, async (transaction) => {
      const sql = transaction as SmokeSql;
      const fixture = await seedConcurrentSupplier(
        sql, base, supplierIds(ids, "A"), "A",
      );
      assertSubmitted(
        await saveRequisition(
          sql, fixture, ids.concurrentA, 0,
          "requisition-smoke-concurrent-a", 1,
        ),
        { status: "saved", idempotent: false, version: 1 },
      );
      const submitted = assertSubmitted(
        await submitRequisition(
          sql, fixture, ids.concurrentA, 1,
          "requisition-smoke-concurrent-a-submit",
        ),
        { status: "submitted", idempotent: false, version: 2 },
      );
      const commitments = await commitmentEvidence(
        sql, fixture.tenant_id, ids.concurrentA,
      );
      markASubmitted();
      await holdA;
      return {
        commandResult: submitted,
        evidence: { requisition: submitted.requisition, commitments },
      };
    });
    const aReady = await waitForFirstSubmission(aSubmitted, operationA);
    if (aReady !== "submitted") {
      throw new SupplierPurchaseRequisitionConcurrencyError(
        `SMOKE_CONCURRENT_A_${aReady.toUpperCase()}`,
      );
    }
    const operationB = activeOperationB = rollback(databaseB, async (transaction) => {
      const sql = transaction as SmokeSql;
      const fixture = await seedConcurrentSupplier(
        sql, base, supplierIds(ids, "B"), "B",
      );
      assertSubmitted(
        await saveRequisition(
          sql, fixture, ids.concurrentB, 0,
          "requisition-smoke-concurrent-b", 1,
        ),
        { status: "saved", idempotent: false, version: 1 },
      );
      markBSaved(await readBackendPid(sql));
      const submitted = assertSubmitted(
        await submitRequisition(
          sql, fixture, ids.concurrentB, 1,
          "requisition-smoke-concurrent-b-submit",
        ),
        { status: "submitted", idempotent: false, version: 2 },
      );
      return {
        commandResult: submitted,
        evidence: {
          requisition: submitted.requisition,
          commitments: await commitmentEvidence(
            sql, fixture.tenant_id, ids.concurrentB,
          ),
        },
      };
    });
    const bPid = await waitForSavedBackendPid(bSaved, operationB);
    await waitForBudgetAdvisoryLock(lookup as SmokeSql, {
      pid: bPid,
      tenantId: base.tenant_id,
      projectId: base.project_id,
    });
    releaseA?.();
    const bResult = await waitForOperationCompletion(operationB);
    assertSubmitted(bResult.commandResult, {
      status: "submitted",
      idempotent: false,
      version: 2,
    });
    const aResult = await operationA;
    const remainingFixtureCount = await countConcurrentFixtureRows(
      lookup as SmokeSql,
      ids,
    );
    if (remainingFixtureCount !== 0) {
      throw new SupplierPurchaseRequisitionConcurrencyError(
        "SMOKE_CONCURRENT_FIXTURE_NOT_ROLLED_BACK",
      );
    }
    return assertConcurrentBudgetEvidence({
      a: aResult.evidence,
      b: bResult.evidence,
    });
  } catch (error) {
    primaryFailure = error;
    throw error;
  } finally {
    releaseA?.();
    await cleanupConcurrentBudgetResources({
      operations: [activeOperationA, activeOperationB],
      connections: [lookup, databaseA, databaseB],
      primaryFailure,
    });
  }
}
