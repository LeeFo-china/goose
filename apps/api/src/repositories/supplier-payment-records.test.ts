import { describe, expect, test } from "bun:test";

import {
  PROJECT_COST_EVENT_SELECT,
  SUPPLIER_PAYABLE_EVENT_SELECT,
  SUPPLIER_PAYMENT_ALLOCATION_SELECT,
  SUPPLIER_PAYMENT_REQUEST_ALLOCATION_SELECT,
  SUPPLIER_PAYMENT_REQUEST_SELECT,
  SUPPLIER_PAYMENT_SELECT,
  ProjectCostEventSchema,
  SupplierPayableEventSchema,
  SupplierPaymentAllocationSchema,
  SupplierPaymentCommandEnvelopeSchema,
  SupplierPaymentRequestAllocationSchema,
  SupplierPaymentRequestSchema,
  SupplierPaymentSchema,
} from "./supplier-payment-records";

const ID = "81000000-0000-4000-8000-000000000001";
const TENANT_ID = "81000000-0000-4000-8000-000000000002";
const PROJECT_ID = "81000000-0000-4000-8000-000000000003";
const CATEGORY_ID = "81000000-0000-4000-8000-000000000004";
const ORDER_ID = "81000000-0000-4000-8000-000000000005";
const ORDER_ITEM_ID = "81000000-0000-4000-8000-000000000006";
const REQUISITION_ID = "81000000-0000-4000-8000-000000000007";
const RECEIPT_ID = "81000000-0000-4000-8000-000000000008";
const RECEIPT_ITEM_ID = "81000000-0000-4000-8000-000000000009";
const RELATIONSHIP_ID = "81000000-0000-4000-8000-000000000010";
const SUPPLIER_ID = "81000000-0000-4000-8000-000000000011";
const EMPLOYEE_ID = "81000000-0000-4000-8000-000000000012";
const REQUEST_ID = "81000000-0000-4000-8000-000000000013";
const PAYABLE_ID = "81000000-0000-4000-8000-000000000014";
const REQUEST_ALLOCATION_ID = "81000000-0000-4000-8000-000000000015";
const PAYMENT_ID = "81000000-0000-4000-8000-000000000016";
const PAYMENT_ALLOCATION_ID = "81000000-0000-4000-8000-000000000017";
const IDEMPOTENCY_KEY = "81000000-0000-4000-8000-000000000018";
const AT = "2026-07-31T10:00:00.000+08:00";

const projectCostEvent = {
  id: ID,
  tenant_id: TENANT_ID,
  project_id: PROJECT_ID,
  cost_category_id: CATEGORY_ID,
  source_type: "supplier_purchase_receipt_item",
  source_id: RECEIPT_ITEM_ID,
  supplier_purchase_order_id: ORDER_ID,
  supplier_purchase_order_item_id: ORDER_ITEM_ID,
  purchase_requisition_id: REQUISITION_ID,
  amount: "100.00",
  currency: "CNY",
  occurred_at: AT,
  created_by_employee_id: EMPLOYEE_ID,
  created_at: AT,
} as const;

const payableEvent = {
  id: PAYABLE_ID,
  tenant_id: TENANT_ID,
  tenant_supplier_id: RELATIONSHIP_ID,
  supplier_id: SUPPLIER_ID,
  project_id: PROJECT_ID,
  cost_category_id: CATEGORY_ID,
  supplier_purchase_order_id: ORDER_ID,
  supplier_purchase_order_item_id: ORDER_ITEM_ID,
  receipt_id: RECEIPT_ID,
  receipt_item_id: RECEIPT_ITEM_ID,
  source_type: "supplier_purchase_receipt_item",
  source_id: RECEIPT_ITEM_ID,
  amount: "100.00",
  currency: "CNY" as const,
  occurred_at: AT,
  due_at: AT,
  created_by_employee_id: EMPLOYEE_ID,
  created_at: AT,
} as const;

const paymentRequest = {
  id: REQUEST_ID,
  tenant_id: TENANT_ID,
  project_id: PROJECT_ID,
  tenant_supplier_id: RELATIONSHIP_ID,
  supplier_id: SUPPLIER_ID,
  request_no: "SPR-20260731-00000001",
  status: "partially_paid",
  currency: "CNY",
  requested_amount: "100.00",
  paid_amount: "40.00",
  reason: "首批材料款",
  remark: null,
  version: 4,
  submitted_by_employee_id: EMPLOYEE_ID,
  submitted_at: AT,
  reviewed_by_employee_id: EMPLOYEE_ID,
  reviewed_at: AT,
  review_remark: "同意",
  cancelled_by_employee_id: null,
  cancelled_at: null,
  cancel_reason: null,
  closed_by_employee_id: null,
  closed_at: null,
  close_reason: null,
  created_by_employee_id: EMPLOYEE_ID,
  updated_by_employee_id: EMPLOYEE_ID,
  created_at: AT,
  updated_at: AT,
} as const;

const requestAllocation = {
  id: REQUEST_ALLOCATION_ID,
  tenant_id: TENANT_ID,
  payment_request_id: REQUEST_ID,
  payable_event_id: PAYABLE_ID,
  requested_amount: "100.00",
  paid_amount: "40.00",
  created_at: AT,
  updated_at: AT,
} as const;

const supplierPayment = {
  id: PAYMENT_ID,
  tenant_id: TENANT_ID,
  project_id: PROJECT_ID,
  tenant_supplier_id: RELATIONSHIP_ID,
  supplier_id: SUPPLIER_ID,
  payment_request_id: REQUEST_ID,
  payment_no: "SP-20260731-00000001",
  currency: "CNY" as const,
  amount: "40.00",
  payment_method: "bank_transfer" as const,
  payment_reference: "BANK-20260731-001",
  paid_at: AT,
  evidence_images: ["https://cdn.example.test/payment-1.jpg"],
  remark: null,
  confirmed_by_employee_id: EMPLOYEE_ID,
  idempotency_key: IDEMPOTENCY_KEY,
  created_at: AT,
};

const paymentAllocation = {
  id: PAYMENT_ALLOCATION_ID,
  tenant_id: TENANT_ID,
  supplier_payment_id: PAYMENT_ID,
  payment_request_allocation_id: REQUEST_ALLOCATION_ID,
  payable_event_id: PAYABLE_ID,
  amount: "40.00",
  created_at: AT,
} as const;

describe("supplier payable and payment database records", () => {
  test("selects every numeric database fact as text", () => {
    for (const select of [
      PROJECT_COST_EVENT_SELECT,
      SUPPLIER_PAYABLE_EVENT_SELECT,
      SUPPLIER_PAYMENT_REQUEST_SELECT,
      SUPPLIER_PAYMENT_REQUEST_ALLOCATION_SELECT,
      SUPPLIER_PAYMENT_SELECT,
      SUPPLIER_PAYMENT_ALLOCATION_SELECT,
    ]) {
      expect(select).toContain("amount::text");
    }
    expect(SUPPLIER_PAYMENT_REQUEST_SELECT).toContain(
      "requested_amount::text",
    );
    expect(SUPPLIER_PAYMENT_REQUEST_SELECT).toContain("paid_amount::text");
    expect(SUPPLIER_PAYMENT_REQUEST_ALLOCATION_SELECT).toContain(
      "requested_amount::text",
    );
    expect(SUPPLIER_PAYMENT_REQUEST_ALLOCATION_SELECT).toContain(
      "paid_amount::text",
    );
  });

  test("strictly parses project cost and supplier payable events", () => {
    expect(ProjectCostEventSchema.parse(projectCostEvent))
      .toEqual(projectCostEvent);
    expect(SupplierPayableEventSchema.parse(payableEvent))
      .toEqual(payableEvent);
    for (const invalid of [
      { ...projectCostEvent, source_type: "purchase_order_item" },
      { ...projectCostEvent, purchase_requisition_id: null },
      { ...projectCostEvent, amount: 100 },
      { ...projectCostEvent, currency: "USD" },
      { ...projectCostEvent, occurred_at: "2026-07-31" },
      { ...projectCostEvent, extra: true },
    ]) {
      expect(ProjectCostEventSchema.safeParse(invalid).success).toBe(false);
    }
    for (const invalid of [
      { ...payableEvent, source_type: "purchase_order_item" },
      { ...payableEvent, receipt_id: "invalid" },
      { ...payableEvent, amount: 100 },
      { ...payableEvent, currency: "USD" },
      { ...payableEvent, due_at: "2026-07-31" },
      { ...payableEvent, extra: true },
    ]) {
      expect(SupplierPayableEventSchema.safeParse(invalid).success).toBe(false);
    }
  });

  test("strictly parses request lifecycle state and nullable audits", () => {
    expect(SupplierPaymentRequestSchema.parse(paymentRequest))
      .toEqual(paymentRequest);
    expect(SupplierPaymentRequestSchema.parse({
      ...paymentRequest,
      status: "draft",
      submitted_by_employee_id: null,
      submitted_at: null,
      reviewed_by_employee_id: null,
      reviewed_at: null,
      review_remark: null,
    })).toMatchObject({
      status: "draft",
      submitted_at: null,
      reviewed_at: null,
    });
    for (const invalid of [
      { ...paymentRequest, status: "open" },
      { ...paymentRequest, currency: "USD" },
      { ...paymentRequest, requested_amount: 100 },
      { ...paymentRequest, paid_amount: -1 },
      { ...paymentRequest, version: 0 },
      { ...paymentRequest, reviewed_by_employee_id: "invalid" },
      { ...paymentRequest, closed_at: "yesterday" },
      { ...paymentRequest, extra: true },
    ]) {
      expect(SupplierPaymentRequestSchema.safeParse(invalid).success)
        .toBe(false);
    }
  });

  test("strictly parses request allocations with string money", () => {
    expect(SupplierPaymentRequestAllocationSchema.parse(requestAllocation))
      .toEqual(requestAllocation);
    for (const invalid of [
      { ...requestAllocation, payment_request_id: "invalid" },
      { ...requestAllocation, requested_amount: 100 },
      { ...requestAllocation, paid_amount: "-1.00" },
      { ...requestAllocation, created_at: "today" },
      { ...requestAllocation, extra: true },
    ]) {
      expect(SupplierPaymentRequestAllocationSchema.safeParse(invalid).success)
        .toBe(false);
    }
  });

  test("strictly parses payments and their allocations", () => {
    expect(SupplierPaymentSchema.parse(supplierPayment))
      .toEqual(supplierPayment);
    expect(SupplierPaymentAllocationSchema.parse(paymentAllocation))
      .toEqual(paymentAllocation);
    for (const invalid of [
      { ...supplierPayment, amount: 40 },
      { ...supplierPayment, payment_method: "card" },
      { ...supplierPayment, paid_at: "2026-07-31" },
      { ...supplierPayment, evidence_images: [1] },
      { ...supplierPayment, idempotency_key: "invalid" },
      { ...supplierPayment, extra: true },
    ]) {
      expect(SupplierPaymentSchema.safeParse(invalid).success).toBe(false);
    }
    for (const invalid of [
      { ...paymentAllocation, amount: 40 },
      { ...paymentAllocation, payable_event_id: "invalid" },
      { ...paymentAllocation, created_at: "today" },
      { ...paymentAllocation, extra: true },
    ]) {
      expect(SupplierPaymentAllocationSchema.safeParse(invalid).success)
        .toBe(false);
    }
  });

  test("enforces numeric eighteen scale two money strings", () => {
    const cases = [
      [ProjectCostEventSchema, projectCostEvent, "amount"],
      [SupplierPayableEventSchema, payableEvent, "amount"],
      [SupplierPaymentRequestSchema, paymentRequest, "requested_amount"],
      [SupplierPaymentRequestSchema, paymentRequest, "paid_amount"],
      [
        SupplierPaymentRequestAllocationSchema,
        requestAllocation,
        "requested_amount",
      ],
      [
        SupplierPaymentRequestAllocationSchema,
        requestAllocation,
        "paid_amount",
      ],
      [SupplierPaymentSchema, supplierPayment, "amount"],
      [SupplierPaymentAllocationSchema, paymentAllocation, "amount"],
    ] as const;
    for (const [schema, record, field] of cases) {
      expect(schema.safeParse({ ...record, [field]: "0.00" }).success)
        .toBe(true);
      expect(schema.safeParse({
        ...record,
        [field]: "9999999999999999.99",
      }).success).toBe(true);
      for (const value of [
        1,
        "-0.01",
        "1",
        "01.00",
        "1.001",
        "10000000000000000.00",
      ]) {
        expect(schema.safeParse({ ...record, [field]: value }).success)
          .toBe(false);
      }
    }
  });
});

describe("supplier payment command envelope", () => {
  test("strictly parses request-only success statuses", () => {
    for (const status of [
      "saved",
      "submitted",
      "approved",
      "rejected",
      "cancelled",
      "closed",
    ] as const) {
      const envelope = {
        status,
        idempotent: false,
        payment_request: paymentRequest,
        version: 4,
      };
      const result = SupplierPaymentCommandEnvelopeSchema.safeParse(envelope);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(envelope);
      }
      expect(SupplierPaymentCommandEnvelopeSchema.safeParse({
        ...envelope,
        payment: supplierPayment,
      }).success).toBe(false);
    }
  });

  test("requires a payment for partially paid and paid statuses", () => {
    for (const status of ["partially_paid", "paid"] as const) {
      const envelope = {
        status,
        idempotent: true,
        payment_request: {
          ...paymentRequest,
          status,
        },
        payment: supplierPayment,
        version: 5,
      };
      const result = SupplierPaymentCommandEnvelopeSchema.safeParse(envelope);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(envelope);
      }
      const { payment: _payment, ...withoutPayment } = envelope;
      expect(SupplierPaymentCommandEnvelopeSchema.safeParse(withoutPayment)
        .success).toBe(false);
    }
  });

  test("strictly pairs stable error statuses and error codes", () => {
    const envelopes = [
      {
        status: "not_found",
        error_code: "SUPPLIER_PAYMENT_NOT_FOUND",
      },
      {
        status: "validation_error",
        error_code: "SUPPLIER_PAYMENT_VALIDATION_ERROR",
      },
      {
        status: "state_conflict",
        error_code: "SUPPLIER_PAYMENT_STATE_CONFLICT",
      },
      {
        status: "version_conflict",
        error_code: "SUPPLIER_PAYMENT_VERSION_CONFLICT",
      },
      {
        status: "scope_mismatch",
        error_code: "SUPPLIER_PAYMENT_SCOPE_MISMATCH",
      },
      {
        status: "amount_unavailable",
        error_code: "SUPPLIER_PAYMENT_AMOUNT_UNAVAILABLE",
      },
      {
        status: "allocation_invalid",
        error_code: "SUPPLIER_PAYMENT_ALLOCATION_INVALID",
      },
      {
        status: "evidence_required",
        error_code: "SUPPLIER_PAYMENT_EVIDENCE_REQUIRED",
      },
      {
        status: "invoice_required",
        error_code: "SUPPLIER_PAYMENT_INVOICE_REQUIRED",
      },
      {
        status: "self_review",
        error_code: "SUPPLIER_PAYMENT_SELF_REVIEW",
      },
      {
        status: "idempotency_conflict",
        error_code: "SUPPLIER_PAYMENT_IDEMPOTENCY_CONFLICT",
      },
    ] as const;
    for (const base of envelopes) {
      const envelope = { ...base, reason: "命令执行失败" };
      const result = SupplierPaymentCommandEnvelopeSchema.safeParse(envelope);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(envelope);
      }
      expect(SupplierPaymentCommandEnvelopeSchema.safeParse({
        ...envelope,
        error_code: "SUPPLIER_PAYMENT_UNKNOWN",
      }).success).toBe(false);
      expect(SupplierPaymentCommandEnvelopeSchema.safeParse({
        ...envelope,
        extra: true,
      }).success).toBe(false);
    }
  });
});
