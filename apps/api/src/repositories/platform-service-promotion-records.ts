import { z } from "zod";

const DateTimeSchema = z.iso.datetime({ offset: true });
const NullableDateTimeSchema = DateTimeSchema.nullable();
const NullableStringSchema = z.string().nullable();

const PlatformServicePromotionRecordSchema = z.strictObject({
  id: z.string(),
  code: z.string(),
  draft_version_id: NullableStringSchema,
  published_version_id: NullableStringSchema,
  version: z.number().int().positive(),
  archived_at: NullableDateTimeSchema,
  created_by_employee_id: NullableStringSchema,
  updated_by_employee_id: NullableStringSchema,
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
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
  version_no: z.number().int().positive(),
  publication_status: PlatformServicePromotionVersionStatusSchema,
  name: z.string(),
  badge_text: z.string(),
  title: z.string(),
  summary: z.string(),
  rules_text: z.string(),
  discount_rate_basis_points: z.number().int().min(1).max(9999),
  starts_at: NullableDateTimeSchema,
  ends_at: NullableDateTimeSchema,
  published_at: NullableDateTimeSchema,
  published_by_employee_id: NullableStringSchema,
  stopped_at: NullableDateTimeSchema,
  stopped_by_employee_id: NullableStringSchema,
  stop_reason: NullableStringSchema,
  created_at: DateTimeSchema,
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
  term_years: z.number().int().positive(),
  base_amount_fen: z.number().int().positive(),
  effective_amount_fen: z.number().int().positive(),
  base_price_rate_basis_points: z.number().int().min(1).max(10_000),
  price_rate_basis_points: z.number().int().min(1).max(10_000),
});

const PlatformServicePromotionCommandResultSchema = z.strictObject({
  idempotent: z.boolean(),
  promotion: PlatformServicePromotionRecordSchema,
  draft: PlatformServicePromotionVersionRecordSchema.nullable(),
  published: PlatformServicePromotionVersionRecordSchema.nullable(),
  price_preview: z.array(PlatformServicePromotionPricePreviewSchema),
  server_time: DateTimeSchema,
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
    page: z.number().int().positive(),
    pageSize: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
  server_time: DateTimeSchema,
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
) {
  return PlatformServicePromotionCommandResultSchema.safeParse(value);
}

export function parsePlatformServicePromotionListPage(
  value: unknown,
) {
  return PlatformServicePromotionListPageSchema.safeParse(value);
}
