import { beforeAll, describe, expect, test } from "bun:test";

import { Errors } from "@/errors/error-factory";
import type { BrandingVirtualProductRecord } from "@/repositories/branding-virtual-products";
import type { AuthContext } from "@/services/authorization";
import {
  auth,
  buildFixture,
  EMPLOYEE_ID,
  type FixtureOptions,
  manageAuth,
  managementConfiguration,
  product,
  productionMapping,
  secretStatuses,
  TENANT_ID,
  virtualPatch,
} from "@/services/platform-branding-virtual-payment-settings.test-fixtures";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

type ServiceConstructor = typeof import(
  "./platform-branding-virtual-payment-settings"
)["PlatformBrandingVirtualPaymentSettingsService"];

let PlatformBrandingVirtualPaymentSettingsService: ServiceConstructor;

beforeAll(async () => {
  ({ PlatformBrandingVirtualPaymentSettingsService } = await import(
    "./platform-branding-virtual-payment-settings"
  ));
});

function createFixture(options: FixtureOptions = {}) {
  return buildFixture(PlatformBrandingVirtualPaymentSettingsService, options);
}

describe("PlatformBrandingVirtualPaymentSettingsService permissions", () => {
  test("allows read and manage permissions to read with the correct capability", async () => {
    const readFixture = createFixture();
    const manageFixture = createFixture();

    await expect(readFixture.service.get(
      auth("platform.payment.config.read", { employeeId: null, authUserId: "" }),
    )).resolves.toEqual({
      ...managementConfiguration,
      can_manage: false,
      ...secretStatuses,
    });
    await expect(manageFixture.service.get(manageAuth)).resolves.toEqual({
      ...managementConfiguration,
      can_manage: true,
      ...secretStatuses,
    });
    expect(readFixture.getStatuses).toHaveBeenCalledWith(
      auth("platform.payment.config.read", { employeeId: null, authUserId: "" }),
    );
  });

  test("reports a partial payment manager as read-only", async () => {
    const fixture = createFixture();

    await expect(fixture.service.get(auth(
      "platform.payment.config.manage",
      { employeeId: null, authUserId: "" },
    ))).resolves.toEqual({
      ...managementConfiguration,
      can_manage: false,
      ...secretStatuses,
    });
  });

  test("propagates the sanitized secret-status error without partial data", async () => {
    const expected = Errors.business(
      503,
      "读取虚拟支付密钥状态失败",
      "PLATFORM_PAYMENT_SECRET_STATUS_UNAVAILABLE",
    );
    const fixture = createFixture({ secretStatusError: expected });

    await expect(fixture.service.get(
      auth("platform.payment.config.read"),
    )).rejects.toBe(expected);
    expect(fixture.getConfiguration).toHaveBeenCalledTimes(1);
    expect(fixture.getStatuses).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["branding permission", auth("platform.branding_product.manage")],
    ["tenant context", auth("platform.payment.config.read", { tenantId: TENANT_ID })],
    ["non-platform identity", auth("platform.payment.config.read", { isPlatformAdmin: false })],
  ] satisfies Array<[string, AuthContext]>) (
    "rejects %s before reading configuration",
    async (_name, context) => {
      const fixture = createFixture();
      await expect(fixture.service.get(context)).rejects.toMatchObject({
        statusCode: 403,
        code: "FORBIDDEN",
      });
      expect(fixture.getConfiguration).not.toHaveBeenCalled();
      expect(fixture.getStatuses).not.toHaveBeenCalled();
    },
  );

  test.each([
    ["read permission", auth("platform.payment.config.read")],
    ["branding permission", auth("platform.branding_product.manage")],
    ["missing employee", auth("platform.payment.config.manage", { employeeId: null })],
    ["missing user", auth("platform.payment.config.manage", { authUserId: "" })],
  ] satisfies Array<[string, AuthContext]>) (
    "rejects %s for updates and validation",
    async (_name, context) => {
      const fixture = createFixture();
      await expect(fixture.service.update(context, {
        version: 4,
        purchase_mode: "maintenance",
      })).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
      await expect(fixture.service.validate(context, "production", { version: 3 }))
        .rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
      expect(fixture.getProduct).not.toHaveBeenCalled();
      expect(fixture.validateConfiguration).not.toHaveBeenCalled();
    },
  );

  test("delegates validation under the payment manage permission", async () => {
    const fixture = createFixture();
    await fixture.service.validate(manageAuth, "production", { version: 3 });
    expect(fixture.validateConfiguration).toHaveBeenCalledWith(
      manageAuth,
      { environment: "production", version: 3 },
    );
  });
});

describe("PlatformBrandingVirtualPaymentSettingsService updates", () => {
  test("injects the environment secret key and writes only the payment fields once", async () => {
    const sandboxMapping = {
      ...productionMapping,
      id: "66666666-6666-4666-8666-666666666666",
      environment: "sandbox",
      encrypted_secret_ref: "WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE",
      status: "draft",
      validation_status: "pending",
      validated_at: null,
      version: 1,
    } satisfies BrandingVirtualProductRecord;
    const fixture = createFixture({ mapping: null, savedMapping: sandboxMapping });

    const result = await fixture.service.update(manageAuth, {
      version: 4,
      purchase_mode: "maintenance",
      virtual_product: virtualPatch({
        environment: "sandbox",
        status: "draft",
        version: 1,
      }),
    });

    expect(fixture.manageConfiguration).toHaveBeenCalledTimes(1);
    expect(fixture.manageConfiguration).toHaveBeenCalledWith({
      expectedProductVersion: 4,
      productPatch: { purchase_mode: "maintenance" },
      virtualProductPatch: {
        ...virtualPatch({ environment: "sandbox", status: "draft", version: 1 }),
        encrypted_secret_ref: "WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE",
      },
      actorEmployeeId: EMPLOYEE_ID,
    });
    expect(result).toMatchObject({
      can_manage: true,
      product: { version: 5 },
      virtual_product: {
        environment: "sandbox",
        encrypted_secret_ref: "WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE",
      },
    });
  });

  test.each([
    ["direct_legacy", "wechat_virtual"],
    ["maintenance", "direct_legacy"],
    ["wechat_virtual", "direct_legacy"],
  ] as const)("rejects the %s to %s mode transition", async (from, to) => {
    const fixture = createFixture({ current: { ...product, purchase_mode: from } });
    await expect(fixture.service.update(manageAuth, {
      version: 4,
      purchase_mode: to,
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_ADDON_PURCHASE_MODE_TRANSITION_INVALID",
    });
    expect(fixture.manageConfiguration).not.toHaveBeenCalled();
  });

  test("requires new mappings to use version one", async () => {
    const fixture = createFixture({ mapping: null });
    await expect(fixture.service.update(manageAuth, {
      version: 4,
      virtual_product: virtualPatch({ status: "draft", version: 2 }),
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_VIRTUAL_PRODUCT_VERSION_CONFLICT",
    });
  });

  test("requires an active changed mapping to be revalidated", async () => {
    const fixture = createFixture();
    await expect(fixture.service.update(manageAuth, {
      version: 4,
      virtual_product: virtualPatch({ app_id: "wx-changed" }),
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_VIRTUAL_PRODUCT_REVALIDATION_REQUIRED",
    });
    expect(fixture.manageConfiguration).not.toHaveBeenCalled();
  });

  test.each([
    [
      "inactive production mapping",
      { status: "draft" },
      "BRANDING_VIRTUAL_PRODUCT_DISABLED",
    ],
    [
      "invalid production mapping",
      { validation_status: "pending" },
      "BRANDING_VIRTUAL_PRODUCT_INVALID",
    ],
    [
      "amount mismatch",
      { expected_amount_fen: 9_800 },
      "BRANDING_VIRTUAL_PRODUCT_AMOUNT_MISMATCH",
    ],
    [
      "wrong secret key",
      { encrypted_secret_ref: "WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE" },
      "BRANDING_VIRTUAL_PRODUCT_SECRET_ENVIRONMENT_MISMATCH",
    ],
  ] as const)("rejects wechat mode with %s", async (_name, mappingPatch, code) => {
    const fixture = createFixture({
      current: { ...product, purchase_mode: "maintenance" },
      mapping: { ...productionMapping, ...mappingPatch } as BrandingVirtualProductRecord,
    });
    await expect(fixture.service.update(manageAuth, {
      version: 4,
      purchase_mode: "wechat_virtual",
    })).rejects.toMatchObject({ statusCode: 409, code });
    expect(fixture.manageConfiguration).not.toHaveBeenCalled();
  });

  test("requires matching configured secret revision before enabling wechat mode", async () => {
    const fixture = createFixture({
      secretBundle: JSON.stringify({ appKey: "secret", revision: 9 }),
    });
    await expect(fixture.service.update(manageAuth, {
      version: 4,
      purchase_mode: "wechat_virtual",
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_VIRTUAL_PRODUCT_SECRET_INVALID",
    });
  });

  test("sanitizes an application error from the uncached platform secret accessor", async () => {
    const sensitiveDetails = { ciphertext: "must-not-leak" };
    const settingsError = Errors.business(
      503,
      "平台支付密钥暂不可用",
      "CONFIG_SECRET_DECRYPT_FAILED",
      sensitiveDetails,
    );
    const fixture = createFixture({ mapping: null, secretError: settingsError });

    const error = await fixture.service.update(manageAuth, {
      version: 4,
      virtual_product: virtualPatch({ status: "draft", version: 1 }),
    }).catch((caught) => caught);
    expect(error).toMatchObject({
      statusCode: 503,
      code: "CONFIG_SECRET_DECRYPT_FAILED",
      message: "平台支付密钥暂不可用",
      details: undefined,
    });
    expect(JSON.stringify(error)).not.toContain("must-not-leak");
    expect(fixture.getPlatformSecretString).toHaveBeenCalledWith(
      "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE",
    );
    expect(fixture.getSecretString).not.toHaveBeenCalled();
    expect(fixture.manageConfiguration).not.toHaveBeenCalled();
  });

  test("wraps an unknown secret read outage and does not save a draft mapping", async () => {
    const fixture = createFixture({
      mapping: null,
      secretError: new Error("private settings outage"),
    });

    await expect(fixture.service.update(manageAuth, {
      version: 4,
      virtual_product: virtualPatch({ status: "draft", version: 1 }),
    })).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      message: "读取平台支付密钥配置失败",
      details: undefined,
    });
    expect(fixture.manageConfiguration).not.toHaveBeenCalled();
  });

  test("switches maintenance to wechat virtual with an uncached ready secret", async () => {
    const fixture = createFixture();

    const result = await fixture.service.update(manageAuth, {
      version: 4,
      purchase_mode: "wechat_virtual",
    });

    expect(fixture.getPlatformSecretString).toHaveBeenCalledTimes(1);
    expect(fixture.getPlatformSecretString).toHaveBeenCalledWith(
      "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE",
    );
    expect(fixture.getSecretString).not.toHaveBeenCalled();
    expect(fixture.manageConfiguration).toHaveBeenCalledTimes(1);
    expect(fixture.manageConfiguration).toHaveBeenCalledWith({
      expectedProductVersion: 4,
      productPatch: { purchase_mode: "wechat_virtual" },
      virtualProductPatch: {},
      actorEmployeeId: EMPLOYEE_ID,
    });
    expect(result).toMatchObject({
      can_manage: true,
      product: { purchase_mode: "wechat_virtual", version: 5 },
    });
    const audit = JSON.stringify(fixture.recordBestEffort.mock.calls);
    expect(audit).toContain('"from":"maintenance"');
    expect(audit).toContain('"to":"wechat_virtual"');
    expect(audit).not.toContain("never-expose-this-app-key");
    expect(audit).not.toContain("appKey");
  });

  test("preserves business errors, wraps unknown writes, and does not audit failures", async () => {
    const businessFixture = createFixture({
      saveError: Errors.business(409, "版本冲突", "BRANDING_ADDON_PRODUCT_VERSION_CONFLICT"),
    });
    await expect(businessFixture.service.update(manageAuth, {
      version: 4,
      purchase_mode: "maintenance",
    })).rejects.toMatchObject({ code: "BRANDING_ADDON_PRODUCT_VERSION_CONFLICT" });

    const unknownFixture = createFixture({ saveError: { detail: "private sql" } });
    await expect(unknownFixture.service.update(manageAuth, {
      version: 4,
      purchase_mode: "maintenance",
    })).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR", details: undefined });
    expect(businessFixture.recordBestEffort).not.toHaveBeenCalled();
    expect(unknownFixture.recordBestEffort).not.toHaveBeenCalled();
  });

  test("audits mode and mapping metadata without exposing the raw AppKey", async () => {
    const fixture = createFixture();
    await fixture.service.update(manageAuth, {
      version: 4,
      virtual_product: virtualPatch(),
    });
    const audit = JSON.stringify(fixture.recordBestEffort.mock.calls);
    expect(audit).toContain("branding_virtual_product");
    expect(audit).toContain("WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE");
    expect(audit).not.toContain("never-expose-this-app-key");
    expect(audit).not.toContain("appKey");
  });
});

describe("PlatformBrandingVirtualPaymentSettingsService product reads", () => {
  test("returns stable not-found, version conflict, and sanitized database errors", async () => {
    const missing = createFixture({ current: null });
    await expect(missing.service.update(manageAuth, {
      version: 4,
      purchase_mode: "maintenance",
    })).rejects.toMatchObject({ statusCode: 404, code: "BRANDING_ADDON_PRODUCT_NOT_FOUND" });

    const stale = createFixture({ current: { ...product, version: 5 } });
    await expect(stale.service.update(manageAuth, {
      version: 4,
      purchase_mode: "maintenance",
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_ADDON_PRODUCT_VERSION_CONFLICT",
    });

    const failed = createFixture({ productError: { message: "private database detail" } });
    await expect(failed.service.update(manageAuth, {
      version: 4,
      purchase_mode: "maintenance",
    })).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR", details: undefined });
  });
});
