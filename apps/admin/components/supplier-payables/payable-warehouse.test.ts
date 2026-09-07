import { expect, test } from "bun:test";

import { canMergePayables } from "./payable-rules";
import { validateDraftPayables, mergePaymentRequestDraftLines } from "../supplier-payment-requests/payment-request-page-utils";
import type { SupplierPayable } from "./payable-types";
import type { SupplierPaymentRequestDetail } from "../supplier-payment-requests/payment-request-types";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const warehouse = (n: number): SupplierPayable => ({
  id: id(n), destination_type: "warehouse" as const, project_id: null,
  warehouse_id: id(n), tenant_supplier_id: id(50), currency: "CNY" as const,
  available_to_request_amount: "10.00",
  supplier_id: id(51), supplier_purchase_order_id: id(52), receipt_id: id(53), receipt_item_id: id(54),
  project_name: null, warehouse_name: "历史仓库", supplier_name: "材料供应商",
  purchase_order_no: "PO-20260907-00000001", receipt_no: "RCV-20260907-00000001",
  invoice_required_before_payment: false, amount: "10.00", paid_amount: "0.00",
  reserved_amount: "0.00", open_amount: "10.00", status: "open",
  occurred_at: "2026-09-07T00:00:00Z", due_at: "2026-09-30T00:00:00Z",
});

test("warehouse payables merge only within the exact warehouse", () => {
  expect(canMergePayables(warehouse(1), warehouse(2))).toBe(false);
  const sameWarehouse = { ...warehouse(1), id: id(3) };
  expect(canMergePayables(warehouse(1), sameWarehouse)).toBe(true);
});

test("deep-link fresh facts reject cross-warehouse allocations", () => {
  expect(() => validateDraftPayables([id(1), id(2)], [warehouse(1), warehouse(2)]))
    .toThrow("同一项目");
});

test("editing a warehouse draft rejects facts from a different warehouse", () => {
  expect(() => mergePaymentRequestDraftLines(draft(), [warehouse(2)])).toThrow("申请范围");
});

function draft(): SupplierPaymentRequestDetail {
  return {
    payment_request: {
      id: id(60), tenant_id: id(61), destination_type: "warehouse", project_id: null, warehouse_id: id(1),
      tenant_supplier_id: id(50), supplier_id: id(51), request_no: "SPR-20260907-00000001",
      currency: "CNY", status: "draft", version: 1, requested_amount: "10.00", paid_amount: "0.00",
      reason: "材料结算", remark: null, submitted_by_employee_id: null, submitted_at: null,
      reviewed_by_employee_id: null, reviewed_at: null, review_remark: null,
      cancelled_by_employee_id: null, cancelled_at: null, cancel_reason: null,
      closed_by_employee_id: null, closed_at: null, close_reason: null,
      created_by_employee_id: id(62), updated_by_employee_id: id(62),
      created_at: "2026-09-07T00:00:00Z", updated_at: "2026-09-07T00:00:00Z",
    },
    allocations: [{ id: id(63), payable_event_id: id(2), requested_amount: "10.00", paid_amount: "0.00",
      payable_amount: "10.00", due_at: "2026-09-30T00:00:00Z", supplier_purchase_order_id: id(52),
      receipt_id: id(53), receipt_item_id: id(54), invoice_required_before_payment: false }],
  };
}
