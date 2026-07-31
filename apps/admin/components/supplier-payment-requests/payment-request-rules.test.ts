import { describe, expect, test } from "bun:test";

import { paymentRequestActions } from "./payment-request-rules";
import type {
  PaymentRequestActionContext,
  PaymentRequestPermissions,
} from "./payment-request-types";

const permissions: PaymentRequestPermissions = {
  canManage: true,
  canApprove: true,
  canPay: true,
};

describe("供应商付款申请动作规则", () => {
  test("草稿可编辑、提交和取消", () => {
    expect(paymentRequestActions(context("draft"), permissions)).toEqual([
      "edit",
      "submit",
      "cancel",
    ]);
  });

  test("待审批、已批准和部分付款动作符合状态机", () => {
    expect(paymentRequestActions(
      context("pending_approval"),
      permissions,
    )).toEqual(["approve", "reject", "cancel"]);
    expect(paymentRequestActions(context("approved"), permissions))
      .toEqual(["pay", "cancel"]);
    expect(paymentRequestActions(context("partially_paid"), permissions))
      .toEqual(["pay", "close"]);
  });

  test("发票阻断隐藏付款动作且终态无动作", () => {
    expect(paymentRequestActions(
      context("approved", { invoiceBlocked: true }),
      permissions,
    )).not.toContain("pay");
    for (const status of [
      "paid",
      "rejected",
      "cancelled",
      "closed",
    ] as const) {
      expect(paymentRequestActions(context(status), permissions)).toEqual([]);
    }
  });

  test("权限按动作独立收敛", () => {
    expect(paymentRequestActions(context("draft"), {
      canManage: false,
      canApprove: true,
      canPay: true,
    })).toEqual([]);
    expect(paymentRequestActions(context("pending_approval"), {
      canManage: false,
      canApprove: true,
      canPay: false,
    })).toEqual(["approve", "reject"]);
    expect(paymentRequestActions(context("approved"), {
      canManage: false,
      canApprove: false,
      canPay: true,
    })).toEqual(["pay"]);
  });
});

function context(
  status: PaymentRequestActionContext["status"],
  overrides: Partial<PaymentRequestActionContext> = {},
): PaymentRequestActionContext {
  return { status, invoiceBlocked: false, ...overrides };
}
