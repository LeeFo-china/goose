import { randomInt } from "node:crypto";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  adminAuthRepository,
  type AdminAuthEmployeeRecord,
} from "@/repositories/admin-auth";
import { authorizationService, type AuthContext } from "@/services/authorization";
import { platformAuthorizationService } from "@/services/platform-authorization";
import { sendSmsCode } from "@/services/sms";
import { userIdentityService } from "@/services/user-identities";
import { isPhoneLoginWithoutCodeEnabled } from "@/utils/auth/test-login";
import { getAdminJwtExpiresAt, signAdminToken } from "@/utils/jwt";
import { isEmployeeOperableStatus } from "@gooes/domain";
import { resolveStoredFileUrl } from "@/services/files/file-url-resolver";
import {
  measureAdminAuthLoginStep,
  type AdminAuthLoginTimingStep,
  type AdminAuthLoginTimingSteps,
} from "@/services/admin-auth-login-timing";

const ADMIN_LOGIN_SCENE = "admin_login" as const;

type AdminAuthLoginOptions = {
  timingSteps?: AdminAuthLoginTimingSteps;
};

async function measureLoginStep<T>(
  options: AdminAuthLoginOptions | undefined,
  step: AdminAuthLoginTimingStep,
  callback: () => Promise<T> | T,
): Promise<T> {
  if (!options?.timingSteps) {
    return await callback();
  }

  return measureAdminAuthLoginStep(options.timingSteps, step, callback);
}

function generateVerificationCode() {
  return String(randomInt(100000, 1000000));
}

function getRelationName(
  value:
    | { name: string | null }
    | Array<{ name: string | null }>
    | null
    | undefined,
) {
  if (Array.isArray(value)) {
    return value[0]?.name ?? null;
  }

  return value?.name ?? null;
}

function getRelationField<T extends Record<string, unknown>, K extends keyof T>(
  value: T | T[] | null | undefined,
  key: K,
): T[K] | null {
  const record = Array.isArray(value) ? value[0] : value;
  return record?.[key] ?? null;
}

function getEmployeeDepartmentName(employee: AdminAuthEmployeeRecord) {
  return getRelationField(employee.tenant_department, "alias_name") as string | null;
}

function getEmployeeDepartmentCode(employee: AdminAuthEmployeeRecord) {
  return getRelationField(employee.tenant_department, "code") as string | null;
}

function serializeEmployeeFromAuthContext(authContext: AuthContext) {
  return {
    id: authContext.employeeId,
    name: authContext.employeeName,
    status: authContext.employeeStatus,
    tenant_department_id: authContext.tenantDepartmentId,
    department_code: authContext.departmentCode,
    department_name: authContext.departmentName,
    post_id: authContext.postId,
    post_name: authContext.postName,
    avatar: resolveStoredFileUrl(authContext.avatar),
  };
}

function serializeTenantFromAuthContext(authContext: AuthContext) {
  if (!authContext.tenantId) {
    return null;
  }

  return {
    id: authContext.tenantId,
    name: authContext.tenantName,
    slug: authContext.tenantSlug,
    status: authContext.tenantStatus,
  };
}

function serializePlatformSessionFlags(authContext: AuthContext) {
  return {
    is_platform_staff: Boolean(authContext.isPlatformStaff),
    is_platform_super_admin: Boolean(authContext.isPlatformSuperAdmin),
  };
}

function serializeEmployeeRecord(employee: AdminAuthEmployeeRecord) {
  return {
    id: employee.id,
    name: employee.name,
    phone: employee.phone,
    status: employee.status,
    tenant_department_id: employee.tenant_department_id,
    department_code: getEmployeeDepartmentCode(employee),
    department_name: getEmployeeDepartmentName(employee),
    post_id: employee.post_id,
    post_name: getRelationName(employee.post),
    avatar: resolveStoredFileUrl(employee.avatar),
  };
}

class AdminAuthService {
  private async getSingleActiveEmployeeByPhone(
    phone: string,
    options?: AdminAuthLoginOptions,
  ) {
    const employees = await measureLoginStep(
      options,
      "find_employee_ms",
      () => adminAuthRepository.findEmployeeByPhone(phone),
    );

    if (employees.length === 0) {
      throw Errors.business(
        404,
        "该手机号未绑定员工身份",
        ErrorCodes.ADMIN_AUTH_EMPLOYEE_NOT_FOUND,
      );
    }

    if (employees.length > 1) {
      throw Errors.badRequest("该手机号绑定了多个员工档案，请联系管理员处理");
    }

    const employee = employees[0];
    if (!employee) {
      throw Errors.business(
        404,
        "该手机号未绑定员工身份",
        ErrorCodes.ADMIN_AUTH_EMPLOYEE_NOT_FOUND,
      );
    }

    if (!isEmployeeOperableStatus(employee.status)) {
      throw Errors.business(
        403,
        "员工状态不可登录后台",
        ErrorCodes.ADMIN_AUTH_EMPLOYEE_DISABLED,
      );
    }

    const authContext = await measureLoginStep(
      options,
      "employee_auth_context_ms",
      () => authorizationService.getAuthContextByEmployeeId(employee.id),
    );
    authorizationService.assertTenantAvailable(authContext);

    return employee;
  }

  async sendCode(input: {
    phone: string;
    requestIp?: string | null;
  }) {
    const employee = await this.getSingleActiveEmployeeByPhone(input.phone);

    const recentBoundary = new Date(Date.now() - 60 * 1000).toISOString();
    const recentCode = await adminAuthRepository.findRecentVerificationCode({
      phone: input.phone,
      scene: ADMIN_LOGIN_SCENE,
      since: recentBoundary,
    });

    if (recentCode) {
      throw Errors.badRequest("验证码发送过于频繁，请稍后再试");
    }

    const code = generateVerificationCode();
    const expiredAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await adminAuthRepository.createVerificationCode({
      phone: input.phone,
      scene: ADMIN_LOGIN_SCENE,
      code,
      expired_at: expiredAt,
      request_ip: input.requestIp,
    });

    try {
      await sendSmsCode(input.phone, code, ADMIN_LOGIN_SCENE, {
        tenantId: employee.tenant_id,
      });
    } catch (error) {
      await adminAuthRepository.deletePendingVerificationCode({
        phone: input.phone,
        scene: ADMIN_LOGIN_SCENE,
        code,
      });
      throw Errors.dbError("发送验证码失败", error);
    }

    return { success: true };
  }

  async login(
    input: {
      phone: string;
      code?: string;
    },
    options: AdminAuthLoginOptions = {},
  ) {
    const employee = await this.getSingleActiveEmployeeByPhone(
      input.phone,
      options,
    );
    const skipCodeVerification = isPhoneLoginWithoutCodeEnabled();
    const code = input.code?.trim() || "";
    let verificationCode: { id: string } | null = null;

    if (!skipCodeVerification) {
      if (!code) {
        throw Errors.business(
          400,
          "请输入验证码",
          ErrorCodes.ADMIN_AUTH_CODE_INVALID,
        );
      }

      verificationCode = await measureLoginStep(
        options,
        "verification_code_ms",
        () => adminAuthRepository.findValidVerificationCode({
          phone: input.phone,
          scene: ADMIN_LOGIN_SCENE,
          code,
          now: new Date().toISOString(),
        }),
      );

      if (!verificationCode) {
        throw Errors.business(
          400,
          "验证码错误或已过期",
          ErrorCodes.ADMIN_AUTH_CODE_INVALID,
        );
      }
    }

    let authUserId = employee.user_id;
    if (!authUserId) {
      authUserId = await measureLoginStep(
        options,
        "admin_auth_user_ms",
        async () => {
          const createdAuthUserId = await adminAuthRepository.createAdminAuthUser({
            employeeId: employee.id,
            phone: input.phone,
            name: employee.name,
          });
          await adminAuthRepository.bindEmployeeAuthUser({
            employeeId: employee.id,
            authUserId: createdAuthUserId,
          });
          return createdAuthUserId;
        },
      );
      authorizationService.invalidateAuthContext({
        authUserId,
        employeeId: employee.id,
      });
    }

    await measureLoginStep(options, "business_membership_sync_ms", () =>
      userIdentityService.syncBusinessMembershipBestEffort({
        userId: authUserId,
        tenantId: employee.tenant_id,
        identityType: "employee",
        identityId: employee.id,
        deactivateOtherSameType: true,
        source: "admin_web_login",
      }),
    );

    if (verificationCode) {
      await measureLoginStep(options, "verification_mark_ms", () =>
        adminAuthRepository.markVerificationCodeVerified(verificationCode.id),
      );
    }

    const authContext = await measureLoginStep(
      options,
      "session_auth_context_ms",
      () => authorizationService.getAuthContextByAuthUserId(authUserId),
    );
    authorizationService.assertTenantAvailable(authContext);

    const isPlatformSession = Boolean(authContext.isPlatformStaff);
    const adminAuthVersion = authContext.adminAuthVersion
      ?? employee.admin_auth_version
      ?? 1;
    const token = signAdminToken({
      sub: authUserId,
      login_channel: "admin_web",
      roles: ["employee"],
      admin_auth_version: adminAuthVersion,
    }, { platform: isPlatformSession });
    await adminAuthRepository.updateLastLogin(
      employee.id,
      new Date().toISOString(),
    );

    return {
      token,
      user_id: authUserId,
      login_channel: "admin_web",
      employee: serializeEmployeeRecord(employee),
      tenant: serializeTenantFromAuthContext(authContext),
      roles: authContext.roleCodes,
      permissions: authContext.permissions,
      ...serializePlatformSessionFlags(authContext),
      expires_at: getAdminJwtExpiresAt({ platform: isPlatformSession }),
    };
  }

  async me(authUserId?: string | null, adminAuthVersion?: number) {
    if (!authUserId) {
      throw Errors.unauthorized("缺少登录凭证");
    }

    let authContext = await authorizationService.getAuthContextByAuthUserId(
      authUserId,
    );
    authorizationService.assertTenantAvailable(authContext);

    if (authContext.isPlatformStaff) {
      authContext = await platformAuthorizationService.assertPlatformSession(
        authContext,
        adminAuthVersion,
      );
    }

    if (
      !authContext.employeeId ||
      !isEmployeeOperableStatus(authContext.employeeStatus)
    ) {
      throw Errors.business(
        403,
        "员工状态不可登录后台",
        ErrorCodes.ADMIN_AUTH_EMPLOYEE_DISABLED,
      );
    }

    return {
      user_id: authUserId,
      login_channel: "admin_web",
      employee: serializeEmployeeFromAuthContext(authContext),
      tenant: serializeTenantFromAuthContext(authContext),
      roles: authContext.roleCodes,
      permissions: authContext.permissions,
      ...serializePlatformSessionFlags(authContext),
    };
  }
}

export const adminAuthService = new AdminAuthService();
