import type { FastifyReply, FastifyRequest } from "fastify";
import { SupabaseDB } from "@/utils/supabase";
import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import { Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";

export class WeChatController extends BaseController {
  constructor() {
    super("wechat");
  }

  @Post("/auth")
  async getOpenId(
    request: FastifyRequest<
      { Body: { code?: string; login_type?: "employee" | "customer" } }
    >,
    reply: FastifyReply,
  ) {
    const { code, login_type } = request.body ?? {};

    if (!code) {
      throw Errors.badRequest("缺少 code");
    }

    const appId = process.env.WECHAT_APPID;
    const secret = process.env.WECHAT_SECRET;

    if (!appId || !secret) {
      throw Errors.badRequest("服务器未配置微信参数");
    }

    const wxResponse = await fetch(
      `https://api.weixin.qq.com/sns/jscode2session?appid=${appId}&secret=${secret}&js_code=${code}&grant_type=authorization_code`,
    );

    const wxData = await wxResponse.json() as any;

    if (wxData.errcode) {
      throw Errors.badRequest(`微信接口错误: ${wxData.errmsg}`);
    }

    const openid = wxData.openid;
    const adminClient = SupabaseDB.getAdminClient();

    const email = `${openid}@wechat.local`;
    const password = `${openid}#${secret.substring(0, 8)}`;

    let authUser;
    let authSession;

    const { data: signInData, error: signInError } = await adminClient.auth
      .signInWithPassword({
        email,
        password,
      });

    if (signInError) {
      const { data: signUpData, error: signUpError } = await adminClient.auth
        .admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { openid },
        });

      if (signUpError) {
        throw Errors.dbError("创建用户失败", signUpError);
      }

      const { data: newSignInData, error: newSignInError } = await adminClient
        .auth.signInWithPassword({
          email,
          password,
        });

      if (newSignInError) {
        throw Errors.dbError("自动登录失败", newSignInError);
      }

      authUser = newSignInData.user;
      authSession = newSignInData.session;
    } else {
      authUser = signInData.user;
      authSession = signInData.session;
    }

    let businessRole = null;

    if (login_type === "employee") {
      const { data: empData } = await adminClient
        .from("employees")
        .select("*")
        .eq("user_id", authUser?.id)
        .single();

      if (!empData) {
        throw Errors.badRequest("未绑定员工账号，请联系管理员");
      }
      businessRole = empData;
    } else if (login_type === "customer") {
      const { data: custData } = await adminClient
        .from("customers")
        .select("*")
        .eq("user_id", authUser?.id)
        .single();

      if (!custData) {
        const { data: newCustData, error: custError } = await adminClient
          .from("customers")
          .insert({ user_id: authUser?.id })
          .select()
          .single();

        if (custError) {
          throw Errors.dbError("创建客户档案失败", custError);
        }
        businessRole = newCustData;
      } else {
        businessRole = custData;
      }
    }

    return ResponseHandler.success({
      session: authSession,
      user: authUser,
      role_info: businessRole,
      login_type: login_type || "visitor",
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
