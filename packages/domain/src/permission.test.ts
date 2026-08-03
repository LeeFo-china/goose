import { describe, expect, test } from "bun:test";
import { PermissionCodeConfig, PERMISSION_CODE_VALUES } from "./permission";

describe("domain permissions", () => {
  test("exposes the Douyin miniapp platform permission", () => {
    expect(PERMISSION_CODE_VALUES).toContain("platform.douyin_miniapp.manage");
    expect(PermissionCodeConfig["platform.douyin_miniapp.manage"]).toEqual({
      label: "管理抖音小程序",
      module: "platform",
      resource: "douyin_miniapp",
      action: "manage",
    });
  });

  test("exposes tenant Douyin workspace and lead permissions", () => {
    const expectedPermissions = {
      "douyin_miniapp.read": {
        label: "查看抖音小程序",
        module: "douyin_miniapp",
        resource: "douyin_miniapp",
        action: "read",
      },
      "douyin_miniapp.manage": {
        label: "管理抖音小程序",
        module: "douyin_miniapp",
        resource: "douyin_miniapp",
        action: "manage",
      },
      "douyin_miniapp.audit.submit": {
        label: "提交抖音审核",
        module: "douyin_miniapp",
        resource: "douyin_miniapp",
        action: "audit_submit",
      },
      "douyin_lead.read": {
        label: "查看抖音线索",
        module: "douyin_miniapp",
        resource: "douyin_lead",
        action: "read",
      },
      "douyin_lead.assign": {
        label: "分配抖音线索",
        module: "douyin_miniapp",
        resource: "douyin_lead",
        action: "assign",
      },
      "douyin_lead.follow_up": {
        label: "跟进抖音线索",
        module: "douyin_miniapp",
        resource: "douyin_lead",
        action: "follow_up",
      },
      "douyin_lead.convert": {
        label: "转化抖音线索",
        module: "douyin_miniapp",
        resource: "douyin_lead",
        action: "convert",
      },
    } as const;

    for (const code of Object.keys(expectedPermissions) as Array<
      keyof typeof expectedPermissions
    >) {
      expect(PERMISSION_CODE_VALUES).toContain(code);
      expect(PermissionCodeConfig[code]).toEqual(expectedPermissions[code]);
    }
  });

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

  test("exposes branding and tenant entitlement permissions", () => {
    const expectedPermissions = {
      "platform.branding.manage": {
        label: "管理平台技术支持品牌",
        module: "platform_branding",
      },
      "platform.branding_product.manage": {
        label: "管理品牌技术支持权益商品",
        module: "platform_branding",
      },
      "platform.branding_order.read": {
        label: "查看品牌技术支持权益订单",
        module: "platform_branding",
      },
      "platform.tenant_entitlement.manage": {
        label: "管理租户增值权益",
        module: "platform_entitlement",
      },
      "brand.settings.read": {
        label: "查看品牌技术支持设置",
        module: "branding",
      },
      "brand.settings.update": {
        label: "编辑品牌技术支持设置",
        module: "branding",
      },
      "brand.entitlement.purchase": {
        label: "购买品牌技术支持权益",
        module: "branding",
      },
      "brand.entitlement_order.read": {
        label: "查看品牌技术支持权益订单",
        module: "branding",
      },
    } as const;
    const brandingPermissionCodes = PERMISSION_CODE_VALUES.filter(
      (code) =>
        code.startsWith("platform.branding.") ||
        code.startsWith("platform.branding_") ||
        code.startsWith("platform.tenant_entitlement.") ||
        code.startsWith("brand.settings.") ||
        code.startsWith("brand.entitlement"),
    ).sort();

    for (const code of Object.keys(expectedPermissions) as Array<
      keyof typeof expectedPermissions
    >) {
      expect(PERMISSION_CODE_VALUES).toContain(code);
      expect(PermissionCodeConfig[code]).toEqual(expectedPermissions[code]);
    }

    expect(brandingPermissionCodes).toEqual([
      "brand.entitlement.purchase",
      "brand.entitlement_order.read",
      "brand.settings.read",
      "brand.settings.update",
      "platform.branding.manage",
      "platform.branding_order.read",
      "platform.branding_product.manage",
      "platform.tenant_entitlement.manage",
    ]);

    const purchasePermissionCodes = [
      "platform.branding_product.manage",
      "platform.branding_order.read",
      "brand.entitlement.purchase",
      "brand.entitlement_order.read",
    ] as const;
    for (const code of purchasePermissionCodes) {
      expect(PERMISSION_CODE_VALUES).toContain(code);
      expect(PermissionCodeConfig[code].label.length).toBeGreaterThan(0);
    }
  });

  test("exposes generic virtual product permissions", () => {
    for (const code of [
      "platform.virtual_product.read",
      "platform.virtual_product.manage",
      "platform.virtual_product.publish",
      "platform.virtual_order.read",
      "platform.virtual_refund.manage",
      "virtual_product.purchase",
    ] as const) {
      expect(PERMISSION_CODE_VALUES).toContain(code);
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

  test("exposes platform service sales permissions in domain constants", () => {
    expect(PERMISSION_CODE_VALUES).toContain("billing.service_order.create");
    expect(PERMISSION_CODE_VALUES).toContain("billing.service_order.read");
    expect(PERMISSION_CODE_VALUES).toContain(
      "billing.service_order.refund.request",
    );
    expect(PERMISSION_CODE_VALUES).toContain(
      "platform.service_product.manage",
    );
    expect(PERMISSION_CODE_VALUES).toContain("platform.service_order.read");
    expect(PERMISSION_CODE_VALUES).toContain(
      "platform.service_work_order.manage",
    );
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

  test("exposes tenant OCR and platform OCR audit permissions", () => {
    expect(PERMISSION_CODE_VALUES).toContain("ocr.recognize");
    expect(PERMISSION_CODE_VALUES).toContain("platform.ocr.recognize");
    expect(PERMISSION_CODE_VALUES).toContain("platform.ocr.recognition.read");
    expect(PERMISSION_CODE_VALUES).toContain("platform.ocr.tenant_policy.manage");
    expect(PermissionCodeConfig["ocr.recognize"]).toEqual({
      label: "使用证照识别",
      module: "ocr",
    });
    expect(PermissionCodeConfig["platform.ocr.recognize"]).toEqual({
      label: "使用平台证照识别",
      module: "platform_ocr",
    });
    expect(PermissionCodeConfig["platform.ocr.recognition.read"]).toEqual({
      label: "查看平台OCR记录",
      module: "platform_ocr",
    });
    expect(PermissionCodeConfig["platform.ocr.tenant_policy.manage"]).toEqual({
      label: "管理OCR租户灰度",
      module: "platform_ocr",
    });
  });

  test("exposes supplier permissions", () => {
    const expectedPermissions = {
      "platform.supplier.view": {
        label: "查看平台供应商",
        module: "platform_supplier",
      },
      "platform.supplier.review": {
        label: "审核供应商准入",
        module: "platform_supplier",
      },
      "platform.supplier.manage": {
        label: "管理平台供应商",
        module: "platform_supplier",
      },
      "platform.supplier.blacklist": {
        label: "管理供应商黑名单",
        module: "platform_supplier",
      },
      "platform.catalog.manage": {
        label: "管理供应标准目录",
        module: "platform_supplier_catalog",
      },
      "supplier.view": {
        label: "查看合作供应商",
        module: "supplier",
      },
      "supplier.manage": {
        label: "管理合作供应商",
        module: "supplier",
      },
      "supplier.contract.manage": {
        label: "管理供应商合同",
        module: "supplier",
      },
      "supplier.product.view": {
        label: "查看供应商商品",
        module: "supplier",
      },
      "supplier.product.manage": {
        label: "管理供应商商品",
        module: "supplier",
      },
      "supplier.cost-price.view": {
        label: "查看供应商供货价",
        module: "supplier",
      },
      "supplier.cost-price.manage": {
        label: "管理供应商供货价",
        module: "supplier",
      },
      "supplier.purchase-order.view": {
        label: "查看供应商采购单",
        module: "supplier",
      },
      "supplier.purchase-order.manage": {
        label: "管理供应商采购单",
        module: "supplier",
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
