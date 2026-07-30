import type { TransactionSQL } from "bun";

import {
  FULFILLMENT_SMOKE_IDS,
  seedFulfillmentFixture,
  type FulfillmentSmokeSql,
} from "./supplier-purchase-fulfillment-smoke-fixture";
import {
  assertErrorEnvelope,
  assertFulfillmentFacts,
  assertFulfillmentCommandResult,
  cancelOrderAfterShipment,
  confirmFulfillment,
  createReceipt,
  createShipment,
  createStaleVersionShipment,
  expectIdempotencyConflict,
  SupplierPurchaseFulfillmentSmokeAssertionError,
} from "./supplier-purchase-fulfillment-smoke-commands";

const SUMMARY_KEYS = [
  "confirmed",
  "confirmation_idempotent",
  "shipment_created",
  "shipment_idempotency_conflict",
  "over_shipment_blocked",
  "premature_receipt_blocked",
  "partial_receipt_created",
  "over_receipt_blocked",
  "variance_reason_required",
  "final_receipt_created",
  "accepted_amount_correct",
  "cancellation_after_shipment_blocked",
  "tenant_isolation",
  "transaction_rolled_back",
] as const;

type SmokeCheck = typeof SUMMARY_KEYS[number];
export type SupplierPurchaseFulfillmentSmokeSummary =
  Record<SmokeCheck, boolean>;
type PreRollbackSummary = Omit<
  SupplierPurchaseFulfillmentSmokeSummary,
  "transaction_rolled_back"
>;

type TransactionExecutor<Transaction> = {
  begin<T>(callback: (transaction: Transaction) => Promise<T>): Promise<T>;
};
type CloseableDatabase = { close(): Promise<void> };
type PrimaryFailure =
  | { failed: false }
  | { failed: true; value: unknown };

class RollbackSentinel extends Error {}

export async function runRollbackOnly<Transaction, Result>(
  executor: TransactionExecutor<Transaction>,
  callback: (transaction: Transaction) => Promise<Result>,
): Promise<Result> {
  const sentinel = new RollbackSentinel();
  let callbackResult: Result | undefined;
  let callbackError: unknown;
  let callbackCompleted = false;
  let callbackFailed = false;
  let rollbackObserved = false;

  try {
    await executor.begin(async (transaction) => {
      try {
        callbackResult = await callback(transaction);
        callbackCompleted = true;
      } catch (error) {
        callbackFailed = true;
        callbackError = error;
      }
      throw sentinel;
    });
  } catch (error) {
    if (error !== sentinel) throw error;
    rollbackObserved = true;
  }

  if (!rollbackObserved) {
    throw new SupplierPurchaseFulfillmentSmokeAssertionError(
      "transaction executor did not propagate the rollback sentinel",
    );
  }
  if (callbackFailed) throw callbackError;
  if (!callbackCompleted) {
    throw new SupplierPurchaseFulfillmentSmokeAssertionError(
      "smoke assertions did not complete before rollback",
    );
  }
  return callbackResult as Result;
}

export async function closeDatabasePreservingPrimaryFailure(
  database: CloseableDatabase,
  primaryFailure: PrimaryFailure,
) {
  try {
    await database.close();
  } catch (closeError) {
    if (!primaryFailure.failed) throw closeError;
  }
  if (primaryFailure.failed) throw primaryFailure.value;
}

export function assertSupplierPurchaseFulfillmentSmokeSummary(
  value: unknown,
): SupplierPurchaseFulfillmentSmokeSummary {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SupplierPurchaseFulfillmentSmokeAssertionError(
      "smoke summary must be an object",
    );
  }
  const record = value as Record<string, unknown>;
  const actualKeys = Object.keys(record).sort();
  const expectedKeys = [...SUMMARY_KEYS].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new SupplierPurchaseFulfillmentSmokeAssertionError(
      "smoke summary must contain exactly 14 checks",
    );
  }
  for (const key of SUMMARY_KEYS) {
    if (typeof record[key] !== "boolean" || record[key] !== true) {
      throw new SupplierPurchaseFulfillmentSmokeAssertionError(
        `${key} must be true`,
      );
    }
  }
  return record as SupplierPurchaseFulfillmentSmokeSummary;
}

async function executeSmoke(
  sql: FulfillmentSmokeSql,
): Promise<PreRollbackSummary> {
  const fixture = await seedFulfillmentFixture(sql);

  assertErrorEnvelope(
    await confirmFulfillment(
      sql,
      fixture,
      "fulfillment-smoke-other-tenant",
      {
        tenantId: fixture.other_tenant_id,
        userId: fixture.other_user_id,
        employeeId: fixture.other_employee_id,
      },
    ),
    "not_found",
    "SUPPLIER_PURCHASE_ORDER_NOT_FOUND",
  );

  assertFulfillmentCommandResult(
    await confirmFulfillment(
      sql,
      fixture,
      "fulfillment-smoke-confirm",
    ),
    {
      status: "confirmed",
      idempotent: false,
      version: 1,
      fulfillmentStatus: "confirmed",
    },
  );
  assertFulfillmentCommandResult(
    await confirmFulfillment(
      sql,
      fixture,
      "fulfillment-smoke-confirm",
    ),
    {
      status: "confirmed",
      idempotent: true,
      version: 1,
      fulfillmentStatus: "confirmed",
    },
  );

  assertErrorEnvelope(
    await createReceipt(sql, fixture, {
      id: FULFILLMENT_SMOKE_IDS.prematureReceipt,
      version: 1,
      number: "SMOKE-PREMATURE-RECEIPT",
      acceptedQuantity: 1,
      rejectedQuantity: 0,
      varianceReason: null,
      idempotencyKey: "fulfillment-smoke-premature-receipt",
    }),
    "over_received",
    "OVER_RECEIVED",
  );

  assertFulfillmentCommandResult(
    await createShipment(sql, fixture, {
      id: FULFILLMENT_SMOKE_IDS.shipment,
      version: 1,
      number: "SMOKE-SHIPMENT-1",
      quantity: 10,
      idempotencyKey: "fulfillment-smoke-shipment",
    }),
    {
      status: "shipment_created",
      idempotent: false,
      version: 2,
      fulfillmentStatus: "shipped",
    },
  );
  assertErrorEnvelope(
    await createStaleVersionShipment(sql, fixture),
    "version_conflict",
    "FULFILLMENT_VERSION_CONFLICT",
  );
  await expectIdempotencyConflict(sql, (savepoint) =>
    createShipment(savepoint, fixture, {
      id: FULFILLMENT_SMOKE_IDS.shipment,
      version: 1,
      number: "SMOKE-SHIPMENT-1",
      quantity: 9,
      idempotencyKey: "fulfillment-smoke-shipment",
    })
  );
  assertErrorEnvelope(
    await createShipment(sql, fixture, {
      id: FULFILLMENT_SMOKE_IDS.overShipment,
      version: 2,
      number: "SMOKE-SHIPMENT-OVER",
      quantity: 1,
      idempotencyKey: "fulfillment-smoke-over-shipment",
    }),
    "over_shipped",
    "OVER_SHIPPED",
  );

  assertFulfillmentCommandResult(
    await createReceipt(sql, fixture, {
      id: FULFILLMENT_SMOKE_IDS.partialReceipt,
      version: 2,
      number: "SMOKE-RECEIPT-PARTIAL",
      acceptedQuantity: 3,
      rejectedQuantity: 0,
      varianceReason: null,
      idempotencyKey: "fulfillment-smoke-partial-receipt",
    }),
    {
      status: "receipt_created",
      idempotent: false,
      version: 3,
      fulfillmentStatus: "partially_received",
    },
  );
  assertErrorEnvelope(
    await createReceipt(sql, fixture, {
      id: FULFILLMENT_SMOKE_IDS.overReceipt,
      version: 3,
      number: "SMOKE-RECEIPT-OVER",
      acceptedQuantity: 8,
      rejectedQuantity: 0,
      varianceReason: null,
      idempotencyKey: "fulfillment-smoke-over-receipt",
    }),
    "over_received",
    "OVER_RECEIVED",
  );
  assertErrorEnvelope(
    await createReceipt(sql, fixture, {
      id: FULFILLMENT_SMOKE_IDS.missingVarianceReceipt,
      version: 3,
      number: "SMOKE-RECEIPT-MISSING-VARIANCE",
      acceptedQuantity: 0,
      rejectedQuantity: 1,
      varianceReason: null,
      idempotencyKey: "fulfillment-smoke-missing-variance",
    }),
    "variance_reason_required",
    "VARIANCE_REASON_REQUIRED",
  );
  assertFulfillmentCommandResult(
    await createReceipt(sql, fixture, {
      id: FULFILLMENT_SMOKE_IDS.finalReceipt,
      version: 3,
      number: "SMOKE-RECEIPT-FINAL",
      acceptedQuantity: 6,
      rejectedQuantity: 1,
      varianceReason: "运输破损",
      idempotencyKey: "fulfillment-smoke-final-receipt",
    }),
    {
      status: "receipt_created",
      idempotent: false,
      version: 4,
      fulfillmentStatus: "received_with_variance",
    },
  );

  const factRows = await sql<Record<string, unknown>[]>`
    select
      fulfillment.ordered_quantity::text,
      fulfillment.shipped_quantity::text,
      fulfillment.received_quantity::text,
      fulfillment.accepted_quantity::text,
      fulfillment.rejected_quantity::text,
      fulfillment.accepted_subtotal_amount::text,
      fulfillment.accepted_tax_amount::text,
      fulfillment.accepted_total_amount::text
    from public.supplier_purchase_order_fulfillments as fulfillment
    where fulfillment.tenant_id = ${fixture.tenant_id}::uuid
      and fulfillment.supplier_purchase_order_id =
        ${FULFILLMENT_SMOKE_IDS.order}::uuid;
  `;
  if (factRows.length !== 1) {
    throw new SupplierPurchaseFulfillmentSmokeAssertionError(
      "fulfillment facts must have exactly one row",
    );
  }
  assertFulfillmentFacts(factRows[0], {
    ordered: "10.0000",
    shipped: "10.0000",
    received: "10.0000",
    accepted: "9.0000",
    rejected: "1.0000",
    subtotal: "79.65",
    tax: "10.35",
    total: "90.00",
  });

  assertErrorEnvelope(
    await cancelOrderAfterShipment(sql, fixture),
    "state_conflict",
    "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_STARTED",
  );

  return {
    confirmed: true,
    confirmation_idempotent: true,
    shipment_created: true,
    shipment_idempotency_conflict: true,
    over_shipment_blocked: true,
    premature_receipt_blocked: true,
    partial_receipt_created: true,
    over_receipt_blocked: true,
    variance_reason_required: true,
    final_receipt_created: true,
    accepted_amount_correct: true,
    cancellation_after_shipment_blocked: true,
    tenant_isolation: true,
  };
}

export async function runSupplierPurchaseFulfillmentSmoke(
  databaseUrl: string,
): Promise<SupplierPurchaseFulfillmentSmokeSummary> {
  const database = new Bun.SQL(databaseUrl, { prepare: false });
  let summary: SupplierPurchaseFulfillmentSmokeSummary | undefined;
  let completed = false;
  let primaryFailure: PrimaryFailure = { failed: false };
  try {
    const checks = await runRollbackOnly<
      TransactionSQL,
      PreRollbackSummary
    >(
      database,
      (transaction) =>
        executeSmoke(transaction as unknown as FulfillmentSmokeSql),
    );
    const rows = await database<{ count: number }[]>`
      select count(*)::integer as count
      from (
        select purchase_order.id
        from public.supplier_purchase_orders as purchase_order
        where purchase_order.id = ${FULFILLMENT_SMOKE_IDS.order}::uuid
        union all
        select shipment.id
        from public.supplier_purchase_order_shipments as shipment
        where shipment.id = ${FULFILLMENT_SMOKE_IDS.shipment}::uuid
        union all
        select receipt.id
        from public.supplier_purchase_order_receipts as receipt
        where receipt.id in (
          ${FULFILLMENT_SMOKE_IDS.partialReceipt}::uuid,
          ${FULFILLMENT_SMOKE_IDS.finalReceipt}::uuid
        )
      ) as smoke_facts;
    `;
    summary = assertSupplierPurchaseFulfillmentSmokeSummary({
      ...checks,
      transaction_rolled_back: rows[0]?.count === 0,
    });
    completed = true;
  } catch (error) {
    primaryFailure = { failed: true, value: error };
  }
  await closeDatabasePreservingPrimaryFailure(database, primaryFailure);
  if (!completed || summary === undefined) {
    throw new SupplierPurchaseFulfillmentSmokeAssertionError(
      "smoke did not complete before database close",
    );
  }
  return summary;
}

async function main() {
  const databaseUrl = process.env.SUPABASE_DB_DIRECT_URL;
  if (!databaseUrl) {
    console.error(
      "SUPPLIER_PURCHASE_FULFILLMENT_SMOKE_FAILED: " +
        "SUPABASE_DB_DIRECT_URL is required",
    );
    process.exitCode = 1;
    return;
  }
  try {
    console.log(
      JSON.stringify(await runSupplierPurchaseFulfillmentSmoke(databaseUrl)),
    );
  } catch {
    console.error("SUPPLIER_PURCHASE_FULFILLMENT_SMOKE_FAILED");
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  void main();
}
