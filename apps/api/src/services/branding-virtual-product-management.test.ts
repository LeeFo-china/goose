import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { BrandingAddonProductRecord } from "@/repositories/branding-addon-products";
import type { BrandingVirtualProductRecord } from "@/repositories/branding-virtual-products";
import { PlatformAuditLogActionSchema } from "@/schema/platform-audit-logs";
import { Errors } from "@/errors/error-factory";
import type { AuthContext } from "@/services/authorization";
process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";
const AUTH_USER_ID = "22222222-2222-4222-8222-222222222222";
const PRODUCT_ID = "33333333-3333-4333-8333-333333333333";
const platformAuth = {
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
  permissions: [{ code: "platform.payment.config.manage", scope: "all" }],
} satisfies AuthContext;
const product: BrandingAddonProductRecord = {
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
};
const mapping = {
  id: "44444444-4444-4444-8444-444444444444",
  addon_product_id: PRODUCT_ID,
  provider: "wechat_virtual",
  environment: "production",
  app_id: "wx-app",
  virtual_merchant_id: "virtual-merchant",
  offer_id: "offer-annual",
  provider_product_id: "branding-annual",
  item_url: "https://cdn.example.test/branding.png",
  goods_quantity: 1,
  expected_amount_fen: 9_900,
  encrypted_secret_ref:
    "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE",
  secret_revision: 2,
  status: "draft",
  validation_status: "pending",
  validated_at: null,
  version: 3,
  created_by: EMPLOYEE_ID,
  updated_by: EMPLOYEE_ID,
  created_at: "2026-07-31T00:00:00.000Z",
  updated_at: "2026-07-31T00:00:00.000Z",
} satisfies BrandingVirtualProductRecord;
type ServiceConstructor = typeof import(
  "./branding-virtual-product-management"
)["BrandingVirtualProductManagementService"];
let BrandingVirtualProductManagementService: ServiceConstructor;

beforeAll(async () => {
  ({ BrandingVirtualProductManagementService } = await import(
    "./branding-virtual-product-management"
  ));
});
function createFixture(options: {
  product?: BrandingAddonProductRecord | null;
  mappings?: BrandingVirtualProductRecord[];
  mapping?: BrandingVirtualProductRecord | null;
  secretValues?: Record<string, string>;
  validationResult?: BrandingVirtualProductRecord;
  validationError?: unknown;
  secretError?: unknown;
  accessTokenError?: unknown;
  gatewayError?: unknown;
} = {}) {
  const snapshotProduct = options.product === undefined ? product : options.product;
  const snapshotMappings = options.mappings ?? (
    options.mapping === undefined ? [mapping] : options.mapping ? [options.mapping] : []
  );
  const getManagementSnapshot = mock(async () => {
    if (!snapshotProduct) {
      throw Errors.business(
        404,
        "年度品牌权益商品不存在",
        "BRANDING_ADDON_PRODUCT_NOT_FOUND",
      );
    }
    return { product: snapshotProduct, mappings: snapshotMappings };
  });
  const setConfigurationValidation = mock(async (input: {
    validationStatus: "pending" | "valid" | "invalid";
  }) => {
    if (options.validationError) throw options.validationError;
    return options.validationResult ?? {
      ...mapping,
      validation_status: input.validationStatus,
      validated_at: "2026-08-01T01:02:03.000Z",
      version: 4,
    };
  });
  const secretValues = options.secretValues ?? {
    WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE: JSON.stringify({
      appKey: "sandbox-secret",
      revision: 5,
    }),
    WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE: JSON.stringify({
      appKey: "production-secret",
      revision: 2,
    }),
  };
  const getPlatformSecretStrings = mock(async () => {
    if (options.secretError) throw options.secretError;
    return secretValues;
  });
  const assertPermission = mock((
    authContext: AuthContext,
    permission: string,
  ) => {
    if (!authContext.permissions.some(({ code }) => code === permission)) {
      throw Errors.forbidden();
    }
    return "all" as const;
  });
  const recordBestEffort = mock(async () => null);
  const getAccessToken = mock(async () => {
    if (options.accessTokenError) throw options.accessTokenError;
    return "access-token-sensitive";
  });
  const queryUploadGoods = mock(async () => {
    if (options.gatewayError) throw options.gatewayError;
    return {
      requestId: "upload-request-id",
      environment: "production" as const,
      status: 3 as const,
      items: [{
        id: "branding-annual",
        name: "年度品牌权益",
        price: 9_900,
        remark: "年度数字权益", itemUrl: "https://cdn.example.test/branding.png",
        uploadStatus: 2 as const,
      }],
    };
  });
  const queryPublishGoods = mock(async () => {
    if (options.gatewayError) throw options.gatewayError;
    return {
      requestId: "publish-request-id",
      environment: "production" as const,
      status: 3 as const,
      items: [{ id: "branding-annual", publishStatus: 2 as const }],
    };
  });
  const service = new BrandingVirtualProductManagementService({
    virtualProductRepository: {
      getManagementSnapshot,
      setConfigurationValidation,
    },
    settingsService: { getPlatformSecretStrings },
    accessPolicy: { assertPermission },
    audit: { recordBestEffort },
    accessTokenProvider: { getAccessToken },
    gateway: { queryUploadGoods, queryPublishGoods },
    nowFactory: () => new Date("2026-08-01T01:02:03.000Z"),
  });
  return {
    service,
    getManagementSnapshot,
    setConfigurationValidation,
    getPlatformSecretStrings,
    recordBestEffort,
    getAccessToken,
    queryUploadGoods,
    queryPublishGoods,
  };
}

describe("BrandingVirtualProductManagementService summaries", () => {
  test("returns both environment summaries with configured secret metadata", async () => {
    const fixture = createFixture();

    const result = await fixture.service.getConfiguration();
    expect(result.product).toMatchObject({
      code: "custom_support_branding_annual",
      version: 4,
    });
    expect(result.virtual_products).toEqual([
      {
        environment: "sandbox",
        mapping: null,
        secret: {
          key: "WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE",
          revision: 5,
          configured: true,
        },
      },
      {
        environment: "production",
        mapping: expect.objectContaining({
          version: 3,
          validation_status: "pending",
          validated_at: null,
          secret_revision: 2,
        }),
        secret: {
          key: "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE",
          revision: 2,
          configured: true,
        },
      },
    ]);
    expect(fixture.getManagementSnapshot).toHaveBeenCalledTimes(1);
    expect(fixture.getPlatformSecretStrings).toHaveBeenCalledTimes(1);
    expect(
      fixture.getManagementSnapshot.mock.calls.length +
        fixture.getPlatformSecretStrings.mock.calls.length,
    ).toBe(2);
    const json = JSON.stringify(result.virtual_products);
    expect(json).not.toContain("sandbox-secret");
    expect(json).not.toContain("production-secret");
    expect(json).not.toContain("appKey");
  });

  test("preserves a sanitized settings infrastructure failure", async () => {
    const fixture = createFixture({
      secretError: Errors.business(
        500,
        "系统配置密文解密失败",
        "CONFIG_SECRET_DECRYPT_FAILED",
        { ciphertext: "must-not-leak" },
      ),
    });
    await expect(fixture.service.getConfiguration()).rejects.toMatchObject({
      statusCode: 500,
      code: "CONFIG_SECRET_DECRYPT_FAILED",
      details: undefined,
    });
    expect(JSON.stringify(fixture.recordBestEffort.mock.calls))
      .not.toContain("must-not-leak");
  });

  test("preserves a sanitized settings database failure on GET", async () => {
    const fixture = createFixture({
      secretError: Errors.dbError("查询平台支付密钥配置失败", {
        value_text: "must-not-leak",
      }),
    });

    await expect(fixture.service.getConfiguration()).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      details: undefined,
    });
    expect(JSON.stringify(fixture.recordBestEffort.mock.calls))
      .not.toContain("must-not-leak");
  });
});

describe("BrandingVirtualProductManagementService WeChat goods validation", () => {
  test("registers the dedicated validation audit action", () => {
    expect(PlatformAuditLogActionSchema.safeParse(
      "branding_virtual_product.validate",
    ).success).toBe(true);
  });

  test("rejects the branding-product permission before reading configuration", async () => {
    const fixture = createFixture();

    await expect(fixture.service.validateConfiguration(
      {
        ...platformAuth,
        permissions: [{ code: "platform.branding_product.manage", scope: "all" }],
      },
      { environment: "production", version: 3 },
    )).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(fixture.getManagementSnapshot).not.toHaveBeenCalled();
    expect(fixture.setConfigurationValidation).not.toHaveBeenCalled();
  });

  test("persists valid only after the latest upload and publish tasks confirm the fixed product", async () => {
    const fixture = createFixture();

    const result = await fixture.service.validateConfiguration(
      platformAuth,
      { environment: "production", version: 3 },
    );

    expect(fixture.setConfigurationValidation).toHaveBeenCalledWith({
      addonProductId: PRODUCT_ID,
      environment: "production",
      expectedProductVersion: 4,
      expectedMappingVersion: 3,
      validationStatus: "valid",
      validatedAt: "2026-08-01T01:02:03.000Z",
      updatedByEmployeeId: EMPLOYEE_ID,
    });
    expect(result.virtual_product.validation_status).toBe("valid");
    expect(result.validation.kind).toBe("wechat_goods");
    expect(fixture.getAccessToken).toHaveBeenCalledTimes(1);
    expect(fixture.queryUploadGoods).toHaveBeenCalledWith({
      accessToken: "access-token-sensitive",
      environment: "production",
      signingSecret: {
        environment: "production",
        appKey: "production-secret",
      },
    });
    expect(fixture.queryPublishGoods).toHaveBeenCalledWith({
      accessToken: "access-token-sensitive",
      environment: "production",
      signingSecret: {
        environment: "production",
        appKey: "production-secret",
      },
    });
    expect(JSON.stringify(fixture.recordBestEffort.mock.calls))
      .not.toContain("production-secret");
  });

  test("persists invalid before returning a stable 409", async () => {
    const fixture = createFixture({
      secretValues: {
        WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE: "",
      },
    });

    await expect(fixture.service.validateConfiguration(
      platformAuth,
      { environment: "production", version: 3 },
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_VIRTUAL_PRODUCT_SECRET_INVALID",
    });
    expect(fixture.setConfigurationValidation).toHaveBeenCalledWith(
      expect.objectContaining({ validationStatus: "invalid" }),
    );
    expect(fixture.getAccessToken).not.toHaveBeenCalled();
    expect(fixture.queryUploadGoods).not.toHaveBeenCalled();
    expect(fixture.queryPublishGoods).not.toHaveBeenCalled();
    const auditJson = JSON.stringify(fixture.recordBestEffort.mock.calls);
    expect(auditJson).not.toContain("appKey");
    expect(auditJson).not.toContain("production-secret");
    expect(auditJson).toContain('"configured":false');
  });

  test("persists invalid when WeChat explicitly rejects the goods query", async () => {
    const sensitive = "upstream-sensitive-errmsg";
    const fixture = createFixture({
      gatewayError: Errors.business(
        502,
        "微信虚拟支付接口拒绝请求",
        "WECHAT_VIRTUAL_PAYMENT_UPSTREAM_REJECTED",
        { httpStatus: 200, wechatErrcode: 268490003, requestId: "safe-id", sensitive },
      ),
    });

    const error = await fixture.service.validateConfiguration(
      platformAuth,
      { environment: "production", version: 3 },
    ).catch((caught) => caught);

    expect(error).toMatchObject({
      statusCode: 409,
      code: "BRANDING_VIRTUAL_PRODUCT_WECHAT_QUERY_REJECTED",
      details: { requestId: "safe-id", wechatErrcode: 268490003 },
    });
    expect(fixture.setConfigurationValidation).toHaveBeenCalledWith(
      expect.objectContaining({ validationStatus: "invalid" }),
    );
    expect(JSON.stringify(error)).not.toContain(sensitive);
    expect(JSON.stringify(error)).not.toContain("access-token-sensitive");
    expect(JSON.stringify(error)).not.toContain("production-secret");
  });

  test("persists pending for an unconfirmed network failure", async () => {
    const code = "WECHAT_VIRTUAL_PAYMENT_TRANSPORT_FAILED";
    const fixture = createFixture({
      gatewayError: Errors.business(
        502,
        "微信虚拟支付接口暂时无法确认",
        code,
        { httpStatus: 200, wechatErrcode: null, requestId: "safe-id" },
      ),
    });

    await expect(fixture.service.validateConfiguration(
      platformAuth,
      { environment: "production", version: 3 },
    )).rejects.toMatchObject({
      code,
      details: { requestId: "safe-id" },
    });
    expect(fixture.setConfigurationValidation).toHaveBeenCalledWith(
      expect.objectContaining({ validationStatus: "pending" }),
    );
  });

  test("rejects an oversized AppKey without exposing it in validation", async () => {
    const oversizedAppKey = "sensitive-" + "x".repeat(503);
    const fixture = createFixture({
      secretValues: {
        WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE: JSON.stringify({
          appKey: oversizedAppKey,
          revision: 2,
        }),
      },
    });

    const error = await fixture.service.validateConfiguration(
      platformAuth,
      { environment: "production", version: 3 },
    ).catch((caught) => caught);
    expect(error).toMatchObject({
      statusCode: 409,
      code: "BRANDING_VIRTUAL_PRODUCT_SECRET_INVALID",
    });
    expect(fixture.setConfigurationValidation).toHaveBeenCalledWith(
      expect.objectContaining({ validationStatus: "invalid" }),
    );
    expect(JSON.stringify(error)).not.toContain(oversizedAppKey);
    expect(JSON.stringify(fixture.recordBestEffort.mock.calls))
      .not.toContain(oversizedAppKey);
  });

  test("keeps unknown database failures as 500", async () => {
    const fixture = createFixture({
      validationError: { code: "42P01", message: "private sql" },
    });

    await expect(fixture.service.validateConfiguration(
      platformAuth,
      { environment: "production", version: 3 },
    )).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
    });
  });

  test("does not mutate validation state when secret infrastructure fails", async () => {
    const fixture = createFixture({
      secretError: Errors.dbError("查询系统配置失败", {
        value_text: "must-not-leak",
      }),
    });

    await expect(fixture.service.validateConfiguration(
      platformAuth,
      { environment: "production", version: 3 },
    )).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      details: undefined,
    });
    expect(fixture.setConfigurationValidation).not.toHaveBeenCalled();
    expect(JSON.stringify(fixture.recordBestEffort.mock.calls))
      .not.toContain("must-not-leak");
  });

  test("does not mutate validation state when secret decryption fails", async () => {
    const fixture = createFixture({
      secretError: Errors.business(
        500,
        "系统配置密文解密失败",
        "CONFIG_SECRET_DECRYPT_FAILED",
        { ciphertext: "must-not-leak" },
      ),
    });

    await expect(fixture.service.validateConfiguration(
      platformAuth,
      { environment: "production", version: 3 },
    )).rejects.toMatchObject({
      statusCode: 500,
      code: "CONFIG_SECRET_DECRYPT_FAILED",
      details: undefined,
    });
    expect(fixture.setConfigurationValidation).not.toHaveBeenCalled();
    expect(JSON.stringify(fixture.recordBestEffort.mock.calls))
      .not.toContain("must-not-leak");
  });
});
