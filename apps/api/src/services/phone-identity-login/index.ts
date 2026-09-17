import type { FastifyRequest } from "fastify";
import { isEmployeeOperableStatus } from "@gooes/domain";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { primeWechatIdentityCheckCacheFromToken } from "@/plugins/auth";
import { phoneIdentityCandidateRepository } from "@/repositories/phone-identity-candidates";
import { phoneIdentityLoginRepository } from "@/repositories/phone-identity-login";
import { platformPartnerPortalRepository } from "@/repositories/platform-partner-portal";
import { platformPartnerPortalService } from "@/services/platform-partner-portal";
import { authorizationService } from "@/services/authorization";
import { smsVerificationCodeService } from "@/services/sms-verification-codes";
import { tenantShareLinkService } from "@/services/tenant-share-links";
import { userIdentityService } from "@/services/user-identities";
import { wechatAuthIdentityService } from "@/services/wechat-auth-identities";
import { wechatCustomerIdentityService } from "@/services/wechat-customer-identities";
import { wechatEmployeeIdentityService } from "@/services/wechat-employee-identities";
import {
  buildEmployeeLoginContextByEmployeeId,
  buildEmployeeLoginResponse,
  runAuthBackgroundTask,
  serializeBackgroundError,
  serializeEmployeeFromAuthContext,
  serializeTenantFromAuthContext,
  signWechatAuthToken,
} from "@/services/wechat-auth-legacy/common";
import {
  bindCustomerToAuthUser,
} from "@/services/wechat-auth-legacy/customer";
import {
  assertCustomerTenantAvailable,
  normalizeTenantRelation,
  signCustomerSession,
} from "@/services/wechat-auth-legacy/identity";
import {
  bindSelectedEmployeeRole,
  findOpenIdByAuthUserId,
  getUserRoles,
} from "@/services/wechat-auth-legacy/employee";
import { PhoneIdentityBindings } from "./bindings";
import { PhoneIdentityLoginService, type RequestLike } from "./service";
import { signAdminToken } from "@/utils/jwt";

export { PhoneIdentityLoginService } from "./service";
export type { PhoneIdentityLoginServiceDependencies } from "./service";

const customerAuthContext = {
  normalizeTenantRelation,
  assertCustomerTenantAvailable,
  findOpenIdByAuthUserId,
  getUserRoles,
  signWechatAuthToken,
  runAuthBackgroundTask,
  serializeBackgroundError,
  bindCustomerToAuthUser,
};

const employeeAuthContext = {
  findOpenIdByAuthUserId,
  buildEmployeeLoginContextByEmployeeId,
  buildEmployeeLoginResponse,
  serializeTenantFromAuthContext,
  serializeEmployeeFromAuthContext,
  signWechatAuthToken,
  runAuthBackgroundTask,
  serializeBackgroundError,
};

const phoneIdentityBindings = new PhoneIdentityBindings({
  findCustomer: ({ tenantId, customerId }) =>
    wechatCustomerIdentityService.getCustomerTenantOptionById(
      customerId,
      tenantId,
    ),
  bindCustomer: (input) =>
    bindCustomerToAuthUser.call(
      customerAuthContext,
      input.request ?? null,
      input.authUserId,
      input.customer,
      { openid: input.openid },
    ),
  signCustomerAuth: async (input) => {
    const auth = await signCustomerSession.call(customerAuthContext, {
      authUserId: input.authUserId,
      openid: input.openid,
      customer: input.customer,
      request: input.request ?? undefined,
      verifiedPhone: input.customer.phone,
    });
    return { ...auth, authMode: "customer" };
  },
  findEmployee: ({ employeeId }) =>
    wechatEmployeeIdentityService.getEmployeeLoginCandidateById(employeeId),
  bindEmployee: async (input) => {
    if (!input.request) {
      throw Errors.unauthorized("请先建立有效的小程序微信会话");
    }
    return bindSelectedEmployeeRole.call(
      employeeAuthContext,
      input.request,
      input.authUserId,
      input.employee.phone ?? "",
      input.openid,
      input.employee,
    );
  },
  signEmployeeAuth: async (input) => {
    const auth = await buildEmployeeLoginContextByEmployeeId.call(
      employeeAuthContext,
      {
        authUserId: input.authUserId,
        employeeId: input.employee.id,
        openid: input.openid,
        roles: ["employee"],
      },
    );
    if (!auth) {
      throw Errors.business(409, "所选身份不可用，请重新验证手机号", "IDENTITY_OPTION_UNAVAILABLE");
    }
    return {
      mode: "tenant_employee",
      authMode: "tenant_employee",
      user_id: input.authUserId,
      roles: ["employee"],
      is_new_user: false,
      customer: null,
      ...auth,
    };
  },
  findPlatformAdmin: async ({ employeeId }) => {
    const employee = await wechatEmployeeIdentityService
      .getEmployeeLoginCandidateById(employeeId);
    if (!employee) return null;

    const authContext = await authorizationService.getAuthContextByEmployeeId(
      employeeId,
    );
    if (
      authContext.employeeId !== employeeId ||
      authContext.tenantId !== null ||
      !authContext.isPlatformSuperAdmin ||
      !authContext.roleCodes.includes("platform_admin")
    ) {
      return null;
    }

    return {
      ...employee,
      roleCodes: authContext.roleCodes,
      adminAuthVersion: authContext.adminAuthVersion ?? 1,
    };
  },
  bindPlatformAdmin: async (input) => {
    if (!input.openid) {
      throw Errors.unauthorized("请先建立有效的小程序微信会话");
    }

    const targetAuthUserId = input.employee.user_id ?? input.authUserId;
    const existingWechatIdentity = await userIdentityService
      .findActiveOauthIdentityByUserId({
        userId: targetAuthUserId,
        platform: "wechat_mini",
      });
    if (
      existingWechatIdentity &&
      existingWechatIdentity.openid !== input.openid
    ) {
      throw Errors.business(
        409,
        "所选身份不可用，请重新验证手机号",
        ErrorCodes.IDENTITY_OPTION_UNAVAILABLE,
      );
    }

    await userIdentityService.syncOauthIdentity({
      userId: targetAuthUserId,
      platform: "wechat_mini",
      openid: input.openid,
      unionid: input.unionid ?? null,
    });

    if (!input.employee.user_id) {
      await wechatEmployeeIdentityService.bindEmployeeAuthUser({
        employeeId: input.employee.id,
        authUserId: targetAuthUserId,
        errorMessage: "绑定平台管理员身份失败",
      });
    }

    authorizationService.invalidateAuthContext({
      authUserId: input.authUserId,
      employeeId: input.employee.id,
    });
    if (targetAuthUserId !== input.authUserId) {
      authorizationService.invalidateAuthContext({
        authUserId: targetAuthUserId,
        employeeId: input.employee.id,
      });
    }

    return { ...input.employee, user_id: targetAuthUserId };
  },
  signPlatformAdminAuth: async (input) => {
    if (!input.openid) {
      throw Errors.unauthorized("请先建立有效的小程序微信会话");
    }

    const authContext = await authorizationService.getAuthContextByEmployeeId(
      input.employee.id,
    );
    if (
      authContext.authUserId !== input.authUserId ||
      authContext.employeeId !== input.employee.id ||
      authContext.tenantId !== null ||
      !isEmployeeOperableStatus(authContext.employeeStatus) ||
      !authContext.isPlatformSuperAdmin ||
      !authContext.roleCodes.includes("platform_admin")
    ) {
      throw Errors.business(
        409,
        "所选身份不可用，请重新验证手机号",
        ErrorCodes.IDENTITY_OPTION_UNAVAILABLE,
      );
    }

    const adminAuthVersion = authContext.adminAuthVersion ??
      input.employee.adminAuthVersion;
    const token = signAdminToken({
      sub: input.authUserId,
      openid: input.openid,
      unionid: input.unionid ?? null,
      login_channel: "wechat",
      roles: ["platform_admin"],
      tenant_id: null,
      employee_id: input.employee.id,
      admin_auth_version: adminAuthVersion,
    }, { platform: true });
    primeWechatIdentityCheckCacheFromToken(token);

    return {
      mode: "platform_admin",
      authMode: "platform_admin",
      token,
      user_id: input.authUserId,
      roles: ["platform_admin"],
      is_new_user: false,
      tenant: null,
      employee: serializeEmployeeFromAuthContext(authContext),
      customer: null,
      partner: null,
      is_platform_staff: true,
      is_platform_super_admin: true,
    };
  },
  findPartnerMember: ({ partnerMemberId }) =>
    platformPartnerPortalRepository.findMemberById(partnerMemberId),
  bindPartnerMember: (input) =>
    platformPartnerPortalRepository.bindMemberAuthUser(
      input.member.id,
      input.authUserId,
    ),
  signPartnerAuth: (input) =>
    platformPartnerPortalService.authenticateSelectedMember({
      memberId: input.member.id,
      phone: input.member.phone ?? "",
      userId: input.authUserId,
      openid: input.openid ?? "",
      unionid: input.unionid ?? null,
    }),
});

export const phoneIdentityLoginService = new PhoneIdentityLoginService({
  smsService: smsVerificationCodeService,
  sessionRepository: phoneIdentityLoginRepository,
  candidateRepository: phoneIdentityCandidateRepository,
  tenantShareLinks: tenantShareLinkService,
  bindings: phoneIdentityBindings,
  resolveAuthUserId: resolveWechatAuthUserId,
});

async function resolveWechatAuthUserId(request: RequestLike) {
  if (request.user?.sub) return request.user.sub;
  if (request.user?.token_type !== "visitor_session" || !request.user.openid) {
    throw Errors.unauthorized("请先建立有效的小程序微信会话");
  }

  const openid = request.user.openid;
  const unionid = request.user.unionid ?? null;
  const activeIdentity = await userIdentityService.findActiveOauthIdentity({
    platform: "wechat_mini",
    openid,
  });
  if (activeIdentity) {
    if (unionid && unionid !== activeIdentity.unionid) {
      void userIdentityService.syncOauthIdentityBestEffort({
        userId: activeIdentity.user_id,
        platform: "wechat_mini",
        openid,
        unionid,
        source: "phone_identity_login_oauth_unionid_sync",
      });
    }
    request.log?.info(
      { requestId: request.id, userId: activeIdentity.user_id },
      "[auth] phone identity auth user resolved",
    );
    return activeIdentity.user_id;
  }

  const { data, error } = await wechatAuthIdentityService.createWechatAuthUser({
    openid,
    unionid,
    uniqueEmail: true,
  });
  if (error) {
    throw Errors.dbError("创建微信用户失败", error);
  }
  if (!data.user) {
    throw Errors.dbError("创建微信用户失败");
  }

  await userIdentityService.syncOauthIdentityBestEffort({
    userId: data.user.id,
    platform: "wechat_mini",
    openid,
    unionid,
    source: "phone_identity_login_create_auth_user",
  });
  request.log?.info(
    { requestId: request.id, userId: data.user.id },
    "[auth] phone identity auth user created",
  );
  return data.user.id;
}
