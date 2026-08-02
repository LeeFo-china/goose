import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import {
  BrandingAddonEmptySchema,
  BrandingVirtualProductEnvironmentParamsSchema,
} from "@/schema/branding-addon";
import {
  PlatformWechatVirtualProductValidationSchema,
  PlatformPaymentProfileCodeSchema,
  UpdatePlatformWechatVirtualMessageTokenSchema,
  UpdatePlatformWechatVirtualSecretBundleSchema,
  UpdatePlatformWechatVirtualSettingsSchema,
  UpdatePlatformWechatPayConfigSchema,
  UpdatePlatformWechatPaySecretBundleSchema,
} from "@/schema/platform-payment-configs";
import {
  platformBrandingVirtualPaymentSecretService,
} from "@/services/platform-branding-virtual-payment-secrets";
import {
  platformBrandingVirtualPaymentSettingsService,
} from "@/services/platform-branding-virtual-payment-settings";
import { platformPaymentConfigService } from "@/services/platform-payment-configs";
import { Get, Patch, Post, Put } from "@/utils/decorators/route";
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

  @Get("/platform/payment/wechat-pay/readiness")
  async getWechatPayReadiness(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const data = await platformPaymentConfigService.getWechatPayReadiness(
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

  @Post("/platform/payment/wechat-pay/profiles/:profileCode/validate")
  async validateWechatPayProfile(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const profileCode = this.parseProfileCode(request);
    const data = await platformPaymentConfigService.validateWechatPayProfile(
      authContext,
      profileCode,
    );
    return ResponseHandler.success(data);
  }

  @Get("/platform/payment/wechat-virtual/branding-entitlement")
  async getBrandingVirtualPaymentSettings(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    this.parseEmptyQuery(request);
    const data = await platformBrandingVirtualPaymentSettingsService.get(
      authContext,
    );
    return ResponseHandler.success(data);
  }

  @Patch("/platform/payment/wechat-virtual/branding-entitlement")
  async updateBrandingVirtualPaymentSettings(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    this.parseEmptyQuery(request);
    const bodyResult = UpdatePlatformWechatVirtualSettingsSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);
    const data = await platformBrandingVirtualPaymentSettingsService.update(
      authContext,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Put(
    "/platform/payment/wechat-virtual/branding-entitlement/:environment/secret-bundle",
  )
  async updateBrandingVirtualPaymentSecretBundle(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    this.parseEmptyQuery(request);
    const environment = this.parseVirtualEnvironment(request);
    const bodyResult = UpdatePlatformWechatVirtualSecretBundleSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);
    const data = await platformBrandingVirtualPaymentSecretService
      .saveSecretBundle(authContext, environment, bodyResult.data);
    return ResponseHandler.success(data);
  }

  @Put("/platform/payment/wechat-virtual/message-token")
  async updateBrandingVirtualPaymentMessageToken(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    this.parseEmptyQuery(request);
    const bodyResult = UpdatePlatformWechatVirtualMessageTokenSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);
    const data = await platformBrandingVirtualPaymentSecretService
      .saveMessageToken(authContext, bodyResult.data);
    return ResponseHandler.success(data);
  }

  @Post(
    "/platform/payment/wechat-virtual/branding-entitlement/:environment/validate",
  )
  async validateBrandingVirtualPaymentSettings(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    this.parseEmptyQuery(request);
    const environment = this.parseVirtualEnvironment(request);
    const bodyResult = PlatformWechatVirtualProductValidationSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);
    const data = await platformBrandingVirtualPaymentSettingsService.validate(
      authContext,
      environment,
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

  private parseEmptyQuery(request: FastifyRequest): void {
    const result = BrandingAddonEmptySchema.safeParse(request.query ?? {});
    if (!result.success) throw Errors.fromZod(result.error);
  }

  private parseVirtualEnvironment(request: FastifyRequest) {
    const result = BrandingVirtualProductEnvironmentParamsSchema.safeParse(
      request.params ?? {},
    );
    if (!result.success) throw Errors.fromZod(result.error);
    return result.data.environment;
  }
}

export default new PlatformPaymentConfigsController();
