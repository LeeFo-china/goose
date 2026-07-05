import { PaginationQuerySchema } from "@/schema/request";
import { z } from "zod";

export const PlatformPartnerStatusSchema = z.enum([
  "pending",
  "active",
  "suspended",
  "terminated",
]);

export const PlatformPartnerListQuerySchema = PaginationQuerySchema.extend({
  status: PlatformPartnerStatusSchema.optional(),
  keyword: z.string().trim().max(120, "关键词不能超过 120 个字符").optional(),
  region_code: z.string().trim().max(12, "区域编码不能超过 12 个字符").optional(),
});

export const PlatformPartnerCreateSchema = z.object({
  name: z.string().trim().min(1, "合伙人名称不能为空").max(120, "合伙人名称不能超过 120 个字符"),
  subject_type: z.enum(["personal", "individual_business", "company"]),
  contact_name: z.string().trim().min(1, "联系人不能为空").max(60, "联系人不能超过 60 个字符"),
  phone: z.string().trim().min(6, "手机号不能为空").max(30, "手机号不能超过 30 个字符"),
  level_id: z.uuid("无效的合伙人等级 ID"),
  region_codes: z.array(z.string().trim().min(1).max(12)).default([]),
  contract_status: z.string().trim().max(40).default("pending"),
  settlement_account_status: z.string().trim().max(40).default("pending"),
  settlement_account: z.record(z.string(), z.unknown()).default({}),
  remark: z.string().trim().max(500).optional(),
}).strict();

export const PlatformPartnerUpdateSchema =
  PlatformPartnerCreateSchema.partial().strict();

export const PlatformPartnerIdParamSchema = z.object({
  id: z.uuid("无效的合伙人 ID"),
});

export const PlatformPartnerInviteCodeParamSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "邀请码不能为空")
    .max(120, "邀请码不能超过 120 个字符")
    .transform((value) => value.toUpperCase()),
});

export const PlatformPartnerStatusUpdateSchema = z.object({
  status: PlatformPartnerStatusSchema,
  reason: z.string().trim().min(1, "状态变更原因不能为空").max(300, "状态变更原因不能超过 300 个字符"),
}).strict();

export const PlatformPartnerInviteCodeCreateSchema = z.object({
  region_code: z.string().trim().max(12, "区域编码不能超过 12 个字符").optional(),
  campaign_code: z.string().trim().max(80, "活动编码不能超过 80 个字符").optional(),
  expires_at: z.string().datetime("过期时间格式无效").optional(),
}).strict();

export const TenantPartnerBindingCreateSchema = z.object({
  tenant_id: z.uuid("无效的租户 ID"),
  partner_id: z.uuid("无效的合伙人 ID"),
  invite_code_id: z.uuid("无效的邀请码 ID").optional(),
  source_type: z.enum(["invite_code", "manual", "lead_source"]),
  source_id: z.string().trim().max(120, "来源 ID 不能超过 120 个字符").optional(),
  change_reason: z.string().trim().min(1, "绑定原因不能为空").max(300, "绑定原因不能超过 300 个字符"),
}).strict();

export const TenantPartnerInviteBindingCreateSchema = z.object({
  invite_code: z
    .string()
    .trim()
    .min(1, "邀请码不能为空")
    .max(120, "邀请码不能超过 120 个字符")
    .transform((value) => value.toUpperCase()),
  source_id: z.string().trim().max(120, "来源 ID 不能超过 120 个字符").optional(),
}).strict();

export const TenantPartnerBindingListQuerySchema =
  PaginationQuerySchema.extend({
    partner_id: z.uuid("无效的合伙人 ID").optional(),
    tenant_id: z.uuid("无效的租户 ID").optional(),
  });

export type PlatformPartnerListQuery =
  z.infer<typeof PlatformPartnerListQuerySchema>;
export type PlatformPartnerCreateInput =
  z.infer<typeof PlatformPartnerCreateSchema>;
export type PlatformPartnerUpdateInput =
  z.infer<typeof PlatformPartnerUpdateSchema>;
export type PlatformPartnerStatusUpdateInput =
  z.infer<typeof PlatformPartnerStatusUpdateSchema>;
export type PlatformPartnerInviteCodeCreateInput =
  z.infer<typeof PlatformPartnerInviteCodeCreateSchema>;
export type PlatformPartnerInviteCodeResolveInput =
  z.infer<typeof PlatformPartnerInviteCodeParamSchema>;
export type TenantPartnerBindingCreateInput =
  z.infer<typeof TenantPartnerBindingCreateSchema>;
export type TenantPartnerInviteBindingCreateInput =
  z.infer<typeof TenantPartnerInviteBindingCreateSchema>;
export type TenantPartnerBindingListQuery =
  z.infer<typeof TenantPartnerBindingListQuerySchema>;
