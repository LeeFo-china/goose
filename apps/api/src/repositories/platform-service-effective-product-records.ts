import { z } from "zod";
import { Errors } from "../errors/error-factory";

const money = z.number().int().positive();
const version = z.number().int().positive();
const dateTime = z.iso.datetime({ offset: true });
const rate = z.number().int().min(1).max(10000);

export const platformServicePromotionSnapshotSchema = z.object({
  id: z.uuid(),
  version_id: z.uuid(),
  version,
  name: z.string(),
  badge_text: z.string(),
  title: z.string(),
  summary: z.string(),
  rules_text: z.string(),
  discount_rate_basis_points: rate.max(9999),
  starts_at: dateTime,
  ends_at: dateTime,
  base_amount_fen: money,
  effective_amount_fen: money,
});

// Legacy orders contain the published daily price but no promotion fields.
export const platformServiceProductSnapshotSchema = z.object({
  product_id: z.uuid(),
  product_version_id: z.uuid(),
  code: z.string().min(1),
  title: z.string(),
  pricing_version: version,
  term_years: version,
  list_amount_fen: money,
  amount_fen: money,
  service_scope: z.array(z.string()),
  terms_version: version,
  terms_content: z.string(),
  base_amount_fen: money.optional(),
  effective_amount_fen: money.optional(),
  base_price_rate_basis_points: z.literal(10000).optional(),
  price_rate_basis_points: rate.optional(),
  promotion: platformServicePromotionSnapshotSchema.nullable().optional(),
});

const effectiveProductSchema = platformServiceProductSnapshotSchema.extend({
  id: z.uuid(),
  base_amount_fen: money,
  effective_amount_fen: money,
  base_price_rate_basis_points: z.literal(10000),
  price_rate_basis_points: rate,
  promotion: platformServicePromotionSnapshotSchema.nullable(),
}).refine((item) => item.id === item.product_id &&
  item.amount_fen === item.effective_amount_fen);

const effectiveProductsPageSchema = z.object({
  list: z.array(effectiveProductSchema).max(100),
  pagination: z.object({
    page: version,
    pageSize: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
  server_time: dateTime,
}).refine(({ list, pagination }) => list.length <= pagination.pageSize &&
  pagination.totalPages === Math.ceil(pagination.total / pagination.pageSize));

export type PlatformServicePromotionSnapshot =
  z.infer<typeof platformServicePromotionSnapshotSchema>;
export type PlatformServiceProductSnapshot =
  z.infer<typeof platformServiceProductSnapshotSchema>;
export type EffectiveProductRecord = z.infer<typeof effectiveProductSchema>;

export function parseEffectiveProductsPage(data: unknown) {
  const result = effectiveProductsPageSchema.safeParse(data);
  if (!result.success) throw Errors.dbError("查询平台技术服务商品失败");
  return result.data;
}
