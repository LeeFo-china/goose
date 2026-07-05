import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import {
  PlatformPaymentProfileCodeSchema,
  UpdatePlatformWechatPayConfigSchema,
  UpdatePlatformWechatPaySecretBundleSchema,
} from "@/schema/platform-payment-configs";
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

  @Get("/platform/payment/wechat-pay/profiles")
  async listWechatPayProfiles(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const data = await platformPaymentConfigService.listWechatPayProfiles(
      authContext,
    );
    return ResponseHandler.success(data);
  }

  @Get("/platform/payment/wechat-pay/profiles/:profileCode/config")
  async getWechatPayProfileConfig(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const profileCode = this.parseProfileCode(request);
    const data = await platformPaymentConfigService.getWechatPayProfileConfig(
      authContext,
      profileCode,
    );
    return ResponseHandler.success(data);
  }

  @Put("/platform/payment/wechat-pay/profiles/:profileCode/config")
  async updateWechatPayProfileConfig(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const profileCode = this.parseProfileCode(request);
    const bodyResult = UpdatePlatformWechatPayConfigSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformPaymentConfigService.saveWechatPayProfile(
      authContext,
      profileCode,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Put("/platform/payment/wechat-pay/profiles/:profileCode/secret-bundle")
  async updateWechatPayProfileSecretBundle(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const profileCode = this.parseProfileCode(request);
    const bodyResult = UpdatePlatformWechatPaySecretBundleSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformPaymentConfigService.saveWechatPaySecretBundle(
      authContext,
      profileCode,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  private parseProfileCode(request: FastifyRequest) {
    const params = request.params as { profileCode?: unknown };
    const result = PlatformPaymentProfileCodeSchema.safeParse(
      params.profileCode,
    );
    if (!result.success) throw Errors.fromZod(result.error);
    return result.data;
  }
}

export default new PlatformPaymentConfigsController();
