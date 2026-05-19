import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import {
  AiConfigIdParamsSchema,
  AiModelPayloadSchema,
  AiProviderPayloadSchema,
  AiSceneRoutePayloadSchema,
  UpdateAiModelPayloadSchema,
  UpdateAiProviderPayloadSchema,
  UpdateAiSceneRoutePayloadSchema,
} from "@/schema/ai-config";
import { aiConfigService } from "@/services/ai-config";
import { Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class AiConfigController extends PlatformBaseController {
  constructor() {
    super("ai_config");
  }

  @Get("/platform/ai-config")
  async getConfig(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const data = await aiConfigService.getConfig(authContext);
    return ResponseHandler.success(data);
  }

  @Post("/platform/ai-config/providers")
  async createProvider(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const bodyResult = AiProviderPayloadSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await aiConfigService.createProvider(authContext, bodyResult.data);
    return ResponseHandler.success(data);
  }

  @Patch("/platform/ai-config/providers/:id")
  async updateProvider(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = AiConfigIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = UpdateAiProviderPayloadSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await aiConfigService.updateProvider(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/ai-config/models")
  async createModel(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const bodyResult = AiModelPayloadSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await aiConfigService.createModel(authContext, bodyResult.data);
    return ResponseHandler.success(data);
  }

  @Patch("/platform/ai-config/models/:id")
  async updateModel(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = AiConfigIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = UpdateAiModelPayloadSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await aiConfigService.updateModel(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/ai-config/routes")
  async createSceneRoute(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const bodyResult = AiSceneRoutePayloadSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await aiConfigService.createSceneRoute(authContext, bodyResult.data);
    return ResponseHandler.success(data);
  }

  @Patch("/platform/ai-config/routes/:id")
  async updateSceneRoute(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);
    const paramsResult = AiConfigIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = UpdateAiSceneRoutePayloadSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await aiConfigService.updateSceneRoute(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }
}

export default new AiConfigController();
