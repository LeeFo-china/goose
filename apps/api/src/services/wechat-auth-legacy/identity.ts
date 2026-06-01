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

export async function getAuthUserIdForRoleVerification(this: any, request: FastifyRequest) {
  if (request.user?.sub) {
    return request.user.sub;
  }

  if (request.user?.token_type !== "visitor_session" || !request.user.openid) {
    throw Errors.unauthorized();
  }

  const startedAt = Date.now();
  const resolution = await this.getOrCreateAuthUser(
    request,
    request.user.openid,
    request.user.unionid ?? undefined,
    { allowVisitorSession: false },
  );

  if (resolution.kind !== "auth_user") {
    throw Errors.unauthorized();
  }

  request.log.info(
    {
      requestId: request.id,
      userId: resolution.userId,
      durationMs: Date.now() - startedAt,
    },
    "[auth] upgraded visitor session to auth user",
  );

  return resolution.userId;
}

// 这里必须保留注释：微信 code 只能短时且单次使用，接口失败原因需要在服务端集中兜底，前端才能稳定触发静默重登。
export async function getWeChatSession(this: any, code: string) {
  const appId = await systemSettingsService.getSecretString("WECHAT_APPID");
  const secret = await systemSettingsService.getSecretString("WECHAT_SECRET");

  if (!appId || !secret) {
    throw Errors.badRequest("服务器未配置微信参数");
  }

  const wxResponse = await fetch(
    `https://api.weixin.qq.com/sns/jscode2session?appid=${appId}&secret=${secret}&js_code=${code}&grant_type=authorization_code`,
  );

  if (!wxResponse.ok) {
    throw Errors.dbError("调用微信登录接口失败", { status: wxResponse.status });
  }

  const wxData = await wxResponse.json() as WeChatSessionResponse;
  if (wxData.errcode) {
    throw Errors.badRequest(`微信接口错误: ${wxData.errmsg || wxData.errcode}`);
  }

  return wxData;
}

export async function getOrCreateAuthUser(this: any, 
  request: FastifyRequest,
  openid: string,
  unionid?: string,
  options: { allowVisitorSession?: boolean } = {},
): Promise<WechatAuthResolution> {
  const allowVisitorSession = options.allowVisitorSession ?? true;
  request.log.info({ requestId: request.id, openid }, "[auth] query user by openid start");
  const activeOauthStartedAt = Date.now();
  const activeOauthIdentity = await userIdentityService.findActiveOauthIdentity({
    platform: "wechat_mini",
    openid,
  });
  request.log.info(
    {
      requestId: request.id,
      openid,
      durationMs: Date.now() - activeOauthStartedAt,
      found: Boolean(activeOauthIdentity),
    },
    "[auth] active oauth identity lookup result",
  );

  if (activeOauthIdentity) {
    request.log.info(
      {
        requestId: request.id,
        openid,
        authUserId: activeOauthIdentity.user_id,
      },
      "[auth] resolved user by active oauth identity",
    );
    if (unionid && unionid !== activeOauthIdentity.unionid) {
      this.runAuthBackgroundTask(request, "sync_oauth_identity", () =>
        userIdentityService.syncOauthIdentityBestEffort({
          userId: activeOauthIdentity.user_id,
          platform: "wechat_mini",
          openid,
          unionid,
          source: "wechat_auth_oauth_primary",
        })
      );
    }

    return {
      kind: "auth_user",
      userId: activeOauthIdentity.user_id,
      isNewUser: false,
    };
  }

  if (allowVisitorSession) {
    request.log.info(
      { requestId: request.id, openid },
      "[auth] active oauth miss visitor fast path",
    );
    return this.createWechatVisitorSession({
      request,
      openid,
      unionid: unionid || null,
      uniqueEmail: true,
      source: "wechat_auth_oauth_miss_fast_path",
      backgroundMode: "resolve_identity",
    });
  }

  return this.createWechatVisitorUser({
    request,
    openid,
    unionid: unionid || null,
    uniqueEmail: true,
    source: "wechat_auth_oauth_miss_background",
  });
}

export function createWechatVisitorSession(this: any, input: {
  request: FastifyRequest;
  openid: string;
  unionid?: string | null;
  uniqueEmail?: boolean;
  source: string;
  backgroundMode?: "create_user" | "resolve_identity";
}): WechatAuthResolution {
  const visitorId = this.buildVisitorSessionId(input.openid);
  input.request.log.info(
    {
      requestId: input.request.id,
      openid: input.openid,
      visitorId,
      source: input.source,
    },
    "[auth] create visitor session result",
  );

  const backgroundMode = input.backgroundMode ?? "create_user";
  this.runAuthBackgroundTask(input.request, backgroundMode === "resolve_identity"
    ? "resolve_visitor_auth_user"
    : "create_visitor_auth_user", () => {
    if (backgroundMode === "resolve_identity") {
      return this.getOrCreateAuthUser(
        input.request,
        input.openid,
        input.unionid ?? undefined,
        { allowVisitorSession: false },
      );
    }

    return this.createWechatVisitorUser({
      request: input.request,
      openid: input.openid,
      unionid: input.unionid ?? null,
      uniqueEmail: input.uniqueEmail,
      source: `${input.source}_background`,
    });
  });

  return {
    kind: "visitor_session",
    visitorId,
    isNewUser: true,
  };
}

export async function createWechatVisitorUser(this: any, input: {
  request: FastifyRequest;
  openid: string;
  unionid?: string | null;
  uniqueEmail?: boolean;
  source: string;
}): Promise<Extract<WechatAuthResolution, { kind: "auth_user" }>> {
  const { data, error } = await wechatAuthIdentityService.createWechatAuthUser({
    openid: input.openid,
    unionid: input.unionid || null,
    uniqueEmail: input.uniqueEmail,
  });

  if (error) {
    input.request.log.error(
      {
        requestId: input.request.id,
        openid: input.openid,
        error: { message: error.message, status: error.status, name: error.name },
      },
      "[auth] create visitor user failed",
    );
    throw Errors.dbError("创建微信用户失败", error);
  }

  if (!data.user) {
    throw Errors.dbError("创建微信用户失败");
  }

  this.runAuthBackgroundTask(input.request, "sync_oauth_identity", () =>
    userIdentityService.syncOauthIdentityBestEffort({
      userId: data.user!.id,
      platform: "wechat_mini",
      openid: input.openid,
      unionid: input.unionid || null,
      source: input.source,
    })
  );

  input.request.log.info(
    { requestId: input.request.id, openid: input.openid, userId: data.user.id },
    "[auth] create visitor user result",
  );

  return {
    kind: "auth_user",
    userId: data.user.id,
    isNewUser: true,
  };
}

export function normalizeTenantRelation(this: any, value: CustomerTenantOption["tenant"]) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export function assertCustomerTenantAvailable(this: any, customer: CustomerTenantOption) {
  const tenant = this.normalizeTenantRelation(customer.tenant);
  if (!customer.tenant_id || tenant?.status !== "active") {
    throw Errors.business(
      403,
      "装修公司服务已暂停，请联系装修公司",
      ErrorCodes.TENANT_NOT_AVAILABLE,
      {
        tenant_id: customer.tenant_id,
        tenant_status: tenant?.status ?? null,
      },
    );
  }
}

export async function listCustomerTenantOptionsByPhone(this: any, phone: string) {
  return wechatCustomerIdentityService.listCustomerTenantOptionsByPhone(phone);
}

export async function listCustomerTenantOptionsByAuthUser(this: any, 
  authUserId: string,
  options?: {
    includeProjectSummary?: boolean;
    memberships?: ActiveBusinessMembership[];
  },
) {
  if (options?.memberships) {
    return wechatCustomerIdentityService.listCustomerTenantOptionsByMemberships({
      authUserId,
      memberships: options.memberships,
      includeProjectSummary: options.includeProjectSummary,
    });
  }

  return wechatCustomerIdentityService.listCustomerTenantOptionsByAuthUser({
    authUserId,
    includeProjectSummary: options?.includeProjectSummary,
  });
}

export async function getCustomerTenantOptionById(this: any, customerId: string, tenantId: string) {
  return wechatCustomerIdentityService.getCustomerTenantOptionById(
    customerId,
    tenantId,
  );
}

export function serializeCustomerTenantOption(this: any, customer: CustomerTenantOption) {
  const tenant = this.normalizeTenantRelation(customer.tenant);
  return {
    tenant_id: customer.tenant_id,
    tenant_name: tenant?.name ?? null,
    tenant_slug: tenant?.slug ?? null,
    customer_id: customer.id,
    customer_name: customer.name ?? null,
    phone: customer.phone ?? null,
    project_count: customer.project_count ?? 0,
    latest_project_name: customer.latest_project_name ?? null,
  };
}

export async function signCustomerSession(this: any, input: {
  authUserId: string;
  openid: string | null;
  customer: CustomerTenantOption;
  roles?: string[];
  request?: FastifyRequest;
}) {
  const tenant = this.normalizeTenantRelation(input.customer.tenant);
  this.assertCustomerTenantAvailable(input.customer);
  const roles = input.roles ?? await this.getUserRoles(input.authUserId);
  const normalizedRoles = roles.includes("customer") ? roles : [...roles, "customer"];
  const token = this.signWechatAuthToken({
    sub: input.authUserId,
    openid: input.openid ?? undefined,
    roles: normalizedRoles,
    tenant_id: input.customer.tenant_id,
    tenant_slug: tenant?.slug ?? null,
    customer_id: input.customer.id,
  });
  if (input.request) {
    this.runAuthBackgroundTask(input.request, "prewarm_customer_context", () =>
      customerSelfServiceService.prewarmCustomerContext({
        authUserId: input.authUserId,
        customer: {
          ...input.customer,
          user_id: input.authUserId,
        },
      })
    );
    this.runAuthBackgroundTask(input.request, "prewarm_customer_home_projects", () =>
      customerSelfServiceService.prewarmCustomerHomeProjects({
        customerId: input.customer.id,
        tenantId: input.customer.tenant_id!,
        pageSize: 20,
      })
    );
  }

  return {
    mode: "customer",
    token,
    user_id: input.authUserId,
    roles: normalizedRoles,
    is_new_user: false,
    tenant: {
      id: input.customer.tenant_id,
      name: tenant?.name ?? null,
      slug: tenant?.slug ?? null,
    },
    customer: {
      id: input.customer.id,
      name: input.customer.name ?? null,
      phone: input.customer.phone ?? null,
    },
  };
}
