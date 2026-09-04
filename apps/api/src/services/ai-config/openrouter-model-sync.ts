import type { z } from "zod";
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
  OpenRouterImageModelListSchema,
  OpenRouterModelListSchema,
  OpenRouterVideoModelListSchema,
} from "@/services/ai-generation/openrouter-contract";
import {
  catalogIdentity,
  hashJson,
  normalizeInputModalities,
  normalizeOpenRouterId,
  imageCandidates,
  projectCandidates,
  summarizeEntries,
  speechCandidates,
  textCandidates,
  videoCandidates,
  type CatalogCandidate,
  type CatalogEntryProjection,
  type CatalogModality,
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

type OpenRouterModelCatalog = z.infer<typeof OpenRouterModelListSchema>;
type OpenRouterImageCatalog = z.infer<typeof OpenRouterImageModelListSchema>;
type OpenRouterVideoCatalog = z.infer<typeof OpenRouterVideoModelListSchema>;
type OpenRouterCatalogs = {
  text: OpenRouterModelCatalog;
  image: OpenRouterImageCatalog;
  video: OpenRouterVideoCatalog;
  speech: OpenRouterModelCatalog;
  sourceEndpoints: string[];
};

const READ_PERMISSION = "platform.ai_config.read";
const MANAGE_PERMISSION = "platform.ai_config.manage";
const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_CREDITS_URL = "https://openrouter.ai/api/v1/credits";
const MAX_CATALOG_ENTRIES = 10_000;
const CATALOG_ENDPOINTS = {
  text: "/api/v1/models",
  image: "/api/v1/images/models",
  video: "/api/v1/videos/models",
  speech: "/api/v1/models?output_modalities=speech",
} as const satisfies Record<CatalogModality, string>;
const CATALOG_MODALITY_ORDER: CatalogModality[] = ["text", "image", "video", "speech"];

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

function buildPreviewEntry(entry: CatalogEntryProjection): Record<string, unknown> {
  return {
    external_model_id: entry.external_model_id,
    model_code: entry.model_code,
    model_name: entry.model_name,
    modality: entry.modality,
    input_modalities: entry.input_modalities,
    capability_payload: entry.capability_payload,
    raw_price_projection: entry.raw_price_projection,
    apply_status: entry.apply_status,
    apply_block_code: entry.apply_block_code,
    catalog_hash: entry.catalog_hash,
    change_type: entry.change_type,
  };
}

function catalogEndpointUrl(provider: AiProviderRecord, path: string): string {
  const baseUrl = provider.endpoint_url?.trim() || OPENROUTER_DEFAULT_BASE_URL;
  return new URL(catalogEndpointRelativePath(path), ensureTrailingSlash(baseUrl)).toString();
}

function catalogEndpointRelativePath(path: string): string {
  return path.startsWith("/api/v1/") ? path.slice("/api/v1/".length) : path.replace(/^\/+/, "");
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

async function parseCatalogResponse(
  response: Awaited<ReturnType<FetchPort>>,
  modality: CatalogModality,
) {
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw Errors.business(502, "OpenRouter 模型目录读取失败", "AI_OPENROUTER_CATALOG_FAILED");
  }
  const parsed = parseCatalogJson(json, modality);
  if (!parsed.success) {
    throw Errors.business(502, "OpenRouter 模型目录格式无效", "AI_OPENROUTER_CATALOG_INVALID");
  }
  return parsed.data;
}

function parseCatalogJson(json: unknown, modality: CatalogModality) {
  if (modality === "image") return OpenRouterImageModelListSchema.safeParse(json);
  if (modality === "video") return OpenRouterVideoModelListSchema.safeParse(json);
  return OpenRouterModelListSchema.safeParse(json);
}

function sortCatalogCandidates(candidates: CatalogCandidate[]): CatalogCandidate[] {
  return [...candidates].sort((left, right) => {
    const modalityOrder = CATALOG_MODALITY_ORDER.indexOf(left.modality)
      - CATALOG_MODALITY_ORDER.indexOf(right.modality);
    if (modalityOrder !== 0) return modalityOrder;
    return normalizeOpenRouterId(left.externalModelId).localeCompare(normalizeOpenRouterId(right.externalModelId));
  });
}

function catalogHashProjection(candidate: CatalogCandidate): Record<string, unknown> {
  return {
    identity: catalogIdentity(candidate.externalModelId, candidate.modality),
    external_model_id: normalizeOpenRouterId(candidate.externalModelId),
    model_name: candidate.modelName,
    modality: candidate.modality,
    input_modalities: normalizeInputModalities(candidate.inputModalities, ["text"]),
    capability_candidate: candidate.capabilityCandidate,
    raw_price_projection: candidate.rawPriceProjection,
  };
}

function countModalities(entries: CatalogEntryProjection[]): Record<CatalogModality, number> {
  return entries.reduce<Record<CatalogModality, number>>((counts, entry) => {
    counts[entry.modality] += 1;
    return counts;
  }, { text: 0, image: 0, video: 0, speech: 0 });
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
      this.fetchModelCatalogs(provider),
      this.repository.listCatalogManagedModels(provider.id),
    ]);
    const candidates = sortCatalogCandidates([
      ...textCandidates(catalog.text.data),
      ...imageCandidates(catalog.image.data),
      ...videoCandidates(catalog.video.data),
      ...speechCandidates(catalog.speech.data),
    ]);
    if (candidates.length > MAX_CATALOG_ENTRIES) {
      throw Errors.business(400, "OpenRouter 目录条目超过上限", "AI_OPENROUTER_CATALOG_TOO_LARGE");
    }
    const catalogHash = hashJson(candidates.map(catalogHashProjection));
    const entries = projectCandidates(candidates, {
      currentModels,
      catalogHash,
    });
    if (entries.length > MAX_CATALOG_ENTRIES) {
      throw Errors.business(400, "OpenRouter 目录条目超过上限", "AI_OPENROUTER_CATALOG_TOO_LARGE");
    }
    const sourceEndpoints = catalog.sourceEndpoints;
    return this.repository.saveOpenRouterCatalogPreview({
      providerId: provider.id,
      sourceEndpoint: sourceEndpoints.join(","),
      catalogHash,
      requestedByEmployeeId: employeeId,
      entries: entries.map(buildPreviewEntry),
      summaryPayload: {
        ...summarizeEntries(entries),
        source_endpoints: sourceEndpoints,
        modality_counts: countModalities(entries),
      },
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

  private async fetchModelCatalogs(provider: AiProviderRecord): Promise<OpenRouterCatalogs> {
    const apiKey = await this.getProviderApiKey(provider);
    const headers = {
      authorization: `Bearer ${apiKey}`,
      ...await this.openRouterHeaders(),
    };
    const requests = CATALOG_MODALITY_ORDER.map(async (modality) => {
      const path = CATALOG_ENDPOINTS[modality];
      const url = catalogEndpointUrl(provider, path);
      const response = await this.fetchImpl(url, { method: "GET", headers });
      return [modality, url, await parseCatalogResponse(response, modality)] as const;
    });
    const results = await Promise.all(requests);
    return {
      text: results.find(([modality]) => modality === "text")?.[2] as OpenRouterModelCatalog,
      image: results.find(([modality]) => modality === "image")?.[2] as OpenRouterImageCatalog,
      video: results.find(([modality]) => modality === "video")?.[2] as OpenRouterVideoCatalog,
      speech: results.find(([modality]) => modality === "speech")?.[2] as OpenRouterModelCatalog,
      sourceEndpoints: results.map(([, url]) => url),
    };
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
