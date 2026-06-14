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

export async function sendCode(this: any, request: FastifyRequest, reply: FastifyReply) {
  const bodyResult = SendCodeSchema.safeParse(request.body);
  if (!bodyResult.success) {
    throw Errors.fromZod(bodyResult.error);
  }

  const { phone, scene } = bodyResult.data;
  await smsVerificationCodeService.sendCode({
    phone,
    scene,
    requestIp: request.ip || null,
  });

  request.log.info(
    { requestId: request.id, hasPhone: Boolean(phone), scene },
    "[auth] sms verification code generated",
  );

  return ResponseHandler.success(null, "验证码已发送");
}

export async function verifyRole(this: any, request: FastifyRequest, reply: FastifyReply) {
  const startedAt = Date.now();
  const bodyResult = VerifyRoleSchema.safeParse(request.body);
  if (!bodyResult.success) {
    throw Errors.fromZod(bodyResult.error);
  }
  const authUserId = await this.getAuthUserIdForRoleVerification(request);
  const requestOpenid = request.user?.openid ?? null;

  const { phone, code } = bodyResult.data;
  const target_role: AuthTargetRole = bodyResult.data.target_role;
  const scene: SmsScene = target_role === "customer"
    ? "bind_customer"
    : "bind_employee";

  const skipCodeVerification = isPhoneLoginWithoutCodeEnabled();
  const normalizedCode = code?.trim() || "";
  let verificationRecord: Awaited<
    ReturnType<typeof smsVerificationCodeService.findValidPending>
  > | null = null;

  request.log.info(
    { requestId: request.id, targetRole: target_role, scene },
    "[auth] verify role start",
  );

  if (!skipCodeVerification) {
    if (!normalizedCode) {
      throw Errors.badRequest("请输入验证码");
    }

    const verifySmsStartedAt = Date.now();
    verificationRecord = await smsVerificationCodeService.findValidPending({
      phone,
      scene,
      code: normalizedCode,
    });
    request.log.info(
      {
        requestId: request.id,
        targetRole: target_role,
        durationMs: Date.now() - verifySmsStartedAt,
        found: Boolean(verificationRecord),
      },
      "[auth] verify role sms checked",
    );
    if (!verificationRecord) {
      throw Errors.badRequest("验证码错误或已过期");
    }
  } else {
    request.log.info(
      { requestId: request.id, targetRole: target_role },
      "[auth] verify role sms skipped",
    );
  }

  if (target_role === "employee") {
    const bindStartedAt = Date.now();
    this.clearVisitorOnlyAuthUserCache(authUserId);
    const employeeAuthUserId = await this.bindEmployeeRole(
      request,
      authUserId,
      phone,
      requestOpenid,
    );
    this.clearVisitorOnlyAuthUserCache(employeeAuthUserId);
    request.log.info(
      {
        requestId: request.id,
        durationMs: Date.now() - bindStartedAt,
        fromAuthUserId: authUserId,
        toAuthUserId: employeeAuthUserId,
      },
      "[auth] verify role employee bound",
    );

    authorizationService.invalidateAuthContext({
      authUserId,
    });
    if (employeeAuthUserId !== authUserId) {
      authorizationService.invalidateAuthContext({
        authUserId: employeeAuthUserId,
      });
    }

    if (verificationRecord) {
      const markVerifiedStartedAt = Date.now();
      await smsVerificationCodeService.markVerified(verificationRecord.id);
      request.log.info(
        {
          requestId: request.id,
          durationMs: Date.now() - markVerifiedStartedAt,
        },
        "[auth] verify role sms marked verified",
      );
    }

    const openid = requestOpenid ?? await this.getOpenIdByAuthUserId(employeeAuthUserId);
    const rolesStartedAt = Date.now();
    const roles = this.buildEmployeeLoginRoles(request.user?.roles);
    request.log.info(
      {
        requestId: request.id,
        durationMs: Date.now() - rolesStartedAt,
        roles,
      },
      "[auth] verify role roles resolved",
    );
    const contextStartedAt = Date.now();
    const employeeLogin = await this.buildEmployeeLoginContext(
      employeeAuthUserId,
      openid,
      roles,
    );
    request.log.info(
      {
        requestId: request.id,
        durationMs: Date.now() - contextStartedAt,
        hasEmployeeLogin: Boolean(employeeLogin),
      },
      "[auth] verify role employee context resolved",
    );
    if (!employeeLogin) {
      throw Errors.badRequest("该手机号未绑定员工身份");
    }

    this.prewarmEmployeeAuthContext(request, employeeAuthUserId, employeeLogin);
    request.log.info(
      {
        requestId: request.id,
        targetRole: target_role,
        totalMs: Date.now() - startedAt,
      },
      "[auth] verify role employee completed",
    );
    return ResponseHandler.success({
      mode: "employee",
      token: employeeLogin.token,
      user_id: employeeAuthUserId,
      roles,
      is_new_user: false,
      tenant: employeeLogin.tenant,
      employee: employeeLogin.employee,
    }, "身份验证成功");
  }

  const customerStartedAt = Date.now();
  this.clearVisitorOnlyAuthUserCache(authUserId);
  const customerLogin = await this.resolveCustomerLoginState(
    request,
    authUserId,
    phone,
    requestOpenid,
    bodyResult.data.share_token ?? null,
  );
  request.log.info(
    {
      requestId: request.id,
      durationMs: Date.now() - customerStartedAt,
      mode: customerLogin.mode,
    },
    "[auth] verify role customer state resolved",
  );

  if (verificationRecord) {
    const markVerifiedStartedAt = Date.now();
    await smsVerificationCodeService.markVerified(verificationRecord.id);
    request.log.info(
      {
        requestId: request.id,
        durationMs: Date.now() - markVerifiedStartedAt,
      },
      "[auth] verify role sms marked verified",
    );
  }

  request.log.info(
    {
      requestId: request.id,
      targetRole: target_role,
      totalMs: Date.now() - startedAt,
    },
    "[auth] verify role customer completed",
  );
  return ResponseHandler.success(customerLogin, "身份验证成功");
}

export async function selectCustomerTenant(this: any, request: FastifyRequest, reply: FastifyReply) {
  if (!request.user?.sub) {
    throw Errors.unauthorized();
  }

  const bodyResult = CustomerTenantSelectBodySchema.safeParse(request.body || {});
  if (!bodyResult.success) {
    throw Errors.fromZod(bodyResult.error);
  }

  const data = await this.selectCustomerTenantForAuthUser({
    authUserId: request.user.sub,
    openid: request.user.openid ?? null,
    verifiedPhone: request.user.verified_phone ?? null,
    tenantId: bodyResult.data.tenant_id,
    customerId: bodyResult.data.customer_id,
  });

  return ResponseHandler.success(data, "客户租户已选择");
}

export async function unbindCustomerWechat(this: any, request: FastifyRequest, reply: FastifyReply) {
  const data = await wechatRebindRequestService.unbindCustomer(request.user || {});
  return ResponseHandler.success(data, "微信绑定已解除");
}

export async function unbindEmployeeWechat(this: any, request: FastifyRequest, reply: FastifyReply) {
  const data = await wechatRebindRequestService.unbindEmployee(request.user || {});
  return ResponseHandler.success(data, "微信绑定已解除");
}

export async function createWechatRebindRequest(this: any, request: FastifyRequest, reply: FastifyReply) {
  const bodyResult = WechatRebindRequestSchema.safeParse(request.body || {});
  if (!bodyResult.success) {
    throw Errors.fromZod(bodyResult.error);
  }

  const authUserId = await this.getAuthUserIdForRoleVerification(request);
  const data = await wechatRebindRequestService.create(authUserId, bodyResult.data);
  return ResponseHandler.success(data, "换绑申请已提交，请等待工作人员审核");
}

export async function listWechatRebindRequests(this: any, request: FastifyRequest, reply: FastifyReply) {
  const authContext = await this.getRequiredAuthContext(request);

  const queryResult = WechatRebindRequestListQuerySchema.safeParse(request.query || {});
  if (!queryResult.success) {
    throw Errors.fromZod(queryResult.error);
  }

  const data = await wechatRebindRequestService.list(authContext, queryResult.data);
  return ResponseHandler.success(data);
}

export async function approveWechatRebindRequest(this: any, request: FastifyRequest, reply: FastifyReply) {
  const authContext = await this.getRequiredAuthContext(request);

  const paramsResult = WechatRebindRequestParamsSchema.safeParse(request.params);
  if (!paramsResult.success) {
    throw Errors.fromZod(paramsResult.error);
  }

  const bodyResult = ReviewWechatRebindRequestSchema.safeParse(request.body || {});
  if (!bodyResult.success) {
    throw Errors.fromZod(bodyResult.error);
  }

  const data = await wechatRebindRequestService.approve(
    authContext,
    paramsResult.data.id,
    bodyResult.data,
  );
  return ResponseHandler.success(data, "微信换绑申请已通过");
}

export async function rejectWechatRebindRequest(this: any, request: FastifyRequest, reply: FastifyReply) {
  const authContext = await this.getRequiredAuthContext(request);

  const paramsResult = WechatRebindRequestParamsSchema.safeParse(request.params);
  if (!paramsResult.success) {
    throw Errors.fromZod(paramsResult.error);
  }

  const bodyResult = ReviewWechatRebindRequestSchema.safeParse(request.body || {});
  if (!bodyResult.success) {
    throw Errors.fromZod(bodyResult.error);
  }

  const data = await wechatRebindRequestService.reject(
    authContext,
    paramsResult.data.id,
    bodyResult.data,
  );
  return ResponseHandler.success(data, "微信换绑申请已拒绝");
}

export async function createH5MarketingSession(this: any, request: FastifyRequest, reply: FastifyReply) {
  if (!request.user?.sub) {
    throw Errors.unauthorized();
  }

  const bodyResult = H5MarketingSessionBodySchema.safeParse(request.body || {});
  if (!bodyResult.success) {
    throw Errors.fromZod(bodyResult.error);
  }

  const data = await marketingPageService.createH5Session({
    authUserId: request.user.sub,
    openid: request.user.openid ?? null,
    slug: bodyResult.data.slug,
    tenantSlug: bodyResult.data.tenant_slug ?? null,
    scene: bodyResult.data.scene ?? null,
  });

  return ResponseHandler.success(data, "H5 访问凭证已生成");
}
