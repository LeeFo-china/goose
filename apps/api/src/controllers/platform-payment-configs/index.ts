import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import { UpdatePlatformWechatPayConfigSchema } from "@/schema/platform-payment-configs";
import { platformPaymentConfigService } from "@/services/platform-payment-configs";
import { Get, Put } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class PlatformPaymentConfigsController extends PlatformBaseController {
  constructor() {
    super("platform-payment-configs");
  }

  @Get("/platform/payment/wechat-pay/config")
  async getWechatPayConfig(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const data = await platformPaymentConfigService.getWechatPayConfig(
      authContext,
    );
    return ResponseHandler.success(data);
  }

  @Put("/platform/payment/wechat-pay/config")
  async updateWechatPayConfig(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const bodyResult = UpdatePlatformWechatPayConfigSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformPaymentConfigService.saveWechatPayConfig(
      authContext,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }
}

export default new PlatformPaymentConfigsController();
