import { beforeAll, describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";
import type { BrandingVirtualProductRecord } from "@/repositories/branding-virtual-products";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const AUTH_USER_ID = "33333333-3333-4333-8333-333333333333";
const PRODUCT_ID = "44444444-4444-4444-8444-444444444444";

const tenantAuth = {
  authUserId: AUTH_USER_ID,
  employeeId: EMPLOYEE_ID,
  tenantId: TENANT_ID,
  tenantName: "测试租户",
  tenantSlug: "test-tenant",
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "租户管理员",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["system_admin"],
  roles: [],
  permissions: [{ code: "brand.entitlement.purchase", scope: "all" }],
} satisfies AuthContext;

const baseProduct = {
  id: PRODUCT_ID,
  code: "custom_support_branding_annual" as const,
  entitlement_code: "custom_support_branding" as const,
  name: "年度品牌技术支持",
  amount_fen: 9_900,
  term_years: 1 as const,
  purchase_notes: "支付成功后自动开通一年",
  refund_policy: "数字权益支付成功并开通后不支持退款",
  enabled: true,
  purchase_mode: "wechat_virtual" as const,
  version: 3,
  updated_by_employee_id: null,
  created_at: "2026-07-28T00:00:00.000Z",
  updated_at: "2026-07-28T00:00:00.000Z",
};

const baseMapping: BrandingVirtualProductRecord = {
  id: "55555555-5555-4555-8555-555555555555",
  addon_product_id: PRODUCT_ID,
  provider: "wechat_virtual" as const,
  environment: "production" as const,
  app_id: "wx-test-app",
  virtual_merchant_id: "virtual-merchant",
  offer_id: "offer-annual",
  provider_product_id: "branding-annual",
  goods_quantity: 1 as const,
  expected_amount_fen: 9_900,
  encrypted_secret_ref:
    "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE" as const,
  secret_revision: 2,
  status: "active" as const,
  validation_status: "valid" as const,
  validated_at: "2026-07-31T00:00:00.000Z",
  version: 2,
  created_by: EMPLOYEE_ID,
  updated_by: EMPLOYEE_ID,
  created_at: "2026-07-31T00:00:00.000Z",
  updated_at: "2026-07-31T00:00:00.000Z",
};

type ServiceConstructor = typeof import(
  "./branding-virtual-products"
)["BrandingVirtualProductService"];
type SecretBundleParser = typeof import(
  "./branding-virtual-products"
)["parseWechatVirtualPaymentSecretBundle"];

let BrandingVirtualProductService: ServiceConstructor;
let parseWechatVirtualPaymentSecretBundle: SecretBundleParser;

beforeAll(async () => {
  const module = await import("./branding-virtual-products");
  BrandingVirtualProductService = module.BrandingVirtualProductService;
  parseWechatVirtualPaymentSecretBundle =
    module.parseWechatVirtualPaymentSecretBundle;
});

function createService(options: {
  purchaseMode?: "direct_legacy" | "maintenance" | "wechat_virtual";
  productEnabled?: boolean;
  amountFen?: number;
  mapping?: Partial<BrandingVirtualProductRecord> | null;
  secretValues?: Record<string, string>;
  secretError?: unknown;
} = {}) {
  const product = {
    ...baseProduct,
    purchase_mode: options.purchaseMode ?? baseProduct.purchase_mode,
    enabled: options.productEnabled ?? baseProduct.enabled,
    amount_fen: options.amountFen ?? baseProduct.amount_fen,
  };
  const mapping = options.mapping === null
    ? null
    : { ...baseMapping, ...options.mapping };
  const secretValues = options.secretValues ?? {
    WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE: JSON.stringify({
      appKey: "production-app-key",
      revision: 2,
    }),
    WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE: JSON.stringify({
      appKey: "sandbox-app-key",
      revision: 1,
    }),
  };
  const getProduct = mock(async () => product);
  const findByProductAndEnvironment = mock(async () => mapping);
  const findByCode = mock(async () => null);
  const getSecretString = mock(async (key: string) => {
    if (options.secretError) throw options.secretError;
    return secretValues[key] ?? "";
  });
  const assertTenantContext = mock(() => TENANT_ID);
  const hasPermission = mock(() => true);
  const service = new BrandingVirtualProductService({
    productRepository: { getProduct },
    virtualProductRepository: { findByProductAndEnvironment },
    entitlementRepository: { findByCode },
    settingsService: { getSecretString },
    accessPolicy: { assertTenantContext, hasPermission },
    nowFactory: () => new Date("2026-08-01T00:00:00.000Z"),
  });

  return {
    service,
    getProduct,
    findByProductAndEnvironment,
    findByCode,
    getSecretString,
  };
}

describe("parseWechatVirtualPaymentSecretBundle", () => {
  test("accepts 512 AppKey characters and rejects 513", () => {
    const boundary = "a".repeat(512);
    const oversized = "sensitive-" + "b".repeat(503);

    expect(parseWechatVirtualPaymentSecretBundle(JSON.stringify({
      appKey: boundary,
      revision: 2,
    }))).toEqual({ appKey: boundary, revision: 2 });
    expect(parseWechatVirtualPaymentSecretBundle(JSON.stringify({
      appKey: oversized,
      revision: 2,
    }))).toBeNull();
  });
});

describe("BrandingVirtualProductService tenant capability", () => {
  test.each([
    ["maintenance", "active", "valid", 9_900, false, "PURCHASE_MAINTENANCE"],
    ["wechat_virtual", "disabled", "valid", 9_900, false, "VIRTUAL_PRODUCT_DISABLED"],
    ["wechat_virtual", "active", "invalid", 9_900, false, "VIRTUAL_PRODUCT_INVALID"],
    ["wechat_virtual", "active", "valid", 99, false, "VIRTUAL_PRODUCT_AMOUNT_TOO_LOW"],
    ["wechat_virtual", "active", "valid", 9_900, true, null],
  ] as const)(
    "derives %s/%s/%s capability",
    async (
      purchaseMode,
      status,
      validationStatus,
      amountFen,
      available,
      reason,
    ) => {
      const fixture = createService({
        purchaseMode,
        amountFen,
        mapping: {
          status,
          validation_status: validationStatus,
          expected_amount_fen: amountFen,
        },
      });

      const result = await fixture.service.getTenantProduct(tenantAuth);

      expect(result.product).toMatchObject({
        purchase_mode: purchaseMode,
        payment_channel: "wechat_virtual",
        virtual_payment_available: available,
        unavailable_reason: reason,
        minimum_amount_fen: 100,
        capability: "wx.requestVirtualPayment",
      });
    },
  );

  test("rejects capability when the production mapping amount differs", async () => {
    const fixture = createService({
      mapping: { expected_amount_fen: 8_800 },
    });

    const result = await fixture.service.getTenantProduct(tenantAuth);

    expect(result.product.virtual_payment_available).toBe(false);
    expect(result.product.unavailable_reason).toBe(
      "VIRTUAL_PRODUCT_AMOUNT_MISMATCH",
    );
  });

  test("does not accept a sandbox secret for a production mapping", async () => {
    const fixture = createService({
      mapping: {
        encrypted_secret_ref:
          "WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE",
        secret_revision: 1,
      },
    });

    const result = await fixture.service.getTenantProduct(tenantAuth);

    expect(result.product.virtual_payment_available).toBe(false);
    expect(result.product.unavailable_reason).toBe(
      "VIRTUAL_PRODUCT_SECRET_INVALID",
    );
    expect(fixture.getSecretString).not.toHaveBeenCalled();
  });

  test("strictly validates the secret bundle shape and revision", async () => {
    for (const bundle of [
      { appKey: "production-app-key", revision: 1 },
      { appKey: "production-app-key", revision: 2, leaked: true },
      { appKey: "", revision: 2 },
      { appKey: "production-app-key", revision: 2.5 },
      { appKey: "sensitive-" + "x".repeat(503), revision: 2 },
    ]) {
      const fixture = createService({
        secretValues: {
          WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE:
            JSON.stringify(bundle),
        },
      });

      const result = await fixture.service.getTenantProduct(tenantAuth);

      expect(result.product.virtual_payment_available).toBe(false);
      expect(result.product.unavailable_reason).toBe(
        "VIRTUAL_PRODUCT_SECRET_INVALID",
      );
    }
  });

  test("keeps the product readable when the protected secret cannot load", async () => {
    const fixture = createService({ secretError: new Error("decrypt failed") });

    const result = await fixture.service.getTenantProduct(tenantAuth);

    expect(result.product.virtual_payment_available).toBe(false);
    expect(result.product.unavailable_reason).toBe(
      "VIRTUAL_PRODUCT_SECRET_INVALID",
    );
  });

  test("keeps the legacy product readable during migration", async () => {
    const fixture = createService({
      purchaseMode: "direct_legacy",
      mapping: null,
    });

    const result = await fixture.service.getTenantProduct(tenantAuth);

    expect(result.product).toMatchObject({
      code: "custom_support_branding_annual",
      amount_fen: 9_900,
      purchase_mode: "direct_legacy",
      virtual_payment_available: false,
      unavailable_reason: "PURCHASE_MODE_DIRECT_LEGACY",
    });
    expect(fixture.findByProductAndEnvironment).not.toHaveBeenCalled();
  });
});

describe("BrandingVirtualProductRepository mapping persistence", () => {
  test("uses bounded columns and product/environment identity for reads", async () => {
    const calls: Array<[string, ...unknown[]]> = [];
    const query = {
      select(columns: string) {
        calls.push(["select", columns]);
        return query;
      },
      eq(column: string, value: unknown) {
        calls.push(["eq", column, value]);
        return query;
      },
      maybeSingle: mock(async () => ({ data: baseMapping, error: null })),
    };
    const { BrandingVirtualProductRepository } = await import(
      "@/repositories/branding-virtual-products"
    );
    const repository = new BrandingVirtualProductRepository(() => ({
      from(table: "platform_virtual_payment_products") {
        calls.push(["from", table]);
        return query;
      },
    }));

    await repository.findByProductAndEnvironment({
      addonProductId: PRODUCT_ID,
      environment: "production",
    });

    expect(calls).toContainEqual([
      "from",
      "platform_virtual_payment_products",
    ]);
    const select = calls.find(([method]) => method === "select");
    expect(select?.[1]).toContain("expected_amount_fen");
    expect(select?.[1]).not.toBe("*");
    expect(calls).toContainEqual(["eq", "addon_product_id", PRODUCT_ID]);
    expect(calls).toContainEqual(["eq", "environment", "production"]);
  });

});
