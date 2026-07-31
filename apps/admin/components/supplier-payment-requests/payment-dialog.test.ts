import { describe, expect, test } from "bun:test";

import { buildPaymentPayload } from "./payment-dialog-rules";
import type { SupplierPaymentRequestDetail } from "./payment-request-types";

const ID = (index: number) =>
  `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

describe("供应商付款 payload", () => {
  test("uses a stable client UUID, expected version and exact allocations", () => {
    const request = detail();
    const allocations = [{
      payment_request_allocation_id: ID(11),
      payable_event_id: ID(12),
      amount: "70.00",
    }];
    expect(buildPaymentPayload({
      request,
      allocations,
      paymentAmount: "70.00",
      paymentId: ID(99),
      paymentMethod: "bank_transfer",
      paymentReference: "BANK-001",
      paidAt: "2026-07-31T10:00:00.000Z",
      evidenceImages: ["supplier-payments/proof.png"],
      remark: null,
    })).toEqual({
      id: ID(99),
      expected_version: request.payment_request.version,
      payment_method: "bank_transfer",
      payment_reference: "BANK-001",
      paid_at: "2026-07-31T10:00:00.000Z",
      evidence_images: ["supplier-payments/proof.png"],
      remark: null,
      allocations,
    });
  });

  test("uses BigInt cents for total and per-line remaining validation", () => {
    const request = detail();
    const base = {
      request,
      paymentId: ID(99),
      paymentMethod: "bank_transfer" as const,
      paymentReference: "BANK-001",
      paidAt: "2026-07-31T10:00:00.000Z",
      evidenceImages: ["proof.png"],
      remark: null,
    };
    expect(() => buildPaymentPayload({ ...base, paymentAmount: "70.01", allocations: [{
      payment_request_allocation_id: ID(11), payable_event_id: ID(12), amount: "70.00",
    }] })).toThrow("分配合计");
    expect(() => buildPaymentPayload({ ...base, paymentAmount: "80.01", allocations: [{
      payment_request_allocation_id: ID(11), payable_event_id: ID(12), amount: "80.01",
    }] })).toThrow("申请剩余");
    expect(() => buildPaymentPayload({ ...base, paymentAmount: "90071992547409.91", allocations: [{
      payment_request_allocation_id: ID(11), payable_event_id: ID(12), amount: "90071992547409.91",
    }] })).toThrow("申请剩余");
  });

  test("requires one to nine evidence images and remark for other", () => {
    const base = validInput();
    expect(() => buildPaymentPayload({ ...base, evidenceImages: [] }))
      .toThrow("付款凭证");
    expect(() => buildPaymentPayload({
      ...base,
      evidenceImages: Array.from({ length: 10 }, (_, index) => `${index}.png`),
    })).toThrow("9");
    expect(() => buildPaymentPayload({
      ...base, paymentMethod: "other", remark: "  ",
    })).toThrow("备注");
  });

  test("any invoice-required line blocks the whole payment without bypass", () => {
    const input = validInput();
    input.request.allocations.push({
      ...input.request.allocations[0]!,
      id: ID(21), payable_event_id: ID(22),
      invoice_required_before_payment: true,
    });
    expect(() => buildPaymentPayload(input)).toThrow("发票");
    expect(JSON.stringify(input)).not.toContain("bypass");
  });
});

function validInput() {
  return {
    request: detail(),
    allocations: [{
      payment_request_allocation_id: ID(11), payable_event_id: ID(12), amount: "70.00",
    }],
    paymentAmount: "70.00", paymentId: ID(99),
    paymentMethod: "bank_transfer" as const, paymentReference: "BANK-001",
    paidAt: "2026-07-31T10:00:00.000Z", evidenceImages: ["proof.png"], remark: null,
  };
}

function detail(): SupplierPaymentRequestDetail {
  return {
    payment_request: {
      id: ID(1), tenant_id: ID(2), project_id: ID(3), tenant_supplier_id: ID(4),
      supplier_id: ID(5), request_no: "PAY-001", status: "approved", currency: "CNY",
      requested_amount: "100.00", paid_amount: "20.00", reason: "材料款", remark: null,
      version: 4, submitted_by_employee_id: ID(6), submitted_at: "2026-07-30T00:00:00.000Z",
      reviewed_by_employee_id: ID(7), reviewed_at: "2026-07-31T00:00:00.000Z",
      review_remark: null, cancelled_by_employee_id: null, cancelled_at: null,
      cancel_reason: null, closed_by_employee_id: null, closed_at: null, close_reason: null,
      created_by_employee_id: ID(6), updated_by_employee_id: ID(7),
      created_at: "2026-07-30T00:00:00.000Z", updated_at: "2026-07-31T00:00:00.000Z",
    },
    allocations: [{
      id: ID(11), payable_event_id: ID(12), requested_amount: "100.00",
      paid_amount: "20.00", payable_amount: "100.00",
      due_at: "2026-08-31T00:00:00.000Z", supplier_purchase_order_id: ID(13),
      receipt_id: ID(14), receipt_item_id: ID(15),
      invoice_required_before_payment: false,
    }],
  };
}
