import { beforeAll, describe, expect, mock, test } from "bun:test";

import type { BrandingAddonProductRecord } from "@/repositories/branding-addon-products";
import type { BrandingVirtualProductRecord } from "@/repositories/branding-virtual-products";
import { PlatformAuditLogActionSchema } from "@/schema/platform-audit-logs";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";
const AUTH_USER_ID = "22222222-2222-4222-8222-222222222222";
const TENANT_ID = "33333333-3333-4333-8333-333333333333";
const product: BrandingAddonProductRecord = {
  id: "44444444-4444-4444-8444-444444444444",
  code: "custom_support_branding_annual",
  entitlement_code: "custom_support_branding",
  name: "年度品牌技术支持",
  amount_fen: null,
  term_years: 1,
  purchase_notes: "支付成功后自动开通一年",
  refund_policy: "数字权益支付成功并开通后不支持退款",
  enabled: false,
  purchase_mode: "maintenance",
  version: 1,
  updated_by_employee_id: null,
  created_at: "2026-07-28T00:00:00.000Z",
  updated_at: "2026-07-28T00:00:00.000Z",
};
const productionMapping: BrandingVirtualProductRecord = {
  id: "55555555-5555-4555-8555-555555555555",
  addon_product_id: product.id,
  provider: "wechat_virtual",
  environment: "production",
  app_id: "wx-app",
  virtual_merchant_id: "virtual-merchant",
  offer_id: "offer-annual",
  provider_product_id: "branding-annual",
  goods_quantity: 1,
  expected_amount_fen: 9_900,
  encrypted_secret_ref:
    "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE",
  secret_revision: 2,
  status: "active",
  validation_status: "valid",
  validated_at: "2026-07-31T00:00:00.000Z",
  version: 1,
  created_by: EMPLOYEE_ID,
  updated_by: EMPLOYEE_ID,
  created_at: "2026-07-31T00:00:00.000Z",
  updated_at: "2026-07-31T00:00:00.000Z",
};
const platformAuth: AuthContext = {
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
  permissions: [{
    code: "platform.branding_product.manage",
    scope: "all",
  }],
};
type ServiceConstructor = typeof import(
  "./platform-branding-addon-product"
)["PlatformBrandingAddonProductService"];

let PlatformBrandingAddonProductService: ServiceConstructor;

beforeAll(async () => {
  ({ PlatformBrandingAddonProductService } = await import(
    "./platform-branding-addon-product"
  ));
});

function createFixture(options: {
  current?: BrandingAddonProductRecord | null;
  updated?: BrandingAddonProductRecord | null;
  getError?: unknown;
  updateError?: unknown;
  mapping?: BrandingVirtualProductRecord | null;
  updatedMapping?: BrandingVirtualProductRecord | null;
  secretBundle?: string;
} = {}) {
  const getProduct = mock(async () => {
    if (options.getError) throw options.getError;
    return options.current === undefined ? product : options.current;
  });
  const manageConfiguration = mock(async () => {
    if (options.updateError) throw options.updateError;
    if (options.updated === null) {
      throw Object.assign(new Error("version conflict"), {
        statusCode: 409,
        code: "BRANDING_ADDON_PRODUCT_VERSION_CONFLICT",
      });
    }
    return {
      product: options.updated === undefined
        ? { ...product, amount_fen: 1, enabled: true, version: 2 }
        : options.updated ?? product,
      virtual_product: options.updatedMapping === undefined
        ? null
        : options.updatedMapping,
    };
  });
  const assertPermission = mock((
    authContext: AuthContext,
    permission: string,
  ) => {
    if (
      !authContext.permissions.some(({ code }) => code === permission)
    ) {
      throw Object.assign(new Error("forbidden"), {
        statusCode: 403,
        code: "FORBIDDEN",
      });
    }
    return "all" as const;
  });
  const recordBestEffort = mock(async () => null);
  const findByProductAndEnvironment = mock(async () =>
    options.mapping === undefined ? productionMapping : options.mapping
  );
  const createMapping = mock(async () =>
    options.updatedMapping === undefined || options.updatedMapping === null
      ? productionMapping
      : options.updatedMapping
  );
  const updateMapping = mock(async () =>
    options.updatedMapping === undefined
      ? { ...productionMapping, version: 2 }
      : options.updatedMapping
  );
  const getSecretString = mock(async () =>
    options.secretBundle ?? JSON.stringify({
      appKey: "production-secret",
      revision: 2,
    })
  );
  const getSummaries = mock(async () => []);
  const validateConfiguration = mock(async () => ({
    virtual_product: productionMapping,
    validation: {
      kind: "server_configuration" as const,
      validated_at: "2026-08-01T00:00:00.000Z",
    },
  }));
  const service = new PlatformBrandingAddonProductService({
    repository: { getProduct },
    virtualProductRepository: {
      findByProductAndEnvironment,
      manageConfiguration,
    },
    settingsService: { getSecretString },
    accessPolicy: { assertPermission },
    audit: { recordBestEffort },
    managementService: { getSummaries, validateConfiguration },
  });

  return {
    service,
    getProduct,
    updateProduct: manageConfiguration,
    manageConfiguration,
    assertPermission,
    recordBestEffort,
    findByProductAndEnvironment,
    createMapping,
    updateMapping,
    getSecretString,
  };
}

describe("PlatformBrandingAddonProductService access", () => {
  test.each([
    ["non-platform identity", { ...platformAuth, isPlatformAdmin: false }],
    ["tenant-scoped platform flag", { ...platformAuth, tenantId: TENANT_ID }],
    ["missing employee", { ...platformAuth, employeeId: null }],
    ["missing auth user", { ...platformAuth, authUserId: "" }],
    ["missing permission", { ...platformAuth, permissions: [] }],
  ] satisfies Array<[string, AuthContext]>)(
    "rejects %s before product access",
    async (_name, authContext) => {
      const fixture = createFixture();

      await expect(fixture.service.get(authContext)).rejects.toMatchObject({
        statusCode: 403,
        code: "FORBIDDEN",
      });
      await expect(fixture.service.update(authContext, {
        name: "新商品名",
        version: 1,
      })).rejects.toMatchObject({
        statusCode: 403,
        code: "FORBIDDEN",
      });
      expect(fixture.getProduct).not.toHaveBeenCalled();
      expect(fixture.updateProduct).not.toHaveBeenCalled();
    },
  );

  test("checks the dedicated permission for both reads and updates", async () => {
    const fixture = createFixture();

    await fixture.service.get(platformAuth);
    await fixture.service.update(platformAuth, {
      amount_fen: 1,
      enabled: true,
      version: 1,
    });

    expect(fixture.assertPermission.mock.calls.map((call) => call[1])).toEqual([
      "platform.branding_product.manage",
      "platform.branding_product.manage",
    ]);
  });
});

describe("PlatformBrandingAddonProductService reads", () => {
  test("returns only the fixed product contract and permits an unconfigured price", async () => {
    const fixture = createFixture();

    await expect(fixture.service.get(platformAuth)).resolves.toEqual({
      product: {
        code: "custom_support_branding_annual",
        entitlement_code: "custom_support_branding",
        name: "年度品牌技术支持",
        amount_fen: null,
        term_years: 1,
        purchase_notes: "支付成功后自动开通一年",
        enabled: false,
        purchase_mode: "maintenance",
        version: 1,
      },
      virtual_products: [],
    });
  });

  test("maps a missing product to a stable not-found error", async () => {
    const fixture = createFixture({ current: null });

    await expect(fixture.service.get(platformAuth)).rejects.toMatchObject({
      statusCode: 404,
      code: "BRANDING_ADDON_PRODUCT_NOT_FOUND",
    });
  });

  test("does not expose repository diagnostics", async () => {
    const fixture = createFixture({
      getError: {
        code: "DB_ERROR",
        details: { message: "secret sql", hint: "private row" },
      },
    });

    await expect(fixture.service.get(platformAuth)).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      details: undefined,
    });
  });
});

describe("PlatformBrandingAddonProductService updates", () => {
  test("registers the product update audit action", () => {
    expect(PlatformAuditLogActionSchema.safeParse(
      "branding_addon_product.update",
    ).success).toBe(true);
  });

  test("partially updates with an optimistic version and audits before and after values", async () => {
    const updated = {
      ...product,
      name: "年度品牌支持服务",
      version: 2,
      updated_by_employee_id: EMPLOYEE_ID,
    } satisfies BrandingAddonProductRecord;
    const fixture = createFixture({ updated });

    await expect(fixture.service.update(platformAuth, {
      name: "年度品牌支持服务",
      version: 1,
    })).resolves.toEqual({
      product: {
        code: "custom_support_branding_annual",
        entitlement_code: "custom_support_branding",
        name: "年度品牌支持服务",
        amount_fen: null,
        term_years: 1,
        purchase_notes: "支付成功后自动开通一年",
        enabled: false,
        purchase_mode: "maintenance",
        version: 2,
      },
    });
    expect(fixture.manageConfiguration).toHaveBeenCalledWith({
      expectedProductVersion: 1,
      productPatch: { name: "年度品牌支持服务" },
      virtualProductPatch: {},
      actorEmployeeId: EMPLOYEE_ID,
    });
    expect(fixture.recordBestEffort).toHaveBeenCalledWith({
      action: "branding_addon_product.update",
      actorEmployeeId: EMPLOYEE_ID,
      actorUserId: AUTH_USER_ID,
      resourceType: "branding_addon_product",
      resourceId: product.id,
      resourceLabel: "年度品牌支持服务",
      status: "success",
      summary: "更新年度品牌权益商品",
      metadata: {
        from: {
          code: "custom_support_branding_annual",
          entitlement_code: "custom_support_branding",
          name: "年度品牌技术支持",
          amount_fen: null,
          term_years: 1,
          purchase_notes: "支付成功后自动开通一年",
          enabled: false,
          purchase_mode: "maintenance",
          version: 1,
        },
        to: {
          code: "custom_support_branding_annual",
          entitlement_code: "custom_support_branding",
          name: "年度品牌支持服务",
          amount_fen: null,
          term_years: 1,
          purchase_notes: "支付成功后自动开通一年",
          enabled: false,
          purchase_mode: "maintenance",
          version: 2,
        },
      },
    });
  });

  test("can enable after the final merged state has a positive integer price", async () => {
    const fixture = createFixture({
      current: { ...product, amount_fen: 1 },
      updated: { ...product, amount_fen: 1, enabled: true, version: 2 },
    });

    await fixture.service.update(platformAuth, {
      enabled: true,
      version: 1,
    });

    expect(fixture.manageConfiguration).toHaveBeenCalledWith({
      expectedProductVersion: 1,
      productPatch: { enabled: true },
      virtualProductPatch: {},
      actorEmployeeId: EMPLOYEE_ID,
    });
  });

  test("rejects enabling while the final merged price is unconfigured", async () => {
    const fixture = createFixture();

    await expect(fixture.service.update(platformAuth, {
      enabled: true,
      version: 1,
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_ADDON_PRODUCT_PRICE_REQUIRED",
    });
    expect(fixture.updateProduct).not.toHaveBeenCalled();
    expect(fixture.recordBestEffort).not.toHaveBeenCalled();
  });

  test("accepts the database integer upper boundary", async () => {
    const fixture = createFixture();

    await fixture.service.update(platformAuth, {
      amount_fen: 2_147_483_647,
      version: 1,
    });

    expect(fixture.manageConfiguration).toHaveBeenCalledWith({
      expectedProductVersion: 1,
      productPatch: { amount_fen: 2_147_483_647 },
      virtualProductPatch: {},
      actorEmployeeId: EMPLOYEE_ID,
    });
  });

  test("rejects prices above the database integer boundary before repository access", async () => {
    for (const amount_fen of [2_147_483_648, 3_000_000_000]) {
      const fixture = createFixture();

      await expect(fixture.service.update(platformAuth, {
        amount_fen,
        version: 1,
      })).rejects.toMatchObject({
        statusCode: 400,
        code: "VALIDATION_ERROR",
      });
      expect(fixture.updateProduct).not.toHaveBeenCalled();
      expect(fixture.recordBestEffort).not.toHaveBeenCalled();
    }
  });

  test("rejects a stale version before attempting the update", async () => {
    const fixture = createFixture({
      current: { ...product, version: 3 },
    });

    await expect(fixture.service.update(platformAuth, {
      purchase_notes: "新说明",
      version: 2,
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_ADDON_PRODUCT_VERSION_CONFLICT",
    });
    expect(fixture.updateProduct).not.toHaveBeenCalled();
    expect(fixture.recordBestEffort).not.toHaveBeenCalled();
  });

  test("maps a concurrent optimistic update miss to the stable version error", async () => {
    const fixture = createFixture({ updated: null });

    await expect(fixture.service.update(platformAuth, {
      purchase_notes: "新说明",
      version: 1,
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_ADDON_PRODUCT_VERSION_CONFLICT",
    });
    expect(fixture.recordBestEffort).not.toHaveBeenCalled();
  });

  test("does not expose update diagnostics or audit a failed mutation", async () => {
    const fixture = createFixture({
      updateError: {
        code: "23514",
        message: "secret constraint",
        details: { row: "private row" },
      },
    });

    await expect(fixture.service.update(platformAuth, {
      amount_fen: 1,
      version: 1,
    })).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      details: undefined,
    });
    expect(fixture.recordBestEffort).not.toHaveBeenCalled();
  });

  test("switches to virtual payment only with a valid active production mapping", async () => {
    const current = {
      ...product,
      amount_fen: 9_900,
      enabled: true,
    } satisfies BrandingAddonProductRecord;
    const fixture = createFixture({
      current,
      updated: {
        ...current,
        purchase_mode: "wechat_virtual",
        version: 2,
      },
    });

    await fixture.service.update(platformAuth, {
      purchase_mode: "wechat_virtual",
      version: 1,
    });

    expect(fixture.findByProductAndEnvironment).toHaveBeenCalledWith({
      addonProductId: product.id,
      environment: "production",
    });
    expect(fixture.manageConfiguration).toHaveBeenCalledWith({
      expectedProductVersion: 1,
      productPatch: { purchase_mode: "wechat_virtual" },
      virtualProductPatch: {},
      actorEmployeeId: EMPLOYEE_ID,
    });
  });

});
