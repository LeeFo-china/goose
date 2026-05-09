import { PaginationQuerySchema } from "@/schema/request";
import { z } from "zod";

const ChinaMobilePhoneSchema = z.string()
  .trim()
  .regex(/^1[3-9]\d{9}$/, "请输入有效的手机号");

export const PlatformLeadStatusSchema = z.enum(["new", "assigned", "invalid"]);

export const PlatformLeadIdParamsSchema = z.object({
  id: z.uuid("无效的平台线索 ID"),
});

export const PlatformLeadSubmitSchema = z.object({
  phone: ChinaMobilePhoneSchema,
  name: z.string().trim().min(1, "请输入称呼").max(50, "称呼不能超过 50 个字符").optional(),
  city: z.string().trim().max(80, "城市不能超过 80 个字符").optional(),
  community: z.string().trim().max(120, "小区不能超过 120 个字符").optional(),
  area: z.coerce.number().positive("面积必须大于 0").max(10000, "面积过大").optional(),
  budget: z.string().trim().max(80, "预算不能超过 80 个字符").optional(),
  description: z.string().trim().max(1000, "需求描述不能超过 1000 个字符").optional(),
  source: z.string().trim().min(1).max(80).optional().default("platform_visitor"),
});

export const PlatformLeadListQuerySchema = PaginationQuerySchema.extend({
  status: PlatformLeadStatusSchema.optional(),
  phone: z.string().trim().max(20).optional(),
  keyword: z.string().trim().max(80).optional(),
  assigned_tenant_id: z.uuid("无效的租户 ID").optional(),
});

export const PlatformLeadAssignSchema = z.object({
  tenant_id: z.uuid("无效的目标租户 ID"),
  assigned_note: z.string().trim().max(500, "分配备注不能超过 500 个字符").optional(),
});

export type PlatformLeadStatus = z.infer<typeof PlatformLeadStatusSchema>;
export type PlatformLeadSubmitInput = z.infer<typeof PlatformLeadSubmitSchema>;
export type PlatformLeadListQuery = z.infer<typeof PlatformLeadListQuerySchema>;
export type PlatformLeadAssignInput = z.infer<typeof PlatformLeadAssignSchema>;
