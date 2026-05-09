import { PaginationQuerySchema } from "@/schema/request";
import { z } from "zod";

export const TenantShareLinkSourceSchema = z.enum([
  "employee_share",
  "h5_campaign",
  "quote_form",
  "miniprogram_qrcode",
]);

export const TenantShareLinkTargetTypeSchema = z.enum([
  "miniprogram",
  "h5_page",
  "quote_form",
  "campaign",
  "custom",
]);

export const TenantShareLinkStatusSchema = z.enum(["active", "disabled"]);

export const TenantShareTokenSchema = z.string()
  .trim()
  .min(8, "分享 token 过短")
  .max(80, "分享 token 过长")
  .regex(/^[A-Za-z0-9_-]+$/, "分享 token 格式不正确");

export const TenantShareLinkTokenParamsSchema = z.object({
  token: TenantShareTokenSchema,
});

export const TenantShareLinkCreateSchema = z.object({
  source: TenantShareLinkSourceSchema.optional().default("employee_share"),
  target_type: TenantShareLinkTargetTypeSchema.optional().default("miniprogram"),
  target_id: z.string().trim().max(120, "目标 ID 不能超过 120 个字符").nullable().optional(),
  expires_at: z.iso.datetime("无效的过期时间").nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

export const TenantShareLinkListQuerySchema = PaginationQuerySchema.extend({
  source: TenantShareLinkSourceSchema.optional(),
  target_type: TenantShareLinkTargetTypeSchema.optional(),
  status: TenantShareLinkStatusSchema.optional(),
});

export type TenantShareLinkCreateInput = z.infer<typeof TenantShareLinkCreateSchema>;
export type TenantShareLinkListQuery = z.infer<typeof TenantShareLinkListQuerySchema>;
