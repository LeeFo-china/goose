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

export async function getOpenId(this: any, request: FastifyRequest, reply: FastifyReply) {
  const startedAt = Date.now();
  const bodyResult = WeChatAuthBodySchema.safeParse(request.body);
  if (!bodyResult.success) {
    throw Errors.fromZod(bodyResult.error);
  }

  request.log.info({ requestId: request.id }, "[auth] receive code");
  this.prewarmVisitorHomeData(request);

  request.log.info({ requestId: request.id }, "[auth] call wechat jscode2session start");
  const wechatStartedAt = Date.now();
  const wxData = await this.getWeChatSession(bodyResult.data.code);
  request.log.info(
    {
      requestId: request.id,
      durationMs: Date.now() - wechatStartedAt,
      hasOpenid: Boolean(wxData.openid),
      hasUnionid: Boolean(wxData.unionid),
    },
    "[auth] call wechat jscode2session result",
  );

  if (!wxData.openid) {
    throw Errors.badRequest("微信登录失败，未获取到 openid");
  }

  request.log.info({ requestId: request.id, openid: wxData.openid }, "[auth] parsed openid");

  const resolveIdentityStartedAt = Date.now();
  const loginStateStartedAt = Date.now();
  const resolvedLoginState = await wechatCustomerIdentityService
    .resolveWechatLoginStateByOpenid(wxData.openid);
  request.log.info(
    {
      requestId: request.id,
      openid: wxData.openid,
      durationMs: Date.now() - loginStateStartedAt,
      found: Boolean(resolvedLoginState),
    },
    "[auth] resolved login state by openid",
  );

  let userId: string;
  let isNewUser = false;
  let loginMembershipState: Awaited<
    ReturnType<typeof wechatCustomerIdentityService.resolveWechatLoginMembershipState>
  >;

  if (resolvedLoginState) {
    userId = resolvedLoginState.authUserId;
    loginMembershipState = resolvedLoginState;
    if (wxData.unionid && wxData.unionid !== resolvedLoginState.oauthUnionid) {
      this.runAuthBackgroundTask(request, "sync_oauth_identity", () =>
        userIdentityService.syncOauthIdentityBestEffort({
          userId,
          platform: "wechat_mini",
          openid: wxData.openid!,
          unionid: wxData.unionid,
          source: "wechat_auth_login_state_primary",
        })
      );
    }
  } else {
    const authResolution = await this.getOrCreateAuthUser(
      request,
      wxData.openid,
      wxData.unionid,
    );
    if (authResolution.kind === "visitor_session") {
      request.log.info(
        {
          requestId: request.id,
          visitorId: authResolution.visitorId,
          durationMs: Date.now() - resolveIdentityStartedAt,
        },
        "[auth] resolved visitor session",
      );
      request.log.info(
        {
          requestId: request.id,
          visitorId: authResolution.visitorId,
          totalMs: Date.now() - startedAt,
        },
        "[auth] resolved visitor login context",
      );
      return ResponseHandler.success(
        this.createVisitorSessionResponse({
          openid: wxData.openid,
          unionid: wxData.unionid ?? null,
          visitorId: authResolution.visitorId,
          isNewUser: authResolution.isNewUser,
        }),
        "登录成功",
      );
    }

    userId = authResolution.userId;
    isNewUser = authResolution.isNewUser;
    const loginMembershipStartedAt = Date.now();
    loginMembershipState = await wechatCustomerIdentityService
      .resolveWechatLoginMembershipState(userId);
    request.log.info(
      {
        requestId: request.id,
        userId,
        durationMs: Date.now() - loginMembershipStartedAt,
        source: "auth_user_fallback",
      },
      "[auth] resolved login memberships fallback",
    );
  }

  request.log.info(
    { requestId: request.id, userId, durationMs: Date.now() - resolveIdentityStartedAt },
    "[auth] resolved auth user",
  );

  const visitorState = {
    isVisitorOnly: loginMembershipState.memberships.length === 0,
    memberships: loginMembershipState.memberships,
  };
  if (visitorState.isVisitorOnly) {
    this.setCachedVisitorOnlyAuthUser(userId);
  } else {
    this.clearVisitorOnlyAuthUserCache(userId);
  }
  request.log.info(
    {
      requestId: request.id,
      userId,
      durationMs: Date.now() - resolveIdentityStartedAt,
      membershipCount: visitorState.memberships.length,
      customerOptionCount: loginMembershipState.customerOptions.length,
      isVisitorOnly: visitorState.isVisitorOnly,
      source: resolvedLoginState ? "login_state_by_openid" : "login_memberships",
    },
    "[auth] visitor only auth user checked",
  );
  if (visitorState.isVisitorOnly) {
    request.log.info(
      {
        requestId: request.id,
        userId,
        durationMs: Date.now() - resolveIdentityStartedAt,
        totalMs: Date.now() - startedAt,
      },
      "[auth] resolved existing visitor login context",
    );
    return ResponseHandler.success(
      this.createAuthUserVisitorResponse({
        authUserId: userId,
        openid: wxData.openid,
        unionid: wxData.unionid ?? null,
        roles: ["visitor"],
        isNewUser,
      }),
      "登录成功",
    );
  }

  const employeeMembership = visitorState.memberships?.find((item) =>
    item.identity_type === "employee"
  );
  if (employeeMembership) {
    request.log.info({ requestId: request.id, userId }, "[auth] resolve employee login by membership start");
    const employeeContextStartedAt = Date.now();
    const roles = ["employee"];
    const employeeLoginRow = loginMembershipState.employeeLoginRows.find((item) =>
      item.identity_id === employeeMembership.identity_id
    );
    const employeeLogin = employeeLoginRow
      ? await this.buildEmployeeLoginContextFromMembership({
        authUserId: userId,
        row: employeeLoginRow,
        openid: wxData.openid,
        roles,
      })
      : await this.buildEmployeeLoginContextByEmployeeId({
        authUserId: userId,
        employeeId: employeeMembership.identity_id,
        openid: wxData.openid,
        roles,
      });
    request.log.info(
      {
        requestId: request.id,
        userId,
        durationMs: Date.now() - employeeContextStartedAt,
        hasEmployeeLogin: Boolean(employeeLogin),
        source: employeeLoginRow ? "login_membership_row" : "membership",
      },
      "[auth] resolved employee login context result",
    );

    if (employeeLogin) {
      this.prewarmEmployeeAuthContext(request, userId, employeeLogin);

      request.log.info(
        { requestId: request.id, userId, totalMs: Date.now() - startedAt },
        "[auth] resolved employee login context",
      );
      return ResponseHandler.success({
        mode: "employee",
        token: employeeLogin.token,
        user_id: userId,
        roles,
        is_new_user: isNewUser,
        tenant: employeeLogin.tenant,
        employee: employeeLogin.employee,
      }, "登录成功");
    }
  }

  const canResolveCustomerOnlyRolesFromMembership = Boolean(
    visitorState.memberships?.some((item) => item.identity_type === "customer") &&
      visitorState.memberships.every((item) => item.identity_type !== "employee")
  );
  let roles = ["customer"];
  let rolesResolvedFromMembership = true;
  if (!canResolveCustomerOnlyRolesFromMembership) {
    rolesResolvedFromMembership = false;
    const rolesStartedAt = Date.now();
    roles = await this.getUserRoles(userId, visitorState.memberships ?? undefined);
    request.log.info(
      { requestId: request.id, userId, durationMs: Date.now() - rolesStartedAt, roles },
      "[auth] resolved user roles",
    );
  } else {
    request.log.info(
      { requestId: request.id, userId, durationMs: 0, roles, source: "membership_customer_only" },
      "[auth] resolved user roles",
    );
  }
  request.log.info({ requestId: request.id, userId, roles }, "[auth] resolve login context start");
  const employeeContextStartedAt = Date.now();
  const employeeLogin = roles.includes("employee")
    ? await this.buildEmployeeLoginContext(userId, wxData.openid, roles)
    : null;
  request.log.info(
    {
      requestId: request.id,
      userId,
      durationMs: Date.now() - employeeContextStartedAt,
      hasEmployeeLogin: Boolean(employeeLogin),
    },
    "[auth] resolved employee login context result",
  );

  if (employeeLogin) {
    this.prewarmEmployeeAuthContext(request, userId, employeeLogin);
    request.log.info(
      { requestId: request.id, userId, totalMs: Date.now() - startedAt },
      "[auth] resolved employee login context",
    );
    return ResponseHandler.success({
      mode: "employee",
      token: employeeLogin.token,
      user_id: userId,
      roles,
      is_new_user: isNewUser,
      tenant: employeeLogin.tenant,
      employee: employeeLogin.employee,
    }, "登录成功");
  }

  const customerOptionsStartedAt = Date.now();
  const customerOptions = loginMembershipState.customerOptions;
  request.log.info(
    {
      requestId: request.id,
      userId,
      durationMs: Date.now() - customerOptionsStartedAt,
      count: customerOptions.length,
      source: "login_memberships",
    },
    "[auth] resolved customer tenant options",
  );
  if (customerOptions.length === 1) {
    request.log.info(
      { requestId: request.id, userId, totalMs: Date.now() - startedAt },
      "[auth] resolved customer login context",
    );
    return ResponseHandler.success(
      await this.signCustomerSession({
        authUserId: userId,
        openid: wxData.openid,
        customer: customerOptions[0]!,
        roles,
        request,
      }),
      "登录成功",
    );
  }

  if (customerOptions.length > 1) {
    const enrichedCustomerOptions = await this.listCustomerTenantOptionsByAuthUser(userId, {
      includeProjectSummary: true,
      memberships: visitorState.memberships ?? undefined,
    });
    const token = this.signWechatAuthToken({
      sub: userId,
      openid: wxData.openid,
      login_channel: "wechat",
      roles,
    });

    return ResponseHandler.success({
      mode: "select_tenant",
      token,
      user_id: userId,
      roles,
      is_new_user: isNewUser,
      tenants: enrichedCustomerOptions.map((item: CustomerTenantOption) =>
        this.serializeCustomerTenantOption(item)
      ),
    }, "登录成功");
  }

  if (rolesResolvedFromMembership) {
    const rolesStartedAt = Date.now();
    roles = await this.getUserRoles(userId, visitorState.memberships ?? undefined);
    request.log.info(
      {
        requestId: request.id,
        userId,
        durationMs: Date.now() - rolesStartedAt,
        roles,
        reason: "customer_options_empty",
      },
      "[auth] resolved user roles",
    );
  }

  request.log.info(
    { requestId: request.id, userId, totalMs: Date.now() - startedAt },
    "[auth] resolved visitor login context",
  );

  return ResponseHandler.success(
    this.createAuthUserVisitorResponse({
      authUserId: userId,
      openid: wxData.openid,
      unionid: wxData.unionid ?? null,
      roles,
      isNewUser,
    }),
    "登录成功",
  );
}
