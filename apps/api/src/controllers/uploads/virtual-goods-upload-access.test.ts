import { beforeAll, describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";
import "./index.test-harness";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let assertVirtualGoodsUploadSceneAccess: typeof import(
  "./virtual-goods-upload-access"
)["assertVirtualGoodsUploadSceneAccess"];

beforeAll(async () => {
  ({ assertVirtualGoodsUploadSceneAccess } = await import(
    "./virtual-goods-upload-access"
  ));
});

const platformContext: AuthContext = {
  authUserId: "auth-platform",
  employeeId: "employee-platform",
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  isPlatformAdmin: true,
  employeeName: "平台超管",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: [],
  roles: [],
  permissions: [{ code: "platform.payment.config.manage", scope: "all" }],
};

function dependencies(authContext: AuthContext) {
  const getRequiredAuthContext = mock(async () => authContext);
  const assertPermission = mock(() => "all" as const);
  return {
    getRequiredAuthContext,
    assertPermission,
    value: {
      authorizationService: { getRequiredAuthContext },
      accessPolicyService: { assertPermission },
    },
  };
}

describe("assertVirtualGoodsUploadSceneAccess", () => {
  test("ignores unrelated upload scenes", async () => {
    const deps = dependencies(platformContext);

    expect(await assertVirtualGoodsUploadSceneAccess(
      { sub: "auth-platform" },
      "brand_logo",
      deps.value,
    )).toBeNull();
    expect(deps.getRequiredAuthContext).not.toHaveBeenCalled();
  });

  test("allows a platform employee with payment configuration permission", async () => {
    const deps = dependencies(platformContext);

    expect(await assertVirtualGoodsUploadSceneAccess(
      { sub: "auth-platform" },
      "branding_virtual_goods",
      deps.value,
    )).toEqual({
      tenantId: null,
      employeeId: "employee-platform",
      customerId: null,
      visitorId: null,
      isPlatformAdmin: true,
    });
    expect(deps.assertPermission).toHaveBeenCalledWith(
      platformContext,
      "platform.payment.config.manage",
    );
  });

  test.each([
    ["tenant context", { tenantId: "tenant-1" }],
    ["non-platform context", { isPlatformAdmin: false }],
    ["missing employee", { employeeId: null }],
  ])("rejects %s", async (_name, patch) => {
    const deps = dependencies({ ...platformContext, ...patch });

    await expect(assertVirtualGoodsUploadSceneAccess(
      { sub: "auth-platform" },
      "branding_virtual_goods",
      deps.value,
    )).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
  });

  test("rejects visitor sessions before resolving an employee", async () => {
    const deps = dependencies(platformContext);

    await expect(assertVirtualGoodsUploadSceneAccess(
      { token_type: "visitor_session", visitor_id: "visitor-1" },
      "branding_virtual_goods",
      deps.value,
    )).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(deps.getRequiredAuthContext).not.toHaveBeenCalled();
  });

  test("propagates missing payment configuration permission", async () => {
    const deps = dependencies(platformContext);
    deps.assertPermission.mockImplementation(() => {
      throw Object.assign(new Error("forbidden"), {
        statusCode: 403,
        code: "FORBIDDEN",
      });
    });

    await expect(assertVirtualGoodsUploadSceneAccess(
      { sub: "auth-platform" },
      "branding_virtual_goods",
      deps.value,
    )).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
