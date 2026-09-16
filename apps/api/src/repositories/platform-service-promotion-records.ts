import { z } from "zod";

const NullableStringSchema = z.string().nullable();

const PlatformServicePromotionRecordSchema = z.strictObject({
  id: z.string(),
  code: z.string(),
  draft_version_id: NullableStringSchema,
  published_version_id: NullableStringSchema,
  version: z.number().int(),
  archived_at: NullableStringSchema,
  created_by_employee_id: NullableStringSchema,
  updated_by_employee_id: NullableStringSchema,
  created_at: z.string(),
  updated_at: z.string(),
});

const PlatformServicePromotionVersionStatusSchema = z.enum([
  "draft",
  "published",
  "superseded",
  "stopped",
]);

const PlatformServicePromotionVersionRecordSchema = z.strictObject({
  id: z.string(),
  promotion_id: z.string(),
  version_no: z.number().int(),
  publication_status: PlatformServicePromotionVersionStatusSchema,
  name: z.string(),
  badge_text: z.string(),
  title: z.string(),
  summary: z.string(),
  rules_text: z.string(),
  discount_rate_basis_points: z.number().int(),
  starts_at: NullableStringSchema,
  ends_at: NullableStringSchema,
  published_at: NullableStringSchema,
  published_by_employee_id: NullableStringSchema,
  stopped_at: NullableStringSchema,
  stopped_by_employee_id: NullableStringSchema,
  stop_reason: NullableStringSchema,
  created_at: z.string(),
});

const PlatformServicePromotionPhaseSchema = z.enum([
  "draft",
  "scheduled",
  "active",
  "ended",
  "stopped",
]);

const PlatformServicePromotionPricePreviewSchema = z.strictObject({
  product_id: z.string(),
  code: z.string(),
  title: z.string(),
  term_years: z.number().int(),
  base_amount_fen: z.number().int(),
  effective_amount_fen: z.number().int(),
  base_price_rate_basis_points: z.number().int(),
  price_rate_basis_points: z.number().int(),
});

const PlatformServicePromotionCommandResultSchema = z.strictObject({
  idempotent: z.boolean(),
  promotion: PlatformServicePromotionRecordSchema,
  draft: PlatformServicePromotionVersionRecordSchema.nullable(),
  published: PlatformServicePromotionVersionRecordSchema.nullable(),
  price_preview: z.array(PlatformServicePromotionPricePreviewSchema),
  server_time: z.string(),
});

const PlatformServicePromotionListRecordSchema =
  PlatformServicePromotionRecordSchema.extend({
    draft: PlatformServicePromotionVersionRecordSchema.nullable(),
    published: PlatformServicePromotionVersionRecordSchema.nullable(),
    phase: PlatformServicePromotionPhaseSchema,
    price_preview: z.array(PlatformServicePromotionPricePreviewSchema),
  });

const PlatformServicePromotionListPageSchema = z.strictObject({
  list: z.array(PlatformServicePromotionListRecordSchema),
  pagination: z.strictObject({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
  server_time: z.string(),
});

export type PlatformServicePromotionRecord =
  z.infer<typeof PlatformServicePromotionRecordSchema>;
export type PlatformServicePromotionVersionStatus =
  z.infer<typeof PlatformServicePromotionVersionStatusSchema>;
export type PlatformServicePromotionVersionRecord =
  z.infer<typeof PlatformServicePromotionVersionRecordSchema>;
export type PlatformServicePromotionPhase =
  z.infer<typeof PlatformServicePromotionPhaseSchema>;
export type PlatformServicePromotionPricePreview =
  z.infer<typeof PlatformServicePromotionPricePreviewSchema>;
export type PlatformServicePromotionCommandResult =
  z.infer<typeof PlatformServicePromotionCommandResultSchema>;
export type PlatformServicePromotionListRecord =
  z.infer<typeof PlatformServicePromotionListRecordSchema>;
export type PlatformServicePromotionListPage =
  z.infer<typeof PlatformServicePromotionListPageSchema>;

export function parsePlatformServicePromotionCommandResult(
  value: unknown,
): PlatformServicePromotionCommandResult | null {
  const parsed = PlatformServicePromotionCommandResultSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parsePlatformServicePromotionListPage(
  value: unknown,
): PlatformServicePromotionListPage | null {
  const parsed = PlatformServicePromotionListPageSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
