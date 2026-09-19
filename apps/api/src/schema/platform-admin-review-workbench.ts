import { z } from "zod";

const PositiveVersionSchema = z.coerce.number().int().min(1, "版本号必须大于 0");
const ReviewRemarkSchema = z.string().trim().min(1, "请填写审核备注").max(500, "审核备注不能超过 500 个字符");
const RegionCodeSchema = z.string().trim().min(1, "区域编码不能为空").max(20, "区域编码不能超过 20 个字符");

export const PlatformAdminApplicationIdParamSchema = z.object({
  id: z.uuid("无效的申请 ID"),
}).strict();

export const PlatformAdminReviewListQuerySchema = z.object({
  page: z.coerce.number().int().min(1, "页码必须大于 0").default(1),
  pageSize: z.coerce.number().int().min(1, "每页条数必须大于 0").max(50, "每页条数不能超过 50").default(20),
  status: z.enum([
    "submitted",
    "reviewing",
    "supplement_required",
    "approved",
    "rejected",
    "withdrawn",
  ]).optional(),
  keyword: z.string().trim().max(120, "关键词不能超过 120 个字符").optional(),
  region_code: RegionCodeSchema.optional(),
  source_channel: z.enum(["local_services", "partner_invite"]).optional(),
});

export const PlatformAdminReviewLogListQuerySchema = z.object({
  target_type: z.enum([
    "tenant_onboarding_application",
    "partner_application",
  ]),
  target_id: z.uuid("无效的审核对象 ID"),
  page: z.coerce.number().int().min(1, "页码必须大于 0").default(1),
  pageSize: z.coerce.number().int().min(1, "每页条数必须大于 0").max(50, "每页条数不能超过 50").default(20),
});

export const PlatformAdminIdempotencyHeadersSchema = z.object({
  "idempotency-key": z.uuid("Idempotency-Key 必须是合法 UUID"),
});

export const PlatformAdminTenantApproveSchema = z.object({
  expected_version: PositiveVersionSchema,
  remark: ReviewRemarkSchema,
  publish_local_service_provider: z.literal(false, {
    message: "本地服务商公开需走独立发布流程",
  }).default(false),
  assign_partner_id: z.uuid("无效的城市合伙人 ID").nullable().default(null),
}).strict();

export const PlatformAdminTenantRejectSchema = z.object({
  expected_version: PositiveVersionSchema,
  remark: ReviewRemarkSchema,
}).strict();

export const PlatformAdminTenantRequestSupplementSchema = z.object({
  expected_version: PositiveVersionSchema,
  remark: ReviewRemarkSchema,
  required_fields: z.array(z.enum([
    "company_name",
    "unified_social_credit_code",
    "business_license_file_id",
    "admin_name",
    "company_location",
    "address",
    "service_region_codes",
  ])).min(1, "请选择至少一个补充字段").max(20, "补充字段不能超过 20 个"),
}).strict();

export const PlatformAdminPartnerApproveSchema = z.object({
  expected_version: PositiveVersionSchema,
  remark: ReviewRemarkSchema,
  partner_level_code: z.string().trim().min(1, "合伙人等级不能为空").max(40, "合伙人等级不能超过 40 个字符"),
  region_codes: z.array(RegionCodeSchema).min(1, "请至少选择一个运营区域").max(100, "运营区域不能超过 100 个"),
  generate_default_invite_code: z.boolean().default(true),
}).strict();

export const PlatformAdminPartnerRejectSchema = z.object({
  expected_version: PositiveVersionSchema,
  remark: ReviewRemarkSchema,
}).strict();

export const PlatformAdminPartnerRequestSupplementSchema = z.object({
  expected_version: PositiveVersionSchema,
  remark: ReviewRemarkSchema,
  required_fields: z.array(z.enum([
    "applicant_name",
    "subject_type",
    "contact_name",
    "phone",
    "region_codes",
    "business_description",
    "resource_description",
    "message",
  ])).min(1, "请选择至少一个补充字段").max(20, "补充字段不能超过 20 个"),
}).strict();

export type PlatformAdminReviewListQuery = z.infer<typeof PlatformAdminReviewListQuerySchema>;
export type PlatformAdminReviewLogListQuery = z.infer<typeof PlatformAdminReviewLogListQuerySchema>;
export type PlatformAdminTenantApproveInput = z.infer<typeof PlatformAdminTenantApproveSchema>;
export type PlatformAdminTenantRejectInput = z.infer<typeof PlatformAdminTenantRejectSchema>;
export type PlatformAdminTenantRequestSupplementInput = z.infer<typeof PlatformAdminTenantRequestSupplementSchema>;
export type PlatformAdminPartnerApproveInput = z.infer<typeof PlatformAdminPartnerApproveSchema>;
export type PlatformAdminPartnerRejectInput = z.infer<typeof PlatformAdminPartnerRejectSchema>;
export type PlatformAdminPartnerRequestSupplementInput = z.infer<typeof PlatformAdminPartnerRequestSupplementSchema>;
export type PlatformAdminReviewTargetType = z.infer<typeof PlatformAdminReviewLogListQuerySchema>["target_type"];
