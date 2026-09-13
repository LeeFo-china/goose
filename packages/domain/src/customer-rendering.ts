import { z } from 'zod';

export const RENDERING_TRIAL_LIMIT = 1;
export const RENDERING_CUSTOMER_LIMIT = 5;
export const RENDERING_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const RENDERING_BATCH_UPLOAD_LIMIT = 20;
export const RENDERING_SPACE_VALUES = ['living_room', 'bedroom'] as const;
export const RENDERING_MODE_VALUES = ['soft_furnishing', 'renovation'] as const;
export const RENDERING_STYLE_VALUES = [
  'modern_simple', 'cream', 'new_chinese', 'nordic', 'light_luxury',
  'natural_wood', 'american', 'french', 'wabi_sabi',
] as const;

export const RenderingUploadPurposeSchema = z.enum(['room', 'floor_plan']);
export const RenderingUploadMimeSchema = z.enum(['image/jpeg', 'image/png', 'image/webp']);
export const RenderingUploadIntentRequestSchema = z.strictObject({
  purpose: RenderingUploadPurposeSchema,
  mime_type: RenderingUploadMimeSchema,
  size_bytes: z.number().int().min(1).max(RENDERING_UPLOAD_MAX_BYTES),
});
export const RenderingUploadCompleteRequestSchema = z.strictObject({});
export const RenderingUploadIntentResponseSchema = z.strictObject({
  intent_id: z.uuid(),
  method: z.literal('PUT'),
  upload_url: z.url({ protocol: /^https$/ }),
  headers: z.record(z.string(), z.string()),
  expires_at: z.iso.datetime({ offset: true }),
});
export const RenderingUploadCompleteResponseSchema = z.strictObject({
  file_id: z.uuid(),
  status: z.literal('pending_review'),
  mime_type: z.literal('image/webp'),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  size_bytes: z.number().int().positive(),
});

const CountSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const TextSchema = z.string().trim().min(1).max(300);
const SpaceSchema = z.enum(RENDERING_SPACE_VALUES);
const StyleSchema = z.enum(RENDERING_STYLE_VALUES);

export const RenderingListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  space: SpaceSchema.optional(),
  style: StyleSchema.optional(),
});

export const RenderingJobRequestSchema = z.strictObject({
  style_asset_id: z.uuid(),
  room_file_id: z.uuid(),
  floor_plan_file_id: z.uuid().optional(),
  space: SpaceSchema,
  mode: z.enum(RENDERING_MODE_VALUES),
  keep_notes: z.string().trim().max(300).optional(),
  idempotency_key: z.uuid(),
});

export const RenderingStyleInputSchema = z.strictObject({
  title: z.string().trim().min(1).max(80),
  space: SpaceSchema,
  style: StyleSchema,
  color_notes: z.string().trim().max(300).default(''),
  material_notes: z.string().trim().max(300).default(''),
  source_type: z.enum(['real_case', 'design', 'ai_concept']),
  rights_confirmed: z.literal(true),
  file_id: z.uuid(),
  sort_order: z.number().int().min(0).max(100_000).default(0),
});

export const RenderingSettingsSchema = z.strictObject({
  enabled: z.boolean(),
  daily_task_limit: z.number().int().min(1).max(10_000).nullable(),
  daily_budget_fen: z.number().int().min(1).max(100_000_000).nullable(),
}).superRefine((value, ctx) => {
  if (value.enabled && (value.daily_task_limit === null || value.daily_budget_fen === null)) {
    ctx.addIssue({ code: 'custom', message: '启用前必须设置每日任务上限和费用预算' });
  }
});

const AdviceItemSchema = z.strictObject({ observed: TextSchema, suggested: TextSchema });
const AdviceGroupSchema = z.array(AdviceItemSchema).min(1).max(5);
export const RenderingAdviceSchema = z.strictObject({
  colors: AdviceGroupSchema,
  materials: AdviceGroupSchema,
  furniture: AdviceGroupSchema,
  onsite_checks: z.array(TextSchema).min(1).max(5),
});

export const RenderingQuotaSchema = z.strictObject({
  trial_used: z.boolean(),
  phone_verified: z.boolean(),
  consumed: CountSchema,
  reserved: CountSchema,
  remaining: z.number().int().min(0).max(RENDERING_CUSTOMER_LIMIT),
  active_job_id: z.uuid().nullable(),
  can_generate: z.boolean(),
  blocked_reason: z.enum(['phone_required', 'quota_exhausted', 'job_active']).nullable(),
});

const QuotaProjectionInputSchema = z.strictObject({
  phoneVerified: z.boolean(),
  consumed: CountSchema,
  reserved: CountSchema,
  activeJobId: z.uuid().nullable(),
});

export type RenderingQuota = z.infer<typeof RenderingQuotaSchema>;
export type RenderingJobRequest = z.infer<typeof RenderingJobRequestSchema>;
export type RenderingUploadIntentRequest = z.infer<typeof RenderingUploadIntentRequestSchema>;
export type RenderingUploadCompleteRequest = z.infer<typeof RenderingUploadCompleteRequestSchema>;
export type RenderingUploadIntentResponse = z.infer<typeof RenderingUploadIntentResponseSchema>;
export type RenderingUploadCompleteResponse = z.infer<typeof RenderingUploadCompleteResponseSchema>;
export type RenderingStyleInput = z.infer<typeof RenderingStyleInputSchema>;
export type RenderingSettings = z.infer<typeof RenderingSettingsSchema>;
export type RenderingAdvice = z.infer<typeof RenderingAdviceSchema>;
export type RenderingListQuery = z.infer<typeof RenderingListQuerySchema>;

/** Projection only: task admission still requires an atomic server-side reservation. */
export function projectRenderingQuota(input: z.infer<typeof QuotaProjectionInputSchema>): RenderingQuota {
  const { phoneVerified, consumed, reserved, activeJobId } = QuotaProjectionInputSchema.parse(input);
  const limit = phoneVerified ? RENDERING_CUSTOMER_LIMIT : RENDERING_TRIAL_LIMIT;
  const remaining = Math.max(0, limit - consumed - reserved);
  const active = reserved > 0 || activeJobId !== null;
  const blockedReason = active ? 'job_active'
    : remaining > 0 ? null
      : phoneVerified ? 'quota_exhausted' : 'phone_required';
  return {
    trial_used: consumed > 0,
    phone_verified: phoneVerified,
    consumed,
    reserved,
    remaining,
    active_job_id: activeJobId,
    can_generate: blockedReason === null,
    blocked_reason: blockedReason,
  };
}
