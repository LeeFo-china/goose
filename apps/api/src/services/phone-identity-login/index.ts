import type { FastifyRequest } from "fastify";
import { Errors } from "@/errors/error-factory";
import { phoneIdentityCandidateRepository } from "@/repositories/phone-identity-candidates";
import { phoneIdentityLoginRepository } from "@/repositories/phone-identity-login";
import { platformPartnerPortalRepository } from "@/repositories/platform-partner-portal";
import { platformPartnerPortalService } from "@/services/platform-partner-portal";
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
