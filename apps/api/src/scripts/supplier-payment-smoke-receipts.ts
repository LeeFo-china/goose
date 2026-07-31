import {
  SUPPLIER_PAYMENT_SMOKE_IDS,
  type SupplierPaymentSmokeSql,
} from "./supplier-payment-smoke-fixture";
import {
  createSupplierPaymentReceipt,
  listPayableFacts,
  type SupplierPaymentCommandStep,
} from "./supplier-payment-smoke-commands";
import {
  paymentSmokeAssert as assert,
  paymentSmokeCents as cents,
  type SupplierPaymentScenarioState,
} from "./supplier-payment-smoke-state";
import { assertFulfillmentCommandResult } from
  "./supplier-purchase-fulfillment-smoke-commands";

async function createMainReceipt(
  sql: SupplierPaymentSmokeSql,
  state: SupplierPaymentScenarioState,
  final: boolean,
) {
  const input = final
    ? {
      receiptId: SUPPLIER_PAYMENT_SMOKE_IDS.finalReceipt,
      expectedVersion: 3,
      receiptNo: "SMOKE-PAYMENT-RECEIPT-FINAL",
      acceptedQuantity: 1.8889,
      rejectedQuantity: 0.3333,
      varianceReason: "烟测拒收数量",
      idempotencyKey: "supplier-payment-smoke-final-receipt",
    }
    : {
      receiptId: SUPPLIER_PAYMENT_SMOKE_IDS.partialReceipt,
      expectedVersion: 2,
      receiptNo: "SMOKE-PAYMENT-RECEIPT-PARTIAL",
      acceptedQuantity: 1.1111,
      rejectedQuantity: 0,
      varianceReason: null,
      idempotencyKey: "supplier-payment-smoke-partial-receipt",
    };
  const value = await createSupplierPaymentReceipt(sql, state.fixture, {
    ...input,
    orderId: SUPPLIER_PAYMENT_SMOKE_IDS.order,
    orderItemId: state.fixture.order_item_id,
  });
  assertFulfillmentCommandResult(value, {
    status: "receipt_created",
    idempotent: false,
    version: final ? 4 : 3,
    fulfillmentStatus: final
      ? "received_with_variance"
      : "partially_received",
  });
  return value;
}

async function assertReceiptFacts(
  sql: SupplierPaymentSmokeSql,
  state: SupplierPaymentScenarioState,
): Promise<void> {
  const rows = await sql<Array<{
    receipt_id: string;
    rejected_quantity: string;
    cost_count: number;
    payable_count: number;
    cost_amount: string;
    payable_amount: string;
  }>>`
    select receipt_item.receipt_id,
      receipt_item.rejected_quantity::text,
      count(distinct cost.id)::integer as cost_count,
      count(distinct payable.id)::integer as payable_count,
      coalesce(max(cost.amount), 0)::text as cost_amount,
      coalesce(max(payable.amount), 0)::text as payable_amount
    from public.supplier_purchase_order_receipt_items as receipt_item
    left join public.project_cost_events as cost
      on cost.tenant_id = receipt_item.tenant_id
      and cost.source_id = receipt_item.id
    left join public.supplier_payable_events as payable
      on payable.tenant_id = receipt_item.tenant_id
      and payable.source_id = receipt_item.id
    where receipt_item.tenant_id = ${state.fixture.tenant_id}::uuid
      and receipt_item.receipt_id in (
        ${SUPPLIER_PAYMENT_SMOKE_IDS.partialReceipt}::uuid,
        ${SUPPLIER_PAYMENT_SMOKE_IDS.finalReceipt}::uuid
      )
    group by receipt_item.id, receipt_item.receipt_id
    order by receipt_item.receipt_id;
  `;
  assert(rows.length === 2, "main receipts must have two item rows");
  assert(
    rows.every((row) => row.cost_count === 1),
    "each receipt item must create one cost event",
  );
  assert(
    rows.every((row) => row.payable_count === 1),
    "each receipt item must create one payable event",
  );
  assert(
    rows.every((row) => row.cost_amount === row.payable_amount),
    "cost and payable amounts must be atomic",
  );
  assert(
    rows.reduce((sum, row) => sum + cents(row.cost_amount), 0) === 3_000,
    "split receipts must recognize exactly 30.00",
  );
  assert(
    rows.some((row) => row.rejected_quantity === "0.3333"),
    "fixture must include rejected quantity",
  );
  const commitments = await sql<Array<{
    amount: string;
    recognized_amount: string;
    status: string;
  }>>`
    select commitment.amount::text, commitment.recognized_amount::text,
      commitment.status
    from public.project_cost_commitments as commitment
    where commitment.tenant_id = ${state.fixture.tenant_id}::uuid
      and commitment.source_id =
        ${SUPPLIER_PAYMENT_SMOKE_IDS.requisition}::uuid
      and commitment.cost_category_id =
        ${state.fixture.cost_category_id}::uuid;
  `;
  assert(
    commitments.length === 1 &&
      commitments[0]?.amount === "33.33" &&
      commitments[0]?.recognized_amount === "30.00" &&
      commitments[0]?.status === "converted",
    "commitment must retain the rejected-quantity residual",
  );
  Object.assign(state.checks, {
    receipt_cost_atomic: true,
    receipt_payable_atomic: true,
    split_receipt_rounding_exact: true,
    rejected_quantity_excluded: true,
    commitment_partially_consumed: true,
  } as const);
}

async function replayFinalReceipt(
  sql: SupplierPaymentSmokeSql,
  state: SupplierPaymentScenarioState,
) {
  const replay = await createSupplierPaymentReceipt(sql, state.fixture, {
    receiptId: SUPPLIER_PAYMENT_SMOKE_IDS.finalReceipt,
    orderId: SUPPLIER_PAYMENT_SMOKE_IDS.order,
    orderItemId: state.fixture.order_item_id,
    expectedVersion: 3,
    receiptNo: "SMOKE-PAYMENT-RECEIPT-FINAL",
    acceptedQuantity: 1.8889,
    rejectedQuantity: 0.3333,
    varianceReason: "烟测拒收数量",
    idempotencyKey: "supplier-payment-smoke-final-receipt",
  });
  assertFulfillmentCommandResult(replay, {
    status: "receipt_created",
    idempotent: true,
    version: 4,
    fulfillmentStatus: "received_with_variance",
  });
  const payables = await listPayableFacts(
    sql,
    state.fixture,
    SUPPLIER_PAYMENT_SMOKE_IDS.order,
  );
  assert(payables.length === 2, "receipt replay must not duplicate");
  state.checks.receipt_replay_idempotent = true;
  return replay;
}

export async function executeSupplierPaymentReceiptStep(
  sql: SupplierPaymentSmokeSql,
  state: SupplierPaymentScenarioState,
  step: SupplierPaymentCommandStep,
): Promise<unknown> {
  if (step === "partial_receipt") return createMainReceipt(sql, state, false);
  if (step === "final_receipt") {
    await createMainReceipt(sql, state, true);
    return assertReceiptFacts(sql, state);
  }
  if (step === "receipt_replay") return replayFinalReceipt(sql, state);
  assert(false, `unexpected supplier payment receipt step: ${step}`);
}
