import { z } from "zod";

const decimalString = z.string().regex(/^\d+(?:\.\d+)?$/);
const numberOrDecimalString = z.union([z.number().finite().nonnegative(), decimalString]);
const modelCatalogPriceValue = z.union([numberOrDecimalString, z.literal(-1), z.literal("-1")]);
const nullableNumber = z.number().finite().nullable();
const nullableInteger = z.number().int().nullable();
const stringArray = z.array(z.string().max(128)).max(1_000);

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
  elo: nullableNumber.optional(),
  rank: nullableNumber.optional(),
  win_rate: nullableNumber.optional(),
});
const artificialAnalysisBenchmarkSchema = z.strictObject({
  agentic_index: nullableNumber.optional(),
  coding_index: nullableNumber.optional(),
  intelligence_index: nullableNumber.optional(),
});
const benchmarksSchema = z.strictObject({
  artificial_analysis: artificialAnalysisBenchmarkSchema.optional(),
  design_arena: z.array(designArenaBenchmarkSchema).max(1_000).optional(),
});
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
const modelReasoningSchema = z.strictObject({
  default_effort: z.string().trim().min(1).max(64).optional(),
  default_enabled: z.boolean().optional(),
  mandatory: z.boolean().optional(),
  supported_efforts: z.array(z.string().trim().min(1).max(64)).max(128).nullable().optional(),
  supports_max_tokens: z.boolean().optional(),
});
const pricingOverrideSchema = z.strictObject({
  audio: modelCatalogPriceValue.optional(),
  completion: modelCatalogPriceValue.optional(),
  input_audio_cache: modelCatalogPriceValue.optional(),
  input_cache_read: modelCatalogPriceValue.optional(),
  input_cache_write: modelCatalogPriceValue.optional(),
  input_cache_write_1h: modelCatalogPriceValue.optional(),
  max_prompt_tokens: nullableInteger.optional(),
  min_prompt_tokens: nullableInteger.optional(),
  prompt: modelCatalogPriceValue.optional(),
  utc_days: z.array(z.string().max(32)).max(31).optional(),
  utc_end: z.number().finite().optional(),
  utc_start: z.number().finite().optional(),
});
const pricingSchema = z.strictObject({
  audio: modelCatalogPriceValue.optional(),
  audio_output: modelCatalogPriceValue.optional(),
  completion: modelCatalogPriceValue.optional(),
  discount: modelCatalogPriceValue.optional(),
  image: modelCatalogPriceValue.optional(),
  image_output: modelCatalogPriceValue.optional(),
  image_token: modelCatalogPriceValue.optional(),
  input_audio: modelCatalogPriceValue.optional(),
  input_audio_cache: modelCatalogPriceValue.optional(),
  input_cache_read: modelCatalogPriceValue.optional(),
  input_cache_write: modelCatalogPriceValue.optional(),
  input_cache_write_1h: modelCatalogPriceValue.optional(),
  internal_reasoning: modelCatalogPriceValue.optional(),
  output_audio: modelCatalogPriceValue.optional(),
  prompt: modelCatalogPriceValue.optional(),
  request: modelCatalogPriceValue.optional(),
  overrides: z.array(pricingOverrideSchema).max(1_000).optional(),
  web_search: modelCatalogPriceValue.optional(),
});
const requestLimitsSchema = z.strictObject({
  completion_tokens: nullableInteger.optional(),
  images: nullableInteger.optional(),
  prompt_tokens: nullableInteger.optional(),
  requests: nullableInteger.optional(),
});
const topProviderSchema = z.strictObject({
  context_length: nullableInteger.optional(),
  is_moderated: z.boolean().nullable().optional(),
  max_completion_tokens: nullableInteger.optional(),
});

const modelEntrySchema = z.strictObject({
  alias_target: z.strictObject({
    name: z.string().trim().min(1).max(512),
    slug: z.string().trim().min(1).max(512),
  }).nullable().optional(),
  architecture: modelArchitectureSchema.optional(),
  benchmarks: benchmarksSchema.optional(),
  canonical_slug: z.string().max(512).nullable().optional(),
  context_length: z.number().int().nonnegative().nullable().optional(),
  created: z.number().int().nonnegative().nullable().optional(),
  default_parameters: defaultParametersSchema.nullable().optional(),
  description: z.string().max(20_000).nullable().optional(),
  endpoints: z.string().max(2_048).optional(),
  expiration_date: z.union([z.string().max(128), z.number().int()]).nullable().optional(),
  hugging_face_id: z.string().max(512).nullable().optional(),
  id: z.string().trim().min(1).max(256),
  knowledge_cutoff: z.string().max(128).nullable().optional(),
  links: modelLinksSchema.optional(),
  name: z.string().trim().min(1).max(512).optional(),
  per_request_limits: requestLimitsSchema.nullable().optional(),
  pricing: pricingSchema.optional(),
  reasoning: modelReasoningSchema.optional(),
  supported_parameters: stringArray.optional(),
  supported_voices: stringArray.nullable().optional(),
  top_provider: topProviderSchema.nullable().optional(),
});

export const OpenRouterModelListSchema = z.strictObject({
  data: z.array(modelEntrySchema).max(10_000),
  links: modelLinksSchema,
  total_count: z.number().int().nonnegative(),
});
