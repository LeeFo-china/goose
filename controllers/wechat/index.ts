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

  /**
   * 核心方法：Code 换取 OpenID
   */
  @Post("/auth/openid")
  async getOpenId(
    request: FastifyRequest<{ Body: { code?: string } }>,
    reply: FastifyReply,
  ) {
    const { code } = request.body ?? {};

    if (!code) {
      throw Errors.badRequest("缺少 code");
    }

    const { data, error } = await SupabaseDB.getClient().functions.invoke(
      "wechat-login",
      {
        body: { code },
      },
    );

    if (error) {
      throw Errors.dbError("调用 wechat-login 失败", error);
    }

    if (data?.error) {
      throw Errors.badRequest("获取 openid 失败");
    }
    return ResponseHandler.success(data);
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
