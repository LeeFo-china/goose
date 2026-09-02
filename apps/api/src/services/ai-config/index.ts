import { Errors } from "@/errors/error-factory";
import { aiConfigRepository } from "@/repositories/ai-config";
import { aiModelCatalogRepository } from "@/repositories/ai-model-catalog";
import { platformAuditLogRepository } from "@/repositories/platform-audit-logs";
import type {
  AiCatalogEntryListQuery,
  AiCatalogRunListQuery,
  AiConfigListQuery,
  AiModelCapabilityPayload,
  AiModelListQuery,
  AiModelPayload,
  AiProviderPayload,
  AiSceneRouteListQuery,
  AiSceneRoutePayload,
  OpenRouterCatalogApplyPayload,
  OpenRouterCatalogPreviewPayload,
  OpenRouterProviderQuery,
  UpdateAiModelPayload,
  UpdateAiProviderPayload,
  UpdateAiSceneRoutePayload,
} from "@/schema/ai-config";
import { openRouterModelSyncService } from "@/services/ai-config/openrouter-model-sync";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

const READ_PERMISSION = "platform.ai_config.read";
const MANAGE_PERMISSION = "platform.ai_config.manage";

class AiConfigService {
  async getConfig(authContext: AuthContext) {
    this.assertPlatformPermission(authContext, READ_PERMISSION);

    const [counts, usageSummary] = await Promise.all([
      aiModelCatalogRepository.getCounts(),
      aiModelCatalogRepository.getOpenRouterUsageSummary(),
    ]);

    return {
      counts,
      credits: null,
      usage_summary: usageSummary,
    };
  }

  async listProviders(authContext: AuthContext, query: AiConfigListQuery) {
    this.assertPlatformPermission(authContext, READ_PERMISSION);
    return aiModelCatalogRepository.listProviders(query);
  }

  async listModels(authContext: AuthContext, query: AiModelListQuery) {
    this.assertPlatformPermission(authContext, READ_PERMISSION);
    return aiModelCatalogRepository.listModels(query);
  }

  async listSceneRoutes(authContext: AuthContext, query: AiSceneRouteListQuery) {
    this.assertPlatformPermission(authContext, READ_PERMISSION);
    return aiModelCatalogRepository.listSceneRoutes(query);
  }

  async listCatalogRuns(authContext: AuthContext, query: AiCatalogRunListQuery) {
    this.assertPlatformPermission(authContext, READ_PERMISSION);
    return aiModelCatalogRepository.listCatalogRuns(query);
  }

  async listCatalogEntries(authContext: AuthContext, runId: string, query: AiCatalogEntryListQuery) {
    this.assertPlatformPermission(authContext, READ_PERMISSION);
    return aiModelCatalogRepository.listCatalogEntries(runId, query);
  }

  async createOpenRouterPreview(authContext: AuthContext, input: OpenRouterCatalogPreviewPayload) {
    return openRouterModelSyncService.createPreview(authContext, input);
  }

  async applyOpenRouterCatalog(authContext: AuthContext, input: OpenRouterCatalogApplyPayload) {
    return openRouterModelSyncService.applyCatalog(authContext, input);
  }

  async updateModelCapability(authContext: AuthContext, id: string, input: AiModelCapabilityPayload) {
    const record = await openRouterModelSyncService.saveCapability(authContext, id, input);
    await this.audit(authContext, "ai_model", id, null, "更新 AI 模型能力");
    return record;
  }

  async getOpenRouterCredits(authContext: AuthContext, input: OpenRouterProviderQuery) {
    return openRouterModelSyncService.getCredits(authContext, input);
  }

  async getUsageSummary(authContext: AuthContext) {
    return openRouterModelSyncService.getUsageSummary(authContext);
  }

  async createProvider(authContext: AuthContext, input: AiProviderPayload) {
    this.assertPlatformPermission(authContext, MANAGE_PERMISSION);
    const record = await aiConfigRepository.createProvider(input);
    await this.audit(authContext, "ai_provider", record.id, record.name, "创建 AI 供应商");
    return record;
  }

  async updateProvider(authContext: AuthContext, id: string, input: UpdateAiProviderPayload) {
    this.assertPlatformPermission(authContext, MANAGE_PERMISSION);
    const record = await aiConfigRepository.updateProvider(id, input);
    await this.audit(authContext, "ai_provider", record.id, record.name, "更新 AI 供应商");
    return record;
  }

  async createModel(authContext: AuthContext, input: AiModelPayload) {
    this.assertPlatformPermission(authContext, MANAGE_PERMISSION);
    const record = await aiConfigRepository.createModel(input);
    await this.audit(authContext, "ai_model", record.id, record.name, "创建 AI 模型");
    return record;
  }

  async updateModel(authContext: AuthContext, id: string, input: UpdateAiModelPayload) {
    this.assertPlatformPermission(authContext, MANAGE_PERMISSION);
    const record = await aiConfigRepository.updateModel(id, input);
    await this.audit(authContext, "ai_model", record.id, record.name, "更新 AI 模型");
    return record;
  }

  async createSceneRoute(authContext: AuthContext, input: AiSceneRoutePayload) {
    this.assertPlatformPermission(authContext, MANAGE_PERMISSION);
    const record = await aiConfigRepository.createSceneRoute(input);
    await this.audit(authContext, "ai_scene_route", record.id, record.name, "创建 AI 场景路由");
    return record;
  }

  async updateSceneRoute(authContext: AuthContext, id: string, input: UpdateAiSceneRoutePayload) {
    this.assertPlatformPermission(authContext, MANAGE_PERMISSION);
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

  private assertPlatformPermission(authContext: AuthContext, permission: string) {
    const isPlatformIdentity =
      authContext.isPlatformStaff || authContext.isPlatformAdmin;
    if (authContext.tenantId !== null || !isPlatformIdentity) {
      throw Errors.forbidden();
    }
    accessPolicyService.assertPermission(authContext, permission);
  }
}

export const aiConfigService = new AiConfigService();
