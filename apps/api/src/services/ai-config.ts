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
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

const READ_PERMISSION = "platform.ai_config.read";
const MANAGE_PERMISSION = "platform.ai_config.manage";

class AiConfigService {
  async getConfig(authContext: AuthContext) {
    this.assertPlatformPermission(authContext, READ_PERMISSION);

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
