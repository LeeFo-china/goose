import { createHash } from "node:crypto";
import { z } from "zod";
import { AiModelCapabilitySchema, type AiModelCapability } from "@gooes/domain";
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

type OpenRouterCatalog = z.infer<typeof OpenRouterModelListSchema>;
type OpenRouterModel = OpenRouterCatalog["data"][number];
type CatalogChangeType = "new" | "changed" | "removed" | "unchanged";
type CatalogEntryProjection = {
  external_model_id: string;
  model_code: string;
  model_name: string;
  modality: "text" | "image" | "video" | "speech";
  input_modalities: Array<"text" | "image" | "video" | "speech">;
  capability_payload: AiModelCapability;
  raw_price_projection: Record<string, string>;
  catalog_hash: string;
  change_type: CatalogChangeType;
};

const READ_PERMISSION = "platform.ai_config.read";
const MANAGE_PERMISSION = "platform.ai_config.manage";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const OPENROUTER_CREDITS_URL = "https://openrouter.ai/api/v1/credits";
const DEFAULT_TEXT_CONTEXT_TOKENS = 4096;
const MODALITIES = ["text", "image", "video", "speech"] as const;

function assertPlatformPermission(authContext: AuthContext, permission: string) {
  const isPlatformIdentity = authContext.isPlatformStaff || authContext.isPlatformAdmin;
  if (authContext.tenantId !== null || !isPlatformIdentity || !authContext.employeeId) {
    throw Errors.forbidden();
  }
  accessPolicyService.assertPermission(authContext, permission);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashJson(value: unknown) {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

function numberValue(value: string | number) {
  return typeof value === "number" ? value : Number(value);
}

function normalizeOpenRouterId(value: string): string {
  return value.trim().slice(0, 512);
}

function normalizeModelCode(externalModelId: string): string {
  const suffix = externalModelId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 240);
  return `openrouter.${suffix || "model"}`;
}

function normalizePrice(value: string | number | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}

function buildRawPriceProjection(pricing: OpenRouterModel["pricing"]): Record<string, string> {
  return Object.fromEntries(
    [
      ["prompt", normalizePrice(pricing?.prompt)],
      ["completion", normalizePrice(pricing?.completion)],
      ["request", normalizePrice(pricing?.request)],
      ["image", normalizePrice(pricing?.image)],
    ].filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
}

function isKnownModality(value: string): value is "text" | "image" | "video" | "speech" {
  return (MODALITIES as readonly string[]).includes(value);
}

function normalizeInputModalities(model: OpenRouterModel): Array<"text" | "image" | "video" | "speech"> {
  const raw = model.architecture?.input_modalities ?? [];
  const normalized = raw
    .map((value) => value.trim().toLowerCase())
    .filter(isKnownModality);
  const unique = Array.from(new Set(normalized));
  return unique.length ? unique : ["text"];
}

function isTextOutputModel(model: OpenRouterModel): boolean {
  const outputs = model.architecture?.output_modalities;
  if (!outputs || outputs.length === 0) return true;
  return outputs.map((value) => value.trim().toLowerCase()).includes("text");
}

function isCurrentTextCatalogModel(model: AiModelRecord): boolean {
  return !model.modality || model.modality === "text";
}

function inferModality(_model: OpenRouterModel): "text" {
  return "text";
}

function defaultTextCapability(model?: OpenRouterModel): AiModelCapability {
  const supportedParameters = new Set(model?.supported_parameters ?? []);
  const capability = {
    modality: "text" as const,
    max_context_tokens: model?.context_length
      ?? model?.top_provider?.context_length
      ?? DEFAULT_TEXT_CONTEXT_TOKENS,
    supports_json_object: supportedParameters.has("response_format")
      || model?.default_parameters?.response_format?.type === "json_object",
    supports_streaming: supportedParameters.has("stream"),
  };
  return AiModelCapabilitySchema.parse(capability);
}

function parseCurrentCapability(current: AiModelRecord): AiModelCapability {
  const parsed = AiModelCapabilitySchema.safeParse(current.capability_payload);
  if (parsed.success) return parsed.data;
  return defaultTextCapability();
}

function rawPriceFromCurrent(current: AiModelRecord): Record<string, string> {
  const raw = current.price_snapshot?.raw_price_projection;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw)
      .filter((entry): entry is [string, string | number] =>
        typeof entry[1] === "string" || typeof entry[1] === "number")
      .map(([key, value]) => [key, String(value)]),
  );
}

function isSameCatalogState(entry: CatalogEntryProjection, current: AiModelRecord): boolean {
  return entry.model_code === current.code
    && entry.model_name === current.name
    && entry.modality === current.modality
    && stableJson(entry.input_modalities) === stableJson(current.input_modalities ?? ["text"])
    && stableJson(entry.capability_payload) === stableJson(parseCurrentCapability(current))
    && stableJson(entry.raw_price_projection) === stableJson(rawPriceFromCurrent(current));
}

function buildExternalEntry(
  model: OpenRouterModel,
  currentByExternalId: Map<string, AiModelRecord>,
  catalogHash: string,
): CatalogEntryProjection {
  const externalModelId = normalizeOpenRouterId(model.id);
  const modality = inferModality(model);
  const current = currentByExternalId.get(externalModelId);
  const entry: CatalogEntryProjection = {
    external_model_id: externalModelId,
    model_code: normalizeModelCode(externalModelId),
    model_name: (model.name || externalModelId).trim().slice(0, 512),
    modality,
    input_modalities: current ? (current.input_modalities ?? ["text"]).filter(isKnownModality) : normalizeInputModalities(model),
    capability_payload: current ? parseCurrentCapability(current) : defaultTextCapability(model),
    raw_price_projection: buildRawPriceProjection(model.pricing),
    catalog_hash: catalogHash,
    change_type: "new",
  };
  if (!current) return entry;
  return {
    ...entry,
    input_modalities: entry.input_modalities.length ? entry.input_modalities : ["text"],
    change_type: isSameCatalogState(entry, current) ? "unchanged" : "changed",
  };
}

function buildRemovedEntry(current: AiModelRecord, catalogHash: string): CatalogEntryProjection {
  const modality = current.modality && isKnownModality(current.modality) ? current.modality : "text";
  const inputModalities = (current.input_modalities ?? ["text"]).filter(isKnownModality);
  return {
    external_model_id: current.model_name,
    model_code: current.code,
    model_name: current.name,
    modality,
    input_modalities: inputModalities.length ? inputModalities : ["text"],
    capability_payload: parseCurrentCapability(current),
    raw_price_projection: rawPriceFromCurrent(current),
    catalog_hash: catalogHash,
    change_type: "removed",
  };
}

function summarizeEntries(entries: CatalogEntryProjection[]): Record<string, number> {
  return {
    total: entries.length,
    new: entries.filter((entry) => entry.change_type === "new").length,
    changed: entries.filter((entry) => entry.change_type === "changed").length,
    unchanged: entries.filter((entry) => entry.change_type === "unchanged").length,
    removed: entries.filter((entry) => entry.change_type === "removed").length,
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
    const currentByExternalId = new Map(currentTextModels.map((model) => [model.model_name, model]));
    const nonTextCurrentExternalIds = new Set(
      currentModels
        .filter((model) => !isCurrentTextCatalogModel(model))
        .map((model) => model.model_name),
    );
    const externalEntries = catalog.data
      .filter((model) =>
        isTextOutputModel(model)
        && !nonTextCurrentExternalIds.has(normalizeOpenRouterId(model.id)))
      .map((model) => buildExternalEntry(model, currentByExternalId, catalogHash));
    const externalIds = new Set(externalEntries.map((entry) => entry.external_model_id));
    const removedEntries = currentTextModels
      .filter((model) => !externalIds.has(model.model_name))
      .map((model) => buildRemovedEntry(model, catalogHash));
    const entries = [...externalEntries, ...removedEntries];
    return this.repository.saveOpenRouterCatalogPreview({
      providerId: provider.id,
      sourceEndpoint: OPENROUTER_MODELS_URL,
      catalogHash,
      requestedByEmployeeId: employeeId,
      entries,
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
