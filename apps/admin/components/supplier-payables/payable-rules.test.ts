import { describe, expect, test } from "bun:test";

import {
  availableToRequestAmount,
  canMergePayables,
  canSelectPayable,
  isPayableOverdue,
} from "./payable-rules";
import type { SupplierPayable } from "./payable-types";

describe("供应商应付选择规则", () => {
  test("只有可申请余额大于零的应付可选", () => {
    expect(canSelectPayable(payable())).toBe(true);
    expect(canSelectPayable(payable({
      open_amount: "40.00",
      reserved_amount: "40.00",
      available_to_request_amount: "0.00",
    }))).toBe(false);
    expect(canSelectPayable(payable({
      open_amount: "30.00",
      reserved_amount: "40.00",
      available_to_request_amount: "0.00",
    }))).toBe(false);
  });

  test("只允许合并同一项目、合作供应商和币种", () => {
    const selected = payable();
    expect(canMergePayables(selected, payable({ id: "payable-2" }))).toBe(true);
    expect(canMergePayables(
      selected,
      payable({ id: "payable-2", project_id: "project-2" }),
    )).toBe(false);
    expect(canMergePayables(
      selected,
      payable({ id: "payable-2", tenant_supplier_id: "relationship-2" }),
    )).toBe(false);
  });

  test("逾期由到期时间和未付余额派生", () => {
    const now = new Date("2026-07-31T10:00:00.000Z");
    expect(isPayableOverdue(payable(), now)).toBe(true);
    expect(isPayableOverdue(payable({ open_amount: "0.00" }), now))
      .toBe(false);
    expect(isPayableOverdue(
      payable({ due_at: "2026-08-01T00:00:00.000Z" }),
      now,
    )).toBe(false);
  });

  test("可申请金额使用精确分单位计算", () => {
    expect(availableToRequestAmount(payable({
      open_amount: "1000000000000000.10",
      reserved_amount: "0.09",
    }))).toBe("1000000000000000.01");
  });
});

function payable(overrides: Partial<SupplierPayable> = {}): SupplierPayable {
  return {
    id: "payable-1",
    project_id: "project-1",
    tenant_supplier_id: "relationship-1",
    supplier_id: "supplier-1",
    supplier_purchase_order_id: "order-1",
    receipt_id: "receipt-1",
    receipt_item_id: "receipt-item-1",
    invoice_required_before_payment: false,
    amount: "100.00",
    paid_amount: "20.00",
    reserved_amount: "30.00",
    open_amount: "80.00",
    available_to_request_amount: "50.00",
    currency: "CNY",
    occurred_at: "2026-06-30T00:00:00.000Z",
    due_at: "2026-07-30T00:00:00.000Z",
    status: "open",
    ...overrides,
  };
}
