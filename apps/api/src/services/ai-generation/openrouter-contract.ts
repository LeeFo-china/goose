import { Errors } from "@/errors/error-factory";
import { z } from "zod";
const decimalString = z.string().regex(/^\d+(?:\.\d+)?$/);
const numberOrDecimalString = z.union([z.number().finite().nonnegative(), decimalString]);
const safeId = z.string().trim().min(1).max(256);
const safeUrl = z.url().max(2_048);
const safeOpenRouterVideoPath = z.string().regex(/^\/api\/v1\/videos\/[^?#]+(?:\?[^#]*)?$/)
  .max(2_048);
const openRouterVideoUrl = z.union([safeUrl, safeOpenRouterVideoPath]);
const safeText = z.string().max(20_000);
const nullableString = z.string().max(2_048).nullable();
const nullableNumber = z.number().finite().nullable();
const nullableInteger = z.number().int().nullable();

const stringArray = z.array(z.string().max(128)).max(1_000);
const scalarParameterValue = z.union([z.string().max(512), z.number().finite(), z.boolean(), z.null()]);
const parameterSpecSchema = z.strictObject({
  default: scalarParameterValue.optional(),
  max: z.number().finite().optional(),
  min: z.number().finite().optional(),
  type: z.string().trim().min(1).max(64),
  values: z.array(scalarParameterValue).max(1_000).optional(),
});
const modelArchitectureSchema = z.strictObject({
  input_modalities: stringArray.optional(),
  instruct_type: z.string().max(128).nullable().optional(),
  modality: z.string().max(128).nullable().optional(),
  output_modalities: stringArray.optional(),
  tokenizer: z.string().max(128).nullable().optional(),
});
const designArenaBenchmarkSchema = z.strictObject({
  arena: z.string().max(128),
  category: z.string().max(128),
  elo: z.number().finite().nullable().optional(),
  rank: z.number().finite().nullable().optional(),
  win_rate: z.number().finite().nullable().optional(),
});
const benchmarksSchema = z.strictObject({ design_arena: z.array(designArenaBenchmarkSchema).max(1_000).optional() });
const defaultParametersSchema = z.strictObject({
  frequency_penalty: nullableNumber.optional(),
  max_tokens: nullableInteger.optional(),
  presence_penalty: nullableNumber.optional(),
  repetition_penalty: nullableNumber.optional(),
  response_format: z.strictObject({ type: z.string().max(64) }).nullable().optional(),
  temperature: nullableNumber.optional(),
  top_k: nullableInteger.optional(),
  top_p: nullableNumber.optional(),
});
const modelLinksSchema = z.strictObject({
  details: z.string().max(2_048).optional(),
  next: z.string().max(2_048).nullable().optional(),
  prev: z.string().max(2_048).nullable().optional(),
});
const pricingSchema = z.strictObject({
  completion: numberOrDecimalString.optional(),
  image: numberOrDecimalString.optional(),
  input_audio: numberOrDecimalString.optional(),
  input_cache_read: numberOrDecimalString.optional(),
  input_cache_write: numberOrDecimalString.optional(),
  internal_reasoning: numberOrDecimalString.optional(),
  output_audio: numberOrDecimalString.optional(),
  prompt: numberOrDecimalString.optional(),
  request: numberOrDecimalString.optional(),
  overrides: z.array(z.strictObject({
    completion: numberOrDecimalString.optional(),
    max_prompt_tokens: nullableInteger.optional(),
    min_prompt_tokens: nullableInteger.optional(),
    prompt: numberOrDecimalString.optional(),
  })).max(1_000).optional(),
  web_search: numberOrDecimalString.optional(),
});
const requestLimitsSchema = z.strictObject({
  completion_tokens: nullableInteger.optional(), images: nullableInteger.optional(),
  prompt_tokens: nullableInteger.optional(), requests: nullableInteger.optional(),
});
const topProviderSchema = z.strictObject({
  context_length: nullableInteger.optional(),
  is_moderated: z.boolean().nullable().optional(),
  max_completion_tokens: nullableInteger.optional(),
});

const modelEntrySchema = z.strictObject({
  architecture: modelArchitectureSchema.optional(),
  benchmarks: benchmarksSchema.optional(),
  canonical_slug: z.string().max(512).nullable().optional(),
  context_length: z.number().int().nonnegative().nullable().optional(),
  created: z.number().int().nonnegative().nullable().optional(),
  default_parameters: defaultParametersSchema.nullable().optional(),
  description: safeText.nullable().optional(),
  endpoints: z.string().max(2_048).optional(),
  expiration_date: z.union([z.string().max(128), z.number().int()]).nullable().optional(),
  id: safeId,
  knowledge_cutoff: z.string().max(128).nullable().optional(),
  links: modelLinksSchema.optional(),
  name: z.string().trim().min(1).max(512).optional(),
  per_request_limits: requestLimitsSchema.nullable().optional(),
  pricing: pricingSchema.optional(),
  supported_parameters: stringArray.optional(),
  supported_voices: stringArray.nullable().optional(),
  top_provider: topProviderSchema.nullable().optional(),
});

export const OpenRouterModelListSchema = z.strictObject({
  data: z.array(modelEntrySchema).max(10_000),
  links: modelLinksSchema,
  total_count: z.number().int().nonnegative(),
});

const imageSupportedParametersSchema = z.strictObject({
  aspect_ratio: parameterSpecSchema.optional(),
  background: parameterSpecSchema.optional(),
  n: parameterSpecSchema.optional(),
  output_compression: parameterSpecSchema.optional(),
  output_format: parameterSpecSchema.optional(),
  quality: parameterSpecSchema.optional(),
  resolution: parameterSpecSchema.optional(),
  seed: parameterSpecSchema.optional(),
  size: parameterSpecSchema.optional(),
});

const imageModelEntrySchema = z.strictObject({
  architecture: modelArchitectureSchema.optional(),
  created: z.number().int().nonnegative().nullable().optional(),
  description: safeText.nullable().optional(),
  endpoints: z.string().max(2_048).optional(),
  id: safeId,
  name: z.string().trim().min(1).max(512).optional(),
  supported_parameters: imageSupportedParametersSchema.optional(),
  supports_streaming: z.boolean().optional(),
});

const videoModelEntrySchema = z.strictObject({
  allowed_passthrough_parameters: stringArray.optional(),
  canonical_slug: z.string().max(512).nullable().optional(),
  created: z.number().int().nonnegative().nullable().optional(),
  description: safeText.nullable().optional(),
  generate_audio: z.boolean().nullable().optional(),
  id: safeId,
  name: z.string().trim().min(1).max(512).optional(),
  pricing_skus: z.record(z.string().max(128), numberOrDecimalString).optional(),
  seed: z.union([z.boolean(), z.number().int(), z.string().max(128)]).nullable().optional(),
  supported_aspect_ratios: z.array(z.string().max(64)).max(128).optional(),
  supported_durations: z.array(z.number().finite().positive()).max(128).optional(),
  supported_frame_images: z.array(z.string().max(64)).max(128).nullable().optional(),
  supported_resolutions: z.array(z.string().max(64)).max(128).optional(),
  supported_sizes: z.array(z.string().max(64)).max(128).nullable().optional(),
});

export const OpenRouterImageModelListSchema = z.strictObject({ data: z.array(imageModelEntrySchema).max(10_000) });

export const OpenRouterVideoModelListSchema = z.strictObject({ data: z.array(videoModelEntrySchema).max(10_000) });

const tokenUsageSchema = z.strictObject({
  completion_tokens: z.number().int().nonnegative().optional(),
  completion_tokens_details: z.strictObject({
    reasoning_tokens: z.number().int().nonnegative().optional(),
  }).optional(),
  cost: numberOrDecimalString.optional(),
  cost_details: z.strictObject({
    upstream_inference_completions_cost: numberOrDecimalString.optional(),
    upstream_inference_cost: numberOrDecimalString.nullable().optional(),
    upstream_inference_prompt_cost: numberOrDecimalString.optional(),
  }).optional(),
  is_byok: z.boolean().optional(),
  prompt_tokens: z.number().int().nonnegative().optional(),
  prompt_tokens_details: z.strictObject({
    audio_tokens: z.number().int().nonnegative().optional(),
    cache_write_tokens: z.number().int().nonnegative().optional(),
    cached_tokens: z.number().int().nonnegative().optional(),
  }).optional(),
  server_tool_use_details: z.strictObject({
    tool_calls_executed: z.number().int().nonnegative().optional(),
    tool_calls_requested: z.number().int().nonnegative().optional(),
  }).optional(),
  total_tokens: z.number().int().nonnegative().optional(),
});
const textLogprobsSchema = z.strictObject({
  content: z.array(z.strictObject({
    bytes: z.array(z.number().int().min(0).max(255)).max(4_096).nullable().optional(),
    logprob: z.number().finite().optional(),
    token: z.string().max(8_000).optional(),
    top_logprobs: z.array(z.strictObject({
      bytes: z.array(z.number().int().min(0).max(255)).max(4_096).nullable().optional(),
      logprob: z.number().finite().optional(),
      token: z.string().max(8_000).optional(),
    })).max(128).optional(),
  })).max(10_000).nullable().optional(),
  refusal: z.array(z.strictObject({
    bytes: z.array(z.number().int().min(0).max(255)).max(4_096).nullable().optional(),
    logprob: z.number().finite().optional(),
    token: z.string().max(8_000).optional(),
  })).max(10_000).nullable().optional(),
});
const openRouterMetadataSchema = z.strictObject({
  attempt: z.number().int().positive().optional(),
  endpoints: z.strictObject({
    available: z.array(z.strictObject({
      model: z.string().max(512).optional(),
      provider: z.string().max(512).optional(),
      selected: z.boolean().optional(),
    })).max(1_000).optional(),
    total: z.number().int().nonnegative().optional(),
  }).optional(),
  is_byok: z.boolean().optional(),
  provider_name: z.string().max(512).nullable().optional(),
  region: z.string().max(128).nullable().optional(),
  requested: z.string().max(512).optional(),
  strategy: z.string().max(256).optional(),
  summary: z.string().max(8_000).optional(),
});
const videoStatusUsageSchema = z.strictObject({
  cost: numberOrDecimalString.optional(),
  is_byok: z.boolean().nullable().optional(),
});
const videoStatusOutputSchema = z.strictObject({ url: safeUrl.optional() });
const openRouterErrorObjectSchema = z.strictObject({
  code: z.union([z.string().max(128), z.number().finite()]).optional(),
  message: z.string().max(8_000).optional(),
  status: z.number().int().optional(),
  type: z.string().max(128).optional(),
});
const providerResponseSchema = z.strictObject({
  cost: nullableNumber.optional(),
  latency: nullableInteger.optional(),
  provider_name: nullableString.optional(),
  status: nullableString.optional(),
});

export const OpenRouterImageResultSchema = z.strictObject({
  created: z.number().int().nonnegative().optional(),
  data: z.array(z.strictObject({
    b64_json: z.string().min(1).max(50_000_000).optional(),
    media_type: z.string().regex(/^image\//).optional(),
    revised_prompt: z.string().max(8_000).nullable().optional(),
    url: safeUrl.optional(),
  }).refine((item) => Boolean(item.b64_json || item.url))).min(1).max(16),
  usage: tokenUsageSchema.optional(),
});

export const OpenRouterTextResultSchema = z.strictObject({
  id: safeId,
  choices: z.array(z.strictObject({
    finish_reason: z.string().max(128).nullable().optional(),
    index: z.number().int().nonnegative().optional(),
    logprobs: textLogprobsSchema.nullable().optional(),
    message: z.strictObject({
      role: z.string().max(64).optional(),
      content: z.string().max(200_000),
    }),
  })).min(1).max(16),
  created: z.number().int().nonnegative().optional(),
  model: z.string().trim().min(1).max(512).optional(),
  object: z.string().trim().min(1).max(128).optional(),
  openrouter_metadata: openRouterMetadataSchema.optional(),
  service_tier: z.string().max(128).nullable().optional(),
  system_fingerprint: z.string().max(512).nullable().optional(),
  usage: tokenUsageSchema.optional(),
});

export const OpenRouterVideoSubmissionSchema = z.strictObject({
  id: safeId,
  generation_id: safeId.nullable().optional(),
  polling_url: openRouterVideoUrl,
  status: z.enum(["queued", "submitted", "processing", "running", "pending", "in_progress"]),
  unsigned_urls: z.array(safeUrl).max(16).optional(),
});

export const OpenRouterVideoStatusSchema = z.strictObject({
  id: safeId,
  generation_id: safeId.nullable().optional(),
  polling_url: openRouterVideoUrl.optional(),
  status: z.enum([
    "queued",
    "submitted",
    "processing",
    "running",
    "pending",
    "in_progress",
    "completed",
    "succeeded",
    "expired",
    "failed",
    "cancelled",
    "canceled",
  ]),
  unsigned_urls: z.array(safeUrl).max(16).optional(),
  usage: videoStatusUsageSchema.nullable().optional(),
  output: videoStatusOutputSchema.nullable().optional(),
  error: z.union([openRouterErrorObjectSchema, z.string().max(8_000)]).nullable().optional(),
});

export const OpenRouterGenerationUsageSchema = z.strictObject({
  data: z.strictObject({
    api_type: z.enum([
      "completions",
      "embeddings",
      "rerank",
      "tts",
      "stt",
      "video",
      "image",
    ]).nullable().optional(),
    app_id: nullableInteger.optional(),
    cache_discount: nullableNumber.optional(),
    cancelled: z.boolean().nullable().optional(),
    created_at: nullableString.optional(),
    data_region: nullableString.optional(),
    external_user: nullableString.optional(),
    finish_reason: nullableString.optional(),
    generation_time: nullableInteger.optional(),
    http_referer: nullableString.optional(),
    id: safeId,
    is_byok: z.boolean().nullable().optional(),
    latency: nullableInteger.optional(),
    model: z.string().max(512).nullable().optional(),
    moderation_latency: nullableInteger.optional(),
    native_finish_reason: nullableString.optional(),
    native_tokens_cached: nullableInteger.optional(),
    native_tokens_completion: nullableInteger.optional(),
    native_tokens_completion_images: nullableInteger.optional(),
    native_tokens_prompt: nullableInteger.optional(),
    native_tokens_reasoning: nullableInteger.optional(),
    num_fetches: nullableInteger.optional(),
    num_input_audio_prompt: nullableInteger.optional(),
    num_media_completion: nullableInteger.optional(),
    num_media_prompt: nullableInteger.optional(),
    num_search_results: nullableInteger.optional(),
    origin: nullableString.optional(),
    preset_id: nullableString.optional(),
    provider_name: nullableString.optional(),
    provider_responses: z.array(providerResponseSchema).nullable().optional(),
    request_id: nullableString.optional(),
    router: nullableString.optional(),
    service_tier: nullableString.optional(),
    session_id: nullableString.optional(),
    streamed: z.boolean().nullable().optional(),
    tokens_completion: nullableInteger.optional(),
    tokens_prompt: nullableInteger.optional(),
    total_cost: numberOrDecimalString,
    upstream_id: nullableString.optional(),
    upstream_inference_cost: nullableNumber.optional(),
    usage: numberOrDecimalString.optional(),
    user_agent: nullableString.optional(),
    web_search_engine: nullableString.optional(),
    workspace_id: nullableString.optional(),
  }),
});

export const OpenRouterCreditsSchema = z.strictObject({
  data: z.strictObject({
    total_credits: numberOrDecimalString,
    total_usage: numberOrDecimalString,
  }),
});

export const OpenRouterAudioSpeechRequestSchema = z.strictObject({
  model: safeId,
  input: z.string().trim().min(1).max(8_000),
  voice: z.string().trim().min(1).max(128),
  response_format: z.enum(["mp3", "opus", "aac", "flac", "wav", "pcm"]).optional(),
  speed: z.number().finite().positive().max(4).optional(),
  provider: z.strictObject({
    allow_fallbacks: z.boolean().optional(),
    ignore: z.array(safeId).max(128).optional(),
    only: z.array(safeId).max(128).optional(),
    options: z.record(z.string().max(128), z.record(z.string().max(128), scalarParameterValue))
      .optional(),
    order: z.array(safeId).max(128).optional(),
    require_parameters: z.boolean().optional(),
  }).optional(),
});

export type OpenRouterNormalizedResult = {
  billingCorrelationId: string;
  providerTaskId: string | null;
  status: "submitted" | "processing" | "succeeded";
  output: Readonly<Record<string, unknown>>;
  usage: Readonly<Record<string, string | number | null>>;
  temporaryAssetUrls: readonly string[];
};

export type OpenRouterErrorKind =
  | "definitely_not_submitted"
  | "submission_unknown"
  | "terminal_provider_failure"
  | "rate_limited"
  | "invalid_response";

export function normalizeOpenRouterErrorKind(status: number): OpenRouterErrorKind {
  if (status === 429) return "rate_limited";
  if (status >= 400 && status < 500) return "definitely_not_submitted";
  if (status === 502 || status === 529) return "terminal_provider_failure";
  if (status >= 500) return "submission_unknown";
  return "invalid_response";
}

function invalidProviderResponse(message = "AI 供应商响应格式无效"): never {
  throw Errors.business(502, message, "AI_PROVIDER_RESPONSE_INVALID");
}

function readContentLength(response: Response): number | null {
  const raw = response.headers.get("content-length");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

async function readBoundedBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  const contentLength = readContentLength(response);
  if (contentLength !== null && contentLength > maxBytes) invalidProviderResponse();

  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) invalidProviderResponse();
    return bytes;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      invalidProviderResponse();
    }
    chunks.push(value);
  }
  if (total === 0) invalidProviderResponse();

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

type ParseBinaryResponseOptions = {
  maxBytes?: number;
};

export async function parseOpenRouterAudioResponse(
  response: Response,
  options: ParseBinaryResponseOptions = {},
): Promise<{
  contentType: string;
  bytes: Uint8Array;
}> {
  if (!response.ok) {
    throw Errors.business(
      response.status >= 500 ? 502 : response.status,
      "AI 配音请求失败",
      "AI_PROVIDER_REQUEST_FAILED",
      { kind: normalizeOpenRouterErrorKind(response.status), statusCode: response.status },
    );
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase()
    || "";
  if (!contentType.startsWith("audio/")) invalidProviderResponse();

  const bytes = await readBoundedBytes(response, options.maxBytes ?? 25_000_000);

  return {
    contentType,
    bytes,
  };
}

export async function parseOpenRouterVideoContentResponse(
  response: Response,
  options: ParseBinaryResponseOptions = {},
): Promise<{
  contentType: string;
  bytes: Uint8Array;
}> {
  if (!response.ok) {
    throw Errors.business(
      response.status >= 500 ? 502 : response.status,
      "AI 视频内容读取失败",
      "AI_PROVIDER_REQUEST_FAILED",
      { kind: normalizeOpenRouterErrorKind(response.status), statusCode: response.status },
    );
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase()
    || "";
  if (!contentType.startsWith("video/")) invalidProviderResponse();

  return {
    contentType,
    bytes: await readBoundedBytes(response, options.maxBytes ?? 250_000_000),
  };
}
