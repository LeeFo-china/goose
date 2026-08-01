import { beforeAll, describe, expect, mock, test } from "bun:test";

import { Errors } from "@/errors/error-factory";
import type { BrandingAddonProductRecord } from "@/repositories/branding-addon-products";
import type { BrandingVirtualProductRecord } from "@/repositories/branding-virtual-products";
import type { UpdatePlatformWechatVirtualSettingsInput } from "@/schema/platform-payment-configs";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";
const AUTH_USER_ID = "22222222-2222-4222-8222-222222222222";
const PRODUCT_ID = "33333333-3333-4333-8333-333333333333";
const TENANT_ID = "44444444-4444-4444-8444-444444444444";

const product = {
  id: PRODUCT_ID,
  code: "custom_support_branding_annual",
  entitlement_code: "custom_support_branding",
  name: "年度品牌技术支持",
  amount_fen: 9_900,
  term_years: 1,
  purchase_notes: "支付成功后自动开通一年",
  refund_policy: "数字权益支付成功并开通后不支持退款",
  enabled: true,
  purchase_mode: "maintenance",
  version: 4,
  updated_by_employee_id: null,
  created_at: "2026-07-28T00:00:00.000Z",
  updated_at: "2026-07-28T00:00:00.000Z",
} satisfies BrandingAddonProductRecord;

const productionMapping = {
  id: "55555555-5555-4555-8555-555555555555",
  addon_product_id: PRODUCT_ID,
  provider: "wechat_virtual",
  environment: "production",
  app_id: "wx-app",
  virtual_merchant_id: "virtual-merchant",
  offer_id: "offer-annual",
  provider_product_id: "branding-annual",
  goods_quantity: 1,
  expected_amount_fen: 9_900,
  encrypted_secret_ref: "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE",
  secret_revision: 2,
  status: "active",
  validation_status: "valid",
  validated_at: "2026-07-31T00:00:00.000Z",
  version: 3,
  created_by: EMPLOYEE_ID,
  updated_by: EMPLOYEE_ID,
  created_at: "2026-07-31T00:00:00.000Z",
  updated_at: "2026-07-31T00:00:00.000Z",
} satisfies BrandingVirtualProductRecord;

const managementConfiguration = {
  product: {
    code: product.code,
    entitlement_code: product.entitlement_code,
    name: product.name,
    amount_fen: product.amount_fen,
    term_years: product.term_years,
    purchase_notes: product.purchase_notes,
    enabled: product.enabled,
    purchase_mode: product.purchase_mode,
    version: product.version,
  },
  virtual_products: [{
    environment: "production" as const,
    mapping: productionMapping,
    secret: {
      key: "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE" as const,
      revision: 2,
      configured: true,
    },
  }],
};

function auth(permission: string, overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    authUserId: AUTH_USER_ID,
    employeeId: EMPLOYEE_ID,
    tenantId: null,
    tenantName: null,
    tenantSlug: null,
    tenantStatus: null,
    isPlatformAdmin: true,
    employeeName: "平台管理员",
    employeeStatus: "active",
    departmentId: null,
    tenantDepartmentId: null,
    departmentCode: null,
    departmentName: null,
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: ["platform_admin"],
    roles: [],
    permissions: [{ code: permission, scope: "all" }],
    ...overrides,
  };
}

const manageAuth = auth("platform.payment.config.manage");

type ServiceConstructor = typeof import(
  "./platform-branding-virtual-payment-settings"
)["PlatformBrandingVirtualPaymentSettingsService"];

let PlatformBrandingVirtualPaymentSettingsService: ServiceConstructor;

beforeAll(async () => {
  ({ PlatformBrandingVirtualPaymentSettingsService } = await import(
    "./platform-branding-virtual-payment-settings"
  ));
});

function virtualPatch(
  overrides: Partial<NonNullable<UpdatePlatformWechatVirtualSettingsInput["virtual_product"]>> = {},
) {
  return {
    environment: "production" as const,
    app_id: "wx-app",
    virtual_merchant_id: "virtual-merchant",
    offer_id: "offer-annual",
    provider_product_id: "branding-annual",
    expected_amount_fen: 9_900,
    secret_revision: 2,
    status: "active" as const,
    version: 3,
    ...overrides,
  };
}

function createFixture(options: {
  current?: BrandingAddonProductRecord | null;
  mapping?: BrandingVirtualProductRecord | null;
  savedProduct?: BrandingAddonProductRecord;
  savedMapping?: BrandingVirtualProductRecord | null;
  productError?: unknown;
  mappingError?: unknown;
  saveError?: unknown;
  secretBundle?: string;
} = {}) {
  const current = options.current === undefined ? product : options.current;
  const mapping = options.mapping === undefined ? productionMapping : options.mapping;
  const getProduct = mock(async () => {
    if (options.productError) throw options.productError;
    return current;
  });
  const findByProductAndEnvironment = mock(async () => {
    if (options.mappingError) throw options.mappingError;
    return mapping;
  });
  const manageConfiguration = mock(async () => {
    if (options.saveError) throw options.saveError;
    return {
      product: options.savedProduct ?? { ...product, version: 5 },
      virtual_product: options.savedMapping === undefined
        ? mapping
        : options.savedMapping,
    };
  });
  const getSecretString = mock(async () => options.secretBundle ?? JSON.stringify({
    appKey: "never-expose-this-app-key",
    revision: 2,
  }));
  const getConfiguration = mock(async () => managementConfiguration);
  const validateConfiguration = mock(async () => ({
    virtual_product: productionMapping,
    validation: {
      kind: "server_configuration" as const,
      validated_at: "2026-08-01T01:02:03.000Z",
    },
  }));
  const hasPermission = mock((context: AuthContext, permission: string) =>
    context.permissions.some(({ code }) => code === permission)
  );
  const recordBestEffort = mock(async () => null);
  const service = new PlatformBrandingVirtualPaymentSettingsService({
    productRepository: { getProduct },
    virtualProductRepository: {
      findByProductAndEnvironment,
      manageConfiguration,
    },
    settingsService: { getSecretString },
    accessPolicy: { hasPermission },
    audit: { recordBestEffort },
    managementService: { getConfiguration, validateConfiguration },
  });
  return {
    service,
    getProduct,
    findByProductAndEnvironment,
    manageConfiguration,
    getSecretString,
    getConfiguration,
    validateConfiguration,
    recordBestEffort,
  };
}

describe("PlatformBrandingVirtualPaymentSettingsService permissions", () => {
  test("allows read and manage permissions to read with the correct capability", async () => {
    const readFixture = createFixture();
    const manageFixture = createFixture();

    await expect(readFixture.service.get(
      auth("platform.payment.config.read", { employeeId: null, authUserId: "" }),
    )).resolves.toEqual({ ...managementConfiguration, can_manage: false });
    await expect(manageFixture.service.get(manageAuth)).resolves.toEqual({
      ...managementConfiguration,
      can_manage: true,
    });
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
