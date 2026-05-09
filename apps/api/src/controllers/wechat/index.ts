import type { FastifyReply, FastifyRequest } from "fastify";
import { SupabaseDB } from "@/utils/supabase";
import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import { Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import { z } from "zod";
import { signToken } from "@/utils/jwt";
import { SendCodeSchema, VerifyRoleSchema } from "@/schema/wechat";
import { sendSmsCode } from "@/services/sms";
import { authorizationService } from "@/services/authorization";
import { marketingPageService } from "@/services/marketing-pages";
import { systemSettingsService } from "@/services/system-settings";
import { MarketingPageSlugSchema, TenantSlugSchema } from "@/schema/marketing-pages";
import type {
  AuthTargetRole,
  SmsScene,
  SmsVerificationStatus,
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
  phone: string | null;
  user_id: string | null;
  customer_origin?: string | null;
  claimed_at?: string | null;
};

const WeChatAuthBodySchema = z.object({
  code: z.string().trim().min(1, "缺少 code"),
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
    const token = signToken({
      sub: userId,
      openid: wxData.openid,
      roles,
    });
    request.log.info({ requestId: request.id, userId }, "[auth] sign jwt result");

    return ResponseHandler.success({
      token,
      user_id: userId,
      roles,
      is_new_user: isNewUser,
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

    const verificationRecord = await this.getValidVerificationCode(phone, scene, code);
    if (!verificationRecord) {
      throw Errors.badRequest("验证码错误或已过期");
    }

    if (target_role === "customer") {
      await this.bindCustomerRole(request.user.sub, phone, {
        createIfMissing: bodyResult.data.create_customer_if_missing,
        customerOrigin: bodyResult.data.customer_origin,
      });
    } else {
      await this.bindEmployeeRole(request.user.sub, phone);
    }

    authorizationService.invalidateAuthContext({
      authUserId: request.user.sub,
    });

    const { error: verifyError } = await adminClient
      .from("sms_verification_codes")
      .update({
        status: "verified",
        verified_at: new Date().toISOString(),
      })
      .eq("id", verificationRecord.id);

    if (verifyError) {
      throw Errors.dbError("更新验证码状态失败", verifyError);
    }

    const openid = await this.getOpenIdByAuthUserId(request.user.sub);
    const roles = await this.getUserRoles(request.user.sub);
    const token = signToken({
      sub: request.user.sub,
      openid,
      roles,
    });

    return ResponseHandler.success({
      token,
      user_id: request.user.sub,
      roles,
      is_new_user: false,
    }, "身份验证成功");
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

    if (customer.user_id && customer.user_id !== authUserId) {
      throw Errors.badRequest("该客户档案已绑定其他账号");
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
      .select("id, user_id")
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

    if (employee.user_id && employee.user_id !== authUserId) {
      throw Errors.badRequest("该员工档案已绑定其他账号");
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
