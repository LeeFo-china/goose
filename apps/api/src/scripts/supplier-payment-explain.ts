import type { TransactionSQL } from "bun";

import { seedSupplierPaymentExplainCardinality } from
  "./supplier-payment-explain-fixture";
import {
  seedSupplierPaymentSmokeFixture,
  type SupplierPaymentSmokeFixture,
  type SupplierPaymentSmokeSql,
} from "./supplier-payment-smoke-fixture";
import {
  assertSupplierPaymentPrerequisites,
  closeDatabasePreservingPrimaryFailure,
  countResidualFixtureRows,
  runRollbackOnly,
} from "./supplier-payment-smoke";
import {
  closeThenCheckFreshResidual,
  type SupplierPaymentFailureState,
} from "./supplier-payment-smoke-residual";

export const EXPECTED_SUPPLIER_PAYMENT_INDEXES = {
  payable: ["supplier_payable_events_tenant_status_query_idx"],
  request: ["supplier_payment_requests_tenant_status_updated_idx"],
  projectCost: [
    "project_cost_events_tenant_project_category_occurred_idx",
  ],
  commitment: ["project_cost_commitments_active_remaining_idx"],
  projectPayable: ["supplier_payable_events_tenant_project_due_idx"],
  cash: ["finance_ledger_entries_tenant_type_occurred_idx"],
} as const;

export type ParsedExplainPlan = {
  indexNames: string[];
  hasRuntimeEvidence: boolean;
};

type ExplainName = keyof typeof EXPECTED_SUPPLIER_PAYMENT_INDEXES;
type ExplainPlanMap = Record<ExplainName, ParsedExplainPlan>;

class SupplierPaymentExplainError extends Error {}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SupplierPaymentExplainError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new SupplierPaymentExplainError("QUERY PLAN must contain JSON");
  }
}

function collectIndexes(nodeValue: unknown, indexNames: string[]): void {
  const node = record(nodeValue, "EXPLAIN plan node");
  if (typeof node["Node Type"] !== "string") {
    throw new SupplierPaymentExplainError("plan node Node Type is required");
  }
  if (
    node["Index Name"] !== undefined &&
    typeof node["Index Name"] !== "string"
  ) {
    throw new SupplierPaymentExplainError("plan Index Name must be a string");
  }
  if (typeof node["Index Name"] === "string") {
    indexNames.push(node["Index Name"]);
  }
  if (node.Plans === undefined) return;
  if (!Array.isArray(node.Plans)) {
    throw new SupplierPaymentExplainError("plan Plans must be an array");
  }
  for (const child of node.Plans) collectIndexes(child, indexNames);
}

export function parseExplainPlan(rowsValue: unknown): ParsedExplainPlan {
  if (!Array.isArray(rowsValue) || rowsValue.length !== 1) {
    throw new SupplierPaymentExplainError(
      "EXPLAIN must return exactly one row",
    );
  }
  const row = record(rowsValue[0], "EXPLAIN row");
  const planJson = parseJson(row["QUERY PLAN"]);
  if (!Array.isArray(planJson) || planJson.length !== 1) {
    throw new SupplierPaymentExplainError(
      "QUERY PLAN must contain exactly one plan",
    );
  }
  const root = record(planJson[0], "EXPLAIN root");
  const indexNames: string[] = [];
  collectIndexes(root.Plan, indexNames);
  return {
    indexNames: [...new Set(indexNames)],
    hasRuntimeEvidence:
      typeof root["Planning Time"] === "number" &&
      typeof root["Execution Time"] === "number",
  };
}

export function assertExplainUsesIndexes(
  plans: ExplainPlanMap,
): true {
  for (
    const name of Object.keys(
      EXPECTED_SUPPLIER_PAYMENT_INDEXES,
    ) as ExplainName[]
  ) {
    const plan = plans[name];
    if (!plan) {
      throw new SupplierPaymentExplainError(
        `${name} EXPLAIN plan is required`,
      );
    }
    if (!plan.hasRuntimeEvidence) {
      throw new SupplierPaymentExplainError(
        `${name} EXPLAIN runtime evidence is required`,
      );
    }
    const used = new Set(plan.indexNames);
    for (const expected of EXPECTED_SUPPLIER_PAYMENT_INDEXES[name]) {
      if (!used.has(expected)) {
        throw new SupplierPaymentExplainError(
          `${name} EXPLAIN must use ${expected}`,
        );
      }
    }
  }
  return true;
}

export async function runExplainChecks(runner: {
  explain(name: ExplainName): Promise<unknown>;
}): Promise<ExplainPlanMap> {
  const plans = {} as ExplainPlanMap;
  for (
    const name of Object.keys(
      EXPECTED_SUPPLIER_PAYMENT_INDEXES,
    ) as ExplainName[]
  ) {
    plans[name] = parseExplainPlan(await runner.explain(name));
  }
  return plans;
}

async function explainQuery(
  sql: SupplierPaymentSmokeSql,
  fixture: SupplierPaymentSmokeFixture,
  name: ExplainName,
): Promise<unknown> {
  switch (name) {
    case "payable":
      return sql`
        explain (analyze, buffers, format json)
        select payable.id, payable.amount, payable.due_at
        from public.supplier_payable_events as payable
        where payable.tenant_id = ${fixture.tenant_id}::uuid
          and payable.project_id = ${fixture.project_id}::uuid
          and payable.tenant_supplier_id = ${fixture.relationship_id}::uuid
          and payable.due_at >=
            '2026-08-30T04:20:00.000Z'::timestamptz
        order by payable.due_at, payable.id
        limit 100;
      `;
    case "request":
      return sql`
        explain (analyze, buffers, format json)
        select request.id, request.status, request.updated_at
        from public.supplier_payment_requests as request
        where request.tenant_id = ${fixture.tenant_id}::uuid
          and request.status = 'pending_approval'
        order by request.updated_at desc, request.id desc
        limit 100;
      `;
    case "projectCost":
      return sql`
        explain (analyze, buffers, format json)
        select cost.id, cost.amount
        from public.project_cost_events as cost
        where cost.tenant_id = ${fixture.tenant_id}::uuid
          and cost.project_id = ${fixture.project_id}::uuid
          and cost.cost_category_id = ${fixture.cost_category_id}::uuid
          and cost.occurred_at >=
            '2026-07-31T04:20:00.000Z'::timestamptz
        order by cost.occurred_at desc, cost.id desc
        limit 100;
      `;
    case "commitment":
      return sql`
        explain (analyze, buffers, format json)
        select sum(greatest(
          commitment.amount - commitment.recognized_amount, 0
        ))
        from public.project_cost_commitments as commitment
        where commitment.tenant_id = ${fixture.tenant_id}::uuid
          and commitment.project_id = ${fixture.project_id}::uuid
          and commitment.cost_category_id =
            ${fixture.cost_category_id}::uuid
          and commitment.status in ('reserved', 'converted');
      `;
    case "projectPayable":
      return sql`
        explain (analyze, buffers, format json)
        select payable.id, payable.amount
        from public.supplier_payable_events as payable
        where payable.tenant_id = ${fixture.tenant_id}::uuid
          and payable.project_id = ${fixture.project_id}::uuid
          and payable.due_at >=
            '2026-08-30T04:20:00.000Z'::timestamptz
        order by payable.due_at, payable.id
        limit 100;
      `;
    case "cash":
      return sql`
        explain (analyze, buffers, format json)
        select sum(ledger.amount)
        from public.finance_ledger_entries as ledger
        where ledger.tenant_id = ${fixture.tenant_id}::uuid
          and ledger.entry_type = 'supplier_payment'
          and ledger.occurred_at >=
            '2026-07-31T04:00:00.000Z'::timestamptz;
      `;
  }
}

export type SupplierPaymentExplainSummary = {
  indexes: Record<ExplainName, string[]>;
  transaction_rolled_back: true;
};

async function countExplainResiduals(sql: Bun.SQL): Promise<number> {
  const rows = await sql<{ count: number }[]>`
    select sum(fact.count)::integer as count
    from (
      select count(*) from public.supplier_purchase_order_receipts
      where receipt_no like 'SMOKE-EXPLAIN-%'
      union all
      select count(*) from public.supplier_purchase_requisitions
      where request_no like 'PR-20991231-%'
      union all
      select count(*) from public.supplier_payment_requests
      where request_no like 'SPR-20991231-%'
      union all
      select count(*) from public.finance_ledger_entries
      where source_id in (
        select md5(
          'supplier-payment-explain-ledger-' || generated.no
        )::uuid
        from generate_series(1, 5000) as generated(no)
      )
      union all
      select count(*) from public.supplier_purchase_order_receipt_items
      where id in (
        select md5(
          'supplier-payment-explain-receipt-item-' || generated.no
        )::uuid
        from generate_series(1, 5000) as generated(no)
      )
      union all
      select count(*) from public.project_cost_events
      where source_id in (
        select md5(
          'supplier-payment-explain-receipt-item-' || generated.no
        )::uuid
        from generate_series(1, 5000) as generated(no)
      )
      union all
      select count(*) from public.supplier_payable_events
      where source_id in (
        select md5(
          'supplier-payment-explain-receipt-item-' || generated.no
        )::uuid
        from generate_series(1, 5000) as generated(no)
      )
      union all
      select count(*) from public.project_cost_commitments
      where source_id in (
        select md5(
          'supplier-payment-explain-requisition-' || generated.no
        )::uuid
        from generate_series(1, 5000) as generated(no)
      )
    ) as fact;
  `;
  const generatedResiduals = rows[0]?.count ?? -1;
  if (generatedResiduals < 0) return generatedResiduals;
  return generatedResiduals + await countResidualFixtureRows(sql);
}

export async function runSupplierPaymentExplain(
  databaseUrl: string,
): Promise<SupplierPaymentExplainSummary> {
  const database = new Bun.SQL(databaseUrl, {
    max: 1,
    prepare: false,
    connectionTimeout: 10,
  });
  let primaryFailure: SupplierPaymentFailureState = { failed: false };
  let summary: SupplierPaymentExplainSummary | undefined;
  let mustCheckResidual = false;
  try {
    await assertSupplierPaymentPrerequisites(database);
    mustCheckResidual = true;
    const plans = await runRollbackOnly<
      TransactionSQL,
      ExplainPlanMap
    >(database, async (transaction) => {
      const sql = transaction as unknown as SupplierPaymentSmokeSql;
      const fixture = await seedSupplierPaymentSmokeFixture(sql);
      await seedSupplierPaymentExplainCardinality(sql, fixture);
      return runExplainChecks({
        explain: (name) => explainQuery(sql, fixture, name),
      });
    });
    assertExplainUsesIndexes(plans);
    const names = Object.keys(EXPECTED_SUPPLIER_PAYMENT_INDEXES) as ExplainName[];
    summary = {
      indexes: Object.fromEntries(
        names.map((name) => [name, plans[name].indexNames]),
      ) as Record<ExplainName, string[]>,
      transaction_rolled_back: true,
    };
  } catch (error) {
    primaryFailure = { failed: true, value: error };
  }
  if (!mustCheckResidual) {
    await closeDatabasePreservingPrimaryFailure(database, primaryFailure);
  } else {
    await closeThenCheckFreshResidual({
      original: database,
      createFresh: () =>
        new Bun.SQL(databaseUrl, {
          max: 1,
          prepare: false,
          connectionTimeout: 10,
        }),
      countResidual: countExplainResiduals,
      primaryFailure,
      label: "supplier payment EXPLAIN rollback fixture",
    });
  }
  if (!summary) {
    throw new SupplierPaymentExplainError(
      "supplier payment EXPLAIN did not complete",
    );
  }
  return summary;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.SUPABASE_DB_DIRECT_URL ??
    process.env.SUPABASE_DB_URL;
  if (!databaseUrl) {
    console.error(
      "SUPPLIER_PAYMENT_SMOKE_PREREQUISITE_MISSING: database URL is required",
    );
    process.exitCode = 1;
    return;
  }
  try {
    console.log(JSON.stringify(await runSupplierPaymentExplain(databaseUrl)));
  } catch (error) {
    console.error(
      error instanceof Error &&
          error.message.startsWith("SUPPLIER_PAYMENT_SMOKE_PREREQUISITE")
        ? error.message
        : "SUPPLIER_PAYMENT_EXPLAIN_FAILED",
    );
    process.exitCode = 1;
  }
}

if (import.meta.main) void main();
