import { Errors } from "@/errors/error-factory";
import { aiConfigRepository } from "@/repositories/ai-config";
import { platformAuditLogRepository } from "@/repositories/platform-audit-logs";
import type {
  AiModelPayload,
  AiProviderPayload,
  AiSceneRoutePayload,
  UpdateAiModelPayload,
  UpdateAiProviderPayload,
  UpdateAiSceneRoutePayload,
} from "@/schema/ai-config";
import type { AuthContext } from "@/services/authorization";

class AiConfigService {
  private assertPlatformAdmin(authContext: AuthContext) {
    if (!authContext.isPlatformAdmin) {
      throw Errors.forbidden();
    }
  }

  async getConfig(authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);

    const [providers, models, routes] = await Promise.all([
      aiConfigRepository.listProviders(),
      aiConfigRepository.listModels(),
      aiConfigRepository.listSceneRoutes(),
    ]);

    return {
      providers,
      models,
      routes,
    };
  }

  async createProvider(authContext: AuthContext, input: AiProviderPayload) {
    this.assertPlatformAdmin(authContext);
    const record = await aiConfigRepository.createProvider(input);
    await this.audit(authContext, "ai_provider", record.id, record.name, "创建 AI 供应商");
    return record;
  }

  async updateProvider(authContext: AuthContext, id: string, input: UpdateAiProviderPayload) {
    this.assertPlatformAdmin(authContext);
    const record = await aiConfigRepository.updateProvider(id, input);
    await this.audit(authContext, "ai_provider", record.id, record.name, "更新 AI 供应商");
    return record;
  }

  async createModel(authContext: AuthContext, input: AiModelPayload) {
    this.assertPlatformAdmin(authContext);
    const record = await aiConfigRepository.createModel(input);
    await this.audit(authContext, "ai_model", record.id, record.name, "创建 AI 模型");
    return record;
  }

  async updateModel(authContext: AuthContext, id: string, input: UpdateAiModelPayload) {
    this.assertPlatformAdmin(authContext);
    const record = await aiConfigRepository.updateModel(id, input);
    await this.audit(authContext, "ai_model", record.id, record.name, "更新 AI 模型");
    return record;
  }

  async createSceneRoute(authContext: AuthContext, input: AiSceneRoutePayload) {
    this.assertPlatformAdmin(authContext);
    const record = await aiConfigRepository.createSceneRoute(input);
    await this.audit(authContext, "ai_scene_route", record.id, record.name, "创建 AI 场景路由");
    return record;
  }

  async updateSceneRoute(authContext: AuthContext, id: string, input: UpdateAiSceneRoutePayload) {
    this.assertPlatformAdmin(authContext);
    const record = await aiConfigRepository.updateSceneRoute(id, input);
    await this.audit(authContext, "ai_scene_route", record.id, record.name, "更新 AI 场景路由");
    return record;
  }

  private async audit(
    authContext: AuthContext,
    resourceType: string,
    resourceId: string,
    resourceLabel: string | null,
    summary: string,
  ) {
    await platformAuditLogRepository.create({
      action: "platform_config_update",
      actorEmployeeId: authContext.employeeId,
      actorUserId: authContext.authUserId,
      resourceType,
      resourceId,
      resourceLabel,
      summary,
    }).catch(() => null);
  }
}

export const aiConfigService = new AiConfigService();
