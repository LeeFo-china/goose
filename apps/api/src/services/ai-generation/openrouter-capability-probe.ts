import { Errors } from "@/errors/error-factory";

import {
  OpenRouterAudioSpeechRequestSchema,
  OpenRouterGenerationUsageSchema,
  OpenRouterImageModelListSchema,
  OpenRouterImageResultSchema,
  OpenRouterModelListSchema,
  OpenRouterTextResultSchema,
  OpenRouterVideoModelListSchema,
  OpenRouterVideoStatusSchema,
  OpenRouterVideoSubmissionSchema,
  parseOpenRouterAudioResponse,
  parseOpenRouterVideoContentResponse,
} from "./openrouter-contract";

export const OPENROUTER_PROBE_ENDPOINTS = {
  baseUrl: "https://openrouter.ai",
  models: "/api/v1/models",
  chatCompletions: "/api/v1/chat/completions",
  imageModels: "/api/v1/images/models",
  videoModels: "/api/v1/videos/models",
  speechModels: "/api/v1/models?output_modalities=speech",
  images: "/api/v1/images",
  videos: "/api/v1/videos",
  generation: "/api/v1/generation",
  speech: "/api/v1/audio/speech",
} as const;

type Modality = "text" | "image" | "video" | "speech";
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type ProbeCatalog = { endpoint: string; modelIds: readonly string[] };
type ProbeCapability = { async: boolean; query: boolean; cancel: boolean; webhook: boolean };

type ProbeModalityReport = {
  endpoint: string;
  modality: Modality;
  requestSchemaVersion: "openrouter-contract-v1";
  responseShape: Readonly<Record<string, unknown>>;
  billingIdKind: "id" | "generation_id" | "missing";
  capabilities: ProbeCapability;
  eligible: boolean;
};

export type OpenRouterCapabilityProbeReport = {
  generatedAt: string;
  catalogs: readonly ProbeCatalog[];
  modalities: readonly ProbeModalityReport[];
};

export type SanitizedOpenRouterProbeReport = {
  generatedAt: string;
  catalogs: ReadonlyArray<{
    endpoint: string;
    modelCount: number;
  }>;
  modalities: ReadonlyArray<{
    endpoint: string;
    modality: Modality;
    requestSchemaVersion: "openrouter-contract-v1";
    responseShape: { keys: readonly string[] };
    billingIdKind: "id" | "generation_id" | "missing";
    capabilities: ProbeCapability;
    eligible: boolean;
  }>;
};

export type OpenRouterModelListForOperators = {
  generatedAt: string;
  catalogs: ReadonlyArray<{
    endpoint: string;
    modelIds: readonly string[];
  }>;
};

type RunOpenRouterCapabilityProbeInput = {
  apiKey: string;
  mode?: "list-models" | "probe";
  requestedModels?: Partial<Record<Modality, string>>;
  fetchImpl?: FetchLike;
  now?: () => Date;
  videoPoll?: { intervalMs?: number; maxAttempts?: number };
};

const catalogEndpoints = [
  OPENROUTER_PROBE_ENDPOINTS.models,
  OPENROUTER_PROBE_ENDPOINTS.imageModels,
  OPENROUTER_PROBE_ENDPOINTS.videoModels,
  OPENROUTER_PROBE_ENDPOINTS.speechModels,
] as const;

function endpointUrl(endpoint: string): string {
  return `${OPENROUTER_PROBE_ENDPOINTS.baseUrl}${endpoint}`;
}

function openRouterUrl(value: string): string | null {
  const url = new URL(value, OPENROUTER_PROBE_ENDPOINTS.baseUrl);
  return url.origin === OPENROUTER_PROBE_ENDPOINTS.baseUrl ? url.href : null;
}

async function wait(milliseconds: number): Promise<void> {
  if (milliseconds > 0) await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function headers(apiKey: string): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  };
}

async function mapLimited<T, R>(
  values: readonly T[],
  limit: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (index < values.length) {
      const current = values[index]!;
      const resultIndex = index;
      index += 1;
      results[resultIndex] = await mapper(current);
    }
  });
  await Promise.all(workers);
  return results;
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

async function verifyBillingCorrelation(input: {
  apiKey: string;
  billingCorrelationId: string | null;
  fetchImpl: FetchLike;
}): Promise<boolean> {
  if (!input.billingCorrelationId) return false;
  const url = new URL(endpointUrl(OPENROUTER_PROBE_ENDPOINTS.generation));
  url.searchParams.set("id", input.billingCorrelationId);
  const response = await input.fetchImpl(url, { headers: headers(input.apiKey) });
  if (!response.ok) return false;
  const parsed = OpenRouterGenerationUsageSchema.safeParse(await readJson(response));
  return parsed.success && parsed.data.data.id === input.billingCorrelationId;
}

async function fetchCatalog(
  endpoint: string,
  apiKey: string,
  fetchImpl: FetchLike,
): Promise<ProbeCatalog> {
  const response = await fetchImpl(endpointUrl(endpoint), { headers: headers(apiKey) });
  if (!response.ok) {
    throw Errors.business(502, "OpenRouter 模型目录读取失败", "OPENROUTER_PROBE_FAILED", {
      endpoint,
      statusCode: response.status,
    });
  }
  const raw = await readJson(response);
  const schema = endpoint === OPENROUTER_PROBE_ENDPOINTS.imageModels
    ? OpenRouterImageModelListSchema
    : endpoint === OPENROUTER_PROBE_ENDPOINTS.videoModels
      ? OpenRouterVideoModelListSchema
      : OpenRouterModelListSchema;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw Errors.business(502, "OpenRouter 模型目录格式无效", "OPENROUTER_PROBE_FAILED", {
      endpoint,
    });
  }
  return {
    endpoint,
    modelIds: parsed.data.data.map((model) => model.id),
  };
}

function catalogEndpointForModality(modality: Modality): string | null {
  if (modality === "text") return OPENROUTER_PROBE_ENDPOINTS.models;
  if (modality === "image") return OPENROUTER_PROBE_ENDPOINTS.imageModels;
  if (modality === "video") return OPENROUTER_PROBE_ENDPOINTS.videoModels;
  return OPENROUTER_PROBE_ENDPOINTS.speechModels;
}

function hasCatalogModel(
  catalogs: readonly ProbeCatalog[],
  modality: Modality,
  modelId: string,
): boolean {
  const endpoint = catalogEndpointForModality(modality);
  if (!endpoint) return false;
  return catalogs.some((catalog) => catalog.endpoint === endpoint
    && catalog.modelIds.includes(modelId));
}

function responseShape(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>).sort().map((key) => [key, true]),
  );
}

async function probeImage(input: {
  apiKey: string;
  modelId: string;
  fetchImpl: FetchLike;
}): Promise<ProbeModalityReport> {
  const prompt = "probe image";
  const response = await input.fetchImpl(endpointUrl(OPENROUTER_PROBE_ENDPOINTS.images), {
    method: "POST",
    headers: headers(input.apiKey),
    body: JSON.stringify({ model: input.modelId, prompt, size: "512x512" }),
  });
  const raw = await readJson(response);
  const parsed = OpenRouterImageResultSchema.safeParse(raw);
  return {
    endpoint: OPENROUTER_PROBE_ENDPOINTS.images,
    modality: "image",
    requestSchemaVersion: "openrouter-contract-v1",
    responseShape: responseShape(raw),
    billingIdKind: "missing",
    capabilities: { async: false, query: false, cancel: false, webhook: false },
    eligible: response.ok && parsed.success && false,
  };
}

async function probeText(input: {
  apiKey: string;
  modelId: string;
  fetchImpl: FetchLike;
}): Promise<ProbeModalityReport> {
  const prompt = "probe text";
  const response = await input.fetchImpl(endpointUrl(OPENROUTER_PROBE_ENDPOINTS.chatCompletions), {
    method: "POST",
    headers: headers(input.apiKey),
    body: JSON.stringify({
      model: input.modelId,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const raw = await readJson(response);
  const parsed = OpenRouterTextResultSchema.safeParse(raw);
  const hasBillingCorrelation = await verifyBillingCorrelation({
    apiKey: input.apiKey,
    billingCorrelationId: parsed.success ? parsed.data.id : null,
    fetchImpl: input.fetchImpl,
  });
  return {
    endpoint: OPENROUTER_PROBE_ENDPOINTS.chatCompletions,
    modality: "text",
    requestSchemaVersion: "openrouter-contract-v1",
    responseShape: responseShape(raw),
    billingIdKind: parsed.success ? "id" : "missing",
    capabilities: { async: false, query: hasBillingCorrelation, cancel: false, webhook: false },
    eligible: response.ok && parsed.success && hasBillingCorrelation,
  };
}

async function probeVideo(input: {
  apiKey: string;
  modelId: string;
  fetchImpl: FetchLike;
  pollIntervalMs: number;
  pollMaxAttempts: number;
}): Promise<ProbeModalityReport> {
  const prompt = "probe video";
  const response = await input.fetchImpl(endpointUrl(OPENROUTER_PROBE_ENDPOINTS.videos), {
    method: "POST",
    headers: headers(input.apiKey),
    body: JSON.stringify({ model: input.modelId, prompt }),
  });
  const raw = await readJson(response);
  const parsed = OpenRouterVideoSubmissionSchema.safeParse(raw);
  if (!response.ok || !parsed.success) {
    return {
      endpoint: OPENROUTER_PROBE_ENDPOINTS.videos,
      modality: "video",
      requestSchemaVersion: "openrouter-contract-v1",
      responseShape: responseShape(raw),
      billingIdKind: "missing",
      capabilities: { async: false, query: false, cancel: false, webhook: false },
      eligible: false,
    };
  }

  const pollingUrl = openRouterUrl(parsed.data.polling_url);
  if (!pollingUrl) return ineligible("video", OPENROUTER_PROBE_ENDPOINTS.videos);

  let statusResponse: Response | null = null;
  let statusRaw: unknown = null;
  let statusParsed: ReturnType<typeof OpenRouterVideoStatusSchema.safeParse> | null = null;
  for (let attempt = 0; attempt < input.pollMaxAttempts; attempt += 1) {
    if (attempt > 0) await wait(input.pollIntervalMs);
    statusResponse = await input.fetchImpl(pollingUrl, { headers: headers(input.apiKey) });
    statusRaw = await readJson(statusResponse);
    statusParsed = OpenRouterVideoStatusSchema.safeParse(statusRaw);
    if (!statusParsed.success) break;
    if (statusParsed.data.status === "completed") break;
    if (["failed", "expired", "cancelled", "canceled"].includes(statusParsed.data.status)) break;
  }

  const finalStatus = statusParsed?.success === true && statusParsed.data.id === parsed.data.id
    ? statusParsed.data
    : null;
  const contentUrl = openRouterUrl(
    `${OPENROUTER_PROBE_ENDPOINTS.videos}/${encodeURIComponent(parsed.data.id)}/content?index=0`,
  );
  const hasVideoContent = finalStatus?.status === "completed" && contentUrl
    ? await parseOpenRouterVideoContentResponse(await input.fetchImpl(contentUrl, {
      headers: headers(input.apiKey),
    })).then(
      () => true,
      () => false,
    )
    : false;
  const hasBillingCorrelation = await verifyBillingCorrelation({
    apiKey: input.apiKey,
    billingCorrelationId: finalStatus?.generation_id ?? null,
    fetchImpl: input.fetchImpl,
  });
  const isCompleted = finalStatus?.status === "completed";
  return {
    endpoint: OPENROUTER_PROBE_ENDPOINTS.videos,
    modality: "video",
    requestSchemaVersion: "openrouter-contract-v1",
    responseShape: responseShape(statusRaw),
    billingIdKind: finalStatus?.generation_id
      ? "generation_id"
      : "missing",
    capabilities: {
      async: response.ok && parsed.success,
      query: Boolean(statusResponse?.ok && hasBillingCorrelation),
      cancel: false,
      webhook: false,
    },
    eligible: Boolean(statusResponse?.ok)
      && isCompleted
      && hasVideoContent
      && hasBillingCorrelation,
  };
}

async function probeSpeech(input: {
  apiKey: string;
  modelId: string;
  fetchImpl: FetchLike;
}): Promise<ProbeModalityReport> {
  const request = {
    model: input.modelId,
    input: "probe speech",
    voice: "default",
    response_format: "mp3",
  };
  const parsedRequest = OpenRouterAudioSpeechRequestSchema.safeParse(request);
  if (!parsedRequest.success) {
    return ineligible("speech", OPENROUTER_PROBE_ENDPOINTS.speech);
  }
  const response = await input.fetchImpl(endpointUrl(OPENROUTER_PROBE_ENDPOINTS.speech), {
    method: "POST",
    headers: headers(input.apiKey),
    body: JSON.stringify(parsedRequest.data),
  });
  const parsedResponse = await parseOpenRouterAudioResponse(response).then(
    () => true,
    () => false,
  );
  return {
    endpoint: OPENROUTER_PROBE_ENDPOINTS.speech,
    modality: "speech",
    requestSchemaVersion: "openrouter-contract-v1",
    responseShape: parsedResponse ? { content_type: response.headers.get("content-type") ?? null } : {},
    billingIdKind: "missing",
    capabilities: { async: false, query: false, cancel: false, webhook: false },
    eligible: false,
  };
}

export async function runOpenRouterCapabilityProbe(
  input: RunOpenRouterCapabilityProbeInput,
): Promise<OpenRouterCapabilityProbeReport> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const catalogs = await mapLimited(catalogEndpoints, 3, (endpoint) =>
    fetchCatalog(endpoint, input.apiKey, fetchImpl));

  if (input.mode === "list-models") {
    return {
      generatedAt: (input.now ?? (() => new Date()))().toISOString(),
      catalogs,
      modalities: [],
    };
  }

  const modalities: ProbeModalityReport[] = [];
  const requested = input.requestedModels ?? {};
  const videoPoll = {
    intervalMs: input.videoPoll?.intervalMs ?? 5_000,
    maxAttempts: input.videoPoll?.maxAttempts ?? 60,
  };
  if (requested.text) {
    modalities.push(hasCatalogModel(catalogs, "text", requested.text)
      ? await probeText({ apiKey: input.apiKey, modelId: requested.text, fetchImpl })
      : ineligible("text", OPENROUTER_PROBE_ENDPOINTS.chatCompletions));
  }
  if (requested.image) {
    modalities.push(hasCatalogModel(catalogs, "image", requested.image)
      ? await probeImage({ apiKey: input.apiKey, modelId: requested.image, fetchImpl })
      : ineligible("image", OPENROUTER_PROBE_ENDPOINTS.images));
  }
  if (requested.video) {
    modalities.push(hasCatalogModel(catalogs, "video", requested.video)
      ? await probeVideo({
        apiKey: input.apiKey,
        modelId: requested.video,
        fetchImpl,
        pollIntervalMs: videoPoll.intervalMs,
        pollMaxAttempts: videoPoll.maxAttempts,
      })
      : ineligible("video", OPENROUTER_PROBE_ENDPOINTS.videos));
  }
  if (requested.speech) {
    modalities.push(hasCatalogModel(catalogs, "speech", requested.speech)
      ? await probeSpeech({
        apiKey: input.apiKey,
        modelId: requested.speech,
        fetchImpl,
      })
      : ineligible("speech", OPENROUTER_PROBE_ENDPOINTS.speech));
  }

  return {
    generatedAt: (input.now ?? (() => new Date()))().toISOString(),
    catalogs,
    modalities,
  };
}

function ineligible(modality: Modality, endpoint: string): ProbeModalityReport {
  return {
    endpoint,
    modality,
    requestSchemaVersion: "openrouter-contract-v1",
    responseShape: {},
    billingIdKind: "missing",
    capabilities: { async: false, query: false, cancel: false, webhook: false },
    eligible: false,
  };
}

function sanitizeShape(shape: Readonly<Record<string, unknown>>): { keys: readonly string[] } {
  return { keys: Object.keys(shape).sort() };
}

export function sanitizeProbeReport(
  report: OpenRouterCapabilityProbeReport,
): SanitizedOpenRouterProbeReport {
  return {
    generatedAt: report.generatedAt,
    catalogs: report.catalogs.map((catalog) => ({
      endpoint: catalog.endpoint,
      modelCount: catalog.modelIds.length,
    })),
    modalities: report.modalities.map((item) => ({
      endpoint: item.endpoint,
      modality: item.modality,
      requestSchemaVersion: item.requestSchemaVersion,
      responseShape: sanitizeShape(item.responseShape),
      billingIdKind: item.billingIdKind,
      capabilities: item.capabilities,
      eligible: item.eligible,
    })),
  };
}

export function listOpenRouterModelsForOperators(
  report: OpenRouterCapabilityProbeReport,
): OpenRouterModelListForOperators {
  return {
    generatedAt: report.generatedAt,
    catalogs: report.catalogs.map((catalog) => ({
      endpoint: catalog.endpoint,
      modelIds: [...catalog.modelIds].sort(),
    })),
  };
}
