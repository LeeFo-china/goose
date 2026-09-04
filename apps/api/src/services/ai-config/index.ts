import { Errors } from "@/errors/error-factory";
import {
  aiConfigRepository,
  type AiModelRecord,
  type AiProviderRecord,
} from "@/repositories/ai-config";
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
  AiRouteModelOptionListQuery,
  AiRouteModelOptionResolvePayload,
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

type ConfigRepositoryPort = Pick<typeof aiConfigRepository,
  | "createManualModel"
  | "createModel"
  | "createProvider"
  | "createSceneRoute"
  | "findModelByProviderAndCallName"
  | "getModelById"
  | "getProviderById"
  | "listRouteModels"
  | "updateModel"
  | "updateProvider"
  | "updateSceneRoute"
>;

type CatalogRepositoryPort = Pick<typeof aiModelCatalogRepository,
  | "applyOpenRouterCatalog"
  | "getCatalogRouteModelEntry"
  | "getCounts"
  | "getOpenRouterUsageSummary"
  | "listCatalogEntries"
  | "listCatalogRuns"
  | "listLatestEligibleCatalogRouteOptions"
  | "listModels"
  | "listProviders"
  | "listSceneRoutes"
>;

type OpenRouterSyncServicePort = Pick<typeof openRouterModelSyncService,
  | "applyCatalog"
  | "createPreview"
  | "getCredits"
  | "getUsageSummary"
  | "saveCapability"
>;

type AuditRepositoryPort = Pick<typeof platformAuditLogRepository, "create">;

type AiConfigServiceDependencies = {
  configRepository?: Partial<ConfigRepositoryPort>;
  catalogRepository?: Partial<CatalogRepositoryPort>;
  openRouterSyncService?: OpenRouterSyncServicePort;
  auditRepository?: AuditRepositoryPort;
};

export class AiConfigService {
  private readonly configRepository: Partial<ConfigRepositoryPort>;
  private readonly catalogRepository: Partial<CatalogRepositoryPort>;
  private readonly openRouterSyncService: OpenRouterSyncServicePort;
  private readonly auditRepository: AuditRepositoryPort;

  constructor(dependencies: AiConfigServiceDependencies = {}) {
    this.configRepository = dependencies.configRepository ?? aiConfigRepository;
    this.catalogRepository = dependencies.catalogRepository ?? aiModelCatalogRepository;
    this.openRouterSyncService = dependencies.openRouterSyncService ?? openRouterModelSyncService;
    this.auditRepository = dependencies.auditRepository ?? platformAuditLogRepository;
  }

  async getConfig(authContext: AuthContext) {
    this.assertPlatformPermission(authContext, READ_PERMISSION);

    const [counts, usageSummary] = await Promise.all([
      this.requireCatalogRepository("getCounts").call(this.catalogRepository),
      this.requireCatalogRepository("getOpenRouterUsageSummary").call(this.catalogRepository),
    ]);

    return {
      counts,
      credits: null,
      usage_summary: usageSummary,
    };
  }

  async listProviders(authContext: AuthContext, query: AiConfigListQuery) {
    this.assertPlatformPermission(authContext, READ_PERMISSION);
    return this.requireCatalogRepository("listProviders").call(this.catalogRepository, query);
  }

  async listModels(authContext: AuthContext, query: AiModelListQuery) {
    this.assertPlatformPermission(authContext, READ_PERMISSION);
    return this.requireCatalogRepository("listModels").call(this.catalogRepository, query);
  }

  async listSceneRoutes(authContext: AuthContext, query: AiSceneRouteListQuery) {
    this.assertPlatformPermission(authContext, READ_PERMISSION);
    return this.requireCatalogRepository("listSceneRoutes").call(this.catalogRepository, query);
  }

  async listCatalogRuns(authContext: AuthContext, query: AiCatalogRunListQuery) {
    this.assertPlatformPermission(authContext, READ_PERMISSION);
    return this.requireCatalogRepository("listCatalogRuns").call(this.catalogRepository, query);
  }

  async listCatalogEntries(authContext: AuthContext, runId: string, query: AiCatalogEntryListQuery) {
    this.assertPlatformPermission(authContext, READ_PERMISSION);
    return this.requireCatalogRepository("listCatalogEntries").call(this.catalogRepository, runId, query);
  }

  async createOpenRouterPreview(authContext: AuthContext, input: OpenRouterCatalogPreviewPayload) {
    return this.openRouterSyncService.createPreview(authContext, input);
  }

  async applyOpenRouterCatalog(authContext: AuthContext, input: OpenRouterCatalogApplyPayload) {
    return this.openRouterSyncService.applyCatalog(authContext, input);
  }

  async updateModelCapability(authContext: AuthContext, id: string, input: AiModelCapabilityPayload) {
    const record = await this.openRouterSyncService.saveCapability(authContext, id, input);
    await this.audit(authContext, "ai_model", id, null, "更新 AI 模型能力");
    return record;
  }

  async getOpenRouterCredits(authContext: AuthContext, input: OpenRouterProviderQuery) {
    return this.openRouterSyncService.getCredits(authContext, input);
  }

  async getUsageSummary(authContext: AuthContext) {
    return this.openRouterSyncService.getUsageSummary(authContext);
  }

  async createProvider(authContext: AuthContext, input: AiProviderPayload) {
    this.assertPlatformPermission(authContext, MANAGE_PERMISSION);
    const record = await this.requireConfigRepository("createProvider").call(this.configRepository, input);
    await this.audit(authContext, "ai_provider", record.id, record.name, "创建 AI 供应商");
    return record;
  }

  async updateProvider(authContext: AuthContext, id: string, input: UpdateAiProviderPayload) {
    this.assertPlatformPermission(authContext, MANAGE_PERMISSION);
    const record = await this.requireConfigRepository("updateProvider").call(this.configRepository, id, input);
    await this.audit(authContext, "ai_provider", record.id, record.name, "更新 AI 供应商");
    return record;
  }

  async createModel(authContext: AuthContext, input: AiModelPayload) {
    this.assertPlatformPermission(authContext, MANAGE_PERMISSION);
    const record = await this.requireConfigRepository("createModel").call(this.configRepository, input);
    await this.audit(authContext, "ai_model", record.id, record.name, "创建 AI 模型");
    return record;
  }

  async updateModel(authContext: AuthContext, id: string, input: UpdateAiModelPayload) {
    this.assertPlatformPermission(authContext, MANAGE_PERMISSION);
    const record = await this.requireConfigRepository("updateModel").call(this.configRepository, id, input);
    await this.audit(authContext, "ai_model", record.id, record.name, "更新 AI 模型");
    return record;
  }

  async listRouteModelOptions(
    authContext: AuthContext,
    providerId: string,
    query: AiRouteModelOptionListQuery,
  ) {
    this.assertPlatformPermission(authContext, READ_PERMISSION);
    const provider = await this.requireActiveProvider(providerId);
    const internalOptions = await this.requireConfigRepository("listRouteModels")
      .call(this.configRepository, provider.id, { ...query, status: query.status ?? "active" });

    if (provider.provider_type !== "openrouter") {
      const manualOption = query.keyword && (!query.modality || query.modality === "text")
        ? [{
          source: "manual" as const,
          value: `manual:${query.keyword}`,
          model_id: null,
          provider_id: provider.id,
          label: query.keyword,
          description: "使用该模型调用名称",
          modality: "text" as const,
          status: "active",
        }]
        : [];
      return {
        ...internalOptions,
        list: [...internalOptions.list, ...manualOption],
      };
    }

    if (!query.keyword && internalOptions.list.length > 0) return internalOptions;

    const catalogOptions = await this.requireCatalogRepository("listLatestEligibleCatalogRouteOptions")
      .call(this.catalogRepository, provider.id, query);
    return catalogOptions.list.length > 0 ? catalogOptions : internalOptions;
  }

  async resolveRouteModelOption(
    authContext: AuthContext,
    providerId: string,
    input: AiRouteModelOptionResolvePayload,
  ) {
    this.assertPlatformPermission(authContext, MANAGE_PERMISSION);
    const provider = await this.requireActiveProvider(providerId);

    if (input.source === "manual") {
      if (provider.provider_type !== "openai_compatible") {
        throw Errors.business(
          400,
          "OpenRouter 供应商请从目录选择模型",
          "AI_ROUTE_MODEL_MANUAL_UNSUPPORTED",
        );
      }
      const existingModel = await this.requireConfigRepository("findModelByProviderAndCallName")
        .call(this.configRepository, provider.id, input.model_name, "text");
      const modelRecord = existingModel ?? await this.requireConfigRepository("createManualModel")
        .call(this.configRepository, {
          provider,
          modelName: input.model_name,
          displayName: input.name,
        });
      return { model_id: modelRecord.id, model: modelRecord };
    }

    const entry = await this.requireCatalogRepository("getCatalogRouteModelEntry")
      .call(this.catalogRepository, provider.id, input.value);
    if (!entry) {
      throw Errors.business(404, "OpenRouter 目录模型不存在或不可用", "AI_CATALOG_ROUTE_MODEL_NOT_FOUND");
    }

    if (entry.current_model_id) {
      const currentModel = await this.requireConfigRepository("getModelById")
        .call(this.configRepository, entry.current_model_id);
      if (currentModel) return { model_id: currentModel.id, model: currentModel };
    }

    await this.requireCatalogRepository("applyOpenRouterCatalog").call(this.catalogRepository, {
      runId: entry.run_id,
      entryIds: [entry.id],
      expectedCatalogHash: entry.catalog_hash,
    });
    const materializedModel = await this.requireConfigRepository("findModelByProviderAndCallName")
      .call(this.configRepository, provider.id, entry.external_model_id, entry.modality);
    if (!materializedModel) {
      throw Errors.business(500, "OpenRouter 目录模型应用后未找到模型", "AI_CATALOG_ROUTE_MODEL_MATERIALIZE_FAILED");
    }
    return { model_id: materializedModel.id, model: materializedModel };
  }

  async createSceneRoute(authContext: AuthContext, input: AiSceneRoutePayload) {
    this.assertPlatformPermission(authContext, MANAGE_PERMISSION);
    await this.assertRouteModels(input);
    const record = await this.requireConfigRepository("createSceneRoute").call(this.configRepository, input);
    await this.audit(authContext, "ai_scene_route", record.id, record.name, "创建 AI 场景路由");
    return record;
  }

  async updateSceneRoute(authContext: AuthContext, id: string, input: UpdateAiSceneRoutePayload) {
    this.assertPlatformPermission(authContext, MANAGE_PERMISSION);
    await this.assertRouteModels(input);
    const record = await this.requireConfigRepository("updateSceneRoute").call(this.configRepository, id, input);
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
    await this.auditRepository.create({
      action: "platform_config_update",
      actorEmployeeId: authContext.employeeId,
      actorUserId: authContext.authUserId,
      resourceType,
      resourceId,
      resourceLabel,
      summary,
    }).catch(() => null);
  }

  private async requireActiveProvider(providerId: string): Promise<AiProviderRecord> {
    const provider = await this.requireConfigRepository("getProviderById")
      .call(this.configRepository, providerId);
    if (!provider) {
      throw Errors.business(404, "AI 供应商不存在", "AI_PROVIDER_NOT_FOUND");
    }
    if (provider.status !== "active") {
      throw Errors.business(409, "AI 供应商已停用", "AI_PROVIDER_INACTIVE");
    }
    return provider;
  }

  private async assertRouteModels(input: {
    primary_model_id?: string | null;
    fallback_model_id?: string | null;
    modality?: AiSceneRoutePayload["modality"];
  }) {
    if (!input.primary_model_id && !input.fallback_model_id) return;
    if (
      input.primary_model_id
      && input.fallback_model_id
      && input.primary_model_id === input.fallback_model_id
    ) {
      throw Errors.business(409, "主模型和备用模型不能相同", "AI_ROUTE_MODEL_DUPLICATED");
    }

    await Promise.all([
      input.primary_model_id ? this.assertRouteModel(input.primary_model_id, input.modality) : null,
      input.fallback_model_id ? this.assertRouteModel(input.fallback_model_id, input.modality) : null,
    ]);
  }

  private async assertRouteModel(
    modelId: string,
    modality?: AiSceneRoutePayload["modality"],
  ): Promise<AiModelRecord> {
    const modelRecord = await this.requireConfigRepository("getModelById")
      .call(this.configRepository, modelId);
    if (!modelRecord) {
      throw Errors.business(404, "AI 模型不存在", "AI_MODEL_NOT_FOUND");
    }
    if (modelRecord.status !== "active") {
      throw Errors.business(409, "AI 模型已停用", "AI_MODEL_INACTIVE");
    }
    if (modality && modelRecord.modality && modelRecord.modality !== modality) {
      throw Errors.business(409, "AI 模型模态与场景路由不匹配", "AI_ROUTE_MODEL_MODALITY_MISMATCH");
    }
    if (modelRecord.provider?.status && modelRecord.provider.status !== "active") {
      throw Errors.business(409, "AI 供应商已停用", "AI_PROVIDER_INACTIVE");
    }
    return modelRecord;
  }

  private requireConfigRepository<K extends keyof ConfigRepositoryPort>(
    method: K,
  ): ConfigRepositoryPort[K] {
    const target = this.configRepository[method];
    if (!target) {
      throw Errors.business(500, "AI 配置仓储未配置", "AI_CONFIG_REPOSITORY_METHOD_MISSING");
    }
    return target as ConfigRepositoryPort[K];
  }

  private requireCatalogRepository<K extends keyof CatalogRepositoryPort>(
    method: K,
  ): CatalogRepositoryPort[K] {
    const target = this.catalogRepository[method];
    if (!target) {
      throw Errors.business(500, "AI 目录仓储未配置", "AI_CATALOG_REPOSITORY_METHOD_MISSING");
    }
    return target as CatalogRepositoryPort[K];
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
