import { describe, expect, test } from "bun:test";
import {
  getModuleLabel,
  getPermissionName,
  getPermissionSearchText,
  getPermissionSummary,
} from "./role-permission-display";
import type { PermissionRecord } from "./role-mutation-shared";

const financePaymentConfirmPermission: PermissionRecord = {
  id: "permission-finance-payment-confirm",
  code: "finance.payment.confirm",
  name: "确认项目收款",
  module: "finance",
  resource: "payment",
  action: "confirm",
  description: "确认项目收款并推进收款节点",
};

describe("role permission display helpers", () => {
  test("maps finance payment confirmation permission to role config labels", () => {
    expect(getPermissionName(financePaymentConfirmPermission)).toBe("确认项目收款");
    expect(getModuleLabel(financePaymentConfirmPermission.module)).toBe("财务管理");
    expect(getPermissionSummary(financePaymentConfirmPermission)).toBe("项目收款 · 确认");
    expect(getPermissionSearchText(financePaymentConfirmPermission)).toContain("财务管理");
  });
});
