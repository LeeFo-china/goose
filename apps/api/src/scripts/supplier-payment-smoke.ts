import type { TransactionSQL } from "bun";

import {
  SUPPLIER_PAYMENT_BASE_IDS,
  SUPPLIER_PAYMENT_SMOKE_IDS,
  seedSupplierPaymentSmokeFixture,
  type SupplierPaymentSmokeSql,
} from "./supplier-payment-smoke-fixture";
import { SupplierPaymentSmokeAssertionError } from
  "./supplier-payment-smoke-commands";
import { executeSupplierPaymentSmokeScenario } from
  "./supplier-payment-smoke-scenario";
import {
  assertCommittedConcurrencyConfig,
  runConcurrentRequestProbe,
  runConcurrentSubmitOverlap,
} from "./supplier-payment-smoke-concurrency";
import {
  closeThenCheckFreshResidual,
  type SupplierPaymentFailureState,
} from "./supplier-payment-smoke-residual";
import {
  closeDatabasePreservingPrimaryFailure,
  runRollbackOnly,
} from "./supplier-purchase-fulfillment-smoke";

export { closeDatabasePreservingPrimaryFailure, runRollbackOnly };
export {
  assertCommittedConcurrencyConfig,
  closeThenCheckFreshResidual,
  runConcurrentSubmitOverlap,
};

const SUMMARY_KEYS = [
  "receipt_cost_atomic",
  "receipt_payable_atomic",
  "receipt_replay_idempotent",
  "split_receipt_rounding_exact",
  "rejected_quantity_excluded",
  "commitment_partially_consumed",
  "concurrent_request_serialized",
  "rejected_request_released",
  "partial_payment_recorded",
  "repeated_payment_idempotent",
  "final_payment_closed_balance",
  "invoice_gate_atomic",
  "supplier_cash_single_ledger",
  "supplier_cash_not_double_costed",
  "tenant_isolation",
  "transaction_rolled_back",
] as const;

export type SupplierPaymentSmokeSummary = Record<
  typeof SUMMARY_KEYS[number],
  true
>;
type PreRollbackSummary = Omit<
  SupplierPaymentSmokeSummary,
  "transaction_rolled_back"
>;

export function assertSupplierPaymentSmokeSummary(
  value: unknown,
): SupplierPaymentSmokeSummary {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SupplierPaymentSmokeAssertionError(
      "supplier payment smoke summary must be an object",
    );
  }
  const record = value as Record<string, unknown>;
  const actualKeys = Object.keys(record).sort();
  const expectedKeys = [...SUMMARY_KEYS].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new SupplierPaymentSmokeAssertionError(
      "supplier payment smoke summary must contain exactly 16 checks",
    );
  }
  for (const key of SUMMARY_KEYS) {
    if (record[key] !== true) {
      throw new SupplierPaymentSmokeAssertionError(`${key} must be true`);
    }
  }
  return record as SupplierPaymentSmokeSummary;
}

export async function assertSupplierPaymentPrerequisites(
  sql: Bun.SQL,
): Promise<void> {
  const rows = await sql<Array<{
    cost_table: string | null;
    payment_table: string | null;
    receipt_rpc: string | null;
    payment_rpc: string | null;
  }>>`
    select to_regclass('public.project_cost_events')::text as cost_table,
      to_regclass('public.supplier_payment_requests')::text as payment_table,
      to_regprocedure(
        'public.create_supplier_purchase_order_receipt(uuid,uuid,uuid,integer,text,timestamptz,text,jsonb,uuid,uuid,text)'
      )::text as receipt_rpc,
      to_regprocedure(
        'public.confirm_supplier_payment(uuid,uuid,uuid,integer,text,text,timestamptz,jsonb,text,jsonb,uuid,uuid,uuid)'
      )::text as payment_rpc;
  `;
  const row = rows[0];
  if (
    !row?.cost_table || !row.payment_table ||
    !row.receipt_rpc || !row.payment_rpc
  ) {
    throw new SupplierPaymentSmokeAssertionError(
      "SUPPLIER_PAYMENT_SMOKE_PREREQUISITE_MISSING: " +
        "migrations 20260731100000 and 20260731110000 are required",
    );
  }
}

async function executeSmoke(
  sql: SupplierPaymentSmokeSql,
  concurrentRequestSerialized: true,
): Promise<PreRollbackSummary> {
  const fixture = await seedSupplierPaymentSmokeFixture(sql);
  const checks = await executeSupplierPaymentSmokeScenario(sql, fixture);
  return assertSupplierPaymentSmokeSummary({
    ...checks,
    concurrent_request_serialized: concurrentRequestSerialized,
    transaction_rolled_back: true,
  }) as PreRollbackSummary;
}

export async function countResidualFixtureRows(sql: Bun.SQL): Promise<number> {
  const rows = await sql<{ count: number }[]>`
    select sum(fact.count)::integer as count
    from (
      select count(*) from public.supplier_purchase_orders where id in (
        ${SUPPLIER_PAYMENT_SMOKE_IDS.order}::uuid,
        ${SUPPLIER_PAYMENT_SMOKE_IDS.invoiceOrder}::uuid,
        ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseOrder}::uuid
      )
      union all
      select count(*) from public.supplier_payment_requests where id in (
        ${SUPPLIER_PAYMENT_SMOKE_IDS.requestA}::uuid,
        ${SUPPLIER_PAYMENT_SMOKE_IDS.requestB}::uuid,
        ${SUPPLIER_PAYMENT_SMOKE_IDS.invoiceRequest}::uuid
      )
      union all
      select count(*) from public.supplier_payments where id in (
        ${SUPPLIER_PAYMENT_SMOKE_IDS.firstPayment}::uuid,
        ${SUPPLIER_PAYMENT_SMOKE_IDS.finalPayment}::uuid,
        ${SUPPLIER_PAYMENT_SMOKE_IDS.invoicePayment}::uuid
      )
      union all
      select count(*) from public.supplier_contracts
      where id = ${SUPPLIER_PAYMENT_SMOKE_IDS.contract}::uuid
      union all
      select count(*) from public.platform_file_objects
      where id = ${SUPPLIER_PAYMENT_SMOKE_IDS.contractDocument}::uuid
      union all
      select count(*) from public.supplier_purchase_requisitions
      where id in (
        ${SUPPLIER_PAYMENT_SMOKE_IDS.requisition}::uuid,
        ${SUPPLIER_PAYMENT_SMOKE_IDS.invoiceRequisition}::uuid
      )
      union all
      select count(*) from public.finance_cost_categories
      where id = ${SUPPLIER_PAYMENT_SMOKE_IDS.costCategory}::uuid
      union all
      select count(*) from public.project_cost_budgets
      where id = ${SUPPLIER_PAYMENT_SMOKE_IDS.budget}::uuid
      union all
      select count(*) from public.supplier_purchase_order_shipments
      where id in (
        ${SUPPLIER_PAYMENT_SMOKE_IDS.shipment}::uuid,
        ${SUPPLIER_PAYMENT_SMOKE_IDS.invoiceShipment}::uuid
      )
      union all
      select count(*) from public.supplier_purchase_order_receipts
      where id in (
        ${SUPPLIER_PAYMENT_SMOKE_IDS.partialReceipt}::uuid,
        ${SUPPLIER_PAYMENT_SMOKE_IDS.finalReceipt}::uuid,
        ${SUPPLIER_PAYMENT_SMOKE_IDS.invoiceReceipt}::uuid
      )
      union all
      select count(*) from public.suppliers
      where id in (
        ${SUPPLIER_PAYMENT_BASE_IDS.supplier}::uuid,
        ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseSupplier}::uuid
      )
      union all
      select count(*) from public.tenant_suppliers
      where id in (
        ${SUPPLIER_PAYMENT_BASE_IDS.relationship}::uuid,
        ${SUPPLIER_PAYMENT_BASE_IDS.otherRelationship}::uuid,
        ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseRelationship}::uuid
      )
      union all
      select count(*) from public.supplier_products
      where id in (
        ${SUPPLIER_PAYMENT_BASE_IDS.product}::uuid,
        ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseProduct}::uuid
      )
      union all
      select count(*) from public.supplier_skus
      where id in (
        ${SUPPLIER_PAYMENT_BASE_IDS.sku}::uuid,
        ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseSku}::uuid
      )
      union all
      select count(*) from public.supplier_price_lists
      where id in (
        ${SUPPLIER_PAYMENT_BASE_IDS.priceList}::uuid,
        ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoisePriceList}::uuid
      )
      union all
      select count(*) from public.supplier_price_list_items
      where id in (
        ${SUPPLIER_PAYMENT_BASE_IDS.priceItem}::uuid,
        ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoisePriceItem}::uuid
      )
      union all
      select count(*) from public.supplier_purchase_order_items
      where id = ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseOrderItem}::uuid
      union all
      select count(*) from public.supplier_purchase_order_fulfillments
      where id = ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseFulfillment}::uuid
      union all
      select count(*) from public.catalog_categories
      where id = ${SUPPLIER_PAYMENT_BASE_IDS.category}::uuid
      union all
      select count(*) from public.catalog_brands
      where id = ${SUPPLIER_PAYMENT_BASE_IDS.brand}::uuid
      union all
      select count(*) from public.catalog_units
      where id = ${SUPPLIER_PAYMENT_BASE_IDS.unit}::uuid
      union all
      select count(*) from public.supplier_qualifications
      where id = ${SUPPLIER_PAYMENT_BASE_IDS.qualification}::uuid
      union all
      select count(*) from public.supplier_command_events
      where resource_id::text like '86000000-%'
        or resource_id::text like '23000000-%'
    ) as fact;
  `;
  return rows[0]?.count ?? -1;
}

export async function runSupplierPaymentSmoke(
  databaseUrl: string,
  concurrencyConfig: {
    allowCommittedConcurrency?: string;
    disposableDatabase?: string;
    payableId?: string;
  } = {
    allowCommittedConcurrency:
      process.env.SUPPLIER_PAYMENT_SMOKE_ALLOW_COMMITTED_CONCURRENCY,
    disposableDatabase:
      process.env.SUPPLIER_PAYMENT_SMOKE_DISPOSABLE_DB,
    payableId:
      process.env.SUPPLIER_PAYMENT_SMOKE_CONCURRENCY_PAYABLE_ID,
  },
): Promise<SupplierPaymentSmokeSummary> {
  const database = new Bun.SQL(databaseUrl, {
    max: 1,
    prepare: false,
    connectionTimeout: 10,
  });
  let primaryFailure: SupplierPaymentFailureState = { failed: false };
  let checks: PreRollbackSummary | undefined;
  let mustCheckResidual = false;
  try {
    await assertSupplierPaymentPrerequisites(database);
    const concurrentRequestSerialized = await runConcurrentRequestProbe(
      databaseUrl,
      concurrencyConfig,
    );
    mustCheckResidual = true;
    checks = await runRollbackOnly<TransactionSQL, PreRollbackSummary>(
      database,
      (transaction) =>
        executeSmoke(
          transaction as unknown as SupplierPaymentSmokeSql,
          concurrentRequestSerialized,
        ),
    );
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
      countResidual: countResidualFixtureRows,
      primaryFailure,
      label: "supplier payment rollback fixture",
    });
  }
  if (!checks) {
    throw new SupplierPaymentSmokeAssertionError(
      "supplier payment smoke did not complete",
    );
  }
  return assertSupplierPaymentSmokeSummary({
    ...checks,
    transaction_rolled_back: true,
  });
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
    console.log(JSON.stringify(await runSupplierPaymentSmoke(databaseUrl)));
  } catch (error) {
    console.error(
      error instanceof SupplierPaymentSmokeAssertionError &&
          error.message.startsWith("SUPPLIER_PAYMENT_SMOKE_PREREQUISITE")
        ? error.message
        : "SUPPLIER_PAYMENT_SMOKE_FAILED",
    );
    process.exitCode = 1;
  }
}

if (import.meta.main) void main();
