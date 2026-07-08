import { PaginationQuerySchema } from "@/schema/request";
import { PlatformPartnerPhoneSchema } from "@/schema/platform-partner-phone";
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
  phone: PlatformPartnerPhoneSchema,
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

export const PlatformPartnerMemberCreateSchema = z.object({
  name: z.string().trim().min(1, "成员姓名不能为空").max(60, "成员姓名不能超过 60 个字符"),
  phone: PlatformPartnerPhoneSchema,
  role: z.enum(["owner", "operator"]).default("owner"),
}).strict();

export const PlatformPartnerMemberListQuerySchema = PaginationQuerySchema;

export const PlatformPartnerMemberStatusUpdateSchema = z.object({
  status: z.enum(["pending_bind", "active", "disabled"]),
  reason: z.string().trim().min(1, "状态变更原因不能为空").max(300, "状态变更原因不能超过 300 个字符"),
}).strict();

export const PlatformPartnerMemberIdParamSchema = z.object({
  memberId: z.uuid("无效的合伙人成员 ID"),
});

export const PlatformPartnerInviteCodeCreateSchema = z.object({
  region_code: z.string().trim().max(12, "区域编码不能超过 12 个字符").optional(),
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

const PartnerTenantOnboardingInviteCodeSchema = z
  .string()
  .trim()
  .min(1, "邀请码不能为空")
  .max(120, "邀请码不能超过 120 个字符")
  .transform((value) => value.toUpperCase());

const PartnerTenantOnboardingPhoneSchema = z
  .string()
  .trim()
  .regex(/^1[3-9]\d{9}$/, "手机号格式不正确");

const PartnerTenantOnboardingTextSchema = (max: number, message: string) =>
  z.preprocess((value) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === "string" && value.trim() === "") return undefined;
    return value;
  }, z.string().trim().max(max, message).optional());

export const PartnerTenantOnboardingSendCodeSchema = z.object({
  phone: PartnerTenantOnboardingPhoneSchema,
  request_device: PartnerTenantOnboardingTextSchema(120, "设备标识不能超过 120 个字符"),
}).strict();

export const PartnerTenantOnboardingSubmitSchema = z.object({
  invite_code: PartnerTenantOnboardingInviteCodeSchema,
  company_name: z.string().trim().min(1, "请输入装修公司名称").max(100, "装修公司名称不能超过 100 个字符"),
  admin_name: z.string().trim().min(1, "请输入管理员姓名").max(50, "管理员姓名不能超过 50 个字符"),
  admin_phone: PartnerTenantOnboardingPhoneSchema,
  sms_code: z.string().trim().regex(/^\d{4,6}$/, "验证码格式不正确"),
  region_code: PartnerTenantOnboardingTextSchema(20, "区域编码不能超过 20 个字符"),
  region_name: PartnerTenantOnboardingTextSchema(80, "区域名称不能超过 80 个字符"),
  address: PartnerTenantOnboardingTextSchema(200, "公司地址不能超过 200 个字符"),
  location: z.object({
    title: PartnerTenantOnboardingTextSchema(120, "地址标题不能超过 120 个字符"),
    poi_id: PartnerTenantOnboardingTextSchema(120, "POI ID 不能超过 120 个字符"),
    province: PartnerTenantOnboardingTextSchema(40, "地址省份不能超过 40 个字符"),
    city: PartnerTenantOnboardingTextSchema(40, "地址城市不能超过 40 个字符"),
    district: PartnerTenantOnboardingTextSchema(40, "地址区县不能超过 40 个字符"),
    adcode: PartnerTenantOnboardingTextSchema(20, "地址行政区划代码不能超过 20 个字符"),
    latitude: z.coerce.number("地址纬度必须是数字").min(-90).max(90).optional(),
    longitude: z.coerce.number("地址经度必须是数字").min(-180).max(180).optional(),
  }).strict().optional(),
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
export type PlatformPartnerMemberCreateInput =
  z.infer<typeof PlatformPartnerMemberCreateSchema>;
export type PlatformPartnerMemberListQuery =
  z.infer<typeof PlatformPartnerMemberListQuerySchema>;
export type PlatformPartnerMemberStatusUpdateInput =
  z.infer<typeof PlatformPartnerMemberStatusUpdateSchema>;
export type PlatformPartnerInviteCodeCreateInput =
  z.infer<typeof PlatformPartnerInviteCodeCreateSchema>;
export type PlatformPartnerInviteCodeResolveInput =
  z.infer<typeof PlatformPartnerInviteCodeParamSchema>;
export type TenantPartnerBindingCreateInput =
  z.infer<typeof TenantPartnerBindingCreateSchema>;
export type TenantPartnerInviteBindingCreateInput =
  z.infer<typeof TenantPartnerInviteBindingCreateSchema>;
export type PartnerTenantOnboardingSendCodeInput =
  z.infer<typeof PartnerTenantOnboardingSendCodeSchema>;
export type PartnerTenantOnboardingSubmitInput =
  z.infer<typeof PartnerTenantOnboardingSubmitSchema>;
export type TenantPartnerBindingListQuery =
  z.infer<typeof TenantPartnerBindingListQuerySchema>;
