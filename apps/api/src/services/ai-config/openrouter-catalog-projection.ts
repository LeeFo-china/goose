import { createHash } from "node:crypto";
import type { z } from "zod";
import { AiModelCapabilitySchema, type AiModelCapability } from "@gooes/domain";
import { Errors } from "@/errors/error-factory";
import type {
  OpenRouterImageModelListSchema,
  OpenRouterModelListSchema,
  OpenRouterVideoModelListSchema,
} from "@/services/ai-generation/openrouter-contract";

export type CatalogModality = "text" | "image" | "video" | "speech";
export type CatalogChangeType = "new" | "changed" | "removed" | "unchanged";
export type CatalogApplyStatus = "eligible" | "blocked";
export type CatalogApplyBlockCode = null | "CAPABILITY_METADATA_INCOMPLETE";

export type CatalogCandidate = {
  externalModelId: string;
  modelName: string;
  modality: CatalogModality;
  inputModalities: CatalogModality[];
  capabilityCandidate: Record<string, unknown>;
  rawPriceProjection: Record<string, string>;
};

export type CatalogEntryProjection = {
  external_model_id: string;
  model_code: string;
  model_name: string;
  modality: CatalogModality;
  input_modalities: CatalogModality[];
  capability_payload: Record<string, unknown>;
  raw_price_projection: Record<string, string>;
  apply_status: CatalogApplyStatus;
  apply_block_code: CatalogApplyBlockCode;
  catalog_hash: string;
  change_type: CatalogChangeType;
};

export type OpenRouterTextModel = z.infer<typeof OpenRouterModelListSchema>["data"][number];
export type OpenRouterImageModel = z.infer<typeof OpenRouterImageModelListSchema>["data"][number];
export type OpenRouterVideoModel = z.infer<typeof OpenRouterVideoModelListSchema>["data"][number];

export type CurrentCatalogModel = {
  code: string;
  name: string;
  model_name: string;
  modality?: CatalogModality | null;
  input_modalities?: string[] | null;
  capability_payload?: Record<string, unknown> | null;
  price_snapshot?: Record<string, unknown> | null;
};

const DEFAULT_TEXT_CONTEXT_TOKENS = 4096;
const CATALOG_MODALITIES = ["text", "image", "video", "speech"] as const;

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashJson(value: unknown): string {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

export function isKnownModality(value: string): value is CatalogModality {
  return (CATALOG_MODALITIES as readonly string[]).includes(value);
}

export function normalizeOpenRouterId(value: string): string {
  return value.trim().slice(0, 512);
}

export function catalogIdentity(externalModelId: string, modality: CatalogModality): string {
  return `${normalizeOpenRouterId(externalModelId)}\u0000${modality}`;
}

export function modelCode(externalModelId: string, modality: CatalogModality): string {
  const suffix = normalizeOpenRouterId(externalModelId)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 240);
  const prefix = modality === "text" ? "openrouter" : `openrouter.${modality}`;
  return `${prefix}.${suffix || "model"}`;
}

export function normalizePrice(value: string | number | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = String(value).trim();
  if (!normalized) return undefined;
  const numericValue = Number(normalized);
  return Number.isFinite(numericValue) && numericValue >= 0 ? normalized : undefined;
}

export function normalizeInputModalities(
  values: readonly string[] | null | undefined,
  fallback: CatalogModality[] = ["text"],
): CatalogModality[] {
  const normalized = (values ?? [])
    .map((value) => value.trim().toLowerCase())
    .filter(isKnownModality);
  const unique = Array.from(new Set(normalized));
  return unique.length ? unique : fallback;
}

export function buildRawPriceProjection(
  pricing: object | null | undefined,
  keys: readonly string[],
): Record<string, string> {
  const raw = pricing as Record<string, unknown> | null | undefined;
  return Object.fromEntries(
    keys
      .map((key) => [key, scalarPrice(raw?.[key])] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
  );
}

export function rawPriceFromCurrent(current: CurrentCatalogModel): Record<string, string> {
  const raw = current.price_snapshot?.raw_price_projection;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw)
      .filter((entry): entry is [string, string | number] =>
        typeof entry[1] === "string" || typeof entry[1] === "number")
      .map(([key, value]) => [key, String(value)]),
  );
}

export function parseCurrentCapability(current: CurrentCatalogModel): AiModelCapability {
  const parsed = AiModelCapabilitySchema.safeParse(current.capability_payload);
  if (parsed.success) return parsed.data;
  return AiModelCapabilitySchema.parse({
    modality: "text",
    max_context_tokens: DEFAULT_TEXT_CONTEXT_TOKENS,
    supports_json_object: false,
    supports_streaming: false,
  });
}

export function projectCandidate(
  candidate: CatalogCandidate,
  current?: CurrentCatalogModel,
  catalogHash = hashJson(candidate),
): CatalogEntryProjection {
  const externalModelId = normalizeOpenRouterId(candidate.externalModelId);
  const parsed = AiModelCapabilitySchema.safeParse(candidate.capabilityCandidate);
  const isEligible = parsed.success;
  const capabilityPayload = isEligible
    ? parsed.data
    : boundedRecord(candidate.capabilityCandidate);
  const entry: CatalogEntryProjection = {
    external_model_id: externalModelId,
    model_code: modelCode(externalModelId, candidate.modality),
    model_name: (candidate.modelName || externalModelId).trim().slice(0, 512),
    modality: candidate.modality,
    input_modalities: normalizeInputModalities(candidate.inputModalities, ["text"]),
    capability_payload: capabilityPayload,
    raw_price_projection: normalizeRawPriceProjection(candidate.rawPriceProjection),
    apply_status: isEligible ? "eligible" : "blocked",
    apply_block_code: isEligible ? null : "CAPABILITY_METADATA_INCOMPLETE",
    catalog_hash: catalogHash,
    change_type: "new",
  };
  if (!current) return entry;
  return {
    ...entry,
    change_type: isSameCatalogState(entry, current) ? "unchanged" : "changed",
  };
}

export function projectCandidates(
  candidates: CatalogCandidate[],
  options: {
    currentModels?: CurrentCatalogModel[];
    catalogHash?: string;
    includeRemoved?: boolean;
  } = {},
): CatalogEntryProjection[] {
  const catalogHash = options.catalogHash ?? hashJson(candidates);
  const uniqueCandidates = uniqueCatalogCandidates(candidates);
  const currentModels = options.currentModels ?? [];
  const currentByIdentity = new Map(
    currentModels.map((model) => [
      catalogIdentity(model.model_name, model.modality && isKnownModality(model.modality) ? model.modality : "text"),
      model,
    ]),
  );
  const externalEntries = uniqueCandidates.map((candidate) =>
    projectCandidate(candidate, currentByIdentity.get(catalogIdentity(candidate.externalModelId, candidate.modality)), catalogHash));
  if (options.includeRemoved === false || !currentModels.length) return externalEntries;

  const externalIdentities = new Set(
    externalEntries.map((entry) => catalogIdentity(entry.external_model_id, entry.modality)),
  );
  const removedEntries = currentModels
    .filter((model) => {
      const modality = model.modality && isKnownModality(model.modality) ? model.modality : "text";
      return !externalIdentities.has(catalogIdentity(model.model_name, modality));
    })
    .map((model) => buildRemovedEntry(model, catalogHash));
  return [...externalEntries, ...removedEntries];
}

export function textCandidates(models: OpenRouterTextModel[]): CatalogCandidate[] {
  return models.filter(isTextOutputModel).map((model) => {
    const supportedParameters = new Set(model.supported_parameters ?? []);
    const contextLength = model.context_length ?? model.top_provider?.context_length;
    const capabilityCandidate: Record<string, unknown> = {
      modality: "text",
      supports_json_object: supportedParameters.has("response_format")
        || model.default_parameters?.response_format?.type === "json_object",
      supports_streaming: supportedParameters.has("stream"),
    };
    if (typeof contextLength === "number") capabilityCandidate.max_context_tokens = contextLength;
    return {
      externalModelId: model.id,
      modelName: model.name ?? model.id,
      modality: "text",
      inputModalities: normalizeInputModalities(model.architecture?.input_modalities, ["text"]),
      capabilityCandidate,
      rawPriceProjection: buildRawPriceProjection(model.pricing, ["prompt", "completion", "request", "image"]),
    };
  });
}

export function imageCandidates(models: OpenRouterImageModel[]): CatalogCandidate[] {
  return models.map((model) => {
    const supportedParameters = model.supported_parameters;
    const capabilityCandidate: Record<string, unknown> = { modality: "image" };
    const supportedSizes = parameterValues(supportedParameters?.size)
      ?? parameterValues(supportedParameters?.resolution);
    if (supportedSizes) capabilityCandidate.supported_sizes = supportedSizes;
    if (supportedParameters?.input_references) capabilityCandidate.supports_reference_image = true;
    if (typeof supportedParameters?.n?.max === "number") {
      capabilityCandidate.max_images_per_request = Math.floor(supportedParameters.n.max);
    }
    return {
      externalModelId: model.id,
      modelName: model.name ?? model.id,
      modality: "image",
      inputModalities: normalizeInputModalities(model.architecture?.input_modalities, ["text"]),
      capabilityCandidate,
      rawPriceProjection: {},
    };
  });
}

export function videoCandidates(models: OpenRouterVideoModel[]): CatalogCandidate[] {
  return models.map((model) => {
    const capabilityCandidate: Record<string, unknown> = { modality: "video" };
    if (model.supported_aspect_ratios?.length) {
      capabilityCandidate.aspect_ratios = model.supported_aspect_ratios;
    }
    if (model.supported_durations?.length) {
      capabilityCandidate.max_duration_seconds = Math.max(...model.supported_durations.map(Math.floor));
    }
    if (typeof model.generate_audio === "boolean") capabilityCandidate.supports_audio = model.generate_audio;
    return {
      externalModelId: model.id,
      modelName: model.name ?? model.id,
      modality: "video",
      inputModalities: ["text"],
      capabilityCandidate,
      rawPriceProjection: buildRawPriceProjection(model.pricing_skus, Object.keys(model.pricing_skus ?? {})),
    };
  });
}

export function speechCandidates(models: OpenRouterTextModel[]): CatalogCandidate[] {
  return models.filter(isSpeechOutputModel).map((model) => {
    const capabilityCandidate: Record<string, unknown> = { modality: "speech" };
    if (model.supported_voices?.length) capabilityCandidate.supported_voices = model.supported_voices;
    return {
      externalModelId: model.id,
      modelName: model.name ?? model.id,
      modality: "speech",
      inputModalities: ["text"],
      capabilityCandidate,
      rawPriceProjection: buildRawPriceProjection(model.pricing, ["audio", "input_audio", "output_audio"]),
    };
  });
}

export function summarizeEntries(entries: CatalogEntryProjection[]): Record<string, number> {
  return {
    total: entries.length,
    new: entries.filter((entry) => entry.change_type === "new").length,
    changed: entries.filter((entry) => entry.change_type === "changed").length,
    unchanged: entries.filter((entry) => entry.change_type === "unchanged").length,
    removed: entries.filter((entry) => entry.change_type === "removed").length,
  };
}

function isTextOutputModel(model: OpenRouterTextModel): boolean {
  const outputs = model.architecture?.output_modalities;
  if (!outputs || outputs.length === 0) return true;
  return outputs.map((value) => value.trim().toLowerCase()).includes("text");
}

function isSpeechOutputModel(model: OpenRouterTextModel): boolean {
  const outputs = model.architecture?.output_modalities ?? [];
  return outputs.map((value) => value.trim().toLowerCase()).includes("speech")
    || Boolean(model.supported_voices?.length);
}

function buildRemovedEntry(current: CurrentCatalogModel, catalogHash: string): CatalogEntryProjection {
  const modality = current.modality && isKnownModality(current.modality) ? current.modality : "text";
  const capabilityPayload = parseCurrentCapability(current);
  return {
    external_model_id: current.model_name,
    model_code: current.code,
    model_name: current.name,
    modality,
    input_modalities: normalizeInputModalities(current.input_modalities, ["text"]),
    capability_payload: capabilityPayload,
    raw_price_projection: rawPriceFromCurrent(current),
    apply_status: "eligible",
    apply_block_code: null,
    catalog_hash: catalogHash,
    change_type: "removed",
  };
}

function isSameCatalogState(entry: CatalogEntryProjection, current: CurrentCatalogModel): boolean {
  return entry.model_code === current.code
    && entry.model_name === current.name
    && entry.modality === current.modality
    && stableJson(entry.input_modalities) === stableJson(normalizeInputModalities(current.input_modalities, ["text"]))
    && stableJson(entry.capability_payload) === stableJson(parseCurrentCapability(current))
    && stableJson(entry.raw_price_projection) === stableJson(rawPriceFromCurrent(current));
}

function normalizeRawPriceProjection(raw: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(raw)
      .map(([key, value]) => [key, normalizePrice(value)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
  );
}

function scalarPrice(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  return normalizePrice(value);
}

function boundedRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).slice(0, 32).map(([key, entry]) => [key.slice(0, 128), boundedValue(entry)]),
  );
}

function boundedValue(value: unknown): unknown {
  if (typeof value === "string") return value.slice(0, 512);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 64).map(boundedValue);
  if (value && typeof value === "object") return boundedRecord(value as Record<string, unknown>);
  return undefined;
}

export function uniqueCatalogCandidates(candidates: CatalogCandidate[]): CatalogCandidate[] {
  const byIdentity = new Map<string, CatalogCandidate>();
  for (const candidate of candidates) {
    const identity = catalogIdentity(candidate.externalModelId, candidate.modality);
    const existing = byIdentity.get(identity);
    if (!existing) {
      byIdentity.set(identity, candidate);
      continue;
    }
    if (stableJson(existing) !== stableJson(candidate)) {
      throw Errors.business(
        400,
        "OpenRouter 目录存在冲突重复模型",
        "AI_OPENROUTER_CATALOG_DUPLICATE_CONFLICT",
      );
    }
  }
  return Array.from(byIdentity.values());
}

function parameterValues(parameter?: { values?: unknown[] }): string[] | undefined {
  const values = parameter?.values
    ?.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
  return values?.length ? Array.from(new Set(values)) : undefined;
}
