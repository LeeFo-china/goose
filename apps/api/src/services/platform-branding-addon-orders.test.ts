import { beforeAll, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";

import type { PlatformBrandingAddonOrderListQuery } from "@/schema/branding-addon";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";
const AUTH_USER_ID = "22222222-2222-4222-8222-222222222222";
const TENANT_ID = "33333333-3333-4333-8333-333333333333";
const ORDER_ID = "44444444-4444-4444-8444-444444444444";

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
  permissions: [{ code: "platform.branding_order.read", scope: "all" }],
};

type ServiceConstructor = typeof import(
  "./platform-branding-addon-orders"
)["PlatformBrandingAddonOrdersService"];

let PlatformBrandingAddonOrdersService: ServiceConstructor;

beforeAll(async () => {
  ({ PlatformBrandingAddonOrdersService } = await import(
    "./platform-branding-addon-orders"
  ));
});

function createFixture() {
  const listResult = {
    list: [{
      id: ORDER_ID,
      payment_channel: "wechat_virtual",
      payment_status: "succeeded",
      fulfillment_status: "granted",
      refund_status: "none",
    }],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  };
  const detailResult = {
    order: { id: ORDER_ID, payment_channel: "wechat_virtual" },
    audit_summary: { source: "virtual_order" },
  };
  const listPlatform = mock(async () => listResult);
  const getPlatform = mock(async () => detailResult);
  return {
    service: new PlatformBrandingAddonOrdersService({
      queryService: { listPlatform, getPlatform },
    }),
    listPlatform,
    getPlatform,
    listResult,
    detailResult,
  };
}

describe("PlatformBrandingAddonOrdersService unified query delegation", () => {
  test("keeps authorization exclusively in the unified query service", () => {
    const source = readFileSync(
      new URL("./platform-branding-addon-orders.ts", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("requirePlatformReader");
    expect(source).not.toContain("assertPermission");
  });

  test("keeps the existing list method and delegates all filters unchanged", async () => {
    const fixture = createFixture();
    const query = {
      page: 2,
      pageSize: 100,
      tenant_id: TENANT_ID,
      status: "paid",
      payment_channel: "wechat_virtual",
      payment_status: "succeeded",
      fulfillment_status: "granted",
      refund_status: "none",
      keyword: "BVO-20260731",
      created_from: "2026-07-01T00:00:00.000Z",
      created_to: "2026-07-31T23:59:59.999Z",
    } satisfies PlatformBrandingAddonOrderListQuery;

    await expect(fixture.service.list(platformAuth, query)).resolves
      .toEqual(fixture.listResult);
    expect(fixture.listPlatform).toHaveBeenCalledTimes(1);
    expect(fixture.listPlatform).toHaveBeenCalledWith(platformAuth, query);
  });

  test("keeps the existing detail method and unified audit result", async () => {
    const fixture = createFixture();

    await expect(fixture.service.get(platformAuth, ORDER_ID)).resolves
      .toEqual(fixture.detailResult);
    expect(fixture.getPlatform).toHaveBeenCalledTimes(1);
    expect(fixture.getPlatform).toHaveBeenCalledWith(platformAuth, ORDER_ID);
  });
});
