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

    const wxData = await this.getWeChatSession(bodyResult.data.code);
    if (!wxData.openid) {
      throw Errors.badRequest("微信登录失败，未获取到 openid");
    }

    const { user: authUser, isNewUser } = await this.getOrCreateAuthUser(
      wxData.openid,
      wxData.unionid,
    );
    const roles = await this.getUserRoles(authUser.id);
    const token = signToken({
      sub: authUser.id,
      openid: wxData.openid,
      roles,
    });

    return ResponseHandler.success({
      token,
      user_id: authUser.id,
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

  private async getOrCreateAuthUser(openid: string, unionid?: string) {
    const adminClient = SupabaseDB.getAdminClient();
    const existingUser = await this.findAuthUserByOpenId(openid);

    if (existingUser) {
      return {
        user: existingUser,
        isNewUser: false,
      };
    }

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

    if (error || !data.user) {
      throw Errors.dbError("创建微信用户失败", error);
    }

    return {
      user: data.user,
      isNewUser: true,
    };
  }

  private async findAuthUserByOpenId(openid: string) {
    const adminClient = SupabaseDB.getAdminClient();
    let page = 1;
    const perPage = 200;

    while (true) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
      if (error) {
        throw Errors.dbError("查询微信用户失败", error);
      }

      const matchedUser = data.users.find((user) => user.user_metadata?.openid === openid);
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
