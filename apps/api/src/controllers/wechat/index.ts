import type { FastifyReply, FastifyRequest } from "fastify";
import { createHash } from "node:crypto";
import { BaseController } from "@/controllers/BaseController";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import { z } from "zod";
import { signToken, signVisitorSessionToken } from "@/utils/jwt";
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
import { userIdentityService } from "@/services/user-identities";
import { smsVerificationCodeService } from "@/services/sms-verification-codes";
import { wechatAuthIdentityService } from "@/services/wechat-auth-identities";
import { wechatAuthRoleService } from "@/services/wechat-auth-roles";
import {
  wechatCustomerIdentityService,
  type CustomerIdentityRow,
  type CustomerTenantOption,
} from "@/services/wechat-customer-identities";
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

type AuthIdentitySource = "legacy" | "dual" | "membership";

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

const WeChatAuthBodySchema = z.object({
  code: z.string().trim().min(1, "缺少 code"),
});

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

  private getAuthIdentitySource(): AuthIdentitySource {
    const value = (process.env.AUTH_IDENTITY_SOURCE || "dual").trim().toLowerCase();
    if (value === "legacy" || value === "membership") {
      return value;
    }

    return "dual";
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

  private async buildEmployeeLoginContext(
    authUserId: string,
    openid?: string | null,
    roles: string[] = ["employee"],
  ) {
    let authContext = await authorizationService.getAuthContextByAuthUserId(authUserId);
    if (!authContext.employeeId && this.getAuthIdentitySource() !== "legacy") {
      const employeeMembership = (await userIdentityService.listActiveBusinessMemberships({
        userId: authUserId,
        identityType: "employee",
      }))[0];

      if (employeeMembership) {
        authContext = await authorizationService.getAuthContextByEmployeeId(
          employeeMembership.identity_id,
        );
      }
    }

    if (!authContext.employeeId) {
      return null;
    }

    authorizationService.assertTenantAvailable(authContext);

    return {
      authContext,
      token: signToken({
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

    const { userId, isNewUser } = authResolution;
    request.log.info(
      { requestId: request.id, userId, durationMs: Date.now() - resolveIdentityStartedAt },
      "[auth] resolved auth user",
    );

    const rolesStartedAt = Date.now();
    const roles = await this.getUserRoles(userId);
    request.log.info(
      { requestId: request.id, userId, durationMs: Date.now() - rolesStartedAt, roles },
      "[auth] resolved user roles",
    );
    this.runAuthBackgroundTask(request, "observe_legacy_identity_state", () =>
      userIdentityService.observeLegacyIdentityStateBestEffort({
        userId,
        openid: wxData.openid,
        unionid: wxData.unionid ?? null,
        source: "wechat_auth",
      })
    );

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
    const customerOptions = await this.listCustomerTenantOptionsByAuthUser(userId);
    request.log.info(
      {
        requestId: request.id,
        userId,
        durationMs: Date.now() - customerOptionsStartedAt,
        count: customerOptions.length,
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
        }),
        "登录成功",
      );
    }

    if (customerOptions.length > 1) {
      const token = signToken({
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
        tenants: customerOptions.map((item) => this.serializeCustomerTenantOption(item)),
      }, "登录成功");
    }

    const token = signToken({
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
      const employeeAuthUserId = await this.bindEmployeeRole(
        authUserId,
        phone,
        requestOpenid,
      );
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

      const openidStartedAt = Date.now();
      const openid = await this.getOpenIdByAuthUserId(employeeAuthUserId);
      request.log.info(
        {
          requestId: request.id,
          durationMs: Date.now() - openidStartedAt,
          hasOpenid: Boolean(openid),
        },
        "[auth] verify role openid resolved",
      );
      const rolesStartedAt = Date.now();
      const roles = await this.getUserRoles(employeeAuthUserId);
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
    const customerLogin = await this.resolveCustomerLoginState(
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
    const identitySource = this.getAuthIdentitySource();
    if (identitySource !== "legacy") {
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
          identitySource,
        },
        "[auth] active oauth identity lookup result",
      );

      if (activeOauthIdentity) {
        request.log.info(
          {
            requestId: request.id,
            openid,
            authUserId: activeOauthIdentity.user_id,
            identitySource,
          },
          "[auth] resolved user by active oauth identity",
        );

        this.runAuthBackgroundTask(request, "sync_legacy_wechat_identity", () =>
          this.syncLegacyWechatIdentityMapping({
            authUserId: activeOauthIdentity.user_id,
            openid,
            unionid: unionid ?? activeOauthIdentity.unionid ?? null,
          })
        );
        this.runAuthBackgroundTask(request, "sync_oauth_identity", () =>
          userIdentityService.syncOauthIdentityBestEffort({
            userId: activeOauthIdentity.user_id,
            platform: "wechat_mini",
            openid,
            unionid: unionid ?? activeOauthIdentity.unionid ?? null,
            source: "wechat_auth_oauth_primary",
          })
        );

        return {
          kind: "auth_user",
          userId: activeOauthIdentity.user_id,
          isNewUser: false,
        };
      }

      if (allowVisitorSession && identitySource === "membership") {
        request.log.info(
          { requestId: request.id, openid, identitySource },
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
    }

    const existingIdentity = await this.findIdentityByOpenId(openid);

    request.log.info(
      { requestId: request.id, openid, found: Boolean(existingIdentity), authUserId: existingIdentity?.auth_user_id },
      "[auth] query user by openid result",
    );

    if (existingIdentity) {
      const existingOauthUnbound = await userIdentityService.isOauthIdentityUnbound({
        userId: existingIdentity.auth_user_id,
        platform: "wechat_mini",
        openid,
      });

      if (existingOauthUnbound) {
        await wechatAuthIdentityService.deleteIdentityByAuthUserOpenId({
          authUserId: existingIdentity.auth_user_id,
          openid,
        });

        if (allowVisitorSession) {
          return this.createWechatVisitorSession({
            request,
            openid,
            unionid: unionid ?? existingIdentity.unionid ?? null,
            uniqueEmail: true,
            source: "wechat_auth_existing_identity_unbound",
          });
        }

        request.log.info(
          { requestId: request.id, openid, userId: existingIdentity.auth_user_id },
          "[auth] create visitor for unbound existing identity",
        );

        return this.createWechatVisitorUser({
          request,
          openid,
          unionid: unionid ?? existingIdentity.unionid ?? null,
          uniqueEmail: true,
          source: "wechat_auth_existing_identity_unbound",
        });
      }

      this.runAuthBackgroundTask(request, "sync_oauth_identity", () =>
        userIdentityService.syncOauthIdentityBestEffort({
          userId: existingIdentity.auth_user_id,
          platform: "wechat_mini",
          openid,
          unionid: unionid ?? existingIdentity.unionid ?? null,
          source: "wechat_auth_existing_identity",
        })
      );

      return {
        kind: "auth_user",
        userId: existingIdentity.auth_user_id,
        isNewUser: false,
      };
    }

    const legacyLookupStartedAt = Date.now();
    const legacyUser = await this.findLegacyAuthUser(openid);
    request.log.info(
      {
        requestId: request.id,
        openid,
        durationMs: Date.now() - legacyLookupStartedAt,
        found: Boolean(legacyUser),
      },
      "[auth] legacy auth user lookup result",
    );
    if (legacyUser) {
      const legacyOauthUnbound = await userIdentityService.isOauthIdentityUnbound({
        userId: legacyUser.id,
        platform: "wechat_mini",
        openid,
      });

      if (legacyOauthUnbound) {
        request.log.info(
          { requestId: request.id, openid, userId: legacyUser.id },
          "[auth] skip legacy identity repair for unbound oauth",
        );

        if (allowVisitorSession) {
          return this.createWechatVisitorSession({
            request,
            openid,
            unionid: unionid || legacyUser.unionid || null,
            uniqueEmail: true,
            source: "wechat_auth_legacy_unbound",
          });
        }

        return this.createWechatVisitorUser({
          request,
          openid,
          unionid: unionid || legacyUser.unionid || null,
          uniqueEmail: true,
          source: "wechat_auth_legacy_unbound",
        });
      }

      this.runAuthBackgroundTask(request, "repair_legacy_wechat_identity", () =>
        wechatAuthIdentityService.upsertIdentity({
          authUserId: legacyUser.id,
          openid,
          unionid: unionid || legacyUser.unionid || null,
          errorMessage: "补建微信身份映射失败",
        })
      );

      request.log.info(
        { requestId: request.id, openid, userId: legacyUser.id },
        "[auth] repaired legacy identity mapping",
      );

      this.runAuthBackgroundTask(request, "sync_oauth_identity", () =>
        userIdentityService.syncOauthIdentityBestEffort({
          userId: legacyUser.id,
          platform: "wechat_mini",
          openid,
          unionid: unionid || legacyUser.unionid || null,
          source: "wechat_auth_legacy_repair",
        })
      );

      return {
        kind: "auth_user",
        userId: legacyUser.id,
        isNewUser: false,
      };
    }

    if (allowVisitorSession) {
      return this.createWechatVisitorSession({
        request,
        openid,
        unionid: unionid || null,
        uniqueEmail: false,
        source: "wechat_auth_new_visitor_session",
      });
    }

    request.log.info({ requestId: request.id, openid }, "[auth] create visitor user start");

    const { data, error } = await wechatAuthIdentityService.createWechatAuthUser({
      openid,
      unionid: unionid || null,
    });

    if (error) {
      request.log.error(
        { requestId: request.id, openid, error: { message: error.message, status: error.status, name: error.name } },
        "[auth] create visitor user failed",
      );

      const legacyUser = await this.findLegacyAuthUser(openid);
      if (legacyUser) {
        const legacyOauthUnbound = await userIdentityService.isOauthIdentityUnbound({
          userId: legacyUser.id,
          platform: "wechat_mini",
          openid,
        });

        if (legacyOauthUnbound) {
          request.log.info(
            { requestId: request.id, openid, userId: legacyUser.id },
            "[auth] skip legacy identity repair for unbound oauth",
          );

          return this.createWechatVisitorUser({
            request,
            openid,
            unionid: unionid || legacyUser.unionid || null,
            uniqueEmail: true,
            source: "wechat_auth_legacy_unbound",
          });
        }

        this.runAuthBackgroundTask(request, "repair_legacy_wechat_identity", () =>
          wechatAuthIdentityService.upsertIdentity({
            authUserId: legacyUser.id,
            openid,
            unionid: unionid || legacyUser.unionid || null,
            errorMessage: "补建微信身份映射失败",
          })
        );

        request.log.info(
          { requestId: request.id, openid, userId: legacyUser.id },
          "[auth] repaired legacy identity mapping",
        );

        this.runAuthBackgroundTask(request, "sync_oauth_identity", () =>
          userIdentityService.syncOauthIdentityBestEffort({
            userId: legacyUser.id,
            platform: "wechat_mini",
            openid,
            unionid: unionid || legacyUser.unionid || null,
            source: "wechat_auth_legacy_repair",
          })
        );

        return {
          kind: "auth_user",
          userId: legacyUser.id,
          isNewUser: false,
        };
      }

      throw Errors.dbError("创建微信用户失败", error);
    }

    if (!data.user) {
      throw Errors.dbError("创建微信用户失败");
    }

    this.runAuthBackgroundTask(request, "create_legacy_wechat_identity", () =>
      wechatAuthIdentityService.upsertIdentity({
        authUserId: data.user!.id,
        openid,
        unionid: unionid || null,
        errorMessage: "创建微信身份映射失败",
      })
    );

    this.runAuthBackgroundTask(request, "sync_oauth_identity", () =>
      userIdentityService.syncOauthIdentityBestEffort({
        userId: data.user!.id,
        platform: "wechat_mini",
        openid,
        unionid: unionid || null,
        source: "wechat_auth_create_user",
      })
    );

    request.log.info({ requestId: request.id, openid, userId: data.user.id }, "[auth] create visitor user result");

    return {
      kind: "auth_user",
      userId: data.user.id,
      isNewUser: true,
    };
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

    this.runAuthBackgroundTask(input.request, "create_legacy_wechat_identity", () =>
      wechatAuthIdentityService.upsertIdentity({
        authUserId: data.user!.id,
        openid: input.openid,
        unionid: input.unionid || null,
        errorMessage: "创建微信身份映射失败",
      })
    );

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

  private async findIdentityByOpenId(openid: string) {
    return wechatAuthIdentityService.findIdentityByOpenId(openid);
  }

  private async syncLegacyWechatIdentityMapping(input: {
    authUserId: string;
    openid: string;
    unionid?: string | null;
  }) {
    const currentIdentity = await this.findIdentityByOpenId(input.openid);
    if (currentIdentity && currentIdentity.auth_user_id !== input.authUserId) {
      await wechatAuthIdentityService.deleteIdentityByOpenId(input.openid);
    }

    await wechatAuthIdentityService.upsertIdentity({
      authUserId: input.authUserId,
      openid: input.openid,
      unionid: input.unionid ?? null,
      errorMessage: "同步微信身份映射失败",
    });
  }

  private async findLegacyAuthUser(openid: string) {
    return wechatAuthIdentityService.findLegacyAuthUserByOpenId(openid);
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

  private async listCustomerTenantOptionsByAuthUser(authUserId: string) {
    return wechatCustomerIdentityService.listCustomerTenantOptionsByAuthUser({
      authUserId,
      identitySource: this.getAuthIdentitySource(),
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
  }) {
    const tenant = this.normalizeTenantRelation(input.customer.tenant);
    this.assertCustomerTenantAvailable(input.customer);
    const roles = await this.getUserRoles(input.authUserId);
    const normalizedRoles = roles.includes("customer") ? roles : [...roles, "customer"];
    const token = signToken({
      sub: input.authUserId,
      openid: input.openid ?? undefined,
      roles: normalizedRoles,
      tenant_id: input.customer.tenant_id,
      tenant_slug: tenant?.slug ?? null,
      customer_id: input.customer.id,
    });

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
    authUserId: string,
    customer: CustomerTenantOption,
    options?: {
      openid?: string | null;
    },
  ) {
    const hasActiveMembership = this.getAuthIdentitySource() !== "legacy"
      ? await userIdentityService.hasActiveBusinessMembership({
        userId: authUserId,
        tenantId: customer.tenant_id,
        identityType: "customer",
        identityId: customer.id,
      })
      : false;

    if (customer.user_id && customer.user_id !== authUserId && !hasActiveMembership) {
      const existingOpenid = await this.findOpenIdByAuthUserId(customer.user_id);
      if (existingOpenid) {
        await wechatRebindRequestService.assertCustomerCanBind(authUserId, customer);
      }

      if (!options?.openid) {
        throw Errors.badRequest("当前账号未绑定微信身份");
      }

      await this.bindWechatOpenIdToExistingAuthUser({
        openid: options.openid,
        fromAuthUserId: authUserId,
        toAuthUserId: customer.user_id,
        targetRole: "customer",
      });
      await userIdentityService.syncOauthIdentityBestEffort({
        userId: customer.user_id,
        platform: "wechat_mini",
        openid: options.openid,
        source: "customer_verify_role_bind_existing_auth_user",
      });
      await userIdentityService.syncBusinessMembershipBestEffort({
        userId: customer.user_id,
        tenantId: customer.tenant_id,
        identityType: "customer",
        identityId: customer.id,
        source: "customer_verify_role_bind_existing_auth_user",
      });
      authorizationService.invalidateAuthContext({ authUserId });
      authorizationService.invalidateAuthContext({ authUserId: customer.user_id });
      return customer.user_id;
    }

    if (!hasActiveMembership) {
      await wechatRebindRequestService.assertCustomerCanBind(authUserId, customer);
    }

    if (customer.user_id === authUserId && hasActiveMembership) {
      return authUserId;
    }

    if (customer.user_id === authUserId) {
      await userIdentityService.syncBusinessMembershipBestEffort({
        userId: authUserId,
        tenantId: customer.tenant_id,
        identityType: "customer",
        identityId: customer.id,
        source: "customer_bind_auth_user_existing",
      });
      return authUserId;
    }

    if (hasActiveMembership && customer.user_id && customer.user_id !== authUserId) {
      authorizationService.invalidateAuthContext({
        authUserId: customer.user_id,
      });
    }

    await wechatCustomerIdentityService.bindCustomerAuthUser({
      authUserId,
      customer,
    });

    authorizationService.invalidateAuthContext({
      authUserId,
    });

    await userIdentityService.syncBusinessMembershipBestEffort({
      userId: authUserId,
      tenantId: customer.tenant_id,
      identityType: "customer",
      identityId: customer.id,
      source: "customer_bind_auth_user",
    });

    return authUserId;
  }

  private async resolveCustomerLoginState(
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
      const token = signToken({
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
      });
    }

    const roles = await this.getUserRoles(authUserId);
    const token = signToken({
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
    const canSelectByMembership = this.getAuthIdentitySource() !== "legacy"
      ? await userIdentityService.hasActiveBusinessMembership({
        userId: input.authUserId,
        tenantId: customer.tenant_id,
        identityType: "customer",
        identityId: customer.id,
      })
      : false;
    const canSelectByVerifiedPhone = Boolean(
      input.verifiedPhone &&
        customer.phone &&
        input.verifiedPhone === customer.phone,
    );
    if (!canSelectByMembership && !canSelectByCurrentBinding && !canSelectByVerifiedPhone) {
      throw Errors.business(403, "当前账号不能选择该装修公司", "FORBIDDEN");
    }

    const customerAuthUserId = await this.bindCustomerToAuthUser(
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
    authUserId: string,
    phone: string,
    openid: string | null,
  ) {
    const employees = await wechatEmployeeIdentityService
      .listEmployeeLoginCandidatesByPhone(phone);

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

    const hasActiveMembership = this.getAuthIdentitySource() !== "legacy"
      ? await userIdentityService.hasActiveBusinessMembership({
        userId: authUserId,
        tenantId: tenant.id,
        identityType: "employee",
        identityId: employee.id,
      })
      : false;

    if (hasActiveMembership) {
      if (employee.user_id && employee.user_id !== authUserId) {
        authorizationService.invalidateAuthContext({
          authUserId: employee.user_id,
          employeeId: employee.id,
        });
      }

      if (employee.user_id !== authUserId) {
        await wechatEmployeeIdentityService.bindEmployeeAuthUser({
          employeeId: employee.id,
          authUserId,
          errorMessage: "同步员工身份绑定失败",
        });
      }

      await userIdentityService.syncBusinessMembershipBestEffort({
        userId: authUserId,
        tenantId: tenant.id,
        identityType: "employee",
        identityId: employee.id,
        deactivateOtherSameType: true,
        source: "employee_verify_role_membership_primary",
      });
      authorizationService.invalidateAuthContext({ authUserId, employeeId: employee.id });
      return authUserId;
    }

    if (employee.user_id && employee.user_id !== authUserId) {
      const existingOpenid = await this.findOpenIdByAuthUserId(employee.user_id);
      if (existingOpenid) {
        await wechatRebindRequestService.assertEmployeeCanBind(authUserId, employee);
      }

      if (!openid) {
        throw Errors.badRequest("当前账号未绑定微信身份");
      }

      await this.bindWechatOpenIdToExistingAuthUser({
        openid,
        fromAuthUserId: authUserId,
        toAuthUserId: employee.user_id,
      });
      await userIdentityService.syncOauthIdentityBestEffort({
        userId: employee.user_id,
        platform: "wechat_mini",
        openid,
        source: "employee_verify_role_bind_existing_auth_user",
      });
      await userIdentityService.syncBusinessMembershipBestEffort({
        userId: employee.user_id,
        tenantId: tenant.id,
        identityType: "employee",
        identityId: employee.id,
        deactivateOtherSameType: true,
        source: "employee_verify_role_bind_existing_auth_user",
      });
      return employee.user_id;
    }

    await wechatRebindRequestService.assertEmployeeCanBind(authUserId, employee);

    await wechatEmployeeIdentityService.clearOtherEmployeeBindings({
      authUserId,
      exceptEmployeeId: employee.id,
    });

    await wechatEmployeeIdentityService.bindEmployeeAuthUser({
      employeeId: employee.id,
      authUserId,
      errorMessage: "绑定员工身份失败",
    });

    await userIdentityService.syncBusinessMembershipBestEffort({
      userId: authUserId,
      tenantId: tenant.id,
      identityType: "employee",
      identityId: employee.id,
      deactivateOtherSameType: true,
      source: "employee_verify_role_bind",
    });

    return authUserId;
  }

  private async findOpenIdByAuthUserId(authUserId: string) {
    return wechatAuthIdentityService.findOpenIdByAuthUserId(authUserId);
  }

  private async bindWechatOpenIdToExistingAuthUser(input: {
    openid: string;
    fromAuthUserId: string;
    toAuthUserId: string;
    targetRole?: "customer" | "employee";
  }) {
    const targetOpenid = await this.findOpenIdByAuthUserId(input.toAuthUserId);
    if (targetOpenid && targetOpenid !== input.openid) {
      throw Errors.business(
        409,
        "该手机号已绑定其他微信账号，可提交换绑申请",
        ErrorCodes.WECHAT_ALREADY_BOUND,
        {
          can_request_rebind: true,
          target_role: input.targetRole ?? "employee",
        },
      );
    }

    const currentIdentity = await this.findIdentityByOpenId(input.openid);
    if (currentIdentity && currentIdentity.auth_user_id !== input.fromAuthUserId) {
      if (currentIdentity.auth_user_id === input.toAuthUserId) {
        return;
      }

      throw Errors.business(
        409,
        "当前微信已绑定其他账号，请重新登录",
        ErrorCodes.WECHAT_BINDING_NOT_MATCHED,
      );
    }

    if (currentIdentity) {
      await wechatAuthIdentityService.updateIdentityAuthUser({
        fromAuthUserId: input.fromAuthUserId,
        toAuthUserId: input.toAuthUserId,
        openid: input.openid,
      });
      return;
    }

    await wechatAuthIdentityService.upsertIdentity({
      authUserId: input.toAuthUserId,
      openid: input.openid,
      errorMessage: "创建微信身份映射失败",
    });
  }

  private async getOpenIdByAuthUserId(authUserId: string) {
    return wechatAuthIdentityService.getRequiredOpenIdByAuthUserId(authUserId);
  }

  private async getUserRoles(userId: string) {
    return wechatAuthRoleService.getUserRoles({
      userId,
      identitySource: this.getAuthIdentitySource(),
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
