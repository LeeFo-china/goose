import type { TransactionSQL } from "bun";

import {
  countRuntimeOrders,
  createRuntimeBatchSmokeFixture,
  requireSmokeRecord,
  reviewRuntimeBatch,
  saveRuntimeBatch,
  seedRuntimeBatchSmokeFixture,
  type BatchSmokeFixture,
} from "./supplier-purchase-batch-smoke-fixture";
import { assertLocalSupplierPurchaseBatchDatabaseUrl } from
  "./supplier-purchase-batch-local-db";
import { assertSupplierPurchaseBatchDriftMatrix } from
  "./supplier-purchase-batch-drift";
import { assertSecondOrderAtomicRollback } from
  "./supplier-purchase-batch-atomicity";

export const SUPPLIER_PURCHASE_BATCH_SMOKE_MANIFEST = {
  happyPath: {
    supplierCount: 2,
    skuCount: 3,
    costCategoryCount: 2,
    exactSubmittedOrderCount: 2,
    oneOrderPerSupplier: true,
    sameSupplierMultipleSkusStayTogether: true,
    wholeBatchBudgetAggregation: true,
  },
  replay: { sameResult: true, duplicateSideEffects: 0 },
  driftMatrix: [
    ["price_changed", "SUPPLIER_PURCHASE_BATCH_PRICE_CHANGED", [0, 1]],
    ["missing_price", "SUPPLIER_PURCHASE_BATCH_PRICE_CHANGED", [0, 1]],
    ["supplier_suspended", "SUPPLIER_PURCHASE_BATCH_SUPPLIER_INELIGIBLE", [0]],
    ["product_inactive", "SUPPLIER_PURCHASE_BATCH_PRICE_CHANGED", [0]],
    ["sku_inactive", "SUPPLIER_PURCHASE_BATCH_PRICE_CHANGED", [2]],
    ["category_inactive", "SUPPLIER_PURCHASE_BATCH_PRICE_CHANGED", [0, 1, 2]],
    ["budget_changed", "SUPPLIER_PURCHASE_BATCH_BUDGET_CHANGED", [0, 1]],
  ],
  revision: {
    persistedAsDraft: true,
    versionIncremented: true,
    fullBlockerList: true,
    zeroOrders: true,
  },
  injectedFailure: {
    failAtOrder: 2,
    transactionRolledBack: true,
    exactOrderCount: 0,
    batchStatusAndVersionUnchanged: true,
    currentRequisitionStatus: "pending_approval",
    purchaseOrderId: null,
    commitmentStatus: "reserved",
    recognizedAmount: "0.00",
    exactReviewEventCount: 0,
  },
} as const;

export function createSupplierPurchaseBatchSmokeFixture(token: string) {
  return {
    tenantToken: `supplier-purchase-batch:${token}`,
    suppliers: [{ key: "supplier-a" }, { key: "supplier-b" }],
    skus: [
      { key: "sku-a1", supplierKey: "supplier-a" },
      { key: "sku-a2", supplierKey: "supplier-a" },
      { key: "sku-b1", supplierKey: "supplier-b" },
    ],
    costCategories: [{ key: "cost-a" }, { key: "cost-b" }],
    cleanup: { strategy: "rollback", scoped: true },
  } as const;
}

class ForcedRollback extends Error {}

async function runWithRollback<Result>(
  database: Bun.SQL,
  callback: (sql: TransactionSQL) => Promise<Result>,
): Promise<Result> {
  const marker = new ForcedRollback();
  let result: Result | undefined;
  let failure: unknown;
  try {
    await database.begin(async (transaction) => {
      try {
        result = await callback(transaction);
      } catch (error) {
        failure = error;
      }
      throw marker;
    });
  } catch (error) {
    if (error !== marker) throw error;
  }
  if (failure !== undefined) throw failure;
  if (result === undefined) throw new Error("BATCH_SMOKE_NO_RESULT");
  return result;
}

function expectStatus(value: unknown, status: string, label: string) {
  const result = requireSmokeRecord(value, label);
  if (result.status !== status) {
    throw new Error(`${label}:${JSON.stringify(result)}`);
  }
  return result;
}

async function assertHappyPath(
  sql: TransactionSQL,
  fixture: BatchSmokeFixture,
) {
  const batchId = crypto.randomUUID();
  fixture.batchIds.push(batchId);
  const first = expectStatus(
    await saveRuntimeBatch(sql, fixture, batchId, "happy:save"),
    "saved",
    "happy save",
  );
  const replay = expectStatus(
    await saveRuntimeBatch(sql, fixture, batchId, "happy:save"),
    "saved",
    "happy replay",
  );
  if (first.idempotent !== false || replay.idempotent !== true) {
    throw new Error("BATCH_SMOKE_SAVE_REPLAY_INVALID");
  }
  const submittedRows = await sql<{ result: unknown }[]>`
    select public.submit_supplier_purchase_batch(
      ${batchId}::uuid, ${fixture.tenantId}::uuid, 1,
      ${fixture.actorUserId}::uuid, ${fixture.actorEmployeeId}::uuid,
      'happy:submit'
    ) as result;
  `;
  const submitted = expectStatus(
    submittedRows[0]?.result,
    "submitted",
    "happy submit",
  );
  const submittedBatch = requireSmokeRecord(submitted.batch, "submitted batch");
  const snapshot = requireSmokeRecord(
    submittedBatch.budget_snapshot,
    "budget snapshot",
  );
  const categoryA = requireSmokeRecord(
    snapshot[fixture.costCategoryIds[0]],
    "category A budget",
  );
  const categoryB = requireSmokeRecord(
    snapshot[fixture.costCategoryIds[1]],
    "category B budget",
  );
  if (
    categoryA.requested_amount !== "140.00" ||
    categoryB.requested_amount !== "60.00"
  ) throw new Error("BATCH_SMOKE_BUDGET_AGGREGATION_INVALID");

  const ordered = expectStatus(
    await reviewRuntimeBatch(sql, fixture, batchId, "happy:review"),
    "ordered",
    "happy review",
  );
  if (!Array.isArray(ordered.orders) || ordered.orders.length !== 2) {
    throw new Error("BATCH_SMOKE_EXACT_TWO_ORDERS_REQUIRED");
  }
  const groupRows = await sql<{
    tenant_supplier_id: string;
    item_count: number;
  }[]>`
    select purchase_order.tenant_supplier_id,
      count(order_item.id)::integer as item_count
    from public.supplier_purchase_orders as purchase_order
    join public.supplier_purchase_order_items as order_item
      on order_item.supplier_purchase_order_id = purchase_order.id
      and order_item.tenant_id = purchase_order.tenant_id
    where purchase_order.tenant_id = ${fixture.tenantId}::uuid
      and purchase_order.purchase_batch_id = ${batchId}::uuid
      and purchase_order.status = 'submitted'
    group by purchase_order.tenant_supplier_id
    order by purchase_order.tenant_supplier_id
    limit 3;
  `;
  const counts = new Map(groupRows.map((row) => [
    row.tenant_supplier_id,
    row.item_count,
  ]));
  if (
    groupRows.length !== 2 || counts.get(fixture.relationshipIds[0]) !== 2 ||
    counts.get(fixture.relationshipIds[1]) !== 1
  ) throw new Error("BATCH_SMOKE_SUPPLIER_SPLIT_INVALID");
  const reviewReplay = expectStatus(
    await reviewRuntimeBatch(sql, fixture, batchId, "happy:review"),
    "ordered",
    "happy review replay",
  );
  if (
    reviewReplay.idempotent !== true ||
    await countRuntimeOrders(sql, fixture, batchId) !== 2
  ) throw new Error("BATCH_SMOKE_REVIEW_REPLAY_INVALID");
}

export type SupplierPurchaseBatchSmokeSummary = {
  split_orders: 2;
  replay_safe: true;
  missing_price_revision: true;
  full_revision_blockers: true;
  second_order_failure_rolled_back: true;
  fixture_rolled_back: true;
};

export async function runSupplierPurchaseBatchSmoke(
  databaseUrl: string | undefined,
): Promise<SupplierPurchaseBatchSmokeSummary> {
  const localDatabaseUrl = assertLocalSupplierPurchaseBatchDatabaseUrl(
    databaseUrl,
  );
  const database = new Bun.SQL(localDatabaseUrl, { max: 1, prepare: false });
  const runToken = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  let fixture: BatchSmokeFixture | undefined;
  try {
    const result = await runWithRollback(database, async (sql) => {
      fixture = await createRuntimeBatchSmokeFixture(sql, runToken);
      await seedRuntimeBatchSmokeFixture(sql, fixture);
      await assertHappyPath(sql, fixture);
      await assertSupplierPurchaseBatchDriftMatrix(sql, fixture);
      await assertSecondOrderAtomicRollback(sql, fixture);
      return true;
    });
    const residualRows = await database<{ count: number }[]>`
      select count(*)::integer as count from public.employees
      where id = ${fixture?.actorEmployeeId ?? null}::uuid limit 1;
    `;
    if (!result || residualRows[0]?.count !== 0) {
      throw new Error("BATCH_SMOKE_FIXTURE_NOT_ROLLED_BACK");
    }
    return {
      split_orders: 2,
      replay_safe: true,
      missing_price_revision: true,
      full_revision_blockers: true,
      second_order_failure_rolled_back: true,
      fixture_rolled_back: true,
    };
  } finally {
    await database.close();
  }
}

if (import.meta.main) {
  const databaseUrl = process.env.SUPABASE_DB_DIRECT_URL ??
    process.env.SUPABASE_DB_URL;
  runSupplierPurchaseBatchSmoke(databaseUrl)
    .then((summary) => console.log(JSON.stringify(summary)))
    .catch(() => {
      console.error("SUPPLIER_PURCHASE_BATCH_SMOKE_FAILED");
      process.exitCode = 1;
    });
}
