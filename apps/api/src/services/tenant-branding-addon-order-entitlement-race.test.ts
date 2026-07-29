import { describe, expect, test } from "bun:test";

import {
  authContext,
  createDependencies,
  IDEMPOTENCY_KEY,
  NOW,
} from "@/services/tenant-branding-addon-orders.test-fixtures";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const entitlement = {
  id: "99999999-9999-4999-8999-999999999999",
  tenant_id: authContext.tenantId!,
  entitlement_code: "custom_support_branding" as const,
  status: "active" as const,
  starts_at: "2026-07-28T00:00:00.000Z",
  expires_at: "2027-07-28T00:00:00.000Z",
  source_type: "manual_grant" as const,
  source_id: null,
  suspended_at: null,
  suspend_reason: null,
  version: 1,
  updated_by_employee_id: null,
  created_at: "2026-07-28T00:00:00.000Z",
  updated_at: "2026-07-28T00:00:00.000Z",
};

describe("TenantBrandingAddonOrderService entitlement race", () => {
  test.each([
    "BRANDING_ENTITLEMENT_SUSPENDED",
    "BRANDING_ENTITLEMENT_REVOKED",
  ] as const)("honors atomic %s after its preflight scan", async (code) => {
    const dependencies = createDependencies({ entitlement });
    dependencies.orderRepository.createOrder.mockRejectedValue(
      Object.assign(new Error("private"), { statusCode: 409, code }),
    );
    const { TenantBrandingAddonOrderService } = await import(
      "@/services/tenant-branding-addon-orders"
    );
    const service = new TenantBrandingAddonOrderService({
      ...dependencies,
      tradeNoFactory: () => "BA202607280001",
      nowFactory: () => new Date(NOW),
    });

    await expect(service.createOrder(authContext, {
      product_code: "custom_support_branding_annual",
      idempotency_key: IDEMPOTENCY_KEY,
    }, "openid-from-login")).rejects.toMatchObject({ statusCode: 409, code });
    expect(dependencies.wechatPayGateway.createJsapiPrepay)
      .not.toHaveBeenCalled();
  });
});
