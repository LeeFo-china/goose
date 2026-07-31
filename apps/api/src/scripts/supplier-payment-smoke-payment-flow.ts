import {
  SUPPLIER_PAYMENT_SMOKE_IDS,
  type SupplierPaymentSmokeSql,
} from "./supplier-payment-smoke-fixture";
import {
  confirmSupplierPayment,
  createSupplierPaymentReceipt,
  listPayableFacts,
  listRequestAllocations,
  reviewPaymentRequest,
  savePaymentRequest,
  submitPaymentRequest,
  type SupplierPaymentCommandStep,
} from "./supplier-payment-smoke-commands";
import {
  paymentSmokeAssert as assert,
  paymentSmokeCents as cents,
  type SupplierPaymentScenarioState,
} from "./supplier-payment-smoke-state";
import { assertFulfillmentCommandResult } from
  "./supplier-purchase-fulfillment-smoke-commands";
import {
  assertInvoiceGateSnapshotUnchanged,
  assertProjectCostSnapshotUnchanged,
  assertRequestStateSnapshotUnchanged,
  readInvoiceGateSnapshot,
  readProjectCostSnapshot,
  snapshotRequestAccountingState,
} from "./supplier-payment-smoke-assertions";

export {
  assertInvoiceGateSnapshotUnchanged,
  assertProjectCostSnapshotUnchanged,
};

function requestAllocations(state: SupplierPaymentScenarioState) {
  return state.mainPayables.map((payable) => ({
    payable_event_id: payable.id,
    requested_amount: payable.amount,
  }));
}

async function saveCompetingRequests(
  sql: SupplierPaymentSmokeSql,
  state: SupplierPaymentScenarioState,
): Promise<void> {
  state.mainPayables = await listPayableFacts(
    sql,
    state.fixture,
    SUPPLIER_PAYMENT_SMOKE_IDS.order,
  );
  assert(
    state.mainPayables.length === 2 &&
      state.mainPayables.reduce((sum, row) => sum + cents(row.amount), 0) ===
        3_000,
    "main order must expose exactly 30.00 payable",
  );
  const allocations = requestAllocations(state);
  const saved = [];
  saved.push(await savePaymentRequest(sql, state.fixture, {
    requestId: SUPPLIER_PAYMENT_SMOKE_IDS.requestA,
    expectedVersion: 0,
    idempotencyKey: SUPPLIER_PAYMENT_SMOKE_IDS.saveRequestAKey,
    allocations,
  }));
  saved.push(await savePaymentRequest(sql, state.fixture, {
    requestId: SUPPLIER_PAYMENT_SMOKE_IDS.requestB,
    expectedVersion: 0,
    idempotencyKey: SUPPLIER_PAYMENT_SMOKE_IDS.saveRequestBKey,
    allocations,
  }));
  assert(saved.every(({ status }) => status === "saved"), "requests save");
}

async function submitCompetingRequests(
  sql: SupplierPaymentSmokeSql,
  state: SupplierPaymentScenarioState,
): Promise<void> {
  const submitted = [];
  submitted.push(await submitPaymentRequest(sql, state.fixture, {
    requestId: SUPPLIER_PAYMENT_SMOKE_IDS.requestA,
    expectedVersion: 1,
    idempotencyKey: SUPPLIER_PAYMENT_SMOKE_IDS.submitRequestAKey,
  }));
  submitted.push(await submitPaymentRequest(sql, state.fixture, {
    requestId: SUPPLIER_PAYMENT_SMOKE_IDS.requestB,
    expectedVersion: 1,
    idempotencyKey: SUPPLIER_PAYMENT_SMOKE_IDS.submitRequestBKey,
  }));
  const winner = submitted.findIndex(({ status }) => status === "submitted");
  const loser = submitted.findIndex(({ status }) =>
    status === "amount_unavailable"
  );
  assert(
    winner >= 0 && loser >= 0 && winner !== loser,
    "competing requests must serialize to one winner",
  );
  state.activeRequestId = winner === 0
    ? SUPPLIER_PAYMENT_SMOKE_IDS.requestA
    : SUPPLIER_PAYMENT_SMOKE_IDS.requestB;
}

async function rejectAndRelease(
  sql: SupplierPaymentSmokeSql,
  state: SupplierPaymentScenarioState,
): Promise<void> {
  assert(state.activeRequestId, "active request is required");
  const rejectedId = state.activeRequestId;
  const waitingId = rejectedId === SUPPLIER_PAYMENT_SMOKE_IDS.requestA
    ? SUPPLIER_PAYMENT_SMOKE_IDS.requestB
    : SUPPLIER_PAYMENT_SMOKE_IDS.requestA;
  const rejected = await reviewPaymentRequest(sql, state.fixture, {
    requestId: rejectedId,
    expectedVersion: 2,
    action: "reject",
    remark: "烟测释放占用",
    idempotencyKey: SUPPLIER_PAYMENT_SMOKE_IDS.rejectRequestKey,
  });
  assert(rejected.status === "rejected", "winner must be rejected");
  const submitted = await submitPaymentRequest(sql, state.fixture, {
    requestId: waitingId,
    expectedVersion: 1,
    idempotencyKey: SUPPLIER_PAYMENT_SMOKE_IDS.resubmitRequestKey,
  });
  assert(submitted.status === "submitted", "released request must submit");
  state.activeRequestId = waitingId;
  state.checks.rejected_request_released = true;
}

async function approveActiveRequest(
  sql: SupplierPaymentSmokeSql,
  state: SupplierPaymentScenarioState,
): Promise<void> {
  assert(state.activeRequestId, "active request is required");
  const approved = await reviewPaymentRequest(sql, state.fixture, {
    requestId: state.activeRequestId,
    expectedVersion: 2,
    action: "approve",
    remark: "烟测批准",
    idempotencyKey: SUPPLIER_PAYMENT_SMOKE_IDS.approveRequestKey,
  });
  assert(approved.status === "approved", "request must be approved");
  state.activeAllocations = await listRequestAllocations(
    sql,
    state.fixture,
    state.activeRequestId,
  );
  assert(state.activeAllocations.length === 2, "two allocations required");
}

async function assertSelfReviewRejected(
  sql: SupplierPaymentSmokeSql,
  state: SupplierPaymentScenarioState,
): Promise<void> {
  assert(state.activeRequestId, "active request is required");
  const before = await snapshotRequestAccountingState(
    sql,
    state.fixture,
    state.activeRequestId,
  );
  const approve = await reviewPaymentRequest(sql, state.fixture, {
    requestId: state.activeRequestId,
    expectedVersion: 2,
    action: "approve",
    remark: null,
    idempotencyKey: SUPPLIER_PAYMENT_SMOKE_IDS.selfReviewApproveKey,
    selfReview: true,
  });
  assert(
    approve.status === "self_review" &&
      approve.error_code === "SUPPLIER_PAYMENT_SELF_REVIEW",
    "submitter approve must match frozen self_review envelope",
  );
  const reject = await reviewPaymentRequest(sql, state.fixture, {
    requestId: state.activeRequestId,
    expectedVersion: 2,
    action: "reject",
    remark: "提交人不得自审",
    idempotencyKey: SUPPLIER_PAYMENT_SMOKE_IDS.selfReviewRejectKey,
    selfReview: true,
  });
  assert(
    reject.status === "self_review" &&
      reject.error_code === "SUPPLIER_PAYMENT_SELF_REVIEW",
    "submitter reject must match frozen self_review envelope",
  );
  const after = await snapshotRequestAccountingState(
    sql,
    state.fixture,
    state.activeRequestId,
  );
  assertRequestStateSnapshotUnchanged(before, after, "self review");
}

function paymentAllocations(
  state: SupplierPaymentScenarioState,
  first: boolean,
) {
  return state.activeAllocations.map((allocation, index) => ({
    payment_request_allocation_id: allocation.id,
    payable_event_id: allocation.payable_event_id,
    amount: first && index === 0
      ? "10.00"
      : first
      ? "0.00"
      : index === 0
      ? ((cents(allocation.requested_amount) - 1_000) / 100).toFixed(2)
      : allocation.requested_amount,
  })).filter(({ amount }) => amount !== "0.00");
}

async function runPayment(
  sql: SupplierPaymentSmokeSql,
  state: SupplierPaymentScenarioState,
  first: boolean,
) {
  assert(state.activeRequestId, "active request is required");
  return confirmSupplierPayment(sql, state.fixture, {
    requestId: state.activeRequestId,
    expectedVersion: first ? 3 : 4,
    paymentId: first
      ? SUPPLIER_PAYMENT_SMOKE_IDS.firstPayment
      : SUPPLIER_PAYMENT_SMOKE_IDS.finalPayment,
    idempotencyKey: first
      ? SUPPLIER_PAYMENT_SMOKE_IDS.firstPaymentKey
      : SUPPLIER_PAYMENT_SMOKE_IDS.finalPaymentKey,
    allocations: paymentAllocations(state, first),
    reference: first ? "SMOKE-PAYMENT-FIRST" : "SMOKE-PAYMENT-FINAL",
  });
}

async function assertPaymentFacts(
  sql: SupplierPaymentSmokeSql,
  state: SupplierPaymentScenarioState,
): Promise<void> {
  assert(state.activeRequestId, "active request is required");
  const rows = await sql<Array<{
    status: string;
    requested_amount: string;
    paid_amount: string;
    payment_count: number;
    ledger_count: number;
  }>>`
    select request.status, request.requested_amount::text,
      request.paid_amount::text,
      (select count(*)::integer from public.supplier_payments as payment
        where payment.tenant_id = request.tenant_id
          and payment.payment_request_id = request.id) as payment_count,
      (select count(*)::integer from public.finance_ledger_entries as ledger
        where ledger.tenant_id = request.tenant_id
          and ledger.entry_type = 'supplier_payment'
          and ledger.source_id in (
            ${SUPPLIER_PAYMENT_SMOKE_IDS.firstPayment}::uuid,
            ${SUPPLIER_PAYMENT_SMOKE_IDS.finalPayment}::uuid
          )) as ledger_count
    from public.supplier_payment_requests as request
    where request.tenant_id = ${state.fixture.tenant_id}::uuid
      and request.id = ${state.activeRequestId}::uuid;
  `;
  assert(
    rows.length === 1 && rows[0]?.status === "paid" &&
      rows[0]?.requested_amount === "30.00" &&
      rows[0]?.paid_amount === "30.00" &&
      rows[0]?.payment_count === 2 && rows[0]?.ledger_count === 2,
    "final payment facts must close with one ledger per payment",
  );
  assert(state.projectCostBeforePayment, "project cost baseline is required");
  assertProjectCostSnapshotUnchanged(
    state.projectCostBeforePayment,
    await readProjectCostSnapshot(sql, state.fixture),
  );
  Object.assign(state.checks, {
    final_payment_closed_balance: true,
    supplier_cash_single_ledger: true,
    supplier_cash_not_double_costed: true,
  } as const);
}

async function createInvoiceRequest(
  sql: SupplierPaymentSmokeSql,
  state: SupplierPaymentScenarioState,
): Promise<void> {
  const receipt = await createSupplierPaymentReceipt(sql, state.fixture, {
    receiptId: SUPPLIER_PAYMENT_SMOKE_IDS.invoiceReceipt,
    orderId: SUPPLIER_PAYMENT_SMOKE_IDS.invoiceOrder,
    orderItemId: state.fixture.invoice_order_item_id,
    expectedVersion: 2,
    receiptNo: "SMOKE-PAYMENT-INVOICE-RECEIPT",
    acceptedQuantity: 1,
    rejectedQuantity: 0,
    varianceReason: null,
    idempotencyKey: "supplier-payment-smoke-invoice-receipt",
  });
  assertFulfillmentCommandResult(receipt, {
    status: "receipt_created",
    idempotent: false,
    version: 3,
    fulfillmentStatus: "received",
  });
  state.invoicePayables = await listPayableFacts(
    sql,
    state.fixture,
    SUPPLIER_PAYMENT_SMOKE_IDS.invoiceOrder,
  );
  assert(
    state.invoicePayables.length === 1 &&
      state.invoicePayables[0]?.invoice_required_before_payment === true,
    "invoice payable must snapshot the invoice gate",
  );
  const allocations = state.invoicePayables.map((payable) => ({
    payable_event_id: payable.id,
    requested_amount: payable.amount,
  }));
  assert((await savePaymentRequest(sql, state.fixture, {
    requestId: SUPPLIER_PAYMENT_SMOKE_IDS.invoiceRequest,
    expectedVersion: 0,
    idempotencyKey: SUPPLIER_PAYMENT_SMOKE_IDS.saveInvoiceRequestKey,
    allocations,
  })).status === "saved", "invoice request save");
  assert((await submitPaymentRequest(sql, state.fixture, {
    requestId: SUPPLIER_PAYMENT_SMOKE_IDS.invoiceRequest,
    expectedVersion: 1,
    idempotencyKey: SUPPLIER_PAYMENT_SMOKE_IDS.submitInvoiceRequestKey,
  })).status === "submitted", "invoice request submit");
  assert((await reviewPaymentRequest(sql, state.fixture, {
    requestId: SUPPLIER_PAYMENT_SMOKE_IDS.invoiceRequest,
    expectedVersion: 2,
    action: "approve",
    remark: "烟测批准",
    idempotencyKey: SUPPLIER_PAYMENT_SMOKE_IDS.approveInvoiceRequestKey,
  })).status === "approved", "invoice request approve");
}

async function assertInvoiceGate(
  sql: SupplierPaymentSmokeSql,
  state: SupplierPaymentScenarioState,
): Promise<void> {
  const allocations = await listRequestAllocations(
    sql,
    state.fixture,
    SUPPLIER_PAYMENT_SMOKE_IDS.invoiceRequest,
  );
  assert(allocations.length === 1, "invoice allocation required");
  const before = await readInvoiceGateSnapshot(
    sql,
    state.fixture,
    SUPPLIER_PAYMENT_SMOKE_IDS.invoiceRequest,
    SUPPLIER_PAYMENT_SMOKE_IDS.invoicePayment,
  );
  const gated = await confirmSupplierPayment(sql, state.fixture, {
    requestId: SUPPLIER_PAYMENT_SMOKE_IDS.invoiceRequest,
    expectedVersion: 3,
    paymentId: SUPPLIER_PAYMENT_SMOKE_IDS.invoicePayment,
    idempotencyKey: SUPPLIER_PAYMENT_SMOKE_IDS.invoicePaymentKey,
    reference: "SMOKE-PAYMENT-INVOICE-GATE",
    allocations: allocations.map((allocation) => ({
      payment_request_allocation_id: allocation.id,
      payable_event_id: allocation.payable_event_id,
      amount: allocation.requested_amount,
    })),
  });
  assert(gated.status === "invoice_required", "invoice gate must reject cash");
  const after = await readInvoiceGateSnapshot(
    sql,
    state.fixture,
    SUPPLIER_PAYMENT_SMOKE_IDS.invoiceRequest,
    SUPPLIER_PAYMENT_SMOKE_IDS.invoicePayment,
  );
  assertInvoiceGateSnapshotUnchanged(before, after);
  state.checks.invoice_gate_atomic = true;
}

async function assertTenantIsolation(
  sql: SupplierPaymentSmokeSql,
  state: SupplierPaymentScenarioState,
): Promise<void> {
  assert(state.activeRequestId, "active request required");
  const hidden = await reviewPaymentRequest(sql, state.fixture, {
    requestId: state.activeRequestId,
    expectedVersion: 5,
    action: "approve",
    remark: "other tenant",
    idempotencyKey: SUPPLIER_PAYMENT_SMOKE_IDS.tenantIsolationKey,
    otherTenant: true,
  });
  assert(hidden.status === "not_found", "other tenant must not see request");
  state.checks.tenant_isolation = true;
}

export async function executeSupplierPaymentFlowStep(
  sql: SupplierPaymentSmokeSql,
  state: SupplierPaymentScenarioState,
  step: SupplierPaymentCommandStep,
): Promise<unknown> {
  switch (step) {
    case "save_competing_requests":
      return saveCompetingRequests(sql, state);
    case "submit_competing_requests":
      return submitCompetingRequests(sql, state);
    case "reject_reserved_request":
      return rejectAndRelease(sql, state);
    case "resubmit_released_request":
      return state.activeRequestId;
    case "self_review_rejected":
      return assertSelfReviewRejected(sql, state);
    case "approve_payment_request":
      return approveActiveRequest(sql, state);
    case "partial_payment": {
      state.projectCostBeforePayment = await readProjectCostSnapshot(
        sql,
        state.fixture,
      );
      const payment = await runPayment(sql, state, true);
      assert(payment.status === "partially_paid", "partial payment");
      state.checks.partial_payment_recorded = true;
      return payment;
    }
    case "partial_payment_replay": {
      const replay = await runPayment(sql, state, true);
      assert(replay.status === "partially_paid" && replay.idempotent, "replay");
      state.checks.repeated_payment_idempotent = true;
      return replay;
    }
    case "final_payment": {
      const payment = await runPayment(sql, state, false);
      assert(payment.status === "paid", "final payment must close");
      return assertPaymentFacts(sql, state);
    }
    case "invoice_request":
      return createInvoiceRequest(sql, state);
    case "invoice_payment_gate":
      return assertInvoiceGate(sql, state);
    case "tenant_isolation":
      return assertTenantIsolation(sql, state);
    default:
      assert(false, `unexpected supplier payment flow step: ${step}`);
  }
}
