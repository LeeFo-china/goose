import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import { UpdateWechatPayConfigSchema } from "@/schema/wechat-pay-configs";
import { wechatPayConfigService } from "@/services/wechat-pay-configs";
import { Get, Put, registerRoutes } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

class FinanceWechatPayController extends TenantBaseController {
  constructor() {
    super("finance-wechat-pay");
  }

  public override registerExtraRoutes = (fastify: FastifyInstance) => {
    registerRoutes(fastify, this);
  };

  @Get("/finance/wechat-pay/config")
  async getWechatPayConfig(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);

    const data = await wechatPayConfigService.getConfig(authContext);
    return ResponseHandler.success(data);
  }

  @Put("/finance/wechat-pay/config")
  async saveWechatPayConfig(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const bodyResult = UpdateWechatPayConfigSchema.safeParse(request.body || {});
    if (!bodyResult.success) {
      throw Errors.fromZod(bodyResult.error);
    }

    const data = await wechatPayConfigService.saveConfig(
      authContext,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }
}

export default new FinanceWechatPayController();
