import type { FastifyReply, FastifyRequest } from "fastify";
import { createHash } from "node:crypto";
import { BaseController } from "@/controllers/BaseController";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import { z } from "zod";
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
import { userIdentityService } from "@/services/user-identities";
import { smsVerificationCodeService } from "@/services/sms-verification-codes";
import { wechatAuthIdentityService } from "@/services/wechat-auth-identities";
import { wechatAuthRoleService } from "@/services/wechat-auth-roles";
import {
  wechatCustomerIdentityService,
  type CustomerIdentityRow,
  type CustomerTenantOption,
} from "@/services/wechat-customer-identities";
import type { WechatLoginMembershipRow } from "@/repositories/wechat-customer-identities";
import { wechatEmployeeIdentityService } from "@/services/wechat-employee-identities";
import { wechatRebindRequestService } from "@/services/wechat-rebind-requests";
import { MarketingPageSlugSchema, TenantSlugSchema } from "@/schema/marketing-pages";
import { isPhoneLoginWithoutCodeEnabled } from "@/utils/auth/test-login";
import {
  isEmployeeOperableStatus,
  type AuthTargetRole,
  type SmsScene,
} from "@gooes/domain";

type WeChatSessionResponse = {
  openid?: string;
  session_key?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
};

type WechatAuthResolution =
  | {
    kind: "auth_user";
    userId: string;
    isNewUser: boolean;
  }
  | {
    kind: "visitor_session";
    visitorId: string;
    isNewUser: true;
  };

type ActiveBusinessMembership = Awaited<
  ReturnType<typeof userIdentityService.listActiveBusinessMemberships>
>[number];

const WeChatAuthBodySchema = z.object({
  code: z.string().trim().min(1, "缺少 code"),
});

const VISITOR_ONLY_AUTH_USER_CACHE_TTL_MS = 60_000;

const CustomerTenantSelectBodySchema = z.object({
  tenant_id: z.uuid("无效的租户 ID"),
  customer_id: z.uuid("无效的客户 ID"),
});

const H5MarketingSessionBodySchema = z.object({
  slug: MarketingPageSlugSchema,
  tenant_slug: TenantSlugSchema
    .nullable()
    .optional(),
  scene: z.string().trim().max(80, "场景值过长").nullable().optional(),
});

export class WeChatController extends BaseController {
  private visitorOnlyAuthUserCache = new Map<string, { expiresAt: number }>();

  constructor() {
    super("wechat");
  }

  private serializeTenantFromAuthContext(authContext: AuthContext) {
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

  private async getRequiredAuthContext(request: FastifyRequest) {
    return authorizationService.getRequiredAuthContext(request.user?.sub);
  }

  private serializeBackgroundError(error: unknown) {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
      };
    }

    return { message: String(error) };
  }

  private runAuthBackgroundTask(
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

  private prewarmEmployeeAuthContext(
    request: FastifyRequest,
    authUserId: string,
    employeeLogin: NonNullable<Awaited<ReturnType<WeChatController["buildEmployeeLoginContext"]>>>,
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
  }

  private buildVisitorSessionId(openid: string) {
    return `wechat_visitor_${createHash("sha256").update(openid).digest("hex").slice(0, 32)}`;
  }

  private signVisitorSession(input: {
    openid: string;
    unionid?: string | null;
    visitorId: string;
  }) {
    return signVisitorSessionToken({
      openid: input.openid,
      visitor_id: input.visitorId,
      unionid: input.unionid ?? undefined,
    });
  }

  private createVisitorSessionResponse(input: {
    openid: string;
    unionid?: string | null;
    visitorId: string;
    isNewUser: boolean;
  }) {
    return {
      mode: "platform_visitor",
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

  private clearVisitorOnlyAuthUserCache(authUserId: string) {
    this.visitorOnlyAuthUserCache.delete(authUserId);
  }

  private getCachedVisitorOnlyAuthUser(authUserId: string) {
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

  private signWechatAuthToken(payload: Omit<JwtPayload, "iat" | "exp">) {
    const token = signToken(payload);
    primeWechatIdentityCheckCacheFromToken(token);
    return token;
  }

  private setCachedVisitorOnlyAuthUser(authUserId: string) {
    this.visitorOnlyAuthUserCache.set(authUserId, {
      expiresAt: Date.now() + VISITOR_ONLY_AUTH_USER_CACHE_TTL_MS,
    });
  }

  private async resolveMembershipVisitorState(
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

  private createAuthUserVisitorResponse(input: {
    authUserId: string;
    openid: string;
    roles: string[];
    isNewUser: boolean;
  }) {
    return {
      mode: "platform_visitor",
      token: this.signWechatAuthToken({
        sub: input.authUserId,
        openid: input.openid,
        login_channel: "wechat",
        roles: input.roles,
      }),
      user_id: input.authUserId,
      roles: input.roles,
      is_new_user: input.isNewUser,
      tenant: null,
      employee: null,
      customer: null,
      has_customer_profile: false,
    };
  }

  private serializeEmployeeFromAuthContext(authContext: AuthContext) {
    if (!authContext.employeeId) {
      return null;
    }

    return {
      id: authContext.employeeId,
      name: authContext.employeeName,
      status: authContext.employeeStatus,
      department_id: authContext.departmentId,
      tenant_department_id: authContext.tenantDepartmentId,
      department_code: authContext.departmentCode,
      department_name: authContext.departmentName,
      post_id: authContext.postId,
      post_name: authContext.postName,
      avatar: authContext.avatar,
    };
  }

  private buildEmployeeLoginRoles(existingRoles?: string[] | null) {
    const roles = new Set(
      (existingRoles || []).filter((role) => role && role !== "visitor"),
    );
    roles.add("employee");
    return Array.from(roles);
  }

  private buildEmployeeLoginResponse(input: {
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

  private async buildEmployeeLoginContext(
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

  private async buildEmployeeLoginContextByEmployeeId(input: {
    authUserId: string;
    employeeId: string;
    openid?: string | null;
    roles?: string[];
  }) {
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

  private buildEmployeeLoginContextFromMembership(input: {
    authUserId: string;
    row: WechatLoginMembershipRow;
    openid?: string | null;
    roles?: string[];
  }) {
    const row = input.row;
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
      departmentId: row.employee_department_id,
      tenantDepartmentId: row.employee_tenant_department_id,
      departmentCode: row.tenant_department_code ?? row.department_code,
      departmentName: row.tenant_department_alias_name ?? row.department_name,
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

  @Post("/auth")
  async getOpenId(request: FastifyRequest, reply: FastifyReply) {
    const startedAt = Date.now();
    const bodyResult = WeChatAuthBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      throw Errors.fromZod(bodyResult.error);
    }

    request.log.info({ requestId: request.id }, "[auth] receive code");

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
          durationMs: Date.now() - loginMembershipStartedAt,
          totalMs: Date.now() - startedAt,
        },
        "[auth] resolved existing visitor login context",
      );
      return ResponseHandler.success(
        this.createAuthUserVisitorResponse({
          authUserId: userId,
          openid: wxData.openid,
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
        ? this.buildEmployeeLoginContextFromMembership({
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
        tenants: enrichedCustomerOptions.map((item) => this.serializeCustomerTenantOption(item)),
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

    const token = this.signWechatAuthToken({
      sub: userId,
      openid: wxData.openid,
      login_channel: "wechat",
      roles,
    });
    request.log.info(
      { requestId: request.id, userId, totalMs: Date.now() - startedAt },
      "[auth] resolved visitor login context",
    );

    return ResponseHandler.success({
      mode: "platform_visitor",
      token,
      user_id: userId,
      roles,
      is_new_user: isNewUser,
      tenant: null,
      employee: null,
      customer: null,
      has_customer_profile: false,
    }, "登录成功");
  }

  @Post("/auth/send-code")
  async sendCode(request: FastifyRequest, reply: FastifyReply) {
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

  @Post("/auth/verify-role")
  async verifyRole(request: FastifyRequest, reply: FastifyReply) {
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

  @Post("/customer/auth/select-tenant")
  async selectCustomerTenant(request: FastifyRequest, reply: FastifyReply) {
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

  @Post("/customer/auth/unbind-wechat")
  async unbindCustomerWechat(request: FastifyRequest, reply: FastifyReply) {
    const data = await wechatRebindRequestService.unbindCustomer(request.user || {});
    return ResponseHandler.success(data, "微信绑定已解除");
  }

  @Post("/employee/auth/unbind-wechat")
  async unbindEmployeeWechat(request: FastifyRequest, reply: FastifyReply) {
    const data = await wechatRebindRequestService.unbindEmployee(request.user || {});
    return ResponseHandler.success(data, "微信绑定已解除");
  }

  @Post("/auth/wechat-rebind-requests")
  async createWechatRebindRequest(request: FastifyRequest, reply: FastifyReply) {
    const bodyResult = WechatRebindRequestSchema.safeParse(request.body || {});
    if (!bodyResult.success) {
      throw Errors.fromZod(bodyResult.error);
    }

    const data = await wechatRebindRequestService.create(
      request.user?.sub,
      bodyResult.data,
    );
    return ResponseHandler.success(data, "换绑申请已提交，请等待工作人员审核");
  }

  @Get("/employee/auth/wechat-rebind-requests")
  async listWechatRebindRequests(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);

    const queryResult = WechatRebindRequestListQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) {
      throw Errors.fromZod(queryResult.error);
    }

    const data = await wechatRebindRequestService.list(authContext, queryResult.data);
    return ResponseHandler.success(data);
  }

  @Post("/employee/auth/wechat-rebind-requests/:id/approve")
  async approveWechatRebindRequest(request: FastifyRequest, reply: FastifyReply) {
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

  @Post("/employee/auth/wechat-rebind-requests/:id/reject")
  async rejectWechatRebindRequest(request: FastifyRequest, reply: FastifyReply) {
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

  @Post("/wechat/h5-session")
  async createH5MarketingSession(request: FastifyRequest, reply: FastifyReply) {
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

  private async getAuthUserIdForRoleVerification(request: FastifyRequest) {
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
  private async getWeChatSession(code: string) {
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

  private async getOrCreateAuthUser(
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

  private createWechatVisitorSession(input: {
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

  private async createWechatVisitorUser(input: {
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

  private normalizeTenantRelation(value: CustomerTenantOption["tenant"]) {
    if (Array.isArray(value)) {
      return value[0] ?? null;
    }

    return value ?? null;
  }

  private assertCustomerTenantAvailable(customer: CustomerTenantOption) {
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

  private async listCustomerTenantOptionsByPhone(phone: string) {
    return wechatCustomerIdentityService.listCustomerTenantOptionsByPhone(phone);
  }

  private async listCustomerTenantOptionsByAuthUser(
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

  private async getCustomerTenantOptionById(customerId: string, tenantId: string) {
    return wechatCustomerIdentityService.getCustomerTenantOptionById(
      customerId,
      tenantId,
    );
  }

  private serializeCustomerTenantOption(customer: CustomerTenantOption) {
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

  private async signCustomerSession(input: {
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

  private async bindCustomerToAuthUser(
    request: FastifyRequest | null,
    authUserId: string,
    customer: CustomerTenantOption,
    options?: {
      openid?: string | null;
    },
  ) {
    const logCustomerBindStage = (
      stage: string,
      startedAt: number,
      extra: Record<string, unknown> = {},
    ) => {
      request?.log.info(
        {
          requestId: request.id,
          stage,
          durationMs: Date.now() - startedAt,
          ...extra,
        },
        "[auth] customer bind stage completed",
      );
    };

    const membershipStartedAt = Date.now();
    const hasActiveMembership = await userIdentityService.hasActiveBusinessMembership({
      userId: authUserId,
      tenantId: customer.tenant_id,
      identityType: "customer",
      identityId: customer.id,
    });
    logCustomerBindStage("current_membership_checked", membershipStartedAt, {
      authUserId,
      customerId: customer.id,
      hasActiveMembership,
    });

    if (customer.user_id && customer.user_id !== authUserId && !hasActiveMembership) {
      const existingOpenidStartedAt = Date.now();
      const existingOpenid = await this.findOpenIdByAuthUserId(customer.user_id);
      logCustomerBindStage("existing_customer_openid_checked", existingOpenidStartedAt, {
        customerAuthUserId: customer.user_id,
        hasExistingOpenid: Boolean(existingOpenid),
      });
      if (existingOpenid) {
        const rebindStartedAt = Date.now();
        await wechatRebindRequestService.assertCustomerCanBind(authUserId, customer);
        logCustomerBindStage("customer_rebind_checked", rebindStartedAt, {
          customerAuthUserId: customer.user_id,
        });
      }

      if (!options?.openid) {
        throw Errors.badRequest("当前账号未绑定微信身份");
      }

      const oauthStartedAt = Date.now();
      await userIdentityService.syncOauthIdentityBestEffort({
        userId: customer.user_id,
        platform: "wechat_mini",
        openid: options.openid,
        source: "customer_verify_role_bind_existing_auth_user",
      });
      logCustomerBindStage("oauth_identity_synced", oauthStartedAt, {
        customerAuthUserId: customer.user_id,
      });

      const membershipSyncStartedAt = Date.now();
      await userIdentityService.syncBusinessMembershipBestEffort({
        userId: customer.user_id,
        tenantId: customer.tenant_id,
        identityType: "customer",
        identityId: customer.id,
        source: "customer_verify_role_bind_existing_auth_user",
      });
      logCustomerBindStage("business_membership_synced", membershipSyncStartedAt, {
        customerAuthUserId: customer.user_id,
        customerId: customer.id,
        tenantId: customer.tenant_id,
      });
      authorizationService.invalidateAuthContext({ authUserId });
      authorizationService.invalidateAuthContext({ authUserId: customer.user_id });
      return customer.user_id;
    }

    if (!hasActiveMembership) {
      const rebindStartedAt = Date.now();
      await wechatRebindRequestService.assertCustomerCanBind(authUserId, customer);
      logCustomerBindStage("customer_rebind_checked", rebindStartedAt, {
        customerAuthUserId: customer.user_id,
      });
    }

    if (customer.user_id === authUserId && hasActiveMembership) {
      return authUserId;
    }

    if (customer.user_id === authUserId) {
      const membershipSyncStartedAt = Date.now();
      await userIdentityService.syncBusinessMembershipBestEffort({
        userId: authUserId,
        tenantId: customer.tenant_id,
        identityType: "customer",
        identityId: customer.id,
        source: "customer_bind_auth_user_existing",
      });
      logCustomerBindStage("business_membership_synced", membershipSyncStartedAt, {
        authUserId,
        customerId: customer.id,
        tenantId: customer.tenant_id,
      });
      return authUserId;
    }

    if (hasActiveMembership && customer.user_id && customer.user_id !== authUserId) {
      authorizationService.invalidateAuthContext({
        authUserId: customer.user_id,
      });
    }

    const bindStartedAt = Date.now();
    await wechatCustomerIdentityService.bindCustomerAuthUser({
      authUserId,
      customer,
    });
    logCustomerBindStage("customer_auth_user_bound", bindStartedAt, {
      authUserId,
      customerId: customer.id,
      tenantId: customer.tenant_id,
    });

    authorizationService.invalidateAuthContext({
      authUserId,
    });

    const membershipSyncStartedAt = Date.now();
    await userIdentityService.syncBusinessMembershipBestEffort({
      userId: authUserId,
      tenantId: customer.tenant_id,
      identityType: "customer",
      identityId: customer.id,
      source: "customer_bind_auth_user",
    });
    logCustomerBindStage("business_membership_synced", membershipSyncStartedAt, {
      authUserId,
      customerId: customer.id,
      tenantId: customer.tenant_id,
    });

    return authUserId;
  }

  private async resolveCustomerLoginState(
    request: FastifyRequest,
    authUserId: string,
    phone: string,
    openid: string | null,
    shareToken?: string | null,
  ) {
    if (shareToken) {
      return this.resolveCustomerLoginStateByShareToken({
        authUserId,
        phone,
        openid,
        shareToken,
      });
    }

    const customers = await this.listCustomerTenantOptionsByPhone(phone);

    if (customers.length === 0) {
      const roles = await this.getUserRoles(authUserId);
      const token = this.signWechatAuthToken({
        sub: authUserId,
        openid: openid ?? undefined,
        roles,
        verified_phone: phone,
      });

      return {
        mode: "platform_visitor",
        token,
        user_id: authUserId,
        roles,
        is_new_user: false,
        phone,
        has_customer_profile: false,
        message: "暂未匹配到装修公司，可先提交装修需求，平台顾问会协助分配。",
      };
    }

    if (customers.length === 1) {
      const customer = customers[0]!;
      const customerAuthUserId = await this.bindCustomerToAuthUser(
        request,
        authUserId,
        customer,
        { openid },
      );
      return this.signCustomerSession({
        authUserId: customerAuthUserId,
        openid,
        customer: {
          ...customer,
          user_id: customerAuthUserId,
        },
        roles: ["customer"],
        request,
      });
    }

    const roles = await this.getUserRoles(authUserId);
    const token = this.signWechatAuthToken({
      sub: authUserId,
      openid: openid ?? undefined,
      roles,
      verified_phone: phone,
    });

    return {
      mode: "select_tenant",
      token,
      user_id: authUserId,
      roles,
      is_new_user: false,
      phone,
      tenants: customers.map((item) => this.serializeCustomerTenantOption(item)),
    };
  }

  private async resolveCustomerLoginStateByShareToken(input: {
    authUserId: string;
    phone: string;
    openid: string | null;
    shareToken: string;
  }) {
    const bound = await tenantShareLinkService.bindCustomer({
      authUserId: input.authUserId,
      phone: input.phone,
      shareToken: input.shareToken,
    });

    const customer = await this.getCustomerTenantOptionById(
      bound.customer_id,
      bound.tenant_id,
    );
    if (!customer) {
      throw Errors.dbError("员工分享客户绑定后未找到客户档案", bound);
    }

    await userIdentityService.syncBusinessMembershipBestEffort({
      userId: input.authUserId,
      tenantId: bound.tenant_id,
      identityType: "customer",
      identityId: bound.customer_id,
      source: "customer_share_token_bind",
    });

    return {
      ...(await this.signCustomerSession({
        authUserId: input.authUserId,
        openid: input.openid,
        customer: {
          ...customer,
          user_id: input.authUserId,
        },
      })),
      share_binding: {
        share_link_id: bound.share_link_id,
        share_employee_id: bound.share_employee_id,
        dedupe_result: bound.dedupe_result,
        source: bound.source,
      },
    };
  }

  private async selectCustomerTenantForAuthUser(input: {
    authUserId: string;
    openid: string | null;
    verifiedPhone: string | null;
    tenantId: string;
    customerId: string;
  }) {
    const customer = await this.getCustomerTenantOptionById(
      input.customerId,
      input.tenantId,
    );
    if (!customer) {
      throw Errors.notFound("客户租户关系不存在");
    }

    const tenant = this.normalizeTenantRelation(customer.tenant);
    if (tenant?.status !== "active") {
      throw Errors.business(403, "租户状态不可用", "FORBIDDEN");
    }

    const canSelectByCurrentBinding = customer.user_id === input.authUserId;
    const canSelectByMembership = await userIdentityService.hasActiveBusinessMembership({
      userId: input.authUserId,
      tenantId: customer.tenant_id,
      identityType: "customer",
      identityId: customer.id,
    });
    const canSelectByVerifiedPhone = Boolean(
      input.verifiedPhone &&
        customer.phone &&
        input.verifiedPhone === customer.phone,
    );
    if (!canSelectByMembership && !canSelectByCurrentBinding && !canSelectByVerifiedPhone) {
      throw Errors.business(403, "当前账号不能选择该装修公司", "FORBIDDEN");
    }

    const customerAuthUserId = await this.bindCustomerToAuthUser(
      null,
      input.authUserId,
      customer,
      { openid: input.openid },
    );

    return this.signCustomerSession({
      authUserId: customerAuthUserId,
      openid: input.openid,
      customer: {
        ...customer,
        user_id: customerAuthUserId,
      },
    });
  }

  private async bindCustomerRole(
    authUserId: string,
    phone: string,
    options?: {
      createIfMissing?: boolean;
      customerOrigin?: string | null;
    },
  ) {
    await wechatCustomerIdentityService.bindCustomerRole({
      authUserId,
      phone,
      createIfMissing: options?.createIfMissing,
      customerOrigin: options?.customerOrigin,
    });
  }

  private async bindEmployeeRole(
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

    return authUserId;
  }

  private async findOpenIdByAuthUserId(authUserId: string) {
    const identity = await userIdentityService.findActiveOauthIdentityByUserId({
      userId: authUserId,
      platform: "wechat_mini",
    });
    return identity?.openid ?? null;
  }

  private async getOpenIdByAuthUserId(authUserId: string) {
    const openid = await this.findOpenIdByAuthUserId(authUserId);
    if (!openid) {
      throw Errors.badRequest("当前账号未绑定微信身份");
    }
    return openid;
  }

  private async getUserRoles(
    userId: string,
    memberships?: Parameters<typeof wechatAuthRoleService.getUserRoles>[0]["memberships"],
  ) {
    return wechatAuthRoleService.getUserRoles({
      userId,
      memberships,
    });
  }

  async verifyServer(request: FastifyRequest, reply: FastifyReply) {
    const { echostr } = request.query as { echostr?: string };
    return reply.send(echostr);
  }

  async getAccessToken() {
    return {};
  }

  async getJsConfig(request: FastifyRequest, reply: FastifyReply) {
    return reply.send({ message: "Implementation pending" });
  }
}

export default new WeChatController();
