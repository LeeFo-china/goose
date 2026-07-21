import { describe, expect, test } from "bun:test";
import { PermissionCodeConfig, PERMISSION_CODE_VALUES } from "./permission";

describe("domain permissions", () => {
  test("exposes tenant onboarding workflow permissions", () => {
    expect(PermissionCodeConfig["platform.tenant_onboarding.review"]).toEqual({
      label: "审核装企入驻",
      module: "platform_tenant_onboarding",
    });
    expect(PermissionCodeConfig["platform.service_provider.publish"]).toEqual({
      label: "审核服务商发布",
      module: "platform_tenant_onboarding",
    });
    expect(PermissionCodeConfig["service_provider.profile.read"]).toEqual({
      label: "查看服务商资料",
      module: "service_provider",
    });
    expect(PermissionCodeConfig["service_provider.profile.manage"]).toEqual({
      label: "管理服务商资料",
      module: "service_provider",
    });
  });

  test("exposes platform site content permissions", () => {
    const expectedPermissions = {
      "platform.site_content.read": {
        label: "查看官网内容",
        module: "platform_site_content",
      },
      "platform.site_content.manage": {
        label: "管理官网内容",
        module: "platform_site_content",
      },
      "platform.site_content.publish": {
        label: "发布官网内容",
        module: "platform_site_content",
      },
    } as const;

    for (const code of Object.keys(expectedPermissions) as Array<
      keyof typeof expectedPermissions
    >) {
      expect(PERMISSION_CODE_VALUES).toContain(code);
      expect(PermissionCodeConfig[code]).toEqual(expectedPermissions[code]);
    }
  });

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
    expect(PERMISSION_CODE_VALUES).toContain("platform.wechat_pay.applyment.submit");
    expect(PERMISSION_CODE_VALUES).toContain("platform.wechat_pay.applyment.sync");
    expect(PERMISSION_CODE_VALUES).toContain("platform.wechat_pay.applyment.repair");
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
    expect(PermissionCodeConfig["platform.wechat_pay.applyment.submit"]).toEqual({
      label: "平台提交微信支付正式进件",
      module: "platform_wechat_pay",
    });
    expect(PermissionCodeConfig["platform.wechat_pay.config.activate"]).toEqual({
      label: "激活租户微信支付配置",
      module: "platform_wechat_pay",
    });
  });

  test("exposes billing recharge permissions in domain constants", () => {
    expect(PERMISSION_CODE_VALUES).toContain("billing.recharge.create");
    expect(PERMISSION_CODE_VALUES).toContain("billing.recharge.read");
    expect(PERMISSION_CODE_VALUES).toContain("billing.recharge.refund.request");
    expect(PERMISSION_CODE_VALUES).toContain("platform.billing.recharge_refund.read");
    expect(PERMISSION_CODE_VALUES).toContain("platform.billing.recharge_refund.review");
    expect(PERMISSION_CODE_VALUES).toContain("platform.payment.config.read");
    expect(PERMISSION_CODE_VALUES).toContain("platform.payment.config.manage");
    expect(PERMISSION_CODE_VALUES).toContain("platform.billing.recharge_product.manage");
    expect(PermissionCodeConfig["billing.recharge.create"]).toEqual({
      label: "发起积分充值",
      module: "billing",
    });
    expect(PermissionCodeConfig["billing.recharge.refund.request"]).toEqual({
      label: "申请积分充值退款",
      module: "billing",
    });
    expect(PermissionCodeConfig["platform.billing.recharge_refund.read"]).toEqual({
      label: "查看积分充值退款申请",
      module: "platform_billing",
    });
    expect(PermissionCodeConfig["platform.billing.recharge_refund.review"]).toEqual({
      label: "审核积分充值退款申请",
      module: "platform_billing",
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

  test("exposes city partner platform permissions in domain constants", () => {
    const expectedPermissions = {
      "platform.partner.read": {
        label: "查看城市合伙人",
        module: "platform_partner",
      },
      "platform.partner.manage": {
        label: "管理城市合伙人",
        module: "platform_partner",
      },
      "platform.partner.level.manage": {
        label: "管理合伙人等级",
        module: "platform_partner",
      },
      "platform.partner.binding.manage": {
        label: "管理合伙人装企绑定",
        module: "platform_partner",
      },
      "platform.partner.revenue.read": {
        label: "查看合伙人平台收入",
        module: "platform_partner",
      },
      "platform.partner.revenue.manage": {
        label: "管理合伙人平台收入",
        module: "platform_partner",
      },
      "platform.partner.commission.read": {
        label: "查看合伙人佣金",
        module: "platform_partner",
      },
      "platform.partner.commission.manage": {
        label: "管理合伙人佣金",
        module: "platform_partner",
      },
      "platform.partner.settlement.manage": {
        label: "管理合伙人结算",
        module: "platform_partner",
      },
    } as const;

    for (const code of Object.keys(expectedPermissions) as Array<
      keyof typeof expectedPermissions
    >) {
      expect(PERMISSION_CODE_VALUES).toContain(code);
      expect(PermissionCodeConfig[code]).toEqual(expectedPermissions[code]);
    }
  });
});
