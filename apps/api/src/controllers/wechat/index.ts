import type { FastifyInstance } from "fastify";
import { BaseController } from "@/controllers/BaseController";
import legacyWeChatController from "@/services/wechat-auth-legacy-controller";

class WeChatController extends BaseController {
  constructor() {
    super("wechat");
  }

  public override registerExtraRoutes = (fastify: FastifyInstance) => {
    legacyWeChatController.registerExtraRoutes(fastify);
  };
}

export default new WeChatController();
