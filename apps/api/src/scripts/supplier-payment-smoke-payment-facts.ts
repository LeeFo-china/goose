import type { SupplierPaymentSmokeSql } from
  "./supplier-payment-smoke-fixture";
import { paymentSmokeAssert as assert } from
  "./supplier-payment-smoke-state";

export type PaymentFactRow = Record<string, unknown>;

export type PaymentFactSnapshot = {
  request: PaymentFactRow;
  requestAllocations: PaymentFactRow[];
  payments: PaymentFactRow[];
  paymentAllocations: PaymentFactRow[];
  ledgers: PaymentFactRow[];
};

export type PaymentFactExpectation = {
  requestId: string;
  projectId: string;
  relationshipId: string;
  supplierId: string;
  firstPaymentId: string;
  finalPaymentId: string;
  allocations: Array<{
    id: string;
    payableId: string;
    requestedAmount: string;
  }>;
};

function cents(value: unknown): number {
  const text = String(value);
  const amount = Number(value);
  assert(
    Number.isFinite(amount) && amount >= 0 &&
      /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text),
    "payment fact money must be exact to cents",
  );
  return Math.round(amount * 100);
}

function rowById(rows: PaymentFactRow[], id: string): PaymentFactRow {
  const matches = rows.filter((row) => row.id === id);
  assert(matches.length === 1, `payment fact row ${id} must exist once`);
  return matches[0]!;
}

function assertPaymentScope(
  row: PaymentFactRow,
  paymentId: string,
  amount: number,
  expected: PaymentFactExpectation,
  label: string,
): void {
  assert(
    row.id === paymentId &&
      row.payment_request_id === expected.requestId &&
      row.project_id === expected.projectId &&
      row.tenant_supplier_id === expected.relationshipId &&
      row.supplier_id === expected.supplierId &&
      cents(row.amount) === amount,
    `${label} payment facts must match payment scope and amount`,
  );
}

function expectedPaidCents(
  allocationIndex: number,
  requestedAmount: string,
  final: boolean,
): number {
  if (final) return cents(requestedAmount);
  return allocationIndex === 0 ? 1_000 : 0;
}

function assertRequestAllocations(
  snapshot: PaymentFactSnapshot,
  expected: PaymentFactExpectation,
  final: boolean,
  label: string,
): void {
  assert(
    snapshot.requestAllocations.length === expected.allocations.length,
    `${label} request allocation count must match`,
  );
  expected.allocations.forEach((allocation, index) => {
    const row = rowById(snapshot.requestAllocations, allocation.id);
    assert(
      row.payment_request_id === expected.requestId &&
        row.payable_event_id === allocation.payableId &&
        cents(row.requested_amount) === cents(allocation.requestedAmount) &&
        cents(row.paid_amount) === expectedPaidCents(
          index,
          allocation.requestedAmount,
          final,
        ),
      `${label} request allocation paid amount and mapping must match`,
    );
  });
}

function expectedPaymentAllocationCents(
  allocationIndex: number,
  requestedAmount: string,
  final: boolean,
): number {
  if (!final) return allocationIndex === 0 ? 1_000 : 0;
  return cents(requestedAmount) - (allocationIndex === 0 ? 1_000 : 0);
}

function assertPaymentAllocations(
  snapshot: PaymentFactSnapshot,
  expected: PaymentFactExpectation,
  paymentId: string,
  final: boolean,
  label: string,
): void {
  const rows = snapshot.paymentAllocations.filter(
    (row) => row.supplier_payment_id === paymentId,
  );
  const expectedRows = expected.allocations.filter((allocation, index) =>
    expectedPaymentAllocationCents(
      index,
      allocation.requestedAmount,
      final,
    ) > 0
  );
  assert(
    rows.length === expectedRows.length,
    `${label} payment allocation count must match`,
  );
  expected.allocations.forEach((allocation, index) => {
    const amount = expectedPaymentAllocationCents(
      index,
      allocation.requestedAmount,
      final,
    );
    if (amount === 0) return;
    const matches = rows.filter((row) =>
      row.payment_request_allocation_id === allocation.id
    );
    assert(
      matches.length === 1 &&
        matches[0]?.payment_request_id === expected.requestId &&
        matches[0]?.payable_event_id === allocation.payableId &&
        cents(matches[0]?.amount) === amount,
      `${label} payment allocation amount and mapping must match`,
    );
  });
}

export function assertPartialPaymentFacts(
  snapshot: PaymentFactSnapshot,
  expected: PaymentFactExpectation,
): true {
  assert(
    snapshot.request.id === expected.requestId &&
      snapshot.request.status === "partially_paid" &&
      cents(snapshot.request.requested_amount) === 3_000 &&
      cents(snapshot.request.paid_amount) === 1_000,
    "partial payment facts must update the request to 10.00 paid",
  );
  assert(snapshot.payments.length === 1, "partial payment facts payment count");
  assertPaymentScope(
    snapshot.payments[0]!,
    expected.firstPaymentId,
    1_000,
    expected,
    "partial",
  );
  assertRequestAllocations(snapshot, expected, false, "partial payment facts");
  assertPaymentAllocations(
    snapshot,
    expected,
    expected.firstPaymentId,
    false,
    "partial payment facts",
  );
  assert(
    snapshot.ledgers.length === 1 &&
      snapshot.ledgers[0]?.source_id === expected.firstPaymentId,
    "partial payment facts must have one matching ledger",
  );
  return true;
}

export function assertPaymentReplayUnchanged(
  before: PaymentFactSnapshot,
  after: PaymentFactSnapshot,
): true {
  assert(
    JSON.stringify(after) === JSON.stringify(before),
    "payment replay must preserve complete rows and counts",
  );
  return true;
}

export function assertFinalPaymentFacts(
  snapshot: PaymentFactSnapshot,
  expected: PaymentFactExpectation,
): true {
  assert(
    snapshot.request.id === expected.requestId &&
      snapshot.request.status === "paid" &&
      cents(snapshot.request.requested_amount) === 3_000 &&
      cents(snapshot.request.paid_amount) === 3_000,
    "final payment facts must close the request at 30.00",
  );
  assert(snapshot.payments.length === 2, "final payment facts payment count");
  assertPaymentScope(
    rowById(snapshot.payments, expected.firstPaymentId),
    expected.firstPaymentId,
    1_000,
    expected,
    "final first",
  );
  assertPaymentScope(
    rowById(snapshot.payments, expected.finalPaymentId),
    expected.finalPaymentId,
    2_000,
    expected,
    "final second",
  );
  assertRequestAllocations(snapshot, expected, true, "final payment facts");
  assertPaymentAllocations(
    snapshot,
    expected,
    expected.firstPaymentId,
    false,
    "final payment facts first",
  );
  assertPaymentAllocations(
    snapshot,
    expected,
    expected.finalPaymentId,
    true,
    "final payment facts second",
  );
  assert(
    snapshot.ledgers.length === 2 &&
      new Set(snapshot.ledgers.map((row) => row.source_id)).size === 2 &&
      snapshot.ledgers.some((row) => row.source_id === expected.firstPaymentId) &&
      snapshot.ledgers.some((row) => row.source_id === expected.finalPaymentId),
    "final payment facts must have one ledger per payment",
  );
  return true;
}

export async function readPaymentFactSnapshot(
  sql: SupplierPaymentSmokeSql,
  input: {
    tenantId: string;
    requestId: string;
    paymentIds: readonly [string, string];
  },
): Promise<PaymentFactSnapshot> {
  const requests = await sql<Array<{ row: PaymentFactRow }>>`
    select to_jsonb(request.*) as row
    from public.supplier_payment_requests as request
    where request.tenant_id = ${input.tenantId}::uuid
      and request.id = ${input.requestId}::uuid;
  `;
  assert(requests.length === 1, "payment fact request must exist once");
  const requestAllocations = await sql<Array<{ row: PaymentFactRow }>>`
    select to_jsonb(allocation.*) as row
    from public.supplier_payment_request_allocations as allocation
    where allocation.tenant_id = ${input.tenantId}::uuid
      and allocation.payment_request_id = ${input.requestId}::uuid
    order by allocation.id;
  `;
  const payments = await sql<Array<{ row: PaymentFactRow }>>`
    select to_jsonb(payment.*) as row
    from public.supplier_payments as payment
    where payment.tenant_id = ${input.tenantId}::uuid
      and payment.payment_request_id = ${input.requestId}::uuid
    order by payment.id;
  `;
  const paymentAllocations = await sql<Array<{ row: PaymentFactRow }>>`
    select to_jsonb(allocation.*) as row
    from public.supplier_payment_allocations as allocation
    where allocation.tenant_id = ${input.tenantId}::uuid
      and allocation.payment_request_id = ${input.requestId}::uuid
    order by allocation.supplier_payment_id, allocation.id;
  `;
  const ledgers = await sql<Array<{ row: PaymentFactRow }>>`
    select to_jsonb(ledger.*) as row
    from public.finance_ledger_entries as ledger
    where ledger.tenant_id = ${input.tenantId}::uuid
      and ledger.entry_type = 'supplier_payment'
      and ledger.source_id in (
        ${input.paymentIds[0]}::uuid,
        ${input.paymentIds[1]}::uuid
      )
    order by ledger.source_id, ledger.id;
  `;
  return {
    request: requests[0]!.row,
    requestAllocations: requestAllocations.map(({ row }) => row),
    payments: payments.map(({ row }) => row),
    paymentAllocations: paymentAllocations.map(({ row }) => row),
    ledgers: ledgers.map(({ row }) => row),
  };
}
