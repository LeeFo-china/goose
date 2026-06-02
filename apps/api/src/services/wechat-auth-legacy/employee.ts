import type { FastifyReply, FastifyRequest } from "fastify";
import { createHash } from "node:crypto";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { ResponseHandler } from "@/utils/response";
import { signToken, signVisitorSessionToken, type JwtPayload } from "@/utils/jwt";
import { primeWechatIdentityCheckCacheFromToken } from "@/plugins/auth";
import {
  ReviewWechatRebindRequestSchema,
  SendCodeSchema,
  VerifyRoleSchema,
  WechatRebindRequestListQuerySchema,
  WechatRebindRequestParamsSchema,
  WechatRebindRequestSchema,
} from "@/schema/wechat";
import { authorizationService, type AuthContext } from "@/services/authorization";
import { marketingPageService } from "@/services/marketing-pages";
import { systemSettingsService } from "@/services/system-settings";
import { tenantShareLinkService } from "@/services/tenant-share-links";
import { customerSelfServiceService } from "@/services/customer-self-service";
import { customerCoreService } from "@/services/customer-core";
import { homeDashboardService } from "@/services/home-dashboard";
import { taskCenterService } from "@/services/task-center";
import { projectSer } from "@/services/projects";
import { getDecorationQaSuggestions } from "@/services/decoration-qa";
import { userIdentityService } from "@/services/user-identities";
import { smsVerificationCodeService } from "@/services/sms-verification-codes";
import { wechatAuthIdentityService } from "@/services/wechat-auth-identities";
import { wechatAuthRoleService } from "@/services/wechat-auth-roles";
import {
  wechatCustomerIdentityService,
  type CustomerTenantOption,
} from "@/services/wechat-customer-identities";
import type { WechatLoginMembershipRow } from "@/repositories/wechat-customer-identities";
import { wechatEmployeeIdentityService } from "@/services/wechat-employee-identities";
import { wechatRebindRequestService } from "@/services/wechat-rebind-requests";
import { isPhoneLoginWithoutCodeEnabled } from "@/utils/auth/test-login";
import {
  isEmployeeOperableStatus,
  type AuthTargetRole,
  type SmsScene,
} from "@gooes/domain";
import {
  CustomerTenantSelectBodySchema,
  H5MarketingSessionBodySchema,
  VISITOR_ONLY_AUTH_USER_CACHE_TTL_MS,
  WeChatAuthBodySchema,
  type ActiveBusinessMembership,
  type WeChatSessionResponse,
  type WechatAuthResolution,
} from "./shared";

export async function bindEmployeeRole(this: any, 
  request: FastifyRequest,
  authUserId: string,
  phone: string,
  openid: string | null,
) {
  const logEmployeeBindStage = (
    stage: string,
    startedAt: number,
    extra?: Record<string, unknown>,
  ) => {
    request.log.info(
      {
        requestId: request.id,
        stage,
        durationMs: Date.now() - startedAt,
        authUserId,
        ...extra,
      },
      "[auth] bind employee stage completed",
    );
  };

  const candidatesStartedAt = Date.now();
  const employees = await wechatEmployeeIdentityService
    .listEmployeeLoginCandidatesByPhone(phone);
  logEmployeeBindStage("employee_candidates_loaded", candidatesStartedAt, {
    candidateCount: employees.length,
  });

  if (employees.length === 0) {
    throw Errors.badRequest("该手机号未绑定员工身份");
  }

  if (employees.length > 1) {
    throw Errors.badRequest("该手机号绑定了多个员工档案，请联系管理员处理");
  }

  const employee = employees[0];
  if (!employee) {
    throw Errors.badRequest("该手机号未绑定员工身份");
  }

  if (!isEmployeeOperableStatus(employee.status)) {
    throw Errors.badRequest("该员工账号已停用，无法登录");
  }

  const tenant = Array.isArray(employee.tenant)
    ? employee.tenant[0]
    : employee.tenant;
  if (!tenant?.id || tenant.status !== "active") {
    throw Errors.badRequest("该员工未绑定可用装修公司，无法登录");
  }
  request.log.info(
    {
      requestId: request.id,
      stage: "employee_candidate_validated",
      authUserId,
      employeeId: employee.id,
      employeeStatus: employee.status,
      tenantId: tenant.id,
      tenantStatus: tenant.status,
    },
    "[auth] bind employee stage completed",
  );

  const membershipStartedAt = Date.now();
  const hasActiveMembership = await userIdentityService.hasActiveBusinessMembership({
    userId: authUserId,
    tenantId: tenant.id,
    identityType: "employee",
    identityId: employee.id,
  });
  logEmployeeBindStage("active_membership_checked", membershipStartedAt, {
    employeeId: employee.id,
    tenantId: tenant.id,
    hasActiveMembership,
  });

  if (hasActiveMembership) {
    if (employee.user_id && employee.user_id !== authUserId) {
      authorizationService.invalidateAuthContext({
        authUserId: employee.user_id,
        employeeId: employee.id,
      });
    }

    if (employee.user_id !== authUserId) {
      const bindAuthUserStartedAt = Date.now();
      await wechatEmployeeIdentityService.bindEmployeeAuthUser({
        employeeId: employee.id,
        authUserId,
        errorMessage: "同步员工身份绑定失败",
      });
      logEmployeeBindStage("employee_auth_user_synced", bindAuthUserStartedAt, {
        employeeId: employee.id,
        tenantId: tenant.id,
        branch: "active_membership",
      });
    }

    const syncMembershipStartedAt = Date.now();
    await userIdentityService.syncBusinessMembershipBestEffort({
      userId: authUserId,
      tenantId: tenant.id,
      identityType: "employee",
      identityId: employee.id,
      deactivateOtherSameType: true,
      source: "employee_verify_role_membership_primary",
    });
    logEmployeeBindStage("business_membership_synced", syncMembershipStartedAt, {
      employeeId: employee.id,
      tenantId: tenant.id,
      branch: "active_membership",
    });
    wechatCustomerIdentityService.invalidateWechatLoginState({
      authUserId,
      openid,
    });
    authorizationService.invalidateAuthContext({ authUserId, employeeId: employee.id });
    return authUserId;
  }

  if (employee.user_id && employee.user_id !== authUserId) {
    const targetMembershipPromise = userIdentityService.hasActiveBusinessMembership({
      userId: employee.user_id,
      tenantId: tenant.id,
      identityType: "employee",
      identityId: employee.id,
    });
    const existingOpenidStartedAt = Date.now();
    const existingOpenid = await this.findOpenIdByAuthUserId(employee.user_id);
    logEmployeeBindStage("existing_employee_openid_checked", existingOpenidStartedAt, {
      employeeId: employee.id,
      tenantId: tenant.id,
      existingAuthUserId: employee.user_id,
      hasExistingOpenid: Boolean(existingOpenid),
    });
    if (existingOpenid) {
      const rebindGuardStartedAt = Date.now();
      await wechatRebindRequestService.assertEmployeeCanBind(authUserId, employee);
      logEmployeeBindStage("employee_rebind_guard_checked", rebindGuardStartedAt, {
        employeeId: employee.id,
        tenantId: tenant.id,
        existingAuthUserId: employee.user_id,
        branch: "existing_employee_auth_user",
      });
    }

    if (!openid) {
      throw Errors.badRequest("当前账号未绑定微信身份");
    }

    const syncOauthStartedAt = Date.now();
    await userIdentityService.syncOauthIdentityBestEffort({
      userId: employee.user_id,
      platform: "wechat_mini",
      openid,
      source: "employee_verify_role_bind_existing_auth_user",
    });
    logEmployeeBindStage("oauth_identity_synced", syncOauthStartedAt, {
      employeeId: employee.id,
      tenantId: tenant.id,
      existingAuthUserId: employee.user_id,
    });
    const targetMembershipStartedAt = Date.now();
    const hasTargetActiveMembership = await targetMembershipPromise;
    logEmployeeBindStage("target_active_membership_checked", targetMembershipStartedAt, {
      employeeId: employee.id,
      tenantId: tenant.id,
      existingAuthUserId: employee.user_id,
      hasActiveMembership: hasTargetActiveMembership,
    });
    if (hasTargetActiveMembership) {
      authorizationService.invalidateAuthContext({
        authUserId: employee.user_id,
        employeeId: employee.id,
      });
      wechatCustomerIdentityService.invalidateWechatLoginState({
        authUserId: employee.user_id,
        openid,
      });
      return employee.user_id;
    }

    const syncMembershipStartedAt = Date.now();
    await userIdentityService.syncBusinessMembershipBestEffort({
      userId: employee.user_id,
      tenantId: tenant.id,
      identityType: "employee",
      identityId: employee.id,
      deactivateOtherSameType: true,
      source: "employee_verify_role_bind_existing_auth_user",
    });
    logEmployeeBindStage("business_membership_synced", syncMembershipStartedAt, {
      employeeId: employee.id,
      tenantId: tenant.id,
      existingAuthUserId: employee.user_id,
      branch: "existing_employee_auth_user",
    });
    wechatCustomerIdentityService.invalidateWechatLoginState({
      authUserId: employee.user_id,
      openid,
    });
    return employee.user_id;
  }

  const rebindGuardStartedAt = Date.now();
  await wechatRebindRequestService.assertEmployeeCanBind(authUserId, employee);
  logEmployeeBindStage("employee_rebind_guard_checked", rebindGuardStartedAt, {
    employeeId: employee.id,
    tenantId: tenant.id,
    branch: "new_employee_auth_user",
  });

  const clearBindingsStartedAt = Date.now();
  await wechatEmployeeIdentityService.clearOtherEmployeeBindings({
    authUserId,
    exceptEmployeeId: employee.id,
  });
  logEmployeeBindStage("other_employee_bindings_cleared", clearBindingsStartedAt, {
    employeeId: employee.id,
    tenantId: tenant.id,
  });

  const bindAuthUserStartedAt = Date.now();
  await wechatEmployeeIdentityService.bindEmployeeAuthUser({
    employeeId: employee.id,
    authUserId,
    errorMessage: "绑定员工身份失败",
  });
  logEmployeeBindStage("employee_auth_user_bound", bindAuthUserStartedAt, {
    employeeId: employee.id,
    tenantId: tenant.id,
  });

  const syncMembershipStartedAt = Date.now();
  await userIdentityService.syncBusinessMembershipBestEffort({
    userId: authUserId,
    tenantId: tenant.id,
    identityType: "employee",
    identityId: employee.id,
    deactivateOtherSameType: true,
    source: "employee_verify_role_bind",
  });
  logEmployeeBindStage("business_membership_synced", syncMembershipStartedAt, {
    employeeId: employee.id,
    tenantId: tenant.id,
    branch: "new_employee_auth_user",
  });
  wechatCustomerIdentityService.invalidateWechatLoginState({
    authUserId,
    openid,
  });

  return authUserId;
}

export async function findOpenIdByAuthUserId(this: any, authUserId: string) {
  const identity = await userIdentityService.findActiveOauthIdentityByUserId({
    userId: authUserId,
    platform: "wechat_mini",
  });
  return identity?.openid ?? null;
}

export async function getOpenIdByAuthUserId(this: any, authUserId: string) {
  const openid = await this.findOpenIdByAuthUserId(authUserId);
  if (!openid) {
    throw Errors.badRequest("当前账号未绑定微信身份");
  }
  return openid;
}

export async function getUserRoles(this: any, 
  userId: string,
  memberships?: Parameters<typeof wechatAuthRoleService.getUserRoles>[0]["memberships"],
) {
  return wechatAuthRoleService.getUserRoles({
    userId,
    memberships,
  });
}

export async function verifyServer(this: any, request: FastifyRequest, reply: FastifyReply) {
  const { echostr } = request.query as { echostr?: string };
  return reply.send(echostr);
}

export async function getAccessToken(this: any, ) {
  return {};
}

export async function getJsConfig(this: any, request: FastifyRequest, reply: FastifyReply) {
  return reply.send({ message: "Implementation pending" });
}
