import { describe, expect, test } from "bun:test";

import {
  SupplierPayableFilterOptionQuerySchema,
  SupplierPayableListQuerySchema,
  SupplierPaymentConfirmSchema,
  SupplierPaymentListQuerySchema,
  SupplierPaymentRequestCancelSchema,
  SupplierPaymentRequestCloseSchema,
  SupplierPaymentRequestDraftSchema,
  SupplierPaymentRequestListQuerySchema,
  SupplierPaymentRequestParamSchema,
  SupplierPaymentRequestReviewSchema,
  SupplierPaymentRequestSubmitSchema,
} from "./supplier-payments";

const REQUEST_ID = "71000000-0000-4000-8000-000000000001";
const PROJECT_ID = "71000000-0000-4000-8000-000000000002";
const TENANT_SUPPLIER_ID = "71000000-0000-4000-8000-000000000003";
const PURCHASE_ORDER_ID = "71000000-0000-4000-8000-000000000004";
const PAYABLE_EVENT_ID = "71000000-0000-4000-8000-000000000005";
const REQUEST_ALLOCATION_ID = "71000000-0000-4000-8000-000000000006";
const PAYMENT_ID = "71000000-0000-4000-8000-000000000007";
const FROM = "2026-07-01T00:00:00.000+08:00";
const TO = "2026-07-31T23:59:59.000+08:00";

function draft(overrides: Record<string, unknown> = {}) {
  return {
    id: REQUEST_ID,
    project_id: PROJECT_ID,
    tenant_supplier_id: TENANT_SUPPLIER_ID,
    expected_version: 0,
    reason: " 支付首批到货材料款 ",
    remark: " 按合同节点付款 ",
    allocations: [{
      payable_event_id: PAYABLE_EVENT_ID,
      requested_amount: "100.00",
    }],
    ...overrides,
  };
}

function payment(overrides: Record<string, unknown> = {}) {
  return {
    id: PAYMENT_ID,
    expected_version: 3,
    payment_method: "bank_transfer" as const,
    payment_reference: " BANK-20260731-001 ",
    paid_at: "2026-07-31T10:00:00.000+08:00",
    evidence_images: [" https://cdn.example.test/payment-1.jpg "],
    remark: " 首次付款 ",
    allocations: [{
      payment_request_allocation_id: REQUEST_ALLOCATION_ID,
      payable_event_id: PAYABLE_EVENT_ID,
      amount: "100.00",
    }],
    ...overrides,
  };
}

describe("supplier payable and payment request query schemas", () => {
  test("defaults pagination and caps every payment list at one hundred", () => {
    for (const schema of [
      SupplierPayableListQuerySchema,
      SupplierPaymentRequestListQuerySchema,
      SupplierPaymentListQuerySchema,
    ]) {
      expect(schema.parse({})).toEqual({ page: 1, pageSize: 20 });
      expect(schema.parse({ page: "2", pageSize: "100" })).toMatchObject({
        page: 2,
        pageSize: 100,
      });
      expect(schema.safeParse({ pageSize: "101" }).success).toBe(false);
    }
  });

  test("strictly bounds payable filter option queries", () => {
    for (const type of ["project", "supplier", "purchase_order"] as const) {
      expect(SupplierPayableFilterOptionQuerySchema.parse({
        type,
        keyword: "  测试  ",
        page: "2",
        pageSize: "100",
      })).toEqual({ type, keyword: "测试", page: 2, pageSize: 100 });
    }
    for (const input of [
      { type: "receipt" },
      { type: "project", keyword: " " },
      { type: "project", keyword: "a".repeat(101) },
      { type: "project", pageSize: 101 },
      { type: "project", unknown: true },
    ]) {
      expect(SupplierPayableFilterOptionQuerySchema.safeParse(input).success)
        .toBe(false);
    }
  });

  test("strictly filters payables and validates the due range", () => {
    expect(SupplierPayableListQuerySchema.parse({
      project_id: PROJECT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      purchase_order_id: PURCHASE_ORDER_ID,
      status: "overdue",
      due_from: FROM,
      due_to: TO,
    })).toMatchObject({
      project_id: PROJECT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      purchase_order_id: PURCHASE_ORDER_ID,
      status: "overdue",
      due_from: FROM,
      due_to: TO,
    });
    for (const input of [
      { project_id: "invalid" },
      { tenant_supplier_id: "invalid" },
      { purchase_order_id: "invalid" },
      { status: "closed" },
      { due_from: "2026-07-01" },
      { due_to: "tomorrow" },
      { due_from: TO, due_to: FROM },
      { unknown: true },
    ]) {
      expect(SupplierPayableListQuerySchema.safeParse(input).success)
        .toBe(false);
    }
    for (const status of [
      "open",
      "reserved",
      "partially_paid",
      "paid",
      "overdue",
    ] as const) {
      expect(SupplierPayableListQuerySchema.parse({ status }).status)
        .toBe(status);
    }
  });

  test("strictly filters requests and validates the creation range", () => {
    expect(SupplierPaymentRequestListQuerySchema.parse({
      project_id: PROJECT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      status: "pending_approval",
      keyword: " 材料款 ",
      created_from: FROM,
      created_to: TO,
    })).toMatchObject({
      project_id: PROJECT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      status: "pending_approval",
      keyword: "材料款",
      created_from: FROM,
      created_to: TO,
    });
    for (const input of [
      { project_id: "invalid" },
      { tenant_supplier_id: "invalid" },
      { status: "open" },
      { keyword: "" },
      { keyword: " " },
      { keyword: "a".repeat(101) },
      { created_from: "2026-07-01" },
      { created_to: "tomorrow" },
      { created_from: TO, created_to: FROM },
      { purchase_order_id: PURCHASE_ORDER_ID },
      { unknown: true },
    ]) {
      expect(SupplierPaymentRequestListQuerySchema.safeParse(input).success)
        .toBe(false);
    }
  });

  test("strictly parses request params", () => {
    expect(SupplierPaymentRequestParamSchema.parse({ id: REQUEST_ID }))
      .toEqual({ id: REQUEST_ID });
    expect(SupplierPaymentRequestParamSchema.safeParse({ id: "invalid" })
      .success).toBe(false);
    expect(SupplierPaymentRequestParamSchema.safeParse({
      id: REQUEST_ID,
      tenant_id: TENANT_SUPPLIER_ID,
    }).success).toBe(false);
  });
});

describe("supplier payment request draft schema", () => {
  test("accepts a strict trimmed draft without server-owned facts", () => {
    expect(SupplierPaymentRequestDraftSchema.parse(draft())).toEqual({
      ...draft(),
      reason: "支付首批到货材料款",
      remark: "按合同节点付款",
    });
    for (const forbiddenField of [
      "tenant_id",
      "actor_employee_id",
      "supplier_id",
      "request_no",
      "status",
      "paid_amount",
      "total_amount",
      "created_by_employee_id",
    ]) {
      expect(SupplierPaymentRequestDraftSchema.safeParse(draft({
        [forbiddenField]: forbiddenField,
      })).success).toBe(false);
    }
  });

  test("requires valid ids, bounded text and a nonnegative draft version", () => {
    for (const input of [
      draft({ id: "invalid" }),
      draft({ project_id: "invalid" }),
      draft({ tenant_supplier_id: "invalid" }),
      draft({ reason: "" }),
      draft({ reason: " " }),
      draft({ reason: "a".repeat(501) }),
      draft({ remark: "a".repeat(501) }),
      draft({ expected_version: -1 }),
      draft({ expected_version: 1.5 }),
      draft({ expected_version: "0" }),
    ]) {
      expect(SupplierPaymentRequestDraftSchema.safeParse(input).success)
        .toBe(false);
    }
    expect(SupplierPaymentRequestDraftSchema.parse(draft({
      expected_version: 2,
      remark: " ",
    }))).toMatchObject({ expected_version: 2, remark: "" });
  });

  test("requires one to one hundred unique payable allocations", () => {
    expect(SupplierPaymentRequestDraftSchema.safeParse(draft({
      allocations: [],
    })).success).toBe(false);
    expect(SupplierPaymentRequestDraftSchema.safeParse(draft({
      allocations: [
        {
          payable_event_id: PAYABLE_EVENT_ID,
          requested_amount: "1.00",
        },
        {
          payable_event_id: PAYABLE_EVENT_ID.toUpperCase(),
          requested_amount: "2.00",
        },
      ],
    })).success).toBe(false);
    expect(SupplierPaymentRequestDraftSchema.safeParse(draft({
      allocations: Array.from({ length: 101 }, (_, index) => ({
        payable_event_id: `71000000-0000-4000-8000-${
          String(index + 100).padStart(12, "0")
        }`,
        requested_amount: "1.00",
      })),
    })).success).toBe(false);
  });

  test("enforces positive numeric eighteen scale two requested amounts", () => {
    for (const requestedAmount of [
      "0.00",
      "1",
      "01.00",
      "-1.00",
      "1.001",
      "10000000000000000.00",
      " 1.00 ",
      1,
    ]) {
      expect(SupplierPaymentRequestDraftSchema.safeParse(draft({
        allocations: [{
          payable_event_id: PAYABLE_EVENT_ID,
          requested_amount: requestedAmount,
        }],
      })).success).toBe(false);
    }
    expect(SupplierPaymentRequestDraftSchema.parse(draft({
      allocations: [{
        payable_event_id: PAYABLE_EVENT_ID,
        requested_amount: "9999999999999999.99",
      }],
    })).allocations[0]?.requested_amount).toBe("9999999999999999.99");
  });
});

describe("supplier payment request command schemas", () => {
  test("requires positive versions for submit, review, cancel and close", () => {
    expect(SupplierPaymentRequestSubmitSchema.parse({ expected_version: 1 }))
      .toEqual({ expected_version: 1 });
    expect(SupplierPaymentRequestReviewSchema.parse({
      expected_version: 2,
      remark: " 同意 ",
    })).toEqual({ expected_version: 2, remark: "同意" });
    expect(SupplierPaymentRequestReviewSchema.parse({
      expected_version: 2,
      remark: " ",
    }).remark).toBe("");
    for (const schema of [
      SupplierPaymentRequestSubmitSchema,
      SupplierPaymentRequestReviewSchema,
    ]) {
      expect(schema.safeParse({ expected_version: 0 }).success).toBe(false);
      expect(schema.safeParse({ expected_version: 1, action: "approve" })
        .success).toBe(false);
    }
  });

  test("requires a bounded reason to cancel or close", () => {
    for (const schema of [
      SupplierPaymentRequestCancelSchema,
      SupplierPaymentRequestCloseSchema,
    ]) {
      expect(schema.parse({
        expected_version: 2,
        reason: " 业务计划调整 ",
      })).toEqual({
        expected_version: 2,
        reason: "业务计划调整",
      });
      for (const reason of ["", " ", "a".repeat(501)]) {
        expect(schema.safeParse({ expected_version: 2, reason }).success)
          .toBe(false);
      }
      expect(schema.safeParse({
        expected_version: 0,
        reason: "调整",
      }).success).toBe(false);
      expect(schema.safeParse({
        expected_version: 2,
        reason: "调整",
        actor_employee_id: REQUEST_ID,
      }).success).toBe(false);
    }
  });
});

describe("supplier payment confirmation schema", () => {
  test("accepts and trims a strict payment confirmation", () => {
    expect(SupplierPaymentConfirmSchema.parse(payment())).toEqual({
      ...payment(),
      payment_reference: "BANK-20260731-001",
      evidence_images: ["https://cdn.example.test/payment-1.jpg"],
      remark: "首次付款",
    });
    for (const forbiddenField of [
      "tenant_id",
      "actor_employee_id",
      "supplier_id",
      "payment_request_id",
      "payment_no",
      "currency",
      "total_amount",
      "confirmed_by_employee_id",
      "idempotency_key",
    ]) {
      expect(SupplierPaymentConfirmSchema.safeParse(payment({
        [forbiddenField]: forbiddenField,
      })).success).toBe(false);
    }
  });

  test("requires supported payment facts and remark for other", () => {
    for (const paymentMethod of [
      "bank_transfer",
      "wechat",
      "alipay",
      "cash",
      "other",
    ] as const) {
      expect(SupplierPaymentConfirmSchema.safeParse(payment({
        payment_method: paymentMethod,
        remark: paymentMethod === "other" ? "线下票据支付" : " ",
      })).success).toBe(true);
    }
    for (const input of [
      payment({ id: "invalid" }),
      payment({ expected_version: 0 }),
      payment({ payment_method: "card" }),
      payment({ payment_reference: "" }),
      payment({ payment_reference: "a".repeat(201) }),
      payment({ paid_at: "2026-07-31" }),
      payment({ payment_method: "other", remark: null }),
      payment({ payment_method: "other", remark: " " }),
    ]) {
      expect(SupplierPaymentConfirmSchema.safeParse(input).success).toBe(false);
    }
  });

  test("requires one to nine bounded evidence image identities", () => {
    for (const evidenceImages of [
      [],
      Array.from({ length: 10 }, (_, index) => `image-${index}`),
      [""],
      [" "],
      ["a".repeat(2049)],
    ]) {
      expect(SupplierPaymentConfirmSchema.safeParse(payment({
        evidence_images: evidenceImages,
      })).success).toBe(false);
    }
  });

  test("requires bounded independently unique payment allocations", () => {
    const secondRequestAllocationId =
      "71000000-0000-4000-8000-000000000008";
    const secondPayableEventId =
      "71000000-0000-4000-8000-000000000009";
    expect(SupplierPaymentConfirmSchema.safeParse(payment({
      allocations: [],
    })).success).toBe(false);
    expect(SupplierPaymentConfirmSchema.safeParse(payment({
      allocations: Array.from({ length: 101 }, (_, index) => ({
        payment_request_allocation_id:
          `72000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        payable_event_id:
          `73000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        amount: "1.00",
      })),
    })).success).toBe(false);
    for (const allocations of [
      [
        {
          payment_request_allocation_id: REQUEST_ALLOCATION_ID,
          payable_event_id: PAYABLE_EVENT_ID,
          amount: "1.00",
        },
        {
          payment_request_allocation_id: REQUEST_ALLOCATION_ID.toUpperCase(),
          payable_event_id: secondPayableEventId,
          amount: "1.00",
        },
      ],
      [
        {
          payment_request_allocation_id: REQUEST_ALLOCATION_ID,
          payable_event_id: PAYABLE_EVENT_ID,
          amount: "1.00",
        },
        {
          payment_request_allocation_id: secondRequestAllocationId,
          payable_event_id: PAYABLE_EVENT_ID.toUpperCase(),
          amount: "1.00",
        },
      ],
    ]) {
      expect(SupplierPaymentConfirmSchema.safeParse(payment({ allocations }))
        .success).toBe(false);
    }
    for (const amount of [
      "0.00",
      "1",
      "-1.00",
      "1.001",
      "10000000000000000.00",
      1,
    ]) {
      expect(SupplierPaymentConfirmSchema.safeParse(payment({
        allocations: [{
          payment_request_allocation_id: REQUEST_ALLOCATION_ID,
          payable_event_id: PAYABLE_EVENT_ID,
          amount,
        }],
      })).success).toBe(false);
    }
  });
});
