import {
  seedSupplierFixture,
  selectFixtureReferences,
  type SmokeSql,
} from "./supplier-purchase-order-smoke-fixture";
import {
  cancelRequisition,
  commitmentStatus,
  convertRequisition,
  expectIdempotencyConflict,
  extendFixture,
  reviewRequisition,
  saveRequisition,
  submitRequisition,
} from "./supplier-purchase-requisition-smoke-sql";
import {
  runConcurrentBudgetSmoke,
} from "./supplier-purchase-requisition-smoke-concurrency";
import { explainActiveCommitments } from "./supplier-purchase-requisition-smoke-plan";

export const SMOKE_IDS = {
  requisition: "35000000-0000-4000-8000-000000000001",
  cancellation: "35000000-0000-4000-8000-000000000002",
  conversion: "35000000-0000-4000-8000-000000000003",
  concurrentA: "35000000-0000-4000-8000-000000000004",
  concurrentB: "35000000-0000-4000-8000-000000000005",
  purchaseOrder: "35000000-0000-4000-8000-000000000006",
  costCategory: "35000000-0000-4000-8000-000000000007",
  budget: "35000000-0000-4000-8000-000000000008",
  purchaseOrderConflict: "35000000-0000-4000-8000-000000000009",
  concurrentSupplierA: "35000000-0000-4000-8000-000000000010",
  concurrentSupplierB: "35000000-0000-4000-8000-000000000011",
  concurrentRelationshipA: "35000000-0000-4000-8000-000000000012",
  concurrentRelationshipB: "35000000-0000-4000-8000-000000000013",
  concurrentProductA: "35000000-0000-4000-8000-000000000014",
  concurrentProductB: "35000000-0000-4000-8000-000000000015",
  concurrentSkuA: "35000000-0000-4000-8000-000000000016",
  concurrentSkuB: "35000000-0000-4000-8000-000000000017",
  concurrentPriceListA: "35000000-0000-4000-8000-000000000018",
  concurrentPriceListB: "35000000-0000-4000-8000-000000000019",
  concurrentPriceItemA: "35000000-0000-4000-8000-000000000020",
  concurrentPriceItemB: "35000000-0000-4000-8000-000000000021",
} as const;

export const REQUISITION_SMOKE_SQL_CONTRACTS = {
  save: "public.save_supplier_purchase_requisition_draft",
  submit: "public.submit_supplier_purchase_requisition",
  review: "public.review_supplier_purchase_requisition",
  cancel: "public.cancel_supplier_purchase_requisition",
  convert: "public.convert_supplier_purchase_requisition",
  requisitions: "public.supplier_purchase_requisitions",
  commitments: "public.project_cost_commitments",
  activeCommitmentIndex: "project_cost_commitments_active_lookup_idx",
} as const;

const SUMMARY_KEYS = [
  "save_replay",
  "idempotency_conflict",
  "version_conflict",
  "self_review_rejected",
  "concurrent_budget_serialized",
  "rejection_released",
  "cancellation_released",
  "conversion_unique",
  "cross_tenant_hidden",
  "explain_uses_index",
] as const;

export type SmokeSummary = Record<(typeof SUMMARY_KEYS)[number], boolean>;

type TransactionDatabase<Transaction> = {
  begin<T>(callback: (transaction: Transaction) => Promise<T>): Promise<T>;
};

class ForcedRollback extends Error {}

export class SupplierPurchaseRequisitionSmokeAssertionError extends Error {}

export async function runWithForcedRollback<Transaction, Result>(
  database: TransactionDatabase<Transaction>,
  callback: (transaction: Transaction) => Promise<Result>,
): Promise<Result> {
  const sentinel = new ForcedRollback();
  let result: Result | undefined;
  let failure: unknown;
  let completed = false;
  try {
    await database.begin(async (transaction) => {
      try {
        result = await callback(transaction);
        completed = true;
      } catch (error) {
        failure = error;
      }
      throw sentinel;
    });
  } catch (error) {
    if (error !== sentinel) throw error;
  }
  if (failure !== undefined) throw failure;
  if (!completed) {
    throw new SupplierPurchaseRequisitionSmokeAssertionError(
      "smoke callback did not complete before rollback",
    );
  }
  return result as Result;
}

function record(value: unknown, label: string) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SupplierPurchaseRequisitionSmokeAssertionError(
      `${label} must be an object`,
    );
  }
  return value as Record<string, unknown>;
}

export function assertRequisitionCommandResult(
  value: unknown,
  expected: { status: string; idempotent: boolean; version: number },
) {
  const result = record(value, "requisition command result");
  const requisition = record(result.requisition, "requisition");
  if (typeof requisition.total_amount !== "string") {
    throw new SupplierPurchaseRequisitionSmokeAssertionError(
      "requisition.total_amount must be a string",
    );
  }
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (result[field] !== expectedValue) {
      throw new SupplierPurchaseRequisitionSmokeAssertionError(
        `${field} must equal ${String(expectedValue)}`,
      );
    }
  }
  return Object.assign(result, { requisition });
}

export function assertSmokeSummary(value: unknown): SmokeSummary {
  const summary = record(value, "smoke summary");
  const actualKeys = Object.keys(summary).sort();
  const expectedKeys = [...SUMMARY_KEYS].sort();
  if (actualKeys.join(",") !== expectedKeys.join(",")) {
    const unexpected = actualKeys.find((key) => !expectedKeys.includes(
      key as (typeof SUMMARY_KEYS)[number],
    ));
    throw new SupplierPurchaseRequisitionSmokeAssertionError(
      unexpected ?? "smoke summary fields are incomplete",
    );
  }
  for (const key of SUMMARY_KEYS) {
    if (summary[key] !== true) {
      throw new SupplierPurchaseRequisitionSmokeAssertionError(
        `${key} must be true`,
      );
    }
  }
  return summary as SmokeSummary;
}

export function assertExplainUsesIndex(
  rows: { "QUERY PLAN": string }[],
) {
  const plan = rows.map((row) => row["QUERY PLAN"]).join("\n");
  if (
    !/Bitmap Index Scan|Index Scan/.test(plan) ||
    !plan.includes(REQUISITION_SMOKE_SQL_CONTRACTS.activeCommitmentIndex)
  ) {
    throw new SupplierPurchaseRequisitionSmokeAssertionError(
      `EXPLAIN must use ${
        REQUISITION_SMOKE_SQL_CONTRACTS.activeCommitmentIndex
      }`,
    );
  }
  if (!plan.includes("actual time=") || !plan.includes("Buffers:")) {
    throw new SupplierPurchaseRequisitionSmokeAssertionError(
      "EXPLAIN runtime evidence is required",
    );
  }
  return true;
}

function expectResult(
  value: unknown,
  status: string,
  errorCode?: string,
) {
  const result = record(value, status);
  if (result.status !== status ||
    (errorCode !== undefined && result.error_code !== errorCode)) {
    throw new SupplierPurchaseRequisitionSmokeAssertionError(
      `${status} result did not match expected contract`,
    );
  }
  return result;
}

async function seedFixture(sql: SmokeSql) {
  const base = await selectFixtureReferences(sql);
  await seedSupplierFixture(sql, base);
  return extendFixture(sql, base, SMOKE_IDS.costCategory, SMOKE_IDS.budget);
}

async function executeTransactionalSmoke(sql: SmokeSql) {
  const fixture = await seedFixture(sql);
  const saved = assertRequisitionCommandResult(
    await saveRequisition(
      sql, fixture, SMOKE_IDS.requisition, 0, "requisition-smoke-save",
    ),
    { status: "saved", idempotent: false, version: 1 },
  );
  const replayed = assertRequisitionCommandResult(
    await saveRequisition(
      sql, fixture, SMOKE_IDS.requisition, 0, "requisition-smoke-save",
    ),
    { status: "saved", idempotent: true, version: 1 },
  );
  const idempotencyConflict = await expectIdempotencyConflict(
    sql,
    (savepoint) =>
    saveRequisition(
      savepoint, fixture, SMOKE_IDS.requisition, 0,
      "requisition-smoke-save", 21,
    ),
  );
  const versionConflict = expectResult(
    await saveRequisition(
      sql, fixture, SMOKE_IDS.requisition, 0,
      "requisition-smoke-version",
    ),
    "version_conflict",
    "SUPPLIER_PURCHASE_REQUISITION_VERSION_CONFLICT",
  );
  assertRequisitionCommandResult(
    await submitRequisition(
      sql, fixture, SMOKE_IDS.requisition, 1,
      "requisition-smoke-submit",
    ),
    { status: "submitted", idempotent: false, version: 2 },
  );
  const selfReview = expectResult(
    await reviewRequisition(
      sql, fixture, SMOKE_IDS.requisition, 2, "approve",
      "requisition-smoke-self-review", true,
    ),
    "state_conflict",
    "SUPPLIER_PURCHASE_REQUISITION_SELF_REVIEW",
  );
  assertRequisitionCommandResult(
    await reviewRequisition(
      sql, fixture, SMOKE_IDS.requisition, 2, "reject",
      "requisition-smoke-reject",
    ),
    { status: "rejected", idempotent: false, version: 3 },
  );
  const rejectedStatuses = await commitmentStatus(
    sql, fixture.tenant_id, SMOKE_IDS.requisition,
  );

  await saveRequisition(
    sql, fixture, SMOKE_IDS.cancellation, 0, "requisition-smoke-cancel-save",
  );
  await submitRequisition(
    sql, fixture, SMOKE_IDS.cancellation, 1,
    "requisition-smoke-cancel-submit",
  );
  await cancelRequisition(
    sql, fixture, SMOKE_IDS.cancellation, 2,
    "requisition-smoke-cancel",
  );
  const cancelledStatuses = await commitmentStatus(
    sql, fixture.tenant_id, SMOKE_IDS.cancellation,
  );

  await saveRequisition(
    sql, fixture, SMOKE_IDS.conversion, 0,
    "requisition-smoke-convert-save",
  );
  await submitRequisition(
    sql, fixture, SMOKE_IDS.conversion, 1,
    "requisition-smoke-convert-submit",
  );
  await reviewRequisition(
    sql, fixture, SMOKE_IDS.conversion, 2, "approve",
    "requisition-smoke-convert-approve",
  );
  const converted = assertRequisitionCommandResult(
    await convertRequisition(
      sql, fixture, SMOKE_IDS.conversion, SMOKE_IDS.purchaseOrder, 3,
      "requisition-smoke-convert",
    ),
    { status: "converted", idempotent: false, version: 4 },
  );
  const convertedReplay = assertRequisitionCommandResult(
    await convertRequisition(
      sql, fixture, SMOKE_IDS.conversion, SMOKE_IDS.purchaseOrder, 3,
      "requisition-smoke-convert",
    ),
    { status: "converted", idempotent: true, version: 4 },
  );
  const convertedConflict = expectResult(
    await convertRequisition(
      sql, fixture, SMOKE_IDS.conversion,
      SMOKE_IDS.purchaseOrderConflict, 3,
      "requisition-smoke-convert-conflict",
    ),
    "state_conflict",
    "SUPPLIER_PURCHASE_REQUISITION_ALREADY_CONVERTED",
  );
  const orderRows = await sql<Array<{
    requisition_count: number;
    conflicting_id_count: number;
  }>>`
    select count(*) filter (
      where purchase_order.purchase_requisition_id =
        ${SMOKE_IDS.conversion}::uuid
    )::integer as requisition_count,
    count(*) filter (
      where purchase_order.id = ${SMOKE_IDS.purchaseOrderConflict}::uuid
    )::integer as conflicting_id_count
    from public.supplier_purchase_orders as purchase_order
    where purchase_order.purchase_requisition_id =
        ${SMOKE_IDS.conversion}::uuid
      or purchase_order.id = ${SMOKE_IDS.purchaseOrderConflict}::uuid;
  `;
  const crossTenant = expectResult(
    await cancelRequisition(
      sql, fixture, SMOKE_IDS.conversion, 4,
      "requisition-smoke-cross-tenant", fixture.other_tenant_id,
    ),
    "not_found",
    "SUPPLIER_PURCHASE_REQUISITION_NOT_FOUND",
  );
  return {
    save_replay: saved.version === 1 && replayed.idempotent === true,
    idempotency_conflict: idempotencyConflict,
    version_conflict: versionConflict.version === 1,
    self_review_rejected:
      selfReview.error_code === "SUPPLIER_PURCHASE_REQUISITION_SELF_REVIEW",
    rejection_released:
      rejectedStatuses.length > 0 &&
      rejectedStatuses.every((status) => status === "released"),
    cancellation_released:
      cancelledStatuses.length > 0 &&
      cancelledStatuses.every((status) => status === "released"),
    conversion_unique:
      converted.purchase_order_id === SMOKE_IDS.purchaseOrder &&
      convertedReplay.idempotent === true &&
      convertedConflict.error_code ===
        "SUPPLIER_PURCHASE_REQUISITION_ALREADY_CONVERTED" &&
      orderRows[0]?.requisition_count === 1 &&
      orderRows[0]?.conflicting_id_count === 0,
    cross_tenant_hidden:
      crossTenant.error_code === "SUPPLIER_PURCHASE_REQUISITION_NOT_FOUND" &&
      !("version" in crossTenant),
    explain_uses_index:
      await explainActiveCommitments(sql, fixture, assertExplainUsesIndex),
  };
}

export async function runSupplierPurchaseRequisitionSmoke(
  databaseUrl: string,
): Promise<SmokeSummary> {
  const database = new Bun.SQL(databaseUrl, { max: 1, prepare: false });
  try {
    const transactional = await runWithForcedRollback(
      database,
      (transaction) => executeTransactionalSmoke(transaction as SmokeSql),
    );
    const rollbackRows = await database<{
      remaining_explain_fixture_count: number;
    }[]>`
      select sum(residual.count)::integer as remaining_explain_fixture_count
      from (
        select count(*) from public.supplier_purchase_requisitions
        where id in (
          ${SMOKE_IDS.requisition}::uuid,
          ${SMOKE_IDS.cancellation}::uuid,
          ${SMOKE_IDS.conversion}::uuid
        ) or request_no like 'PR-20990101-%'
        union all
        select count(*) from public.project_cost_commitments
        where source_id in (
          ${SMOKE_IDS.requisition}::uuid,
          ${SMOKE_IDS.cancellation}::uuid,
          ${SMOKE_IDS.conversion}::uuid
        )
        union all
        select count(*) from public.supplier_purchase_orders
        where id in (
          ${SMOKE_IDS.purchaseOrder}::uuid,
          ${SMOKE_IDS.purchaseOrderConflict}::uuid
        )
      ) as residual;
    `;
    if (rollbackRows[0]?.remaining_explain_fixture_count !== 0) {
      throw new SupplierPurchaseRequisitionSmokeAssertionError(
        "transaction fixture was not rolled back",
      );
    }
    return assertSmokeSummary({
      ...transactional,
      concurrent_budget_serialized:
        await runConcurrentBudgetSmoke(
          databaseUrl,
          SMOKE_IDS,
          runWithForcedRollback,
          assertRequisitionCommandResult,
        ),
    });
  } finally {
    await database.close();
  }
}

async function main() {
  const databaseUrl = process.env.SUPABASE_DB_DIRECT_URL ||
    process.env.SUPABASE_DB_URL;
  if (!databaseUrl) {
    console.error("SUPPLIER_PURCHASE_REQUISITION_SMOKE_FAILED");
    process.exitCode = 1;
    return;
  }
  try {
    console.log(JSON.stringify(
      await runSupplierPurchaseRequisitionSmoke(databaseUrl),
    ));
  } catch {
    console.error("SUPPLIER_PURCHASE_REQUISITION_SMOKE_FAILED");
    process.exitCode = 1;
  }
}

if (import.meta.main) void main();
