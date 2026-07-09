import { describe, expect, test } from "bun:test";
import {
  getModuleLabel,
  getPermissionGroup,
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

const wechatPayConfigPermission: PermissionRecord = {
  id: "permission-wechat-pay-config-read",
  code: "wechat_pay.config.read",
  name: "查看微信支付配置",
  module: "wechat_pay",
  resource: "settings",
  action: "read",
  description: null,
};

const projectAcceptancePermission: PermissionRecord = {
  id: "permission-project-acceptance-read",
  code: "project_acceptance.read",
  name: "查看项目验收",
  module: "project_acceptance",
  resource: "project_acceptance",
  action: "read",
  description: null,
};

describe("role permission display helpers", () => {
  test("maps finance payment confirmation permission to role config labels", () => {
    expect(getPermissionName(financePaymentConfirmPermission)).toBe("确认项目收款");
    expect(getModuleLabel(financePaymentConfirmPermission.module)).toBe("财务管理");
    expect(getPermissionSummary(financePaymentConfirmPermission)).toBe("项目收款 · 确认");
    expect(getPermissionSearchText(financePaymentConfirmPermission)).toContain("财务管理");
  });

  test("maps technical modules into tenant-facing permission groups", () => {
    expect(getPermissionGroup(projectAcceptancePermission)).toMatchObject({
      key: "project_delivery",
      label: "项目履约",
    });
    expect(getPermissionGroup(financePaymentConfirmPermission)).toMatchObject({
      key: "finance",
      label: "费用与财务",
    });
    expect(getPermissionGroup(wechatPayConfigPermission)).toMatchObject({
      key: "finance",
      label: "费用与财务",
    });
    expect(getModuleLabel(wechatPayConfigPermission.module)).toBe("微信支付");
    expect(getPermissionSearchText(projectAcceptancePermission)).toContain("项目履约");
    expect(getPermissionSearchText(wechatPayConfigPermission)).not.toContain("其他模块");
  });
});
