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
    file: "controllers/platform-location/index.ts",
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
    file: "controllers/platform-supplier-catalog/index.ts",
    permissions: ["platform.catalog.manage"],
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

  test("platform partners service checks concrete partner permissions", () => {
    const source = readFileSync(
      new URL("../services/platform-partners.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain("platform.partner.read");
    expect(source).toContain("platform.partner.manage");
    expect(source).toContain("platform.partner.binding.manage");
    expect(source).not.toContain("assertPlatformAdmin");
  });

  test("platform supplier services check concrete supplier and catalog permissions", () => {
    const suppliers = readFileSync(
      new URL("../services/platform-suppliers.ts", import.meta.url),
      "utf8",
    );
    const catalog = readFileSync(
      new URL("../services/supplier-catalog.ts", import.meta.url),
      "utf8",
    );

    expect(suppliers).toContain("platform.supplier.view");
    expect(suppliers).toContain("platform.supplier.manage");
    expect(suppliers).toContain("platform.supplier.review");
    expect(suppliers).toContain("platform.supplier.blacklist");
    expect(catalog).toContain("platform.catalog.manage");
    expect(suppliers).not.toContain("!auth.isPlatformAdmin");
    expect(catalog).not.toContain("!authContext.isPlatformAdmin");
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
    expect(revenue).toContain("platform.partner.revenue.read");
    expect(revenue).toContain("platform.partner.revenue.manage");
    expect(revenue).toContain("platform.partner.commission.read");
    expect(revenue).toContain("platform.partner.settlement.manage");
    expect(revenue).not.toContain("if (!authContext.isPlatformAdmin)");
  });
});
