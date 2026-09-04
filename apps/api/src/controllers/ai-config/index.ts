import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import {
  AiCatalogEntryListQuerySchema,
  AiCatalogRunListQuerySchema,
  AiConfigListQuerySchema,
  AiConfigIdParamsSchema,
  AiModelCapabilityPayloadSchema,
  AiModelListQuerySchema,
  AiModelPayloadSchema,
  AiProviderPayloadSchema,
  AiRouteModelOptionListQuerySchema,
  AiRouteModelOptionResolvePayloadSchema,
  AiSceneRouteListQuerySchema,
  AiSceneRoutePayloadSchema,
  OpenRouterCatalogApplyPayloadSchema,
  OpenRouterCatalogPreviewPayloadSchema,
  OpenRouterProviderQuerySchema,
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
    const authContext = await this.getAiConfigReadContext(request);
    const data = await aiConfigService.getConfig(authContext);
    return ResponseHandler.success(data);
  }

  @Get("/platform/ai-config/providers")
  async listProviders(request: FastifyRequest, reply: FastifyReply) {
    const queryResult = AiConfigListQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);
    const authContext = await this.getAiConfigReadContext(request);
    const data = await aiConfigService.listProviders(authContext, queryResult.data);
    return ResponseHandler.success(data);
  }

  @Get("/platform/ai-config/models")
  async listModels(request: FastifyRequest, reply: FastifyReply) {
    const queryResult = AiModelListQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);
    const authContext = await this.getAiConfigReadContext(request);
    const data = await aiConfigService.listModels(authContext, queryResult.data);
    return ResponseHandler.success(data);
  }

  @Get("/platform/ai-config/routes")
  async listSceneRoutes(request: FastifyRequest, reply: FastifyReply) {
    const queryResult = AiSceneRouteListQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);
    const authContext = await this.getAiConfigReadContext(request);
    const data = await aiConfigService.listSceneRoutes(authContext, queryResult.data);
    return ResponseHandler.success(data);
  }

  @Get("/platform/ai-config/providers/:id/route-model-options")
  async listRouteModelOptions(request: FastifyRequest, reply: FastifyReply) {
    const paramsResult = AiConfigIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const queryResult = AiRouteModelOptionListQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);
    const authContext = await this.getAiConfigReadContext(request);
    const data = await aiConfigService.listRouteModelOptions(
      authContext,
      paramsResult.data.id,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/ai-config/providers/:id/route-model-options:resolve")
  async resolveRouteModelOption(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getAiConfigManageContext(request);
    const paramsResult = AiConfigIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = AiRouteModelOptionResolvePayloadSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);
    const data = await aiConfigService.resolveRouteModelOption(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/platform/ai-config/catalog-runs")
  async listCatalogRuns(request: FastifyRequest, reply: FastifyReply) {
    const queryResult = AiCatalogRunListQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);
    const authContext = await this.getAiConfigReadContext(request);
    const data = await aiConfigService.listCatalogRuns(authContext, queryResult.data);
    return ResponseHandler.success(data);
  }

  @Get("/platform/ai-config/catalog-runs/:id/entries")
  async listCatalogEntries(request: FastifyRequest, reply: FastifyReply) {
    const paramsResult = AiConfigIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const queryResult = AiCatalogEntryListQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);
    const authContext = await this.getAiConfigReadContext(request);
    const data = await aiConfigService.listCatalogEntries(
      authContext,
      paramsResult.data.id,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/ai-config/providers")
  async createProvider(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getAiConfigManageContext(request);
    const bodyResult = AiProviderPayloadSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await aiConfigService.createProvider(authContext, bodyResult.data);
    return ResponseHandler.success(data);
  }

  @Patch("/platform/ai-config/providers/:id")
  async updateProvider(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getAiConfigManageContext(request);
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
    const authContext = await this.getAiConfigManageContext(request);
    const bodyResult = AiModelPayloadSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await aiConfigService.createModel(authContext, bodyResult.data);
    return ResponseHandler.success(data);
  }

  @Patch("/platform/ai-config/models/:id")
  async updateModel(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getAiConfigManageContext(request);
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

  @Patch("/platform/ai-config/models/:id/capability")
  async updateModelCapability(request: FastifyRequest, reply: FastifyReply) {
    const paramsResult = AiConfigIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = AiModelCapabilityPayloadSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);
    const authContext = await this.getAiConfigManageContext(request);
    const data = await aiConfigService.updateModelCapability(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/ai-config/routes")
  async createSceneRoute(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getAiConfigManageContext(request);
    const bodyResult = AiSceneRoutePayloadSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await aiConfigService.createSceneRoute(authContext, bodyResult.data);
    return ResponseHandler.success(data);
  }

  @Patch("/platform/ai-config/routes/:id")
  async updateSceneRoute(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getAiConfigManageContext(request);
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

  @Post("/platform/ai-config/openrouter/models/sync-preview")
  async createOpenRouterPreview(request: FastifyRequest, reply: FastifyReply) {
    const bodyResult = OpenRouterCatalogPreviewPayloadSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);
    const authContext = await this.getAiConfigManageContext(request);
    const data = await aiConfigService.createOpenRouterPreview(authContext, bodyResult.data);
    return ResponseHandler.success(data);
  }

  @Post("/platform/ai-config/openrouter/models/apply")
  async applyOpenRouterCatalog(request: FastifyRequest, reply: FastifyReply) {
    const bodyResult = OpenRouterCatalogApplyPayloadSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);
    const authContext = await this.getAiConfigManageContext(request);
    const data = await aiConfigService.applyOpenRouterCatalog(authContext, bodyResult.data);
    return ResponseHandler.success(data);
  }

  @Get("/platform/ai-config/openrouter/credits")
  async getOpenRouterCredits(request: FastifyRequest, reply: FastifyReply) {
    const queryResult = OpenRouterProviderQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);
    const authContext = await this.getAiConfigReadContext(request);
    const data = await aiConfigService.getOpenRouterCredits(authContext, queryResult.data);
    return ResponseHandler.success(data);
  }

  @Get("/platform/ai-config/usage-summary")
  async getUsageSummary(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getAiConfigReadContext(request);
    const data = await aiConfigService.getUsageSummary(authContext);
    return ResponseHandler.success(data);
  }

  private getAiConfigReadContext(request: FastifyRequest) {
    return this.getRequiredPlatformPermissionContext(request, "platform.ai_config.read");
  }

  private getAiConfigManageContext(request: FastifyRequest) {
    return this.getRequiredPlatformPermissionContext(request, "platform.ai_config.manage");
  }
}

export default new AiConfigController();
