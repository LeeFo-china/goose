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
import { getTenantServiceAuthOptions } from "@/services/tenant-service-route-access";
import { accessPolicyService } from "@/services/access-policy";
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

export function serializeTenantFromAuthContext(this: any, authContext: AuthContext) {
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

export async function getRequiredAuthContext(this: any, request: FastifyRequest) {
  return authorizationService.getRequiredAuthContext(
    request.user?.sub,
    getTenantServiceAuthOptions(request),
  );
}

export function serializeBackgroundError(this: any, error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return { message: String(error) };
}

export function runAuthBackgroundTask(this: any, 
  request: FastifyRequest,
  task: string,
  handler: () => Promise<unknown>,
) {
  const startedAt = Date.now();
  void handler()
    .then(() => {
      request.log.info(
        { requestId: request.id, task, durationMs: Date.now() - startedAt },
        "[auth] background task completed",
      );
    })
    .catch((error) => {
      request.log.warn(
        {
          requestId: request.id,
          task,
          durationMs: Date.now() - startedAt,
          error: this.serializeBackgroundError(error),
        },
        "[auth] background task failed",
      );
    });
}

export function prewarmEmployeeAuthContext(this: any, 
  request: FastifyRequest,
  authUserId: string,
  employeeLogin: { authContext: AuthContext },
) {
  const employeeId = employeeLogin.authContext.employeeId;
  if (!employeeId) {
    return;
  }

  this.runAuthBackgroundTask(request, "prewarm_employee_auth_context", () =>
    authorizationService.prewarmEmployeeAuthContext({
      authUserId,
      employeeId,
    })
  );
  this.runAuthBackgroundTask(request, "prewarm_employee_home_data", async () => {
    const authContext = await authorizationService.prewarmEmployeeAuthContext({
      authUserId,
      employeeId,
    });

    await Promise.allSettled([
      homeDashboardService.getStats(authContext),
      taskCenterService.getSummary(authContext),
      projectSer.listProjects({
        authContext,
        query: {
          page: 1,
          pageSize: 20,
          ownership: accessPolicyService.getScope(authContext, "project.read") === "self"
            ? "self"
            : "all",
          mode: "home",
          debug_timing: false,
        },
      }),
      customerCoreService.listCustomers({
        authContext,
        query: {
          page: 1,
          pageSize: 20,
          mode: "home",
        },
      }),
    ]);
  });
}

export function prewarmVisitorHomeData(this: any, request: FastifyRequest) {
  this.runAuthBackgroundTask(request, "prewarm_visitor_home_data", async () => {
    await getDecorationQaSuggestions({
      query: {
        scene: "visitor",
        refresh: false,
      },
      tenantServiceAccess: "public_or_callback",
    });
  });
}

export function buildVisitorSessionId(this: any, openid: string) {
  return `wechat_visitor_${createHash("sha256").update(openid).digest("hex").slice(0, 32)}`;
}

export function signVisitorSession(this: any, input: {
  authUserId?: string | null;
  openid: string;
  unionid?: string | null;
  visitorId: string;
  verifiedPhone?: string | null;
  shareLinkId?: string | null;
}) {
  return signVisitorSessionToken({
    sub: input.authUserId ?? undefined,
    openid: input.openid,
    visitor_id: input.visitorId,
    unionid: input.unionid ?? undefined,
    verified_phone: input.verifiedPhone ?? undefined,
    share_link_id: input.shareLinkId ?? undefined,
  });
}

export function createVisitorSessionResponse(this: any, input: {
  openid: string;
  unionid?: string | null;
  visitorId: string;
  isNewUser: boolean;
}) {
  return {
    mode: "platform_visitor",
    authMode: "platform_visitor",
    token: this.signVisitorSession(input),
    user_id: null,
    visitor_id: input.visitorId,
    roles: ["visitor"],
    is_new_user: input.isNewUser,
    tenant: null,
    employee: null,
    customer: null,
    has_customer_profile: false,
  };
}

export function clearVisitorOnlyAuthUserCache(this: any, authUserId: string) {
  this.visitorOnlyAuthUserCache.delete(authUserId);
}

export function getCachedVisitorOnlyAuthUser(this: any, authUserId: string) {
  const cached = this.visitorOnlyAuthUserCache.get(authUserId);
  if (!cached) {
    return false;
  }

  if (cached.expiresAt <= Date.now()) {
    this.visitorOnlyAuthUserCache.delete(authUserId);
    return false;
  }

  return true;
}

export function signWechatAuthToken(this: any, payload: Omit<JwtPayload, "iat" | "exp">) {
  const token = signToken(payload);
  primeWechatIdentityCheckCacheFromToken(token);
  return token;
}

export function setCachedVisitorOnlyAuthUser(this: any, authUserId: string) {
  this.visitorOnlyAuthUserCache.set(authUserId, {
    expiresAt: Date.now() + VISITOR_ONLY_AUTH_USER_CACHE_TTL_MS,
  });
}

export async function resolveMembershipVisitorState(this: any, 
  request: FastifyRequest,
  authUserId: string,
) {
  if (this.getCachedVisitorOnlyAuthUser(authUserId)) {
    request.log.info(
      { requestId: request.id, userId: authUserId, source: "memory" },
      "[auth] visitor only auth user resolved",
    );
    return {
      isVisitorOnly: true,
      memberships: [],
    };
  }

  const startedAt = Date.now();
  const memberships = await userIdentityService.listActiveBusinessMemberships({
    userId: authUserId,
  });
  const isVisitorOnly = memberships.length === 0;
  if (isVisitorOnly) {
    this.setCachedVisitorOnlyAuthUser(authUserId);
  } else {
    this.clearVisitorOnlyAuthUserCache(authUserId);
  }

  request.log.info(
    {
      requestId: request.id,
      userId: authUserId,
      durationMs: Date.now() - startedAt,
      membershipCount: memberships.length,
      isVisitorOnly,
    },
    "[auth] visitor only auth user checked",
  );

  return {
    isVisitorOnly,
    memberships,
  };
}

export function createAuthUserVisitorResponse(this: any, input: {
  authUserId: string;
  openid: string;
  unionid?: string | null;
  roles: string[];
  isNewUser: boolean;
}) {
  const visitorId = this.buildVisitorSessionId(input.openid);
  return {
    mode: "platform_visitor",
    authMode: "platform_visitor",
    token: this.signVisitorSession({
      openid: input.openid,
      unionid: input.unionid ?? null,
      visitorId,
    }),
    user_id: null,
    visitor_id: visitorId,
    roles: ["visitor"],
    is_new_user: input.isNewUser,
    tenant: null,
    employee: null,
    customer: null,
    has_customer_profile: false,
  };
}

export function serializeEmployeeFromAuthContext(this: any, authContext: AuthContext) {
  if (!authContext.employeeId) {
    return null;
  }

  return {
    id: authContext.employeeId,
    name: authContext.employeeName,
    status: authContext.employeeStatus,
    tenant_department_id: authContext.tenantDepartmentId,
    department_code: authContext.departmentCode,
    department_name: authContext.departmentName,
    post_id: authContext.postId,
    post_name: authContext.postName,
    avatar: authContext.avatar,
  };
}

export function buildEmployeeLoginRoles(this: any, existingRoles?: string[] | null) {
  const roles = new Set(
    (existingRoles || []).filter((role) => role && role !== "visitor"),
  );
  roles.add("employee");
  return Array.from(roles);
}

export function buildEmployeeLoginResponse(this: any, input: {
  authUserId: string;
  openid?: string | null;
  roles: string[];
  authContext: AuthContext;
}) {
  const { authUserId, openid, roles, authContext } = input;
  if (!authContext.employeeId) {
    return null;
  }

  if (!isEmployeeOperableStatus(authContext.employeeStatus)) {
    return null;
  }

  authorizationService.assertTenantAvailable(authContext);

  return {
    authContext,
    token: this.signWechatAuthToken({
      sub: authUserId,
      openid: openid ?? undefined,
      login_channel: "wechat",
      roles,
      tenant_id: authContext.tenantId,
      tenant_slug: authContext.tenantSlug,
      employee_id: authContext.employeeId,
    }),
    tenant: this.serializeTenantFromAuthContext(authContext),
    employee: this.serializeEmployeeFromAuthContext(authContext),
  };
}

export async function buildEmployeeLoginContext(this: any, 
  authUserId: string,
  openid?: string | null,
  roles: string[] = ["employee"],
) {
  const employeeMembership = (await userIdentityService.listActiveBusinessMemberships({
    userId: authUserId,
    identityType: "employee",
  }))[0];

  if (!employeeMembership) {
    return null;
  }

  const isBound = await authorizationService.isEmployeeBoundToAuthUser({
    authUserId,
    employeeId: employeeMembership.identity_id,
    tenantId: employeeMembership.tenant_id,
  });
  if (!isBound) {
    return null;
  }

  let authContext = await authorizationService.getEmployeeLoginContextByEmployeeId(
    employeeMembership.identity_id,
  );

  if (authContext.employeeId && !authContext.tenantId && !authContext.isPlatformAdmin) {
    authContext = await authorizationService.getAuthContextByEmployeeId(authContext.employeeId);
  }

  return this.buildEmployeeLoginResponse({
    authUserId,
    openid,
    roles,
    authContext,
  });
}

export async function buildEmployeeLoginContextByEmployeeId(this: any, input: {
  authUserId: string;
  employeeId: string;
  openid?: string | null;
  roles?: string[];
}) {
  const isBound = await authorizationService.isEmployeeBoundToAuthUser({
    authUserId: input.authUserId,
    employeeId: input.employeeId,
  });
  if (!isBound) {
    return null;
  }

  let authContext = await authorizationService.getEmployeeLoginContextByEmployeeId(
    input.employeeId,
  );

  if (authContext.employeeId && !authContext.tenantId && !authContext.isPlatformAdmin) {
    authContext = await authorizationService.getAuthContextByEmployeeId(authContext.employeeId);
  }

  return this.buildEmployeeLoginResponse({
    authUserId: input.authUserId,
    openid: input.openid,
    roles: input.roles ?? ["employee"],
    authContext,
  });
}

export async function buildEmployeeLoginContextFromMembership(this: any, input: {
  authUserId: string;
  row: WechatLoginMembershipRow;
  openid?: string | null;
  roles?: string[];
}) {
  const row = input.row;
  if (row.employee_user_id !== input.authUserId) {
    return null;
  }
  if (!row.employee_id) {
    return null;
  }

  const isBound = await authorizationService.isEmployeeBoundToAuthUser({
    authUserId: input.authUserId,
    employeeId: row.employee_id,
    tenantId: row.tenant_id,
  });
  if (!isBound) {
    return null;
  }

  const authContext: AuthContext = {
    authUserId: input.authUserId,
    employeeId: row.employee_id,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    tenantSlug: row.tenant_slug,
    tenantStatus: row.tenant_status,
    isPlatformAdmin: false,
    employeeName: row.employee_name,
    employeeStatus: row.employee_status,
    departmentId: null,
    tenantDepartmentId: row.employee_tenant_department_id,
    departmentCode: row.tenant_department_code,
    departmentName: row.tenant_department_alias_name,
    postId: row.employee_post_id,
    postName: row.post_name,
    avatar: row.employee_avatar,
    roleCodes: [],
    roles: [],
    permissions: [],
  };

  return this.buildEmployeeLoginResponse({
    authUserId: input.authUserId,
    openid: input.openid,
    roles: input.roles ?? ["employee"],
    authContext,
  });
}
