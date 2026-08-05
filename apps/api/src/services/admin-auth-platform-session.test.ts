import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import type { AdminAuthEmployeeRecord } from "@/repositories/admin-auth";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.JWT_SECRET ??= "test-jwt-secret";

const platformEmployee = {
  id: "platform-employee",
  user_id: "auth-platform",
  tenant_id: null,
  status: "active",
  admin_auth_version: 5,
  tenant_department_id: null,
  post_id: null,
  name: "平台运营",
  phone: "13800138000",
  avatar: null,
  tenant: null,
  tenant_department: null,
  post: null,
} satisfies AdminAuthEmployeeRecord;

const platformAuthContext = {
  authUserId: "auth-platform",
  employeeId: "platform-employee",
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  isPlatformAdmin: false,
  isPlatformStaff: true,
  isPlatformSuperAdmin: false,
  adminAuthVersion: 5,
  employeeName: "平台运营",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["platform_staff", "platform_operations"],
  roles: [],
  permissions: [{ code: "platform.tenant.read", scope: "all" }],
} satisfies AuthContext;

const findEmployeeByPhone = mock(async () => [platformEmployee]);
const findValidVerificationCode = mock(async () => null);
const createAdminAuthUser = mock(async () => "auth-platform");
const bindEmployeeAuthUser = mock(async () => undefined);
const markVerificationCodeVerified = mock(async () => undefined);
const updateLastLogin = mock(async () => undefined);
const getAuthContextByEmployeeId = mock(async () => platformAuthContext);
const getAuthContextByAuthUserId = mock(async () => platformAuthContext);
const assertTenantAvailable = mock(() => undefined);
const invalidateAuthContext = mock(() => undefined);
const syncBusinessMembershipBestEffort = mock(async () => undefined);
const assertPlatformSession = mock(async () => platformAuthContext);
const signAdminToken = mock(() => "admin-token");

mock.module("@/repositories/admin-auth", () => ({
  adminAuthRepository: {
    findEmployeeByPhone,
    findValidVerificationCode,
    createAdminAuthUser,
    bindEmployeeAuthUser,
    markVerificationCodeVerified,
    updateLastLogin,
  },
}));

mock.module("@/services/authorization", () => ({
  authorizationService: {
    getAuthContextByEmployeeId,
    getAuthContextByAuthUserId,
    assertTenantAvailable,
    invalidateAuthContext,
  },
}));

mock.module("@/services/platform-authorization", () => ({
  platformAuthorizationService: {
    assertPlatformSession,
  },
}));

mock.module("@/services/user-identities", () => ({
  userIdentityService: {
    syncBusinessMembershipBestEffort,
  },
}));

mock.module("@/services/sms", () => ({
  sendSmsCode: mock(async () => ({ success: true })),
}));

mock.module("@/utils/auth/test-login", () => ({
  isPhoneLoginWithoutCodeEnabled: () => true,
}));

mock.module("@/utils/jwt", () => ({
  getAdminJwtExpiresAt: () => "2026-08-06T00:00:00.000Z",
  getJwtExpiresAt: () => "2026-08-12T00:00:00.000Z",
  signAdminToken,
  signToken: () => "legacy-token",
  verifyTokenDetailed: () => ({
    reason: "valid",
    payload: {
      sub: "auth-platform",
      login_channel: "admin_web",
      roles: ["employee"],
      admin_auth_version: 5,
      iat: 1,
      exp: 1 + 12 * 60 * 60,
    },
  }),
}));

mock.module("@/services/files/file-url-resolver", () => ({
  resolveStoredFileUrl: (value: string | null) => value,
}));

describe("admin auth platform session", () => {
  beforeEach(() => {
    findEmployeeByPhone.mockClear();
    findValidVerificationCode.mockClear();
    createAdminAuthUser.mockClear();
    bindEmployeeAuthUser.mockClear();
    markVerificationCodeVerified.mockClear();
    updateLastLogin.mockClear();
    getAuthContextByEmployeeId.mockClear();
    getAuthContextByAuthUserId.mockClear();
    assertTenantAvailable.mockClear();
    invalidateAuthContext.mockClear();
    syncBusinessMembershipBestEffort.mockClear();
    assertPlatformSession.mockClear();
    assertPlatformSession.mockImplementation(async () => platformAuthContext);
    signAdminToken.mockClear();
    signAdminToken.mockImplementation(() => "admin-token");
  });

  test("signs platform login tokens with admin session version", async () => {
    const { adminAuthService } = await import("@/services/admin-auth");

    const result = await adminAuthService.login({
      phone: "13800138000",
      code: "",
    });

    expect(signAdminToken).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: "auth-platform",
        login_channel: "admin_web",
        roles: ["employee"],
        admin_auth_version: 5,
      }),
      { platform: true },
    );
    expect(updateLastLogin).toHaveBeenCalledWith(
      "platform-employee",
      expect.any(String),
    );
    expect(result).toMatchObject({
      token: "admin-token",
      is_platform_staff: true,
      is_platform_super_admin: false,
      expires_at: "2026-08-06T00:00:00.000Z",
    });
  });

  test("validates platform me requests against token session version", async () => {
    const { adminAuthService } = await import("@/services/admin-auth");

    const result = await adminAuthService.me("auth-platform", 5);

    expect(assertPlatformSession).toHaveBeenCalledWith(platformAuthContext, 5);
    expect(result).toMatchObject({
      is_platform_staff: true,
      is_platform_super_admin: false,
    });

    assertPlatformSession.mockImplementationOnce(async () => {
      throw Errors.business(
        401,
        "平台会话已失效，请重新登录",
        ErrorCodes.ADMIN_SESSION_REVOKED,
      );
    });

    await expect(adminAuthService.me("auth-platform", 4)).rejects.toMatchObject({
      statusCode: 401,
      code: ErrorCodes.ADMIN_SESSION_REVOKED,
    });
  });
});
