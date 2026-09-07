import { z } from "zod";
import { payableDestination, samePayableDestination, type PayableDestinationFields } from "../supplier-payables/payable-destination";
import { moneyCents } from "./payment-request-page-utils";
import type { PendingPaymentRequestCommand } from "./payment-request-command";
import type { SupplierPaymentCommandResult } from "./payment-request-types";

const uuid = z.uuid();
const nullableId = uuid.nullable();
const time = z.iso.datetime({ offset: true });
const money = z.string().regex(/^(?:0|[1-9]\d{0,15})\.\d{2}$/);
const destinationFields = {
  destination_type: z.enum(["project", "warehouse"]).optional(),
  project_id: nullableId,
  warehouse_id: nullableId.optional(),
};
const requestSchema = z.object({
  ...destinationFields,
  id: uuid, tenant_id: uuid, tenant_supplier_id: uuid, supplier_id: uuid,
  request_no: z.string().min(1), currency: z.literal("CNY"),
  status: z.enum(["draft", "pending_approval", "approved", "rejected", "cancelled", "closed", "partially_paid", "paid"]),
  requested_amount: money, paid_amount: money, reason: z.string().min(1), remark: z.string().nullable(),
  version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  submitted_by_employee_id: nullableId, submitted_at: time.nullable(),
  reviewed_by_employee_id: nullableId, reviewed_at: time.nullable(), review_remark: z.string().nullable(),
  cancelled_by_employee_id: nullableId, cancelled_at: time.nullable(), cancel_reason: z.string().nullable(),
  closed_by_employee_id: nullableId, closed_at: time.nullable(), close_reason: z.string().nullable(),
  created_by_employee_id: uuid, updated_by_employee_id: uuid, created_at: time, updated_at: time,
});
const paymentSchema = z.object({
  ...destinationFields,
  id: uuid, tenant_id: uuid, tenant_supplier_id: uuid, supplier_id: uuid, payment_request_id: uuid,
  payment_no: z.string().min(1), currency: z.literal("CNY"), amount: money,
  payment_method: z.enum(["bank_transfer", "wechat", "alipay", "cash", "other"]),
  payment_reference: z.string().min(1).max(200), paid_at: time,
  evidence_images: z.array(z.string().min(1).max(2048)).min(1).max(9), remark: z.string().nullable(),
  confirmed_by_employee_id: uuid, idempotency_key: uuid, created_at: time,
});
const receiptSchema = z.object({
  status: z.enum(["saved", "submitted", "approved", "rejected", "cancelled", "closed", "partially_paid", "paid"]),
  idempotent: z.boolean(), payment_request: requestSchema,
  version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  payment: paymentSchema.optional(),
});
const requestStatus = { saved: "draft", submitted: "pending_approval", approved: "approved", rejected: "rejected",
  cancelled: "cancelled", closed: "closed", partially_paid: "partially_paid", paid: "paid" } as const;
const commandStatus = { create: "saved", update: "saved", submit: "submitted", approve: "approved",
  reject: "rejected", cancel: "cancelled", close: "closed" } as const;

export function parsePaymentRequestReceipt(value: unknown, pending: PendingPaymentRequestCommand): SupplierPaymentCommandResult | null {
  const parsed = receiptSchema.safeParse(value);
  if (!parsed.success) return null;
  const result = parsed.data;
  const request = result.payment_request;
  const { payload, resourcePath, attempt } = pending.command;
  if (!payableDestination(request) || !samePayableDestination(request, pending.destination) ||
      request.id.toLowerCase() !== resourcePath.toLowerCase() || result.version !== request.version ||
      result.version !== payload.expected_version + 1 || request.status !== requestStatus[result.status] ||
      moneyCents(request.paid_amount) > moneyCents(request.requested_amount)) return null;
  const requested = moneyCents(request.requested_amount);
  const paid = moneyCents(request.paid_amount);
  // Match the database state/amount constraint, including terminal close receipts.
  if (request.status === "paid" ? requested <= BigInt(0) || paid !== requested
    : request.status === "partially_paid" || request.status === "closed"
    ? paid <= BigInt(0) || paid >= requested : paid !== BigInt(0)) return null;
  const isDraft = pending.kind === "create" || pending.kind === "update";
  if (!isDraft) {
    if (!pending.amounts || requested !== moneyCents(pending.amounts.requested_amount)) return null;
    const increment = pending.kind === "pay" && "payment_method" in payload
      ? payload.allocations.reduce((sum, line) => sum + moneyCents(line.amount), BigInt(0)) : BigInt(0);
    if (paid !== moneyCents(pending.amounts.paid_amount) + increment) return null;
  }
  if (pending.kind !== "pay") {
    if (result.status !== commandStatus[pending.kind] || result.payment) return null;
    if ("tenant_supplier_id" in payload && (payload.tenant_supplier_id.toLowerCase() !== request.tenant_supplier_id.toLowerCase() ||
        !samePayableDestination(payload, request) || moneyCents(request.requested_amount) !==
        payload.allocations.reduce((sum, line) => sum + moneyCents(line.requested_amount), BigInt(0)))) return null;
    // The status check above narrows the runtime envelope to a request-only receipt.
    return result as SupplierPaymentCommandResult;
  }
  if ((result.status !== "paid" && result.status !== "partially_paid") || !result.payment || !("payment_method" in payload)) return null;
  if (result.status === "paid" ? request.paid_amount !== request.requested_amount
    : moneyCents(request.paid_amount) <= BigInt(0) || moneyCents(request.paid_amount) >= moneyCents(request.requested_amount)) return null;
  const payment = result.payment;
  if (moneyCents(payment.amount) > moneyCents(request.paid_amount)) return null;
  if (payment.id.toLowerCase() !== payload.id.toLowerCase() || payment.payment_request_id.toLowerCase() !== request.id.toLowerCase() ||
      payment.idempotency_key.toLowerCase() !== attempt.idempotencyKey.toLowerCase() || !samePayableDestination(payment, request) ||
      (["tenant_id", "tenant_supplier_id", "supplier_id", "currency"] as const).some((field) =>
        payment[field].toLowerCase() !== request[field].toLowerCase()) ||
      moneyCents(payment.amount) !== payload.allocations.reduce((sum, line) => sum + moneyCents(line.amount), BigInt(0)) ||
      payment.payment_method !== payload.payment_method || payment.payment_reference !== payload.payment_reference ||
      Date.parse(payment.paid_at) !== Date.parse(payload.paid_at) ||
      JSON.stringify(payment.evidence_images) !== JSON.stringify(payload.evidence_images)) return null;
  return { ...result, status: result.status, payment };
}

export function freezeFinancialDestination(value: PayableDestinationFields) {
  const destination = payableDestination(value);
  if (!destination) throw new RangeError("采购去向无效，无法发起付款申请操作");
  return Object.freeze(destination);
}
