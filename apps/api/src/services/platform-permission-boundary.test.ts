import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

type ControllerBoundary = {
  file: string;
  permissions: string[];
  forbidLegacyGuard?: boolean;
};

const controllerBoundaries: ControllerBoundary[] = [
  {
    file: "controllers/platform-tenants/index.ts",
    permissions: [
      "platform.tenant.read",
      "platform.tenant.manage",
      "platform.tenant.status.manage",
    ],
    forbidLegacyGuard: true,
  },
  {
    file: "controllers/platform-audit-logs/index.ts",
    permissions: ["platform.audit.read"],
    forbidLegacyGuard: true,
  },
  {
    file: "controllers/user-auth-events/index.ts",
    permissions: ["platform.identity_diagnostic.read"],
    forbidLegacyGuard: true,
  },
  {
    file: "controllers/identity-diagnostics/index.ts",
    permissions: ["platform.identity_diagnostic.read"],
    forbidLegacyGuard: true,
  },
  {
    file: "controllers/platform-location/index.ts",
    permissions: ["platform.location.manage"],
    forbidLegacyGuard: true,
  },
  {
    file: "controllers/administrative-areas/index.ts",
    permissions: ["platform.location.manage"],
    forbidLegacyGuard: true,
  },
  {
    file: "controllers/tenant-service-areas/index.ts",
    permissions: ["platform.location.manage"],
    forbidLegacyGuard: true,
  },
  {
    file: "controllers/picture-library/index.ts",
    permissions: ["platform.picture.read", "platform.picture.manage"],
    forbidLegacyGuard: true,
  },
  {
    file: "controllers/platform-service-orders/index.ts",
    permissions: ["platform.service_order.read"],
    forbidLegacyGuard: true,
  },
  {
    file: "controllers/admin-ops/index.ts",
    permissions: ["platform.ops.execute"],
  },
  {
    file: "controllers/platform-partners/index.ts",
    permissions: [
      "platform.partner.read",
      "platform.partner.manage",
      "platform.partner.binding.manage",
    ],
    forbidLegacyGuard: true,
  },
  {
    file: "controllers/platform-partner-applications/index.ts",
    permissions: ["platform.partner.read", "platform.partner.manage"],
    forbidLegacyGuard: true,
  },
  {
    file: "controllers/platform-partner-member-rebind-requests/index.ts",
    permissions: ["platform.partner.read", "platform.partner.manage"],
    forbidLegacyGuard: true,
  },
  {
    file: "controllers/platform-suppliers/index.ts",
    permissions: [
      "platform.supplier.view",
      "platform.supplier.manage",
      "platform.supplier.review",
      "platform.supplier.blacklist",
    ],
    forbidLegacyGuard: true,
  },
  {
    file: "controllers/platform-supplier-onboarding/index.ts",
    permissions: ["platform.supplier.manage"],
    forbidLegacyGuard: true,
  },
  {
    file: "controllers/platform-supplier-catalog/index.ts",
    permissions: ["platform.catalog.manage"],
    forbidLegacyGuard: true,
  },
  {
    file: "controllers/ocr/index.ts",
    permissions: [
      "platform.ocr.recognize",
      "platform.ocr.recognition.read",
      "platform.ocr.tenant_policy.manage",
    ],
    forbidLegacyGuard: true,
  },
  {
    file: "controllers/platform-payment-configs/index.ts",
    permissions: [
      "platform.payment.config.read",
      "platform.payment.config.manage",
    ],
    forbidLegacyGuard: true,
  },
  {
    file: "controllers/platform-virtual-products/index.ts",
    permissions: [
      "platform.virtual_product.read",
      "platform.virtual_product.manage",
      "platform.virtual_product.publish",
    ],
    forbidLegacyGuard: true,
  },
  {
    file: "controllers/platform-wechat-pay-applyments/index.ts",
    permissions: [
      "platform.wechat_pay.applyment.read",
      "platform.wechat_pay.applyment.review",
      "platform.wechat_pay.applyment.manage",
      "platform.wechat_pay.applyment.submit",
      "platform.wechat_pay.applyment.sync",
      "platform.wechat_pay.applyment.repair",
      "platform.wechat_pay.config.activate",
    ],
    forbidLegacyGuard: true,
  },
  {
    file: "controllers/ai-config/index.ts",
    permissions: ["platform.ai_config.read", "platform.ai_config.manage"],
    forbidLegacyGuard: true,
  },
  {
    file: "controllers/site-content/index.ts",
    permissions: [
      "platform.site_content.read",
      "platform.site_content.manage",
      "platform.site_content.publish",
    ],
    forbidLegacyGuard: true,
  },
  {
    file: "controllers/platform-douyin-miniapps/index.ts",
    permissions: ["platform.douyin_miniapp.manage"],
    forbidLegacyGuard: true,
  },
  {
    file: "controllers/platform-partner-revenue/index.ts",
    permissions: [
      "platform.partner.revenue.read",
      "platform.partner.revenue.manage",
      "platform.partner.commission.read",
      "platform.partner.settlement.manage",
    ],
    forbidLegacyGuard: true,
  },
  {
    file: "controllers/platform-billing-recharge/index.ts",
    permissions: [
      "platform.billing.read",
      "platform.billing.recharge_product.manage",
    ],
    forbidLegacyGuard: true,
  },
  {
    file: "controllers/platform-billing-recharge-refunds/index.ts",
    permissions: [
      "platform.billing.recharge_refund.read",
      "platform.billing.recharge_refund.review",
    ],
    forbidLegacyGuard: true,
  },
  {
    file: "controllers/branding/index.ts",
    permissions: ["platform.branding.manage"],
    forbidLegacyGuard: true,
  },
  {
    file: "controllers/branding-addon/index.ts",
    permissions: [
      "platform.branding_product.manage",
      "platform.payment.config.manage",
      "platform.branding_order.read",
      "platform.virtual_refund.manage",
    ],
    forbidLegacyGuard: true,
  },
];

describe("platform permission boundaries", () => {
  test.each(controllerBoundaries)(
    "$file declares concrete platform permission checks",
    (boundary) => {
      const source = readFileSync(
        new URL(`../${boundary.file}`, import.meta.url),
        "utf8",
      );

      for (const permission of boundary.permissions) {
        expect(source).toContain(permission);
      }
      expect(source).toContain("getRequiredPlatformPermissionContext");
      if (boundary.forbidLegacyGuard) {
        expect(source).not.toContain("getRequiredPlatformAdminContext(request)");
      }
    },
  );

  test("platform audit service checks audit permission instead of legacy admin flag", () => {
    const source = readFileSync(
      new URL("../services/platform-audit-logs.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain("platform.audit.read");
    expect(source).toContain("platformAuthorizationService.assertPermission");
    expect(source).not.toContain("authContext.isPlatformAdmin");
  });

  test("platform identity diagnostic services check concrete diagnostic permission", () => {
    const events = readFileSync(
      new URL("../services/user-auth-events.ts", import.meta.url),
      "utf8",
    );
    const diagnostics = readFileSync(
      new URL("../services/identity-diagnostics.ts", import.meta.url),
      "utf8",
    );

    expect(events).toContain("platform.identity_diagnostic.read");
    expect(diagnostics).toContain("platform.identity_diagnostic.read");
    expect(events).not.toContain("assertPlatformAdmin");
    expect(diagnostics).not.toContain("assertPlatformAdmin");
  });

  test("platform location services check concrete location permission", () => {
    const administrativeAreas = readFileSync(
      new URL("../services/administrative-areas.ts", import.meta.url),
      "utf8",
    );
    const locationMatching = readFileSync(
      new URL("../services/location-matching.ts", import.meta.url),
      "utf8",
    );

    expect(administrativeAreas).toContain("platform.location.manage");
    expect(locationMatching).toContain("platform.location.manage");
    expect(administrativeAreas).not.toContain("assertPlatformAdmin");
    expect(locationMatching).not.toContain("assertPlatformAdmin");
  });

  test("platform partners service checks concrete partner permissions", () => {
    const source = readFileSync(
      new URL("../services/platform-partners.ts", import.meta.url),
      "utf8",
    );
    const applications = readFileSync(
      new URL("../services/platform-partner-applications.ts", import.meta.url),
      "utf8",
    );
    const rebind = readFileSync(
      new URL("../services/platform-partner-member-rebind.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain("platform.partner.read");
    expect(source).toContain("platform.partner.manage");
    expect(source).toContain("platform.partner.binding.manage");
    expect(source).not.toContain("assertPlatformAdmin");
    expect(applications).toContain("platform.partner.read");
    expect(applications).toContain("platform.partner.manage");
    expect(applications).not.toContain("assertPlatformAdmin");
    expect(rebind).toContain("platform.partner.read");
    expect(rebind).toContain("platform.partner.manage");
    expect(rebind).not.toContain("assertPlatformAdmin");
  });

  test("platform supplier services check concrete supplier and catalog permissions", () => {
    const suppliers = readFileSync(
      new URL("../services/platform-suppliers.ts", import.meta.url),
      "utf8",
    );
    const onboarding = readFileSync(
      new URL("../services/supplier-onboarding.ts", import.meta.url),
      "utf8",
    );
    const catalog = readFileSync(
      new URL("../services/supplier-catalog.ts", import.meta.url),
      "utf8",
    );
    const uploadAccess = readFileSync(
      new URL("../controllers/uploads/supplier-license-upload-access.ts", import.meta.url),
      "utf8",
    );
    const previews = readFileSync(
      new URL("../controllers/platform-upload-previews/index.ts", import.meta.url),
      "utf8",
    );

    expect(suppliers).toContain("platform.supplier.view");
    expect(suppliers).toContain("platform.supplier.manage");
    expect(suppliers).toContain("platform.supplier.review");
    expect(suppliers).toContain("platform.supplier.blacklist");
    expect(onboarding).toContain("platform.supplier.manage");
    expect(catalog).toContain("platform.catalog.manage");
    expect(uploadAccess).toContain("platform.supplier.manage");
    expect(previews).toContain("platform.supplier.view");
    expect(previews).toContain("platform.supplier.manage");
    expect(suppliers).not.toContain("!auth.isPlatformAdmin");
    expect(onboarding).not.toContain("!auth.isPlatformAdmin");
    expect(uploadAccess).not.toContain("!authContext.isPlatformAdmin");
    expect(previews).not.toContain("getRequiredPlatformAdminContext(request)");
    expect(catalog).not.toContain("!authContext.isPlatformAdmin");
  });

  test("platform OCR services check concrete OCR permissions", () => {
    const platformOcr = readFileSync(
      new URL("../services/ocr/platform-service.ts", import.meta.url),
      "utf8",
    );
    const tenantPolicy = readFileSync(
      new URL("../services/ocr/tenant-policy.ts", import.meta.url),
      "utf8",
    );
    const ocr = readFileSync(
      new URL("../services/ocr/service.ts", import.meta.url),
      "utf8",
    );

    expect(platformOcr).toContain("platform.ocr.recognize");
    expect(tenantPolicy).toContain("platform.ocr.recognition.read");
    expect(tenantPolicy).toContain("platform.ocr.tenant_policy.manage");
    expect(ocr).toContain("platform.ocr.recognition.read");
    expect(platformOcr).not.toContain("!authContext.isPlatformAdmin");
    expect(tenantPolicy).not.toContain("!authContext.isPlatformAdmin");
    expect(ocr).not.toContain("!authContext.isPlatformAdmin");
  });

  test("platform payment and virtual product services check concrete permissions", () => {
    const paymentConfigs = readFileSync(
      new URL("../services/platform-payment-configs.ts", import.meta.url),
      "utf8",
    );
    const virtualProducts = readFileSync(
      new URL("../services/platform-virtual-products.ts", import.meta.url),
      "utf8",
    );
    const virtualChannels = readFileSync(
      new URL("../services/platform-virtual-product-channels.ts", import.meta.url),
      "utf8",
    );
    const virtualSettings = readFileSync(
      new URL("../services/platform-branding-virtual-payment-settings.ts", import.meta.url),
      "utf8",
    );
    const virtualSecrets = readFileSync(
      new URL("../services/platform-branding-virtual-payment-secrets.ts", import.meta.url),
      "utf8",
    );
    const virtualGoodsUpload = readFileSync(
      new URL("../controllers/uploads/virtual-goods-upload-access.ts", import.meta.url),
      "utf8",
    );
    const applyments = readFileSync(
      new URL("../services/wechat-pay-applyments-platform.ts", import.meta.url),
      "utf8",
    );

    expect(paymentConfigs).toContain("platform.payment.config.read");
    expect(paymentConfigs).toContain("platform.payment.config.manage");
    expect(virtualProducts).toContain("platform.virtual_product.read");
    expect(virtualProducts).toContain("platform.virtual_product.manage");
    expect(virtualChannels).toContain("platform.virtual_product.publish");
    expect(virtualSettings).not.toContain("!authContext.isPlatformAdmin");
    expect(virtualSecrets).not.toContain("!authContext.isPlatformAdmin");
    expect(virtualGoodsUpload).toContain("platform.payment.config.manage");
    expect(virtualGoodsUpload).not.toContain("!authContext.isPlatformAdmin");
    expect(applyments).toContain("PLATFORM_SUBMIT_PERMISSION");
    expect(applyments).not.toContain("!authContext.isPlatformAdmin");
  });

  test("platform operating services check concrete permissions", () => {
    const ai = readFileSync(new URL("../services/ai-config.ts", import.meta.url), "utf8");
    const site = readFileSync(new URL("../services/site-content.ts", import.meta.url), "utf8");
    const douyin = readFileSync(
      new URL("../services/platform-douyin-miniapps.ts", import.meta.url),
      "utf8",
    );
    const fulfillmentUpload = readFileSync(
      new URL("../controllers/uploads/platform-service-fulfillment-upload-access.ts", import.meta.url),
      "utf8",
    );
    const revenue = readFileSync(
      new URL("../services/platform-partner-revenue.ts", import.meta.url),
      "utf8",
    );

    expect(ai).toContain("platform.ai_config.read");
    expect(ai).toContain("platform.ai_config.manage");
    expect(site).toContain("platform.site_content.read");
    expect(site).toContain("platform.site_content.manage");
    expect(site).toContain("platform.site_content.publish");
    expect(douyin).toContain("platform.douyin_miniapp.manage");
    expect(douyin).not.toContain("!authContext.isPlatformAdmin");
    expect(fulfillmentUpload).toContain("platform.service_work_order.manage");
    expect(fulfillmentUpload).not.toContain("!authContext.isPlatformAdmin");
    expect(revenue).toContain("platform.partner.revenue.read");
    expect(revenue).toContain("platform.partner.revenue.manage");
    expect(revenue).toContain("platform.partner.commission.read");
    expect(revenue).toContain("platform.partner.settlement.manage");
    expect(revenue).not.toContain("if (!authContext.isPlatformAdmin)");
  });

  test("platform billing services check concrete permissions", () => {
    const recharge = readFileSync(
      new URL("../services/platform-billing-recharge.ts", import.meta.url),
      "utf8",
    );
    const refunds = readFileSync(
      new URL("../services/platform-billing-recharge-refunds.ts", import.meta.url),
      "utf8",
    );
    const execution = readFileSync(
      new URL("../services/platform-billing-recharge-refund-execution.ts", import.meta.url),
      "utf8",
    );

    expect(recharge).toContain("platform.billing.read");
    expect(recharge).toContain("platform.billing.recharge_product.manage");
    expect(refunds).toContain("platform.billing.recharge_refund.read");
    expect(refunds).toContain("platform.billing.recharge_refund.review");
    expect(refunds).not.toContain("if (!authContext.isPlatformAdmin)");
    expect(execution).not.toContain("if (!authContext.isPlatformAdmin)");
  });

  test("platform branding services check concrete permissions", () => {
    const profiles = readFileSync(
      new URL("../services/brand-profiles.ts", import.meta.url),
      "utf8",
    );
    const product = readFileSync(
      new URL("../services/platform-branding-addon-product.ts", import.meta.url),
      "utf8",
    );
    const orders = readFileSync(
      new URL("../services/branding-entitlement-order-query.ts", import.meta.url),
      "utf8",
    );
    const refunds = readFileSync(
      new URL("../services/branding-virtual-refunds.ts", import.meta.url),
      "utf8",
    );
    const channels = readFileSync(
      new URL("../services/platform-branding-virtual-payment-channels.ts", import.meta.url),
      "utf8",
    );
    const virtualProducts = readFileSync(
      new URL("../services/branding-virtual-product-management.ts", import.meta.url),
      "utf8",
    );
    const goodsLifecycle = readFileSync(
      new URL("../services/branding-virtual-product-goods-lifecycle.ts", import.meta.url),
      "utf8",
    );

    expect(profiles).toContain("platform.branding.manage");
    expect(product).toContain("platform.branding_product.manage");
    expect(orders).toContain("platform.branding_order.read");
    expect(refunds).toContain("platform.virtual_refund.manage");
    expect(refunds).not.toContain("platform.branding_virtual_refund.manage");
    for (const source of [
      profiles,
      product,
      orders,
      refunds,
      channels,
      virtualProducts,
      goodsLifecycle,
    ]) {
      expect(source).not.toContain("!authContext.isPlatformAdmin");
    }
  });
});
