import { describe, expect, test } from "bun:test";
import { PermissionCodeConfig } from "@gooes/domain";
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

function permissionRecord(code: keyof typeof PermissionCodeConfig): PermissionRecord {
  const config = PermissionCodeConfig[code];

  return {
    id: `permission-${code}`,
    code,
    name: config.label,
    module: config.module,
    resource: config.resource ?? config.module,
    action: config.action ?? code.split(".").at(-1) ?? "read",
    description: null,
  };
}

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

  test("keeps tenant supplier purchase permissions in a dedicated group", () => {
    expect(getPermissionGroup(permissionRecord("supplier.purchase-requisition.approve")))
      .toMatchObject({
        key: "supplier_purchase",
        label: "供应商与采购",
      });
    expect(getPermissionGroup(permissionRecord("supplier.purchase-order.manage")))
      .toMatchObject({
        key: "supplier_purchase",
        label: "供应商与采购",
      });
    expect(getModuleLabel("supplier")).toBe("供应商与采购");
    expect(getPermissionSearchText(permissionRecord("supplier.purchase-requisition.view")))
      .toContain("供应商与采购");
  });

  test("organizes tenant and platform capabilities without falling into other", () => {
    const examples = {
      "douyin_miniapp.manage": "douyin_growth",
      "brand.entitlement.purchase": "brand_service",
      "service_provider.profile.manage": "service_provider",
      "ocr.recognize": "system",
      "platform.role.manage": "platform_access",
      "platform.tenant.manage": "platform_tenant",
      "platform.wechat_pay.applyment.review": "platform_finance",
      "platform.douyin_miniapp.manage": "platform_content",
      "platform.supplier.review": "platform_supplier",
      "platform.ops.execute": "platform_system",
    } as const;

    for (const [code, expectedGroup] of Object.entries(examples)) {
      expect(getPermissionGroup(permissionRecord(code as keyof typeof PermissionCodeConfig)).key)
        .toBe(expectedGroup);
    }
  });

  test("all canonical permissions have an explicit role configuration group", () => {
    const ungroupedCodes = Object.keys(PermissionCodeConfig).filter((code) =>
      getPermissionGroup(permissionRecord(code as keyof typeof PermissionCodeConfig)).key === "other"
    );

    expect(ungroupedCodes).toEqual([]);
  });
});
