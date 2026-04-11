import type { FastifyReply, FastifyRequest } from "fastify";
import { SupabaseDB } from "@/utils/supabase";
import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import { Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import { z } from "zod";
import { signToken } from "@/utils/jwt";

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
  user_metadata?: {
    openid?: string;
    unionid?: string | null;
  } | null;
};

const WeChatAuthBodySchema = z.object({
  code: z.string().trim().min(1, "缺少 code"),
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

  // 这里必须保留注释：微信 code 只能短时且单次使用，接口失败原因需要在服务端集中兜底，前端才能稳定触发静默重登。
  private async getWeChatSession(code: string) {
    const appId = process.env.WECHAT_APPID;
    const secret = process.env.WECHAT_SECRET;

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
          unionid: unionid || legacyUser.user_metadata?.unionid || null,
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
    const targetEmail = `${openid}@wechat.local`;
    let page = 1;
    const perPage = 200;

    while (true) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });

      if (error) {
        throw Errors.dbError("查询历史微信用户失败", {
          status: error.status,
          name: error.name,
          message: error.message,
        });
      }

      const matchedUser = (data.users as LegacyAuthUser[]).find((user) => {
        return user.email === targetEmail || user.user_metadata?.openid === openid;
      });

      if (matchedUser) {
        return matchedUser;
      }

      if (data.users.length < perPage) {
        return null;
      }

      page += 1;
    }
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
