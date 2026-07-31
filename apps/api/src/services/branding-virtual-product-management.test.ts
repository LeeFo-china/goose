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
  permissions: [{ code: "platform.branding_product.manage", scope: "all" }],
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
} = {}) {
  const getProduct = mock(async () =>
    options.product === undefined ? product : options.product
  );
  const listByProduct = mock(async () => options.mappings ?? [mapping]);
  const findByProductAndEnvironment = mock(async () =>
    options.mapping === undefined ? mapping : options.mapping
  );
  const setConfigurationValidation = mock(async (input: {
    validationStatus: "valid" | "invalid";
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
  const getSecretString = mock(async (key: string) => secretValues[key] ?? "");
  const assertPermission = mock(() => "all" as const);
  const recordBestEffort = mock(async () => null);
  const service = new BrandingVirtualProductManagementService({
    productRepository: { getProduct },
    virtualProductRepository: {
      listByProduct,
      findByProductAndEnvironment,
      setConfigurationValidation,
    },
    settingsService: { getSecretString },
    accessPolicy: { assertPermission },
    audit: { recordBestEffort },
    nowFactory: () => new Date("2026-08-01T01:02:03.000Z"),
  });
  return {
    service,
    getProduct,
    listByProduct,
    findByProductAndEnvironment,
    setConfigurationValidation,
    getSecretString,
    recordBestEffort,
  };
}

describe("BrandingVirtualProductManagementService summaries", () => {
  test("returns both environment summaries with configured secret metadata", async () => {
    const fixture = createFixture();

    const summaries = await fixture.service.getSummaries(product);

    expect(summaries).toEqual([
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
    expect(fixture.listByProduct).toHaveBeenCalledWith(PRODUCT_ID);
    expect(fixture.getSecretString).toHaveBeenCalledTimes(2);
    const json = JSON.stringify(summaries);
    expect(json).not.toContain("sandbox-secret");
    expect(json).not.toContain("production-secret");
    expect(json).not.toContain("appKey");
  });
});

describe("BrandingVirtualProductManagementService local validation", () => {
  test("registers the dedicated validation audit action", () => {
    expect(PlatformAuditLogActionSchema.safeParse(
      "branding_virtual_product.validate",
    ).success).toBe(true);
  });

  test("validates a pending mapping and persists valid with both versions", async () => {
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
    expect(result.validation.kind).toBe("server_configuration");
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
    const auditJson = JSON.stringify(fixture.recordBestEffort.mock.calls);
    expect(auditJson).not.toContain("appKey");
    expect(auditJson).not.toContain("production-secret");
    expect(auditJson).toContain('"configured":false');
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
});
