import { beforeAll, describe, expect, mock, test } from "bun:test";

import type { BrandingAddonProductRecord } from "@/repositories/branding-addon-products";
import type { BrandingVirtualProductRecord } from "@/repositories/branding-virtual-products";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";
const AUTH_USER_ID = "22222222-2222-4222-8222-222222222222";

const product: BrandingAddonProductRecord = {
  id: "44444444-4444-4444-8444-444444444444",
  code: "custom_support_branding_annual",
  entitlement_code: "custom_support_branding",
  name: "年度品牌技术支持",
  amount_fen: 9_900,
  term_years: 1,
  purchase_notes: "支付成功后自动开通一年",
  refund_policy: "数字权益支付成功并开通后不支持退款",
  enabled: true,
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
  permissions: [{ code: "platform.branding_product.manage", scope: "all" }],
} satisfies AuthContext;

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
  product?: BrandingAddonProductRecord;
  mapping?: BrandingVirtualProductRecord;
  secretBundle?: string;
} = {}) {
  const current = options.product ?? product;
  const mapping = options.mapping ?? productionMapping;
  const getProduct = mock(async () => current);
  const updatedProduct = { ...current, version: 2 };
  const findByProductAndEnvironment = mock(async () => mapping);
  const manageConfiguration = mock(async (input: {
    productPatch: Record<string, unknown>;
    virtualProductPatch: Record<string, unknown>;
  }) => {
    const coordinatesChanged =
      input.virtualProductPatch.provider_product_id !== undefined &&
      input.virtualProductPatch.provider_product_id !== mapping.provider_product_id;
    return {
      product: Object.keys(input.productPatch).length > 0
        ? updatedProduct
        : current,
      virtual_product: {
        ...mapping,
        ...input.virtualProductPatch,
        validation_status: coordinatesChanged
          ? "pending" as const
          : mapping.validation_status,
        validated_at: coordinatesChanged ? null : mapping.validated_at,
        version: 2,
      },
    };
  });
  const recordBestEffort = mock(async () => null);
  const getSecretString = mock(async () => options.secretBundle ?? JSON.stringify({
    appKey: "production-secret",
    revision: 2,
  }));
  const service = new PlatformBrandingAddonProductService({
    repository: { getProduct },
    virtualProductRepository: {
      findByProductAndEnvironment,
      manageConfiguration,
    },
    settingsService: {
      getSecretString,
    },
    accessPolicy: { assertPermission: mock(() => "all" as const) },
    audit: { recordBestEffort },
    managementService: {
      getSummaries: mock(async () => []),
      validateConfiguration: mock(async () => ({
        virtual_product: mapping,
        validation: {
          kind: "server_configuration" as const,
          validated_at: "2026-08-01T00:00:00.000Z",
        },
      })),
    },
  });
  return {
    service,
    manageConfiguration,
    recordBestEffort,
    getSecretString,
  };
}

const activeProductionPatch = {
  environment: "production" as const,
  app_id: "wx-app",
  virtual_merchant_id: "virtual-merchant",
  offer_id: "offer-annual",
  provider_product_id: "branding-annual",
  expected_amount_fen: 9_900,
  encrypted_secret_ref:
    "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE" as const,
  secret_revision: 2,
  status: "active" as const,
  version: 1,
};

describe("PlatformBrandingAddonProductService virtual mapping writes", () => {
  test("rejects an unsupported purchase mode transition with a stable conflict", async () => {
    const fixture = createFixture({
      product: { ...product, purchase_mode: "direct_legacy" },
    });
    await expect(fixture.service.update(platformAuth, {
      purchase_mode: "wechat_virtual",
      version: 1,
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_ADDON_PURCHASE_MODE_TRANSITION_INVALID",
    });
    expect(fixture.manageConfiguration).not.toHaveBeenCalled();
  });

  test.each(["draft", "disabled", "active"] as const)(
    "rejects a 99-fen production %s mapping with the same conflict",
    async (status) => {
      const fixture = createFixture();
      await expect(fixture.service.update(platformAuth, {
        virtual_product: {
          ...activeProductionPatch,
          expected_amount_fen: 99,
          status,
        },
        version: 1,
      })).rejects.toMatchObject({
        statusCode: 409,
        code: "BRANDING_VIRTUAL_PRODUCT_AMOUNT_TOO_LOW",
      });
      expect(fixture.manageConfiguration).not.toHaveBeenCalled();
    },
  );

  test("rejects a production price below one yuan with a stable conflict", async () => {
    const fixture = createFixture({
      product: { ...product, amount_fen: 99 },
      mapping: { ...productionMapping, expected_amount_fen: 99 },
    });

    await expect(fixture.service.update(platformAuth, {
      purchase_mode: "wechat_virtual",
      version: 1,
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_VIRTUAL_PRODUCT_AMOUNT_TOO_LOW",
    });
    expect(fixture.manageConfiguration).not.toHaveBeenCalled();
  });

  test("updates a validated mapping without auditing the AppKey", async () => {
    const fixture = createFixture();

    await fixture.service.update(platformAuth, {
      virtual_product: activeProductionPatch,
      version: 1,
    });

    expect(fixture.manageConfiguration).toHaveBeenCalledTimes(1);
    expect(fixture.manageConfiguration).toHaveBeenCalledWith({
      expectedProductVersion: 1,
      productPatch: {},
      virtualProductPatch: activeProductionPatch,
      actorEmployeeId: EMPLOYEE_ID,
    });
    const auditJson = JSON.stringify(fixture.recordBestEffort.mock.calls);
    expect(auditJson).not.toContain("production-secret");
    expect(auditJson).not.toContain("appKey");
    expect(auditJson).toContain(
      "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE",
    );
    expect(auditJson).toContain('"secret_revision":2');
    expect(auditJson).toContain('"configured":true');
  });

  test("requires revalidation before activating changed coordinates", async () => {
    const fixture = createFixture();

    await expect(fixture.service.update(platformAuth, {
      virtual_product: {
        ...activeProductionPatch,
        provider_product_id: "changed-product-id",
      },
      version: 1,
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_VIRTUAL_PRODUCT_REVALIDATION_REQUIRED",
    });
    expect(fixture.manageConfiguration).not.toHaveBeenCalled();
  });

  test("allows saving a draft before its protected secret is configured", async () => {
    const fixture = createFixture({ secretBundle: "" });

    await fixture.service.update(platformAuth, {
      virtual_product: {
        ...activeProductionPatch,
        status: "draft",
      },
      version: 1,
    });

    expect(fixture.manageConfiguration).toHaveBeenCalled();
    expect(fixture.getSecretString).toHaveBeenCalledWith(
      "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE",
    );
    expect(JSON.stringify(fixture.recordBestEffort.mock.calls)).toContain(
      '"configured":false',
    );
  });

  test("saves changed validated coordinates only as a draft for revalidation", async () => {
    const fixture = createFixture();

    const result = await fixture.service.update(platformAuth, {
      virtual_product: {
        ...activeProductionPatch,
        provider_product_id: "changed-product-id",
        status: "draft",
      },
      version: 1,
    });

    expect(fixture.manageConfiguration).toHaveBeenCalledTimes(1);
    expect(result.virtual_product).toMatchObject({
      provider_product_id: "changed-product-id",
      status: "draft",
      validation_status: "pending",
      validated_at: null,
    });
    expect(fixture.manageConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({
        virtualProductPatch: expect.objectContaining({
          provider_product_id: "changed-product-id",
          status: "draft",
        }),
      }),
    );
  });
});
