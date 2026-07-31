import {
  SupplierPaymentCommandEnvelopeSchema,
  type SupplierPaymentCommandEnvelope,
} from "../repositories/supplier-payment-records";
import {
  type SupplierPaymentSmokeFixture,
  type SupplierPaymentSmokeSql,
} from "./supplier-payment-smoke-fixture";

export const SUPPLIER_PAYMENT_COMMAND_SEQUENCE = [
  "partial_receipt",
  "final_receipt",
  "receipt_replay",
  "save_competing_requests",
  "submit_competing_requests",
  "reject_reserved_request",
  "resubmit_released_request",
  "self_review_rejected",
  "approve_payment_request",
  "partial_payment",
  "partial_payment_replay",
  "final_payment",
  "invoice_request",
  "invoice_payment_gate",
  "tenant_isolation",
] as const;

export type SupplierPaymentCommandStep =
  typeof SUPPLIER_PAYMENT_COMMAND_SEQUENCE[number];

export class SupplierPaymentSmokeAssertionError extends Error {}

type ResultRow = { result: unknown };

export type PayableFact = {
  id: string;
  receipt_id: string;
  receipt_item_id: string;
  amount: string;
  invoice_required_before_payment: boolean;
};

export type RequestAllocationFact = {
  id: string;
  payable_event_id: string;
  requested_amount: string;
  paid_amount: string;
};

type PaymentRequestCommand = {
  requestId: string;
  expectedVersion: number;
  idempotencyKey: string;
};

export type SupplierPaymentRequestActorFixture = Pick<
  SupplierPaymentSmokeFixture,
  "tenant_id" | "project_id" | "relationship_id" | "user_id" | "employee_id"
>;

function result(rows: ResultRow[], label: string): unknown {
  if (rows.length !== 1 || rows[0]?.result === undefined) {
    throw new SupplierPaymentSmokeAssertionError(
      `${label} must return exactly one result`,
    );
  }
  return rows[0].result;
}

export function assertSupplierPaymentCommandEnvelope(
  value: unknown,
): SupplierPaymentCommandEnvelope {
  const parsed = SupplierPaymentCommandEnvelopeSchema.safeParse(value);
  if (!parsed.success) {
    throw new SupplierPaymentSmokeAssertionError(
      "payment command envelope does not match the frozen schema",
    );
  }
  return parsed.data;
}

export async function executeSupplierPaymentCommandSequence(runner: {
  execute(step: SupplierPaymentCommandStep): Promise<unknown>;
}): Promise<unknown[]> {
  const results: unknown[] = [];
  for (const step of SUPPLIER_PAYMENT_COMMAND_SEQUENCE) {
    results.push(await runner.execute(step));
  }
  return results;
}

export async function createSupplierPaymentReceipt(
  sql: SupplierPaymentSmokeSql,
  fixture: SupplierPaymentSmokeFixture,
  input: {
    receiptId: string;
    orderId: string;
    orderItemId: string;
    expectedVersion: number;
    receiptNo: string;
    acceptedQuantity: number;
    rejectedQuantity: number;
    varianceReason: string | null;
    idempotencyKey: string;
  },
): Promise<unknown> {
  const items = [{
    purchase_order_item_id: input.orderItemId,
    accepted_quantity: input.acceptedQuantity,
    rejected_quantity: input.rejectedQuantity,
    variance_reason: input.varianceReason,
  }];
  const rows = await sql<ResultRow[]>`
    select public.create_supplier_purchase_order_receipt(
      ${input.receiptId}::uuid,
      ${input.orderId}::uuid,
      ${fixture.tenant_id}::uuid,
      ${input.expectedVersion}::integer,
      ${input.receiptNo},
      '2026-07-31T03:00:00.000Z'::timestamptz,
      '供应商应付付款数据库烟测',
      ${items}::jsonb,
      ${fixture.user_id}::uuid,
      ${fixture.employee_id}::uuid,
      ${input.idempotencyKey}
    ) as result;
  `;
  return result(rows, "receipt command");
}

export async function listPayableFacts(
  sql: SupplierPaymentSmokeSql,
  fixture: SupplierPaymentSmokeFixture,
  orderId: string,
): Promise<PayableFact[]> {
  return sql<PayableFact[]>`
    select payable.id, payable.supplier_purchase_order_receipt_id::text
        as receipt_id,
      payable.supplier_purchase_order_receipt_item_id::text as receipt_item_id,
      payable.amount::text,
      payable.invoice_required_before_payment
    from public.supplier_payable_events as payable
    where payable.tenant_id = ${fixture.tenant_id}::uuid
      and payable.supplier_purchase_order_id = ${orderId}::uuid
    order by payable.occurred_at, payable.id;
  `;
}

export async function savePaymentRequest(
  sql: SupplierPaymentSmokeSql,
  fixture: SupplierPaymentRequestActorFixture,
  input: PaymentRequestCommand & {
    allocations: Array<{
      payable_event_id: string;
      requested_amount: string;
    }>;
  },
): Promise<SupplierPaymentCommandEnvelope> {
  const rows = await sql<ResultRow[]>`
    select public.save_supplier_payment_request_draft(
      ${input.requestId}::uuid,
      ${fixture.tenant_id}::uuid,
      ${fixture.project_id}::uuid,
      ${fixture.relationship_id}::uuid,
      ${input.expectedVersion}::integer,
      '供应商应付付款数据库烟测',
      null::text,
      ${input.allocations}::jsonb,
      ${fixture.user_id}::uuid,
      ${fixture.employee_id}::uuid,
      ${input.idempotencyKey}::uuid
    ) as result;
  `;
  return assertSupplierPaymentCommandEnvelope(
    result(rows, "save payment request"),
  );
}

export async function submitPaymentRequest(
  sql: SupplierPaymentSmokeSql,
  fixture: SupplierPaymentRequestActorFixture,
  input: PaymentRequestCommand,
): Promise<SupplierPaymentCommandEnvelope> {
  const rows = await sql<ResultRow[]>`
    select public.submit_supplier_payment_request(
      ${input.requestId}::uuid,
      ${fixture.tenant_id}::uuid,
      ${input.expectedVersion}::integer,
      ${fixture.user_id}::uuid,
      ${fixture.employee_id}::uuid,
      ${input.idempotencyKey}::uuid
    ) as result;
  `;
  return assertSupplierPaymentCommandEnvelope(
    result(rows, "submit payment request"),
  );
}

export async function reviewPaymentRequest(
  sql: SupplierPaymentSmokeSql,
  fixture: SupplierPaymentSmokeFixture,
  input: PaymentRequestCommand & {
    action: "approve" | "reject";
    remark: string | null;
    otherTenant?: boolean;
    selfReview?: boolean;
  },
): Promise<SupplierPaymentCommandEnvelope> {
  const isOtherTenant = input.otherTenant === true;
  const isSelfReview = input.selfReview === true;
  const rows = await sql<ResultRow[]>`
    select public.review_supplier_payment_request(
      ${input.requestId}::uuid,
      ${isOtherTenant
        ? fixture.other_tenant_id
        : fixture.tenant_id}::uuid,
      ${input.expectedVersion}::integer,
      ${input.action},
      ${input.remark},
      ${isOtherTenant
        ? fixture.other_user_id
        : isSelfReview
        ? fixture.user_id
        : fixture.reviewer_user_id}::uuid,
      ${isOtherTenant
        ? fixture.other_employee_id
        : isSelfReview
        ? fixture.employee_id
        : fixture.reviewer_employee_id}::uuid,
      ${input.idempotencyKey}::uuid
    ) as result;
  `;
  return assertSupplierPaymentCommandEnvelope(
    result(rows, "review payment request"),
  );
}

export async function listRequestAllocations(
  sql: SupplierPaymentSmokeSql,
  fixture: SupplierPaymentSmokeFixture,
  requestId: string,
): Promise<RequestAllocationFact[]> {
  return sql<RequestAllocationFact[]>`
    select allocation.id, allocation.payable_event_id,
      allocation.requested_amount::text, allocation.paid_amount::text
    from public.supplier_payment_request_allocations as allocation
    where allocation.tenant_id = ${fixture.tenant_id}::uuid
      and allocation.payment_request_id = ${requestId}::uuid
    order by allocation.payable_event_id, allocation.id;
  `;
}

export async function confirmSupplierPayment(
  sql: SupplierPaymentSmokeSql,
  fixture: SupplierPaymentSmokeFixture,
  input: PaymentRequestCommand & {
    paymentId: string;
    allocations: Array<{
      payment_request_allocation_id: string;
      payable_event_id: string;
      amount: string;
    }>;
    reference: string;
  },
): Promise<SupplierPaymentCommandEnvelope> {
  const rows = await sql<ResultRow[]>`
    select public.confirm_supplier_payment(
      ${input.paymentId}::uuid,
      ${input.requestId}::uuid,
      ${fixture.tenant_id}::uuid,
      ${input.expectedVersion}::integer,
      'bank_transfer',
      ${input.reference},
      '2026-07-31T04:00:00.000Z'::timestamptz,
      ${["https://example.invalid/supplier-payment-smoke.jpg"]}::jsonb,
      null::text,
      ${input.allocations}::jsonb,
      ${fixture.user_id}::uuid,
      ${fixture.employee_id}::uuid,
      ${input.idempotencyKey}::uuid
    ) as result;
  `;
  return assertSupplierPaymentCommandEnvelope(
    result(rows, "confirm supplier payment"),
  );
}
