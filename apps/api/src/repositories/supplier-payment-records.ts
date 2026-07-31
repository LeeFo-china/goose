import { z } from "zod";

import {
  SupplierPaymentMethodSchema,
  SupplierPaymentRequestStatusSchema,
} from "@/schema/supplier-payments";

export const PROJECT_COST_EVENT_SELECT = [
  "id",
  "tenant_id",
  "project_id",
  "cost_category_id",
  "source_type",
  "source_id",
  "supplier_purchase_order_id",
  "supplier_purchase_order_item_id",
  "purchase_requisition_id",
  "amount::text",
  "currency",
  "occurred_at",
  "created_by_employee_id",
  "created_at",
].join(",");

export const SUPPLIER_PAYABLE_EVENT_SELECT = [
  "id",
  "tenant_id",
  "tenant_supplier_id",
  "supplier_id",
  "project_id",
  "cost_category_id",
  "supplier_purchase_order_id",
  "supplier_purchase_order_item_id",
  "receipt_id",
  "receipt_item_id",
  "source_type",
  "source_id",
  "amount::text",
  "currency",
  "occurred_at",
  "due_at",
  "created_by_employee_id",
  "created_at",
].join(",");

export const SUPPLIER_PAYMENT_REQUEST_SELECT = [
  "id",
  "tenant_id",
  "project_id",
  "tenant_supplier_id",
  "supplier_id",
  "request_no",
  "status",
  "currency",
  "requested_amount::text",
  "paid_amount::text",
  "reason",
  "remark",
  "version",
  "submitted_by_employee_id",
  "submitted_at",
  "reviewed_by_employee_id",
  "reviewed_at",
  "review_remark",
  "cancelled_by_employee_id",
  "cancelled_at",
  "cancel_reason",
  "closed_by_employee_id",
  "closed_at",
  "close_reason",
  "created_by_employee_id",
  "updated_by_employee_id",
  "created_at",
  "updated_at",
].join(",");

export const SUPPLIER_PAYMENT_REQUEST_ALLOCATION_SELECT = [
  "id",
  "tenant_id",
  "payment_request_id",
  "payable_event_id",
  "requested_amount::text",
  "paid_amount::text",
  "created_at",
  "updated_at",
].join(",");

export const SUPPLIER_PAYMENT_SELECT = [
  "id",
  "tenant_id",
  "project_id",
  "tenant_supplier_id",
  "supplier_id",
  "payment_request_id",
  "payment_no",
  "currency",
  "amount::text",
  "payment_method",
  "payment_reference",
  "paid_at",
  "evidence_images",
  "remark",
  "confirmed_by_employee_id",
  "idempotency_key",
  "created_at",
].join(",");

export const SUPPLIER_PAYMENT_ALLOCATION_SELECT = [
  "id",
  "tenant_id",
  "supplier_payment_id",
  "payment_request_allocation_id",
  "payable_event_id",
  "amount::text",
  "created_at",
].join(",");

const uuid = z.uuid();
const dateTime = z.iso.datetime({ offset: true });
const money = z.string().regex(/^(?:0|[1-9]\d{0,15})\.\d{2}$/);
const nullableEmployeeId = uuid.nullable();
const nullableDateTime = dateTime.nullable();
const nullableRemark = z.string().max(500).nullable();

export const ProjectCostEventSchema = z.object({
  id: uuid,
  tenant_id: uuid,
  project_id: uuid,
  cost_category_id: uuid,
  source_type: z.literal("supplier_purchase_receipt_item"),
  source_id: uuid,
  supplier_purchase_order_id: uuid,
  supplier_purchase_order_item_id: uuid,
  purchase_requisition_id: uuid,
  amount: money,
  currency: z.literal("CNY"),
  occurred_at: dateTime,
  created_by_employee_id: uuid,
  created_at: dateTime,
}).strict();

export const SupplierPayableEventSchema = z.object({
  id: uuid,
  tenant_id: uuid,
  tenant_supplier_id: uuid,
  supplier_id: uuid,
  project_id: uuid,
  cost_category_id: uuid,
  supplier_purchase_order_id: uuid,
  supplier_purchase_order_item_id: uuid,
  receipt_id: uuid,
  receipt_item_id: uuid,
  source_type: z.literal("supplier_purchase_receipt_item"),
  source_id: uuid,
  amount: money,
  currency: z.literal("CNY"),
  occurred_at: dateTime,
  due_at: dateTime,
  created_by_employee_id: uuid,
  created_at: dateTime,
}).strict();

export const SupplierPaymentRequestSchema = z.object({
  id: uuid,
  tenant_id: uuid,
  project_id: uuid,
  tenant_supplier_id: uuid,
  supplier_id: uuid,
  request_no: z.string().min(1),
  status: SupplierPaymentRequestStatusSchema,
  currency: z.literal("CNY"),
  requested_amount: money,
  paid_amount: money,
  reason: z.string().min(1),
  remark: nullableRemark,
  version: z.number().int().positive(),
  submitted_by_employee_id: nullableEmployeeId,
  submitted_at: nullableDateTime,
  reviewed_by_employee_id: nullableEmployeeId,
  reviewed_at: nullableDateTime,
  review_remark: nullableRemark,
  cancelled_by_employee_id: nullableEmployeeId,
  cancelled_at: nullableDateTime,
  cancel_reason: nullableRemark,
  closed_by_employee_id: nullableEmployeeId,
  closed_at: nullableDateTime,
  close_reason: nullableRemark,
  created_by_employee_id: uuid,
  updated_by_employee_id: uuid,
  created_at: dateTime,
  updated_at: dateTime,
}).strict();

export const SupplierPaymentRequestAllocationSchema = z.object({
  id: uuid,
  tenant_id: uuid,
  payment_request_id: uuid,
  payable_event_id: uuid,
  requested_amount: money,
  paid_amount: money,
  created_at: dateTime,
  updated_at: dateTime,
}).strict();

export const SupplierPaymentSchema = z.object({
  id: uuid,
  tenant_id: uuid,
  project_id: uuid,
  tenant_supplier_id: uuid,
  supplier_id: uuid,
  payment_request_id: uuid,
  payment_no: z.string().min(1),
  currency: z.literal("CNY"),
  amount: money,
  payment_method: SupplierPaymentMethodSchema,
  payment_reference: z.string().min(1).max(200),
  paid_at: dateTime,
  evidence_images: z.array(z.string().min(1).max(2048)).min(1).max(9),
  remark: nullableRemark,
  confirmed_by_employee_id: uuid,
  idempotency_key: uuid,
  created_at: dateTime,
}).strict();

export const SupplierPaymentAllocationSchema = z.object({
  id: uuid,
  tenant_id: uuid,
  supplier_payment_id: uuid,
  payment_request_allocation_id: uuid,
  payable_event_id: uuid,
  amount: money,
  created_at: dateTime,
}).strict();

export const SUPPLIER_PAYMENT_COMMAND_ERROR_CODES = {
  not_found: "SUPPLIER_PAYMENT_NOT_FOUND",
  validation_error: "SUPPLIER_PAYMENT_VALIDATION_ERROR",
  state_conflict: "SUPPLIER_PAYMENT_STATE_CONFLICT",
  version_conflict: "SUPPLIER_PAYMENT_VERSION_CONFLICT",
  scope_mismatch: "SUPPLIER_PAYMENT_SCOPE_MISMATCH",
  amount_unavailable: "SUPPLIER_PAYMENT_AMOUNT_UNAVAILABLE",
  allocation_invalid: "SUPPLIER_PAYMENT_ALLOCATION_INVALID",
  evidence_required: "SUPPLIER_PAYMENT_EVIDENCE_REQUIRED",
  invoice_required: "SUPPLIER_PAYMENT_INVOICE_REQUIRED",
  self_review: "SUPPLIER_PAYMENT_SELF_REVIEW",
  idempotency_conflict: "SUPPLIER_PAYMENT_IDEMPOTENCY_CONFLICT",
} as const;

const SupplierPaymentRequestCommandSuccessSchema = z.object({
  status: z.enum([
    "saved",
    "submitted",
    "approved",
    "rejected",
    "cancelled",
    "closed",
  ]),
  idempotent: z.boolean(),
  payment_request: SupplierPaymentRequestSchema,
  version: z.number().int().positive(),
}).strict();

const SupplierPaymentCommandSuccessSchema = z.object({
  status: z.enum(["partially_paid", "paid"]),
  idempotent: z.boolean(),
  payment_request: SupplierPaymentRequestSchema,
  payment: SupplierPaymentSchema,
  version: z.number().int().positive(),
}).strict();

function commandErrorSchema<
  Status extends keyof typeof SUPPLIER_PAYMENT_COMMAND_ERROR_CODES,
>(
  status: Status,
) {
  return z.object({
    status: z.literal(status),
    error_code: z.literal(SUPPLIER_PAYMENT_COMMAND_ERROR_CODES[status]),
  }).strict();
}

export const SupplierPaymentCommandEnvelopeSchema = z.union([
  SupplierPaymentRequestCommandSuccessSchema,
  SupplierPaymentCommandSuccessSchema,
  commandErrorSchema("not_found"),
  commandErrorSchema("validation_error"),
  commandErrorSchema("state_conflict"),
  commandErrorSchema("version_conflict"),
  commandErrorSchema("scope_mismatch"),
  commandErrorSchema("amount_unavailable"),
  commandErrorSchema("allocation_invalid"),
  commandErrorSchema("evidence_required"),
  commandErrorSchema("invoice_required"),
  commandErrorSchema("self_review"),
  commandErrorSchema("idempotency_conflict"),
]);

export type ProjectCostEvent =
  z.infer<typeof ProjectCostEventSchema>;
export type SupplierPayableEvent =
  z.infer<typeof SupplierPayableEventSchema>;
export type SupplierPaymentRequest =
  z.infer<typeof SupplierPaymentRequestSchema>;
export type SupplierPaymentRequestAllocation =
  z.infer<typeof SupplierPaymentRequestAllocationSchema>;
export type SupplierPayment =
  z.infer<typeof SupplierPaymentSchema>;
export type SupplierPaymentAllocation =
  z.infer<typeof SupplierPaymentAllocationSchema>;
export type SupplierPaymentCommandEnvelope =
  z.infer<typeof SupplierPaymentCommandEnvelopeSchema>;
