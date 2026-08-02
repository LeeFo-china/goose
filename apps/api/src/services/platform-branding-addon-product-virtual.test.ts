import { beforeAll, describe, expect, mock, test } from "bun:test";

import type { BrandingVirtualProductRecord } from "@/repositories/branding-virtual-products";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";
const AUTH_USER_ID = "22222222-2222-4222-8222-222222222222";
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
const productionMapping = {
  id: "55555555-5555-4555-8555-555555555555",
  addon_product_id: "44444444-4444-4444-8444-444444444444",
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
  status: "active",
  validation_status: "valid",
  validated_at: "2026-07-31T00:00:00.000Z",
  version: 1,
  created_by: EMPLOYEE_ID,
  updated_by: EMPLOYEE_ID,
  created_at: "2026-07-31T00:00:00.000Z",
  updated_at: "2026-07-31T00:00:00.000Z",
} satisfies BrandingVirtualProductRecord;

type ServiceConstructor = typeof import(
  "./platform-branding-addon-product"
)["PlatformBrandingAddonProductService"];

let PlatformBrandingAddonProductService: ServiceConstructor;

beforeAll(async () => {
  ({ PlatformBrandingAddonProductService } = await import(
    "./platform-branding-addon-product"
  ));
});

describe("PlatformBrandingAddonProductService virtual compatibility", () => {
  test("delegates legacy validation without entering the product write path", async () => {
    const getProduct = mock(async () => {
      throw new Error("product write path must not run");
    });
    const manageConfiguration = mock(async () => {
      throw new Error("payment write must not run");
    });
    const validateConfiguration = mock(async () => ({
      virtual_product: productionMapping,
      validation: {
        kind: "wechat_goods" as const,
        validated_at: "2026-08-01T00:00:00.000Z",
        request_ids: { upload: "upload-request-id", publish: "publish-request-id" },
      },
    }));
    const service = new PlatformBrandingAddonProductService({
      repository: { getProduct },
      virtualProductRepository: { manageConfiguration },
      accessPolicy: { assertPermission: mock(() => "all" as const) },
      audit: { recordBestEffort: mock(async () => null) },
      managementService: {
        getConfiguration: mock(async () => {
          throw new Error("configuration read must not run");
        }),
        validateConfiguration,
      },
    });
    const input = { environment: "production" as const, version: 1 };

    await expect(service.validateVirtualProduct(platformAuth, input)).resolves
      .toEqual({
        virtual_product: productionMapping,
        validation: {
          kind: "wechat_goods",
          validated_at: "2026-08-01T00:00:00.000Z",
          request_ids: {
            upload: "upload-request-id",
            publish: "publish-request-id",
          },
        },
      });
    expect(validateConfiguration).toHaveBeenCalledWith(platformAuth, input);
    expect(getProduct).not.toHaveBeenCalled();
    expect(manageConfiguration).not.toHaveBeenCalled();
  });
});
