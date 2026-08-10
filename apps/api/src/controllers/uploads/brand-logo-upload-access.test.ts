import { beforeAll, describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let assertBrandLogoUploadSceneAccess: typeof import(
  "./brand-logo-upload-access"
)["assertBrandLogoUploadSceneAccess"];

beforeAll(async () => {
  ({ assertBrandLogoUploadSceneAccess } = await import(
    "./brand-logo-upload-access"
  ));
});

const tenantContext: AuthContext = {
  authUserId: "auth-tenant",
  employeeId: "employee-tenant",
  tenantId: "tenant-live",
  tenantName: "测试租户",
  tenantSlug: "tenant-live",
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "品牌管理员",
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
  permissions: [{ code: "brand.settings.update", scope: "all" }],
};

function dependencies(authContext: AuthContext) {
  const getRequiredAuthContext = mock(async () => authContext);
  const assertPermission = mock(() => "all" as const);
  const assertCanCustomize = mock(async () => ({
    tenantId: authContext.tenantId ?? "tenant-live",
    entitlement: { code: "custom_support_branding" },
  }));
  return {
    getRequiredAuthContext,
    assertPermission,
    assertCanCustomize,
    value: {
      authorizationService: { getRequiredAuthContext },
      accessPolicyService: { assertPermission },
      tenantEntitlementsService: { assertCanCustomize },
    },
  };
}

describe("assertBrandLogoUploadSceneAccess", () => {
  test("ignores unrelated upload scenes", async () => {
    const deps = dependencies(tenantContext);

    expect(await assertBrandLogoUploadSceneAccess(
      { sub: "auth-tenant" },
      "project_log",
      deps.value,
    )).toBeNull();
    expect(deps.getRequiredAuthContext).not.toHaveBeenCalled();
  });

  test("uses the live tenant employee context and active entitlement", async () => {
    const deps = dependencies(tenantContext);

    const actor = await assertBrandLogoUploadSceneAccess(
      {
        sub: "auth-tenant",
        tenant_id: "forged-tenant",
        employee_id: "forged-employee",
      },
      "brand_logo",
      deps.value,
    );

    expect(deps.getRequiredAuthContext).toHaveBeenCalledWith("auth-tenant", {
      tenantServiceAccess: "write",
    });
    expect(deps.assertCanCustomize).toHaveBeenCalledWith(
      tenantContext,
      expect.any(Date),
    );
    expect(actor).toEqual({
      tenantId: "tenant-live",
      employeeId: "employee-tenant",
      customerId: null,
      visitorId: null,
      isPlatformAdmin: false,
      isPlatformIdentity: false,
    });
  });

  test("allows only platform employees with branding permission", async () => {
    const platformContext: AuthContext = {
      ...tenantContext,
      authUserId: "auth-platform",
      employeeId: "employee-platform",
      tenantId: null,
      tenantName: null,
      tenantSlug: null,
      tenantStatus: null,
      isPlatformAdmin: false,
      isPlatformStaff: true,
      permissions: [{ code: "platform.branding.manage", scope: "all" }],
    };
    const deps = dependencies(platformContext);

    const actor = await assertBrandLogoUploadSceneAccess(
      { sub: "auth-platform" },
      "brand_logo",
      deps.value,
    );

    expect(deps.assertPermission).toHaveBeenCalledWith(
      platformContext,
      "platform.branding.manage",
    );
    expect(deps.assertCanCustomize).not.toHaveBeenCalled();
    expect(actor).toMatchObject({
      tenantId: null,
      employeeId: "employee-platform",
      isPlatformAdmin: false,
      isPlatformIdentity: true,
    });
  });

  test.each([
    ["customer", { employeeId: null }],
    ["platform flag in tenant scope", { isPlatformAdmin: true }],
    ["tenant missing", { tenantId: null }],
  ])("rejects an invalid %s context", async (_name, patch) => {
    const deps = dependencies({ ...tenantContext, ...patch });

    await expect(assertBrandLogoUploadSceneAccess(
      { sub: "auth-tenant" },
      "brand_logo",
      deps.value,
    )).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(deps.assertCanCustomize).not.toHaveBeenCalled();
  });

  test("rejects a visitor session without resolving a generic actor", async () => {
    const deps = dependencies(tenantContext);

    await expect(assertBrandLogoUploadSceneAccess(
      { token_type: "visitor_session", visitor_id: "visitor-1" },
      "brand_logo",
      deps.value,
    )).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(deps.getRequiredAuthContext).not.toHaveBeenCalled();
  });

  test("propagates missing platform permission", async () => {
    const platformDeps = dependencies({
      ...tenantContext,
      tenantId: null,
      tenantName: null,
      tenantSlug: null,
      tenantStatus: null,
      isPlatformAdmin: true,
    });
    platformDeps.assertPermission.mockImplementation(() => {
      throw Object.assign(new Error("forbidden"), {
        statusCode: 403,
        code: "FORBIDDEN",
      });
    });
    await expect(assertBrandLogoUploadSceneAccess(
      { sub: "auth-platform" },
      "brand_logo",
      platformDeps.value,
    )).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test.each([
    "FORBIDDEN",
    "BRANDING_ENTITLEMENT_REQUIRED",
    "BRANDING_ENTITLEMENT_SUSPENDED",
    "BRANDING_ENTITLEMENT_EXPIRED",
    "BRANDING_ENTITLEMENT_REVOKED",
  ])("propagates tenant customization denial %s", async (code) => {
    const tenantDeps = dependencies(tenantContext);
    tenantDeps.assertCanCustomize.mockImplementation(async () => {
      throw Object.assign(new Error("customization denied"), {
        statusCode: 403,
        code,
      });
    });
    await expect(assertBrandLogoUploadSceneAccess(
      { sub: "auth-tenant" },
      "brand_logo",
      tenantDeps.value,
    )).rejects.toMatchObject({ code });
  });
});
