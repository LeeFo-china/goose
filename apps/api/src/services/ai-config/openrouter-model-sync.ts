import { Errors } from "@/errors/error-factory";
import type {
  AiModelCapabilityPayload,
  OpenRouterCatalogApplyPayload,
  OpenRouterCatalogPreviewPayload,
  OpenRouterProviderQuery,
} from "@/schema/ai-config";
import { aiModelCatalogRepository, type AiModelRecord, type AiProviderRecord } from "@/repositories/ai-model-catalog";
import {
  OpenRouterCreditsSchema,
  OpenRouterModelListSchema,
} from "@/services/ai-generation/openrouter-contract";
import {
  hashJson,
  isKnownModality,
  normalizeOpenRouterId,
  projectCandidates,
  summarizeEntries,
  textCandidates,
  type CatalogEntryProjection,
} from "@/services/ai-config/openrouter-catalog-projection";
import { systemSettingsService } from "@/services/system-settings";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

type SettingsPort = Pick<typeof systemSettingsService, "getSecretString" | "getString">;
type FetchPort = (url: string, init?: RequestInit) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

type RepositoryPort = Pick<typeof aiModelCatalogRepository,
  | "getProvider"
  | "listCatalogManagedModels"
  | "saveOpenRouterCatalogPreview"
  | "applyOpenRouterCatalog"
  | "saveCapabilityOverride"
  | "getOpenRouterUsageSummary"
>;

const READ_PERMISSION = "platform.ai_config.read";
const MANAGE_PERMISSION = "platform.ai_config.manage";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const OPENROUTER_CREDITS_URL = "https://openrouter.ai/api/v1/credits";

function assertPlatformPermission(authContext: AuthContext, permission: string) {
  const isPlatformIdentity = authContext.isPlatformStaff || authContext.isPlatformAdmin;
  if (authContext.tenantId !== null || !isPlatformIdentity || !authContext.employeeId) {
    throw Errors.forbidden();
  }
  accessPolicyService.assertPermission(authContext, permission);
}

function numberValue(value: string | number) {
  return typeof value === "number" ? value : Number(value);
}

function isCurrentTextCatalogModel(model: AiModelRecord): boolean {
  return !model.modality || model.modality === "text";
}

function buildPreviewEntry(entry: CatalogEntryProjection): Record<string, unknown> {
  return {
    external_model_id: entry.external_model_id,
    model_code: entry.model_code,
    model_name: entry.model_name,
    modality: entry.modality,
    input_modalities: entry.input_modalities,
    capability_payload: entry.capability_payload,
    raw_price_projection: entry.raw_price_projection,
    catalog_hash: entry.catalog_hash,
    change_type: entry.change_type,
  };
}

export class OpenRouterModelSyncService {
  private readonly repository: RepositoryPort;
  private readonly settings: SettingsPort;
  private readonly fetchImpl: FetchPort;

  constructor(dependencies: {
    repository?: RepositoryPort;
    settings?: SettingsPort;
    fetchImpl?: FetchPort;
  } = {}) {
    this.repository = dependencies.repository ?? aiModelCatalogRepository;
    this.settings = dependencies.settings ?? systemSettingsService;
    this.fetchImpl = dependencies.fetchImpl ?? fetch;
  }

  async createPreview(authContext: AuthContext, input: OpenRouterCatalogPreviewPayload) {
    assertPlatformPermission(authContext, MANAGE_PERMISSION);
    const employeeId = authContext.employeeId;
    if (!employeeId) throw Errors.forbidden();
    const provider = await this.requireOpenRouterProvider(input.provider_id);
    const [catalog, currentModels] = await Promise.all([
      this.fetchModelCatalog(provider),
      this.repository.listCatalogManagedModels(provider.id),
    ]);
    const catalogHash = hashJson(catalog.data.map((model) => ({
      id: model.id,
      name: model.name ?? null,
      architecture: model.architecture ?? null,
      context_length: model.context_length ?? null,
      pricing: model.pricing ?? null,
      supported_parameters: model.supported_parameters ?? null,
      top_provider: model.top_provider ?? null,
      default_parameters: model.default_parameters ?? null,
    })));
    const currentTextModels = currentModels.filter(isCurrentTextCatalogModel);
    const nonTextCurrentExternalIds = new Set(
      currentModels
        .filter((model) => !isCurrentTextCatalogModel(model))
        .map((model) => model.model_name),
    );
    const candidates = textCandidates(catalog.data)
      .filter((candidate) => !nonTextCurrentExternalIds.has(normalizeOpenRouterId(candidate.externalModelId)));
    const entries = projectCandidates(candidates, {
      currentModels: currentTextModels,
      catalogHash,
    });
    return this.repository.saveOpenRouterCatalogPreview({
      providerId: provider.id,
      sourceEndpoint: OPENROUTER_MODELS_URL,
      catalogHash,
      requestedByEmployeeId: employeeId,
      entries: entries.map(buildPreviewEntry),
      summaryPayload: summarizeEntries(entries),
    });
  }

  async applyCatalog(authContext: AuthContext, input: OpenRouterCatalogApplyPayload) {
    assertPlatformPermission(authContext, MANAGE_PERMISSION);
    if (input.entry_ids.length > 100) {
      throw Errors.business(400, "单次最多应用 100 个目录条目", "AI_MODEL_CATALOG_APPLY_LIMIT_EXCEEDED");
    }
    return this.repository.applyOpenRouterCatalog({
      runId: input.run_id,
      entryIds: input.entry_ids,
      expectedCatalogHash: input.expected_catalog_hash,
    });
  }

  async saveCapability(authContext: AuthContext, modelId: string, input: AiModelCapabilityPayload) {
    assertPlatformPermission(authContext, MANAGE_PERMISSION);
    return this.repository.saveCapabilityOverride({
      modelId,
      expectedVersion: input.expected_version,
      capabilityPayload: input.capability_payload,
      probeStatus: input.probe_status,
      probeAt: input.probe_at ?? null,
    });
  }

  async getCredits(authContext: AuthContext, input: OpenRouterProviderQuery) {
    assertPlatformPermission(authContext, READ_PERMISSION);
    const provider = await this.requireOpenRouterProvider(input.provider_id);
    const apiKey = await this.getProviderApiKey(provider);
    const response = await this.fetchImpl(OPENROUTER_CREDITS_URL, {
      method: "GET",
      headers: {
        authorization: `Bearer ${apiKey}`,
        ...await this.openRouterHeaders(),
      },
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      throw Errors.business(502, "OpenRouter 额度读取失败", "AI_OPENROUTER_CREDITS_FAILED");
    }
    const parsed = OpenRouterCreditsSchema.safeParse(json);
    if (!parsed.success) {
      throw Errors.business(502, "OpenRouter 额度格式无效", "AI_OPENROUTER_CREDITS_INVALID");
    }
    return {
      total_credits: numberValue(parsed.data.data.total_credits),
      total_usage: numberValue(parsed.data.data.total_usage),
    };
  }

  async getUsageSummary(authContext: AuthContext) {
    assertPlatformPermission(authContext, READ_PERMISSION);
    return this.repository.getOpenRouterUsageSummary();
  }

  private async requireOpenRouterProvider(providerId: string): Promise<AiProviderRecord> {
    const provider = await this.repository.getProvider(providerId);
    if (!provider || provider.provider_type !== "openrouter" || provider.status !== "active") {
      throw Errors.business(400, "请选择 OpenRouter 供应商", "AI_OPENROUTER_PROVIDER_INVALID");
    }
    return provider;
  }

  private async fetchModelCatalog(provider: AiProviderRecord) {
    const apiKey = await this.getProviderApiKey(provider);
    const response = await this.fetchImpl(OPENROUTER_MODELS_URL, {
      method: "GET",
      headers: {
        authorization: `Bearer ${apiKey}`,
        ...await this.openRouterHeaders(),
      },
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      throw Errors.business(502, "OpenRouter 模型目录读取失败", "AI_OPENROUTER_CATALOG_FAILED");
    }
    const parsed = OpenRouterModelListSchema.safeParse(json);
    if (!parsed.success) {
      throw Errors.business(502, "OpenRouter 模型目录格式无效", "AI_OPENROUTER_CATALOG_INVALID");
    }
    return parsed.data;
  }

  private async getProviderApiKey(provider: AiProviderRecord) {
    const keyName = provider.api_key_setting_key || "OPENROUTER_API_KEY";
    const apiKey = await this.settings.getSecretString(keyName);
    if (!apiKey) {
      throw Errors.business(503, "缺少 OpenRouter API Key", "AI_OPENROUTER_API_KEY_MISSING");
    }
    return apiKey;
  }

  private async openRouterHeaders() {
    return {
      "HTTP-Referer": await this.settings.getString("OPENROUTER_HTTP_REFERER", "https://gooes.local"),
      "X-Title": await this.settings.getString("OPENROUTER_APP_NAME", "gooes-ai-gateway"),
    };
  }
}

export const openRouterModelSyncService = new OpenRouterModelSyncService();
