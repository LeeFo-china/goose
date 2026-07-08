import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";
import type { AdminAuthEmployeeRecord } from "@/repositories/admin-auth";
import {
  createAdminAuthLoginTimingSteps,
  logAdminAuthLoginTiming,
  measureAdminAuthLoginStep,
} from "@/services/admin-auth-login-timing";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.JWT_SECRET ??= "test-jwt-secret";

const activeEmployee = {
  id: "employee-1",
  user_id: "auth-user-1",
  tenant_id: "tenant-1",
  status: "active",
  tenant_department_id: "department-1",
  post_id: "post-1",
  name: "出纳员",
  phone: "13800138000",
  avatar: null,
  tenant: {
    id: "tenant-1",
    name: "固始晴天装饰",
    slug: "qingtian",
    status: "active",
  },
  tenant_department: {
    id: "department-1",
    alias_name: "财务部",
    code: "finance",
  },
  post: { name: "出纳" },
} satisfies AdminAuthEmployeeRecord;

const activeAuthContext = {
  authUserId: "auth-user-1",
  employeeId: "employee-1",
  tenantId: "tenant-1",
  tenantName: "固始晴天装饰",
  tenantSlug: "qingtian",
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "出纳员",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: "department-1",
  departmentCode: "finance",
  departmentName: "财务部",
  postId: "post-1",
  postName: "出纳",
  avatar: null,
  roleCodes: ["finance_cashier"],
  roles: [],
  permissions: [],
} satisfies AuthContext;

const findEmployeeByPhone = mock(async () => [activeEmployee]);
const findValidVerificationCode = mock(async () => null);
const createAdminAuthUser = mock(async () => "auth-user-1");
const bindEmployeeAuthUser = mock(async () => undefined);
const markVerificationCodeVerified = mock(async () => undefined);
const getAuthContextByEmployeeId = mock(async () => activeAuthContext);
const getAuthContextByAuthUserId = mock(async () => activeAuthContext);
const assertTenantAvailable = mock(() => undefined);
const invalidateAuthContext = mock(() => undefined);
const syncBusinessMembershipBestEffort = mock(async () => undefined);

mock.module("@/repositories/admin-auth", () => ({
  adminAuthRepository: {
    findEmployeeByPhone,
    findValidVerificationCode,
    createAdminAuthUser,
    bindEmployeeAuthUser,
    markVerificationCodeVerified,
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
  getJwtExpiresAt: () => "2026-07-08T00:00:00.000Z",
  signToken: () => "signed-token",
}));

mock.module("@/services/files/file-url-resolver", () => ({
  resolveStoredFileUrl: (value: string | null) => value,
}));

function waitForTimerResolution() {
  return new Promise((resolve) => setTimeout(resolve, 2));
}

describe("admin auth login timing", () => {
  beforeEach(() => {
    findEmployeeByPhone.mockClear();
    findEmployeeByPhone.mockImplementation(async () => {
      await waitForTimerResolution();
      return [activeEmployee];
    });
    findValidVerificationCode.mockClear();
    createAdminAuthUser.mockClear();
    bindEmployeeAuthUser.mockClear();
    markVerificationCodeVerified.mockClear();
    getAuthContextByEmployeeId.mockClear();
    getAuthContextByEmployeeId.mockImplementation(async () => {
      await waitForTimerResolution();
      return activeAuthContext;
    });
    getAuthContextByAuthUserId.mockClear();
    getAuthContextByAuthUserId.mockImplementation(async () => {
      await waitForTimerResolution();
      return activeAuthContext;
    });
    assertTenantAvailable.mockClear();
    invalidateAuthContext.mockClear();
    syncBusinessMembershipBestEffort.mockClear();
    syncBusinessMembershipBestEffort.mockImplementation(async () => {
      await waitForTimerResolution();
    });
  });

  test("measures named login stages", async () => {
    const steps = createAdminAuthLoginTimingSteps();

    await measureAdminAuthLoginStep(steps, "find_employee_ms", async () => {
      await waitForTimerResolution();
    });

    expect(steps.find_employee_ms).toBeGreaterThan(0);
  });

  test("logs slow login timing with stage details", () => {
    const warn = mock(
      (_payload: Record<string, unknown>, _message: string) => undefined,
    );
    const info = mock(
      (_payload: Record<string, unknown>, _message: string) => undefined,
    );
    const steps = createAdminAuthLoginTimingSteps();
    steps.find_employee_ms = 1200;

    logAdminAuthLoginTiming(
      {
        id: "request-1",
        log: { warn, info },
      },
      {
        startedAt: Date.now() - 1200,
        statusCode: 200,
        steps,
      },
    );

    expect(warn).toHaveBeenCalledTimes(1);
    expect(info).not.toHaveBeenCalled();
    expect(warn.mock.calls[0]?.[0]).toMatchObject({
      event: "admin_auth_login_timing",
      requestId: "request-1",
      status_code: 200,
      steps: {
        find_employee_ms: 1200,
      },
    });
  });

  test("records login service stage timings", async () => {
    const { adminAuthService } = await import("@/services/admin-auth");
    const steps = createAdminAuthLoginTimingSteps();

    const result = await adminAuthService.login(
      {
        phone: "13800138000",
        code: "",
      },
      { timingSteps: steps },
    );

    expect(result.token).toBe("signed-token");
    expect(steps.find_employee_ms).toBeGreaterThan(0);
    expect(steps.employee_auth_context_ms).toBeGreaterThan(0);
    expect(steps.business_membership_sync_ms).toBeGreaterThan(0);
    expect(steps.session_auth_context_ms).toBeGreaterThan(0);
    expect(findEmployeeByPhone).toHaveBeenCalledWith("13800138000");
    expect(syncBusinessMembershipBestEffort).toHaveBeenCalledWith({
      userId: "auth-user-1",
      tenantId: "tenant-1",
      identityType: "employee",
      identityId: "employee-1",
      deactivateOtherSameType: true,
      source: "admin_web_login",
    });
  });
});
