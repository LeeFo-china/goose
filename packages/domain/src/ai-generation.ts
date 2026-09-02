import { z } from 'zod';

export const AI_MODALITY_VALUES = ['text', 'image', 'video', 'speech'] as const;
export const AI_QUALITY_TIER_VALUES = ['fast', 'balanced', 'quality'] as const;
export const AI_GENERATION_STATUS_VALUES = [
  'awaiting_budget_reconfirmation',
  'queued',
  'submitting',
  'submission_unknown',
  'submitted',
  'processing',
  'succeeded',
  'failed',
  'canceled',
] as const;
export const AI_BILLING_STATUS_VALUES = [
  'estimated',
  'reserved',
  'settled',
  'overrun',
  'adjusted',
] as const;

export const AiModalitySchema = z.enum(AI_MODALITY_VALUES);
export const AiQualityTierSchema = z.enum(AI_QUALITY_TIER_VALUES);
export const AiGenerationStatusSchema = z.enum(AI_GENERATION_STATUS_VALUES);
export const AiBillingStatusSchema = z.enum(AI_BILLING_STATUS_VALUES);
export const AiMoneySchema = z.string().regex(/^\d{1,12}\.\d{12}$/u);

export const AiScopeSchema = z.strictObject({
  scope_type: z.enum(['platform', 'tenant']),
  tenant_id: z.uuid().nullable(),
}).superRefine((value, ctx) => {
  if (value.scope_type === 'platform' && value.tenant_id !== null) {
    ctx.addIssue({
      code: 'custom',
      path: ['tenant_id'],
      message: '平台任务不能绑定租户',
    });
  }
  if (value.scope_type === 'tenant' && value.tenant_id === null) {
    ctx.addIssue({
      code: 'custom',
      path: ['tenant_id'],
      message: '租户任务必须绑定租户',
    });
  }
});

const StringListSchema = z.array(z.string().trim().min(1).max(128)).min(1).max(64);

export const AiTextCapabilitySchema = z.strictObject({
  modality: z.literal('text'),
  max_context_tokens: z.number().int().positive().max(10_000_000),
  supports_json_object: z.boolean(),
  supports_streaming: z.boolean(),
});

export const AiImageCapabilitySchema = z.strictObject({
  modality: z.literal('image'),
  supported_sizes: StringListSchema,
  supports_reference_image: z.boolean(),
  max_images_per_request: z.number().int().positive().max(64),
});

export const AiVideoCapabilitySchema = z.strictObject({
  modality: z.literal('video'),
  aspect_ratios: StringListSchema,
  max_duration_seconds: z.number().int().positive().max(3600),
  supports_audio: z.boolean(),
});

export const AiSpeechCapabilitySchema = z.strictObject({
  modality: z.literal('speech'),
  supported_voices: StringListSchema,
  output_formats: StringListSchema,
  max_input_characters: z.number().int().positive().max(200_000),
});

export const AiModelCapabilitySchema = z.discriminatedUnion('modality', [
  AiTextCapabilitySchema,
  AiImageCapabilitySchema,
  AiVideoCapabilitySchema,
  AiSpeechCapabilitySchema,
]);

const AiPublicDateTimeSchema = z.union([
  z.iso.datetime({ offset: true, precision: 0 }),
  z.iso.datetime({ offset: true, precision: 1 }),
  z.iso.datetime({ offset: true, precision: 2 }),
  z.iso.datetime({ offset: true, precision: 3 }),
]);

export const AiGenerationJobSchema = z.strictObject({
  id: z.uuid(),
  scope: AiScopeSchema,
  modality: AiModalitySchema,
  quality_tier: AiQualityTierSchema,
  status: AiGenerationStatusSchema,
  billing_status: AiBillingStatusSchema,
  estimated_cost: AiMoneySchema,
  reserved_cost: AiMoneySchema,
  actual_cost: AiMoneySchema.nullable(),
  currency: z.literal('USD'),
  created_at: AiPublicDateTimeSchema,
  updated_at: AiPublicDateTimeSchema,
});

export type AiModality = z.infer<typeof AiModalitySchema>;
export type AiQualityTier = z.infer<typeof AiQualityTierSchema>;
export type AiGenerationStatus = z.infer<typeof AiGenerationStatusSchema>;
export type AiBillingStatus = z.infer<typeof AiBillingStatusSchema>;
export type AiScope = Readonly<z.infer<typeof AiScopeSchema>>;
export type AiModelCapability = Readonly<z.infer<typeof AiModelCapabilitySchema>>;
export type AiGenerationJob = Readonly<z.infer<typeof AiGenerationJobSchema>>;
