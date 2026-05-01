import { randomInt } from "node:crypto";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  adminAuthRepository,
  type AdminAuthEmployeeRecord,
} from "@/repositories/admin-auth";
import { authorizationService, type AuthContext } from "@/services/authorization";
import { sendSmsCode } from "@/services/sms";
import { getJwtExpiresAt, signToken } from "@/utils/jwt";
import { isEmployeeOperableStatus } from "@gooes/domain";

const ADMIN_LOGIN_SCENE = "admin_login" as const;

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

function serializeEmployeeFromAuthContext(authContext: AuthContext) {
  return {
    id: authContext.employeeId,
    name: authContext.employeeName,
    status: authContext.employeeStatus,
    department_id: authContext.departmentId,
    department_name: authContext.departmentName,
    post_id: authContext.postId,
    post_name: authContext.postName,
    avatar: authContext.avatar,
  };
}

function serializeEmployeeRecord(employee: AdminAuthEmployeeRecord) {
  return {
    id: employee.id,
    name: employee.name,
    phone: employee.phone,
    status: employee.status,
    department_id: employee.department_id,
    department_name: getRelationName(employee.department),
    post_id: employee.post_id,
    post_name: getRelationName(employee.post),
    avatar: employee.avatar,
  };
}

class AdminAuthService {
  private async getSingleActiveEmployeeByPhone(phone: string) {
    const employees = await adminAuthRepository.findEmployeeByPhone(phone);

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

    return employee;
  }

  async sendCode(input: {
    phone: string;
    requestIp?: string | null;
  }) {
    await this.getSingleActiveEmployeeByPhone(input.phone);

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
      await sendSmsCode(input.phone, code, ADMIN_LOGIN_SCENE);
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

  async login(input: {
    phone: string;
    code: string;
  }) {
    const employee = await this.getSingleActiveEmployeeByPhone(input.phone);
    const verificationCode = await adminAuthRepository.findValidVerificationCode({
      phone: input.phone,
      scene: ADMIN_LOGIN_SCENE,
      code: input.code,
      now: new Date().toISOString(),
    });

    if (!verificationCode) {
      throw Errors.business(
        400,
        "验证码错误或已过期",
        ErrorCodes.ADMIN_AUTH_CODE_INVALID,
      );
    }

    let authUserId = employee.user_id;
    if (!authUserId) {
      authUserId = await adminAuthRepository.createAdminAuthUser({
        employeeId: employee.id,
        phone: input.phone,
        name: employee.name,
      });
      await adminAuthRepository.bindEmployeeAuthUser({
        employeeId: employee.id,
        authUserId,
      });
      authorizationService.invalidateAuthContext({
        authUserId,
        employeeId: employee.id,
      });
    }

    await adminAuthRepository.markVerificationCodeVerified(verificationCode.id);

    const authContext = await authorizationService.getAuthContextByAuthUserId(
      authUserId,
    );
    const token = signToken({
      sub: authUserId,
      login_channel: "admin_web",
      roles: ["employee"],
    });

    return {
      token,
      user_id: authUserId,
      login_channel: "admin_web",
      employee: serializeEmployeeRecord(employee),
      roles: authContext.roleCodes,
      permissions: authContext.permissions,
      expires_at: getJwtExpiresAt(),
    };
  }

  async me(authUserId?: string | null) {
    if (!authUserId) {
      throw Errors.unauthorized("缺少登录凭证");
    }

    const authContext = await authorizationService.getAuthContextByAuthUserId(
      authUserId,
    );

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
      roles: authContext.roleCodes,
      permissions: authContext.permissions,
    };
  }
}

export const adminAuthService = new AdminAuthService();
