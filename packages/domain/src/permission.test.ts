import { describe, expect, test } from "bun:test";
import { PermissionCodeConfig, PERMISSION_CODE_VALUES } from "./permission";

describe("finance receivable permissions", () => {
  test("exposes receivable permissions in domain permission constants", () => {
    expect(PERMISSION_CODE_VALUES).toContain("finance.receivable.view");
    expect(PERMISSION_CODE_VALUES).toContain("finance.receivable.manage");
    expect(PermissionCodeConfig["finance.receivable.view"]).toEqual({
      label: "查看应收计划",
      module: "finance",
    });
    expect(PermissionCodeConfig["finance.receivable.manage"]).toEqual({
      label: "管理应收计划",
      module: "finance",
    });
  });

  test("exposes cost budget and allocation permissions in domain constants", () => {
    expect(PERMISSION_CODE_VALUES).toContain("finance.budget.view");
    expect(PERMISSION_CODE_VALUES).toContain("finance.budget.manage");
    expect(PERMISSION_CODE_VALUES).toContain("finance.cost-category.view");
    expect(PERMISSION_CODE_VALUES).toContain("finance.cost-category.manage");
    expect(PERMISSION_CODE_VALUES).toContain("finance.cost-allocation.manage");
    expect(PermissionCodeConfig["finance.cost-allocation.manage"]).toEqual({
      label: "管理成本归集",
      module: "finance",
    });
  });

  test("exposes finance report and closing permissions in domain constants", () => {
    expect(PERMISSION_CODE_VALUES).toContain("finance.reports.read");
    expect(PERMISSION_CODE_VALUES).toContain("finance.reports.export");
    expect(PERMISSION_CODE_VALUES).toContain("finance.closing.read");
    expect(PERMISSION_CODE_VALUES).toContain("finance.closing.manage");
    expect(PermissionCodeConfig["finance.reports.read"]).toEqual({
      label: "查看财务报表",
      module: "finance",
    });
    expect(PermissionCodeConfig["finance.closing.manage"]).toEqual({
      label: "管理月度结账",
      module: "finance",
    });
  });

  test("exposes wechat pay permissions in domain permission constants", () => {
    expect(PERMISSION_CODE_VALUES).toContain("wechat_pay.config.read");
    expect(PERMISSION_CODE_VALUES).toContain("wechat_pay.config.manage");
    expect(PERMISSION_CODE_VALUES).toContain("wechat_pay.order.read");
    expect(PERMISSION_CODE_VALUES).toContain("wechat_pay.notify.read");
    expect(PERMISSION_CODE_VALUES).toContain("wechat_pay.applyment.read");
    expect(PERMISSION_CODE_VALUES).toContain("wechat_pay.applyment.submit");
    expect(PERMISSION_CODE_VALUES).toContain("platform.wechat_pay.applyment.read");
    expect(PERMISSION_CODE_VALUES).toContain("platform.wechat_pay.applyment.review");
    expect(PERMISSION_CODE_VALUES).toContain("platform.wechat_pay.applyment.manage");
    expect(PERMISSION_CODE_VALUES).toContain("platform.wechat_pay.config.activate");
    expect(PermissionCodeConfig["wechat_pay.config.read"]).toEqual({
      label: "查看微信支付配置",
      module: "wechat_pay",
    });
    expect(PermissionCodeConfig["wechat_pay.config.manage"]).toEqual({
      label: "管理微信支付配置",
      module: "wechat_pay",
    });
    expect(PermissionCodeConfig["wechat_pay.order.read"]).toEqual({
      label: "查看微信支付订单",
      module: "wechat_pay",
    });
    expect(PermissionCodeConfig["wechat_pay.notify.read"]).toEqual({
      label: "查看微信支付回调",
      module: "wechat_pay",
    });
    expect(PermissionCodeConfig["wechat_pay.applyment.submit"]).toEqual({
      label: "提交微信支付开通申请",
      module: "wechat_pay",
    });
    expect(PermissionCodeConfig["platform.wechat_pay.config.activate"]).toEqual({
      label: "激活租户微信支付配置",
      module: "platform_wechat_pay",
    });
  });

  test("exposes billing recharge permissions in domain constants", () => {
    expect(PERMISSION_CODE_VALUES).toContain("billing.recharge.create");
    expect(PERMISSION_CODE_VALUES).toContain("billing.recharge.read");
    expect(PERMISSION_CODE_VALUES).toContain("platform.payment.config.read");
    expect(PERMISSION_CODE_VALUES).toContain("platform.payment.config.manage");
    expect(PERMISSION_CODE_VALUES).toContain("platform.billing.recharge_product.manage");
    expect(PermissionCodeConfig["billing.recharge.create"]).toEqual({
      label: "发起积分充值",
      module: "billing",
    });
    expect(PermissionCodeConfig["platform.payment.config.manage"]).toEqual({
      label: "管理平台支付配置",
      module: "platform_payment",
    });
    expect(PermissionCodeConfig["platform.billing.recharge_product.manage"]).toEqual({
      label: "管理积分充值套餐",
      module: "platform_billing",
    });
  });
});
