import type { FastifyReply, FastifyRequest } from "fastify";
import { SupabaseDB } from "@/utils/supabase";
import { BaseController } from "@/controllers/BaseController";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import { z } from "zod";
import { signToken } from "@/utils/jwt";
import {
  ReviewWechatRebindRequestSchema,
  SendCodeSchema,
  VerifyRoleSchema,
  WechatRebindRequestListQuerySchema,
  WechatRebindRequestParamsSchema,
  WechatRebindRequestSchema,
} from "@/schema/wechat";
import { sendSmsCode } from "@/services/sms";
import { authorizationService, type AuthContext } from "@/services/authorization";
import { marketingPageService } from "@/services/marketing-pages";
import { systemSettingsService } from "@/services/system-settings";
import { tenantShareLinkService } from "@/services/tenant-share-links";
import { wechatRebindRequestService } from "@/services/wechat-rebind-requests";
import { MarketingPageSlugSchema, TenantSlugSchema } from "@/schema/marketing-pages";
import { isPhoneLoginWithoutCodeEnabled } from "@/utils/auth/test-login";
import {
  isEmployeeOperableStatus,
  type AuthTargetRole,
  type SmsScene,
  type SmsVerificationStatus,
} from "@gooes/domain";

type WeChatSessionResponse = {
  openid?: string;
  session_key?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
};

type WechatIdentityRow = {
  auth_user_id: string;
  openid: string;
  unionid: string | null;
};

type LegacyAuthUser = {
  id: string;
  email?: string | null;
  openid?: string | null;
  unionid?: string | null;
};

type SmsVerificationCodeRow = {
  id: string;
  phone: string;
  scene: SmsScene;
  code: string;
  status: SmsVerificationStatus;
  expired_at: string;
  verified_at: string | null;
  created_at: string;
  request_ip: string | null;
};

type CustomerIdentityRow = {
  id: string;
  name: string | null;
  phone: string | null;
  user_id: string | null;
  tenant_id: string | null;
  customer_origin?: string | null;
  claimed_at?: string | null;
};

type CustomerTenantOption = CustomerIdentityRow & {
  tenant: {
    id: string | null;
    name: string | null;
    slug: string | null;
    status: string | null;
  } | Array<{
    id: string | null;
    name: string | null;
    slug: string | null;
    status: string | null;
  }> | null;
  project_count?: number;
  latest_project_name?: string | null;
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

  private serializeEmployeeFromAuthContext(authContext: AuthContext) {
    if (!authContext.employeeId) {
      return null;
    }

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

  private async buildEmployeeLoginContext(
    authUserId: string,
    openid?: string | null,
    roles: string[] = ["employee"],
  ) {
    const authContext = await authorizationService.getAuthContextByAuthUserId(authUserId);
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
    const bodyResult = WeChatAuthBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      throw Errors.fromZod(bodyResult.error);
    }

    request.log.info({ requestId: request.id }, "[auth] receive code");

    request.log.info({ requestId: request.id }, "[auth] call wechat jscode2session start");
    const wxData = await this.getWeChatSession(bodyResult.data.code);
    request.log.info({ requestId: request.id, hasOpenid: Boolean(wxData.openid), hasUnionid: Boolean(wxData.unionid) }, "[auth] call wechat jscode2session result");

    if (!wxData.openid) {
      throw Errors.badRequest("微信登录失败，未获取到 openid");
    }

    request.log.info({ requestId: request.id, openid: wxData.openid }, "[auth] parsed openid");

    const { userId, isNewUser } = await this.getOrCreateAuthUser(
      request,
      wxData.openid,
      wxData.unionid,
    );

    const roles = await this.getUserRoles(userId);

    request.log.info({ requestId: request.id, userId, roles }, "[auth] sign jwt start");
    const employeeLogin = roles.includes("employee")
      ? await this.buildEmployeeLoginContext(userId, wxData.openid, roles)
      : null;
    const token = employeeLogin?.token ?? signToken({
      sub: userId,
      openid: wxData.openid,
      login_channel: "wechat",
      roles,
    });
    request.log.info({ requestId: request.id, userId }, "[auth] sign jwt result");

    return ResponseHandler.success({
      token,
      user_id: userId,
      roles,
      is_new_user: isNewUser,
      tenant: employeeLogin?.tenant ?? null,
      employee: employeeLogin?.employee ?? null,
    }, "登录成功");
  }

  @Post("/auth/send-code")
  async sendCode(request: FastifyRequest, reply: FastifyReply) {
    const bodyResult = SendCodeSchema.safeParse(request.body);
    if (!bodyResult.success) {
      throw Errors.fromZod(bodyResult.error);
    }

    const adminClient = SupabaseDB.getAdminClient();
    const { phone, scene } = bodyResult.data;
    const recentBoundary = new Date(Date.now() - 60 * 1000).toISOString();

    const { data: recentCode, error: recentError } = await adminClient
      .from("sms_verification_codes")
      .select("id, created_at")
      .eq("phone", phone)
      .eq("scene", scene)
      .gte("created_at", recentBoundary)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentError) {
      throw Errors.dbError("查询验证码发送记录失败", recentError);
    }

    if (recentCode) {
      throw Errors.badRequest("验证码发送过于频繁，请稍后再试");
    }

    const code = this.generateVerificationCode();
    const expiredAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const requestIp = request.ip || null;

    const { error } = await adminClient.from("sms_verification_codes").insert({
      phone,
      scene,
      code,
      status: "pending",
      expired_at: expiredAt,
      request_ip: requestIp,
    });

    if (error) {
      throw Errors.dbError("保存验证码失败", error);
    }

    try {
      await sendSmsCode(phone, code, scene);
    } catch (smsError) {
      await adminClient
        .from("sms_verification_codes")
        .delete()
        .eq("phone", phone)
        .eq("scene", scene)
        .eq("code", code)
        .eq("status", "pending");

      throw Errors.dbError("发送验证码失败", smsError);
    }

    request.log.info(
      { requestId: request.id, hasPhone: Boolean(phone), scene },
      "[auth] sms verification code generated",
    );

    return ResponseHandler.success(null, "验证码已发送");
  }

  @Post("/auth/verify-role")
  async verifyRole(request: FastifyRequest, reply: FastifyReply) {
    if (!request.user?.sub) {
      throw Errors.unauthorized();
    }

    const bodyResult = VerifyRoleSchema.safeParse(request.body);
    if (!bodyResult.success) {
      throw Errors.fromZod(bodyResult.error);
    }

    const adminClient = SupabaseDB.getAdminClient();
    const { phone, code } = bodyResult.data;
    const target_role: AuthTargetRole = bodyResult.data.target_role;
    const scene: SmsScene = target_role === "customer"
      ? "bind_customer"
      : "bind_employee";

    const skipCodeVerification = isPhoneLoginWithoutCodeEnabled();
    const normalizedCode = code?.trim() || "";
    let verificationRecord: SmsVerificationCodeRow | null = null;

    if (!skipCodeVerification) {
      if (!normalizedCode) {
        throw Errors.badRequest("请输入验证码");
      }

      verificationRecord = await this.getValidVerificationCode(phone, scene, normalizedCode);
      if (!verificationRecord) {
        throw Errors.badRequest("验证码错误或已过期");
      }
    }

    if (target_role === "employee") {
      await this.bindEmployeeRole(request.user.sub, phone);

      authorizationService.invalidateAuthContext({
        authUserId: request.user.sub,
      });

      if (verificationRecord) {
        await this.markVerificationCodeVerified(adminClient, verificationRecord.id);
      }

      const openid = await this.getOpenIdByAuthUserId(request.user.sub);
      const roles = await this.getUserRoles(request.user.sub);
      const employeeLogin = await this.buildEmployeeLoginContext(
        request.user.sub,
        openid,
        roles,
      );
      if (!employeeLogin) {
        throw Errors.badRequest("该手机号未绑定员工身份");
      }

      return ResponseHandler.success({
        mode: "employee",
        token: employeeLogin.token,
        user_id: request.user.sub,
        roles,
        is_new_user: false,
        tenant: employeeLogin.tenant,
        employee: employeeLogin.employee,
      }, "身份验证成功");
    }

    const customerLogin = await this.resolveCustomerLoginState(
      request.user.sub,
      phone,
      request.user.openid ?? null,
      bodyResult.data.share_token ?? null,
    );

    if (verificationRecord) {
      await this.markVerificationCodeVerified(adminClient, verificationRecord.id);
    }

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
  ) {
    const adminClient = SupabaseDB.getAdminClient();
    request.log.info({ requestId: request.id, openid }, "[auth] query user by openid start");
    const existingIdentity = await this.findIdentityByOpenId(openid);

    request.log.info(
      { requestId: request.id, openid, found: Boolean(existingIdentity), authUserId: existingIdentity?.auth_user_id },
      "[auth] query user by openid result",
    );

    if (existingIdentity) {
      return {
        userId: existingIdentity.auth_user_id,
        isNewUser: false,
      };
    }

    request.log.info({ requestId: request.id, openid }, "[auth] create visitor user start");

    const { data, error } = await adminClient.auth.admin.createUser({
      email: `${openid}@wechat.local`,
      password: crypto.randomUUID(),
      email_confirm: true,
      user_metadata: {
        openid,
        unionid: unionid || null,
        source: "wechat_miniprogram",
      },
    });

    if (error) {
      request.log.error(
        { requestId: request.id, openid, error: { message: error.message, status: error.status, name: error.name } },
        "[auth] create visitor user failed",
      );

      const legacyUser = await this.findLegacyAuthUser(openid);
      if (legacyUser) {
        const { error: identityError } = await adminClient.from("wechat_identities").upsert({
          auth_user_id: legacyUser.id,
          openid,
          unionid: unionid || legacyUser.unionid || null,
        });

        if (identityError) {
          throw Errors.dbError("补建微信身份映射失败", identityError);
        }

        request.log.info(
          { requestId: request.id, openid, userId: legacyUser.id },
          "[auth] repaired legacy identity mapping",
        );

        return {
          userId: legacyUser.id,
          isNewUser: false,
        };
      }

      throw Errors.dbError("创建微信用户失败", error);
    }

    if (!data.user) {
      throw Errors.dbError("创建微信用户失败");
    }

    const { error: identityError } = await adminClient.from("wechat_identities").upsert({
      auth_user_id: data.user.id,
      openid,
      unionid: unionid || null,
    });

    if (identityError) {
      throw Errors.dbError("创建微信身份映射失败", identityError);
    }

    request.log.info({ requestId: request.id, openid, userId: data.user.id }, "[auth] create visitor user result");

    return {
      userId: data.user.id,
      isNewUser: true,
    };
  }

  private async findIdentityByOpenId(openid: string) {
    const adminClient = SupabaseDB.getAdminClient();
    const { data, error } = await adminClient
      .from("wechat_identities")
      .select("auth_user_id, openid, unionid")
      .eq("openid", openid)
      .maybeSingle<WechatIdentityRow>();

    if (error) {
      throw Errors.dbError("查询微信用户失败", {
        code: error.code,
        details: error.details,
        hint: error.hint,
        message: error.message,
      });
    }

    return data;
  }

  private async findLegacyAuthUser(openid: string) {
    const adminClient = SupabaseDB.getAdminClient();
    const { data, error } = await adminClient.rpc("find_auth_user_by_openid", {
      p_openid: openid,
    });

    if (error) {
      throw Errors.dbError("查询历史微信用户失败", {
        code: error.code,
        details: error.details,
        hint: error.hint,
        message: error.message,
      });
    }

    const rows = Array.isArray(data) ? (data as LegacyAuthUser[]) : [];
    return rows[0] || null;
  }

  private async getValidVerificationCode(
    phone: string,
    scene: SmsScene,
    code: string,
  ) {
    const adminClient = SupabaseDB.getAdminClient();
    const now = new Date().toISOString();
    const { data, error } = await adminClient
      .from("sms_verification_codes")
      .select("id, phone, scene, code, status, expired_at, verified_at, created_at, request_ip")
      .eq("phone", phone)
      .eq("scene", scene)
      .eq("code", code)
      .eq("status", "pending")
      .gt("expired_at", now)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<SmsVerificationCodeRow>();

    if (error) {
      throw Errors.dbError("查询验证码失败", error);
    }

    return data;
  }

  private async markVerificationCodeVerified(
    adminClient: ReturnType<typeof SupabaseDB.getAdminClient>,
    verificationCodeId: string,
  ) {
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { error } = await adminClient
        .from("sms_verification_codes")
        .update({
          status: "verified",
          verified_at: new Date().toISOString(),
        })
        .eq("id", verificationCodeId);

      if (!error) {
        return;
      }

      lastError = error;
      if (!this.isRetryableSupabaseError(error) || attempt === 2) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }

    throw Errors.dbError("更新验证码状态失败", lastError);
  }

  private isRetryableSupabaseError(error: unknown) {
    if (!error || typeof error !== "object") {
      return false;
    }

    const message = "message" in error && typeof error.message === "string"
      ? error.message
      : "";

    return (
      message.includes("TimeoutError") ||
      message.includes("timed out") ||
      message.includes("fetch failed") ||
      message.includes("network")
    );
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

  private async enrichCustomerTenantOptions(customers: CustomerTenantOption[]) {
    if (customers.length === 0) {
      return [] as CustomerTenantOption[];
    }

    const customerIds = customers.map((item) => item.id);
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("projects")
      .select("id, name, customer_id, created_at")
      .in("customer_id", customerIds)
      .order("created_at", { ascending: false });

    if (error) {
      throw Errors.dbError("查询客户项目概览失败", error);
    }

    const projectMap = new Map<string, {
      count: number;
      latestName: string | null;
    }>();

    for (const project of (data || []) as Array<{
      id: string;
      name: string | null;
      customer_id: string | null;
      created_at: string | null;
    }>) {
      if (!project.customer_id) continue;
      const current = projectMap.get(project.customer_id) ?? {
        count: 0,
        latestName: null,
      };
      current.count += 1;
      if (!current.latestName) {
        current.latestName = project.name ?? null;
      }
      projectMap.set(project.customer_id, current);
    }

    return customers.map((customer) => {
      const summary = projectMap.get(customer.id);
      return {
        ...customer,
        project_count: summary?.count ?? 0,
        latest_project_name: summary?.latestName ?? null,
      };
    });
  }

  private async listCustomerTenantOptionsByPhone(phone: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .select(`
        id,
        name,
        phone,
        user_id,
        tenant_id,
        customer_origin,
        claimed_at,
        tenant:tenants!customers_tenant_id_fkey(
          id,
          name,
          slug,
          status
        )
      `)
      .eq("phone", phone);

    if (error) {
      throw Errors.dbError("查询客户身份失败", error);
    }

    const customers = ((data || []) as unknown as CustomerTenantOption[])
      .filter((item) => {
        const tenant = this.normalizeTenantRelation(item.tenant);
        return item.tenant_id && tenant?.status === "active";
      });

    return this.enrichCustomerTenantOptions(customers);
  }

  private async getCustomerTenantOptionById(customerId: string, tenantId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .select(`
        id,
        name,
        phone,
        user_id,
        tenant_id,
        customer_origin,
        claimed_at,
        tenant:tenants!customers_tenant_id_fkey(
          id,
          name,
          slug,
          status
        )
      `)
      .eq("id", customerId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询客户身份失败", error);
    }

    return (data || null) as unknown as CustomerTenantOption | null;
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
  ) {
    await wechatRebindRequestService.assertCustomerCanBind(authUserId, customer);

    if (customer.user_id === authUserId) {
      return;
    }

    const updatePayload: {
      user_id: string;
      claimed_at?: string;
    } = {
      user_id: authUserId,
    };
    if (!customer.claimed_at) {
      updatePayload.claimed_at = new Date().toISOString();
    }

    const { error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .update(updatePayload)
      .eq("id", customer.id)
      .eq("tenant_id", customer.tenant_id);

    if (error) {
      throw Errors.dbError("绑定客户身份失败", error);
    }

    authorizationService.invalidateAuthContext({
      authUserId,
    });
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
      await this.bindCustomerToAuthUser(authUserId, customer);
      return this.signCustomerSession({
        authUserId,
        openid,
        customer: {
          ...customer,
          user_id: authUserId,
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
    const canSelectByVerifiedPhone = Boolean(
      input.verifiedPhone &&
        customer.phone &&
        input.verifiedPhone === customer.phone,
    );
    if (!canSelectByCurrentBinding && !canSelectByVerifiedPhone) {
      throw Errors.business(403, "当前账号不能选择该装修公司", "FORBIDDEN");
    }

    await this.bindCustomerToAuthUser(input.authUserId, customer);

    return this.signCustomerSession({
      authUserId: input.authUserId,
      openid: input.openid,
      customer: {
        ...customer,
        user_id: input.authUserId,
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
    const adminClient = SupabaseDB.getAdminClient();
    const [{ data, error }, { data: boundCustomers, error: boundError }] = await Promise.all([
      adminClient
        .from("customers")
        .select("id, phone, user_id, customer_origin, claimed_at")
        .eq("phone", phone),
      adminClient
        .from("customers")
        .select("id, phone, user_id")
        .eq("user_id", authUserId)
        .limit(2),
    ]);

    if (error) {
      throw Errors.dbError("查询客户身份失败", error);
    }

    if (boundError) {
      throw Errors.dbError("查询当前账号客户绑定失败", boundError);
    }

    const currentBindings = (boundCustomers || []) as CustomerIdentityRow[];
    if (currentBindings.length > 1) {
      throw Errors.badRequest("当前账号绑定了多个客户档案，请联系管理员处理");
    }
    const currentBinding = currentBindings[0] || null;

    if (!data || data.length === 0) {
      if (!options?.createIfMissing) {
        throw Errors.badRequest("该手机号未绑定客户身份");
      }

      if (currentBinding) {
        throw Errors.badRequest("当前微信已绑定其他客户，请联系工作人员");
      }

      const customerOrigin = options.customerOrigin || "visitor_self_registered";
      if (customerOrigin !== "visitor_self_registered") {
        throw Errors.badRequest("当前客户创建渠道不支持自助注册");
      }

      const now = new Date().toISOString();
      const { error: insertError } = await adminClient
        .from("customers")
        .insert({
          phone,
          name: `客户${phone.slice(-4)}`,
          status: "potential",
          source: null,
          user_id: authUserId,
          customer_origin: "visitor_self_registered",
          self_registered_at: now,
        });

      if (insertError) {
        throw Errors.dbError("自助创建客户失败", insertError);
      }

      return;
    }

    if (data.length > 1) {
      throw Errors.badRequest("该手机号绑定了多个客户档案，请联系管理员处理");
    }

    const customer = data[0] as CustomerIdentityRow | undefined;
    if (!customer) {
      throw Errors.badRequest("该手机号未绑定客户身份");
    }

    if (currentBinding && currentBinding.id !== customer.id) {
      throw Errors.badRequest("当前微信已绑定其他客户，请联系工作人员");
    }

    await wechatRebindRequestService.assertCustomerCanBind(authUserId, customer);

    const updatePayload: {
      user_id: string;
      claimed_at?: string;
    } = {
      user_id: authUserId,
    };
    if (!customer.claimed_at) {
      updatePayload.claimed_at = new Date().toISOString();
    }
    const { error: updateError } = await adminClient
      .from("customers")
      .update(updatePayload)
      .eq("id", customer.id);

    if (updateError) {
      throw Errors.dbError("绑定客户身份失败", updateError);
    }
  }

  private async bindEmployeeRole(authUserId: string, phone: string) {
    const adminClient = SupabaseDB.getAdminClient();
    const { data, error } = await adminClient
      .from("employees")
      .select(`
        id,
        user_id,
        status,
        tenant:tenants!employees_tenant_id_fkey(id, status)
      `)
      .eq("phone", phone);

    if (error) {
      throw Errors.dbError("查询员工身份失败", error);
    }

    if (!data || data.length === 0) {
      throw Errors.badRequest("该手机号未绑定员工身份");
    }

    if (data.length > 1) {
      throw Errors.badRequest("该手机号绑定了多个员工档案，请联系管理员处理");
    }

    const employee = data[0];
    if (!employee) {
      throw Errors.badRequest("该手机号未绑定员工身份");
    }

    await wechatRebindRequestService.assertEmployeeCanBind(authUserId, employee);

    if (!isEmployeeOperableStatus(employee.status)) {
      throw Errors.badRequest("该员工账号已停用，无法登录");
    }

    const tenant = Array.isArray(employee.tenant)
      ? employee.tenant[0]
      : employee.tenant;
    if (!tenant?.id || tenant.status !== "active") {
      throw Errors.badRequest("该员工未绑定可用装修公司，无法登录");
    }

    const { error: cleanupError } = await adminClient
      .from("employees")
      .update({ user_id: null })
      .eq("user_id", authUserId)
      .neq("id", employee.id);

    if (cleanupError) {
      throw Errors.dbError("清理历史员工绑定失败", cleanupError);
    }

    const { error: updateError } = await adminClient
      .from("employees")
      .update({ user_id: authUserId })
      .eq("id", employee.id);

    if (updateError) {
      throw Errors.dbError("绑定员工身份失败", updateError);
    }
  }

  private async getOpenIdByAuthUserId(authUserId: string) {
    const adminClient = SupabaseDB.getAdminClient();
    const { data, error } = await adminClient
      .from("wechat_identities")
      .select("openid")
      .eq("auth_user_id", authUserId)
      .maybeSingle<{ openid: string }>();

    if (error) {
      throw Errors.dbError("查询微信身份失败", error);
    }

    if (!data?.openid) {
      throw Errors.badRequest("当前账号未绑定微信身份");
    }

    return data.openid;
  }

  private generateVerificationCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  private async getUserRoles(userId: string) {
    const adminClient = SupabaseDB.getAdminClient();
    const roles: string[] = [];

    const [{ data: employeeData }, { data: customerData }] = await Promise.all([
      adminClient.from("employees").select("id").eq("user_id", userId).limit(1),
      adminClient.from("customers").select("id").eq("user_id", userId).limit(1),
    ]);

    if ((employeeData || []).length > 0) {
      roles.push("employee");
    }

    if ((customerData || []).length > 0) {
      roles.push("customer");
    }

    if (roles.length === 0) {
      roles.push("visitor");
    }

    return roles;
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
