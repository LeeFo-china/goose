import { z } from "zod";
import { PaginationQuerySchema } from "./request";

const DisplayNameSchema = z.string()
  .trim()
  .refine((value) => {
    const length = Array.from(value).length;
    return length >= 2 && length <= 40;
  }, "品牌名称必须为 2 到 40 个字符")
  .refine((value) => !/\p{C}/u.test(value), "品牌名称不能包含控制字符")
  .refine(
    (value) => !/^[\p{P}\p{S}\s]+$/u.test(value),
    "品牌名称不能仅包含标点或符号",
  );

const EntitlementReasonSchema = z.string()
  .trim()
  .min(2, "操作原因至少需要 2 个字符")
  .max(500, "操作原因不能超过 500 个字符");

export const BrandingEmptyQuerySchema = z.object({}).strict();

export const BrandingDraftSchema = z.object({
  display_name: DisplayNameSchema,
  logo_file_id: z.uuid("无效的 Logo 文件 ID"),
  version: z.number().int().min(0),
}).strict();

export const BrandingPublishSchema = z.object({
  version: z.number().int().positive(),
}).strict();

export const BrandingTenantParamsSchema = z.object({
  id: z.uuid("无效的租户 ID"),
}).strict();

export const BrandingEntitlementListQuerySchema =
  PaginationQuerySchema.strict();

export const EntitlementGrantSchema = z.object({
  term_years: z.number().int().min(1).max(10).default(1),
  reason: EntitlementReasonSchema,
}).strict();

export const EntitlementSuspendSchema = z.object({
  version: z.number().int().positive(),
  reason: EntitlementReasonSchema,
}).strict();

export const EntitlementResumeSchema = z.object({
  version: z.number().int().positive(),
  reason: EntitlementReasonSchema,
}).strict();

export const EntitlementRevokeSchema = z.object({
  version: z.number().int().positive(),
  reason: EntitlementReasonSchema,
  confirm: z.literal(true),
}).strict();

export type BrandingEmptyQueryInput =
  z.infer<typeof BrandingEmptyQuerySchema>;
export type BrandingDraftInput = z.infer<typeof BrandingDraftSchema>;
export type BrandingPublishInput = z.infer<typeof BrandingPublishSchema>;
export type BrandingTenantParamsInput =
  z.infer<typeof BrandingTenantParamsSchema>;
export type BrandingEntitlementListQueryInput =
  z.infer<typeof BrandingEntitlementListQuerySchema>;
export type EntitlementGrantInput = z.infer<typeof EntitlementGrantSchema>;
export type EntitlementSuspendInput =
  z.infer<typeof EntitlementSuspendSchema>;
export type EntitlementResumeInput = z.infer<typeof EntitlementResumeSchema>;
export type EntitlementRevokeInput = z.infer<typeof EntitlementRevokeSchema>;
