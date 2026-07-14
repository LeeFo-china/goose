import { z } from "zod";

import { PaginationQuerySchema } from "@/schema/request";

const PositiveVersionSchema = z.number().int().positive("版本号必须为正整数");
const ReviewRemarkSchema = z
  .string()
  .trim()
  .min(1, "请填写审核说明")
  .max(500, "审核说明不能超过 500 个字符");
const OptionalReviewRemarkSchema = z
  .string()
  .trim()
  .max(500, "审核说明不能超过 500 个字符")
  .optional();
const OptionalLocationTextSchema = z.string().trim().min(1).max(40).optional();
const hasUniqueValues = (values: readonly string[]) =>
  new Set(values).size === values.length;

export const UnifiedSocialCreditCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(
    z
      .string()
      .regex(
        /^[0-9A-HJ-NPQRTUWXY]{18}$/,
        "统一社会信用代码格式不正确",
      ),
  );

export const MobilePhoneSchema = z
  .string()
  .trim()
  .regex(/^1[3-9]\d{9}$/, "手机号格式不正确");

export const AdministrativeRegionCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "行政区代码格式不正确");

export const TenantOnboardingApplicationStatusSchema = z.enum([
  "submitted",
  "reviewing",
  "supplement_required",
  "approved",
  "rejected",
  "withdrawn",
]);

export const TenantOnboardingPartnerAssistStatusSchema = z.enum([
  "not_applicable",
  "pending",
  "verified",
  "supplement_suggested",
  "not_recommended",
  "expired",
]);

export const TenantOnboardingSourceChannelSchema = z.enum([
  "local_services",
  "partner_invite",
]);

export const TenantServiceProviderProfileStatusSchema = z.enum([
  "draft",
  "pending_review",
  "published",
  "suspended",
]);

export const TenantOnboardingApplicationIdParamSchema = z
  .object({
    id: z.uuid("无效的装企申请 ID"),
  })
  .strict();

export const TenantOnboardingNotificationIdParamSchema = z
  .object({
    id: z.uuid("无效的装企申请 ID"),
    deliveryId: z.uuid("无效的通知记录 ID"),
  })
  .strict();

export const TenantServiceProviderPublicationParamSchema = z
  .object({
    tenantId: z.uuid("无效的租户 ID"),
  })
  .strict();

export const TenantServiceProviderAreaIdParamSchema = z
  .object({
    id: z.uuid("无效的服务区域 ID"),
  })
  .strict();

export const TenantOnboardingSendCodeSchema = z
  .object({
    phone: MobilePhoneSchema,
  })
  .strict();

const CompanyLocationSchema = z
  .object({
    province: OptionalLocationTextSchema,
    city: z.string().trim().min(1, "请填写公司所在城市").max(40),
    district: OptionalLocationTextSchema,
    region_code: AdministrativeRegionCodeSchema,
    address: z.string().trim().min(1, "请填写公司详细地址").max(300),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  })
  .strict();

const ServiceRegionCodesSchema = z
  .array(AdministrativeRegionCodeSchema)
  .min(1, "请选择至少一个服务区域")
  .max(20, "服务区域不能超过 20 个")
  .refine(hasUniqueValues, "服务区域不能重复");

const ApplicantEditableFieldsSchema = z
  .object({
    company_name: z.string().trim().min(1, "请填写企业名称").max(120),
    unified_social_credit_code: UnifiedSocialCreditCodeSchema,
    business_license_file_id: z.uuid("无效的营业执照文件 ID"),
    admin_name: z.string().trim().min(1, "请填写负责人姓名").max(60),
    company_location: CompanyLocationSchema,
    service_region_codes: ServiceRegionCodesSchema,
  })
  .strict();

export const SubmitTenantOnboardingApplicationSchema =
  ApplicantEditableFieldsSchema.extend({
    admin_phone: MobilePhoneSchema,
    sms_code: z
      .string()
      .trim()
      .min(1, "请填写短信验证码")
      .regex(/^\d{4,6}$/, "验证码格式不正确"),
    visitor_context_id: z.uuid("无效的访客定位上下文 ID"),
    invite_code: z
      .string()
      .trim()
      .min(1, "邀请码不能为空")
      .max(120, "邀请码不能超过 120 个字符")
      .transform((value) => value.toUpperCase())
      .nullable()
      .optional(),
    source_channel: TenantOnboardingSourceChannelSchema,
    privacy_policy_version: z
      .string()
      .trim()
      .min(1, "隐私政策版本不能为空")
      .max(40),
    onboarding_terms_version: z
      .string()
      .trim()
      .min(1, "入驻条款版本不能为空")
      .max(40),
    agree_privacy: z.literal(true, {
      message: "请先同意隐私政策和入驻条款",
    }),
  }).strict();

export const SupplementTenantOnboardingApplicationSchema =
  ApplicantEditableFieldsSchema.partial()
    .extend({ version: PositiveVersionSchema })
    .strict()
    .refine(
      (value) => Object.keys(value).some((key) => key !== "version"),
      "至少需要提交一个补充字段",
    );

export const WithdrawTenantOnboardingApplicationSchema = z
  .object({
    version: PositiveVersionSchema,
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const StartReviewTenantOnboardingApplicationSchema = z
  .object({
    version: PositiveVersionSchema,
  })
  .strict();

const RequiredSupplementFieldsSchema = z
  .array(z.string().trim().min(1, "补充字段不能为空").max(80))
  .min(1, "请选择至少一个补充字段")
  .max(20, "补充字段不能超过 20 个")
  .refine(hasUniqueValues, "补充字段不能重复");

export const RequestSupplementTenantOnboardingApplicationSchema = z
  .object({
    version: PositiveVersionSchema,
    required_fields: RequiredSupplementFieldsSchema,
    remark: ReviewRemarkSchema,
  })
  .strict();

export const RequestTenantOnboardingPartnerAssistSchema = z
  .object({
    version: PositiveVersionSchema,
    partner_id: z.uuid("无效的城市合伙人 ID"),
    remark: OptionalReviewRemarkSchema,
  })
  .strict();

export const TenantOnboardingPartnerAssistDecisionSchema = z
  .object({
    version: PositiveVersionSchema,
    decision: z.enum([
      "verified",
      "supplement_suggested",
      "not_recommended",
    ]),
    remark: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const ApproveTenantOnboardingApplicationSchema = z
  .object({
    version: PositiveVersionSchema,
    attribution_mode: z.enum(["auto", "partner", "unassigned"]),
    final_partner_id: z.uuid("无效的城市合伙人 ID").optional(),
    review_remark: ReviewRemarkSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.attribution_mode === "partner" && !value.final_partner_id) {
      context.addIssue({
        code: "custom",
        path: ["final_partner_id"],
        message: "请选择最终归因合伙人",
      });
    }
  });

export const RejectTenantOnboardingApplicationSchema = z
  .object({
    version: PositiveVersionSchema,
    review_remark: ReviewRemarkSchema,
  })
  .strict();

export const RetryTenantOnboardingNotificationSchema = z.object({}).strict();

export const TenantOnboardingApplicationListQuerySchema =
  PaginationQuerySchema.extend({
    status: TenantOnboardingApplicationStatusSchema.optional(),
    region_code: AdministrativeRegionCodeSchema.optional(),
    candidate_partner_id: z.uuid("无效的城市合伙人 ID").optional(),
    assist_status: TenantOnboardingPartnerAssistStatusSchema.optional(),
    keyword: z.string().trim().max(120, "关键词不能超过 120 个字符").optional(),
  });

export const TenantOnboardingOwnedApplicationListQuerySchema =
  PaginationQuerySchema.extend({});
export const TenantOnboardingReviewListQuerySchema =
  PaginationQuerySchema.extend({});
export const TenantOnboardingNotificationListQuerySchema =
  PaginationQuerySchema.extend({});
export const TenantOnboardingPartnerAssistListQuerySchema =
  PaginationQuerySchema.extend({
    status: TenantOnboardingPartnerAssistStatusSchema.optional(),
  });

const NullableProfileTextSchema = (max: number) =>
  z.string().trim().min(1).max(max).nullable();

export const UpdateTenantServiceProviderProfileSchema = z
  .object({
    version: PositiveVersionSchema,
    public_name: NullableProfileTextSchema(120).optional(),
    introduction: NullableProfileTextSchema(2000).optional(),
    public_phone: MobilePhoneSchema.nullable().optional(),
    address_province: NullableProfileTextSchema(40).optional(),
    address_city: NullableProfileTextSchema(40).optional(),
    address_district: NullableProfileTextSchema(40).optional(),
    address_region_code: AdministrativeRegionCodeSchema.nullable().optional(),
    address: NullableProfileTextSchema(300).optional(),
    address_latitude: z.number().min(-90).max(90).nullable().optional(),
    address_longitude: z.number().min(-180).max(180).nullable().optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).some((key) => key !== "version"),
    "至少需要提交一个更新字段",
  );

const TenantServiceProviderAreaFieldsSchema = z
  .object({
    province: z.string().trim().min(1).max(40).nullable().optional(),
    city: z.string().trim().min(1, "城市不能为空").max(40),
    district: z.string().trim().min(1).max(40).nullable().optional(),
    adcode: AdministrativeRegionCodeSchema,
    center_latitude: z.number().min(-90).max(90).nullable().optional(),
    center_longitude: z.number().min(-180).max(180).nullable().optional(),
    service_radius_km: z.number().positive().max(9999).nullable().optional(),
    priority: z.number().int().min(0).max(10000).default(100),
  })
  .strict();

export const CreateTenantServiceProviderAreaSchema =
  TenantServiceProviderAreaFieldsSchema.extend({
    version: PositiveVersionSchema,
  }).strict();

export const UpdateTenantServiceProviderAreaSchema =
  TenantServiceProviderAreaFieldsSchema.partial()
    .extend({ version: PositiveVersionSchema })
    .strict()
    .refine(
      (value) => Object.keys(value).some((key) => key !== "version"),
      "至少需要提交一个更新字段",
    );

export const SubmitTenantServiceProviderProfileSchema = z
  .object({ version: PositiveVersionSchema })
  .strict();

const PlatformServiceProviderDecisionSchema = z
  .object({
    version: PositiveVersionSchema,
    review_remark: ReviewRemarkSchema,
  })
  .strict();

export const PublishTenantServiceProviderProfileSchema =
  PlatformServiceProviderDecisionSchema;
export const ReturnTenantServiceProviderProfileToDraftSchema =
  PlatformServiceProviderDecisionSchema;
export const SuspendTenantServiceProviderProfileSchema =
  PlatformServiceProviderDecisionSchema;

export const TenantServiceProviderAreaListQuerySchema =
  PaginationQuerySchema.extend({});
export const TenantServiceProviderPublicationListQuerySchema =
  PaginationQuerySchema.extend({
    status: TenantServiceProviderProfileStatusSchema.optional(),
    keyword: z.string().trim().max(120, "关键词不能超过 120 个字符").optional(),
  });
export const VisitorLocalServiceProviderListQuerySchema =
  PaginationQuerySchema.extend({});

export type TenantOnboardingApplicationStatus = z.infer<
  typeof TenantOnboardingApplicationStatusSchema
>;
export type TenantOnboardingPartnerAssistStatus = z.infer<
  typeof TenantOnboardingPartnerAssistStatusSchema
>;
export type TenantOnboardingSourceChannel = z.infer<
  typeof TenantOnboardingSourceChannelSchema
>;
export type TenantServiceProviderProfileStatus = z.infer<
  typeof TenantServiceProviderProfileStatusSchema
>;
export type TenantOnboardingApplicationIdParams = z.infer<
  typeof TenantOnboardingApplicationIdParamSchema
>;
export type TenantOnboardingNotificationIdParams = z.infer<
  typeof TenantOnboardingNotificationIdParamSchema
>;
export type TenantServiceProviderPublicationParams = z.infer<
  typeof TenantServiceProviderPublicationParamSchema
>;
export type TenantServiceProviderAreaIdParams = z.infer<
  typeof TenantServiceProviderAreaIdParamSchema
>;
export type TenantOnboardingSendCodeInput = z.infer<
  typeof TenantOnboardingSendCodeSchema
>;
export type SubmitTenantOnboardingApplicationInput = z.infer<
  typeof SubmitTenantOnboardingApplicationSchema
>;
export type SupplementTenantOnboardingApplicationInput = z.infer<
  typeof SupplementTenantOnboardingApplicationSchema
>;
export type WithdrawTenantOnboardingApplicationInput = z.infer<
  typeof WithdrawTenantOnboardingApplicationSchema
>;
export type StartReviewTenantOnboardingApplicationInput = z.infer<
  typeof StartReviewTenantOnboardingApplicationSchema
>;
export type RequestSupplementTenantOnboardingApplicationInput = z.infer<
  typeof RequestSupplementTenantOnboardingApplicationSchema
>;
export type RequestTenantOnboardingPartnerAssistInput = z.infer<
  typeof RequestTenantOnboardingPartnerAssistSchema
>;
export type TenantOnboardingPartnerAssistDecisionInput = z.infer<
  typeof TenantOnboardingPartnerAssistDecisionSchema
>;
export type ApproveTenantOnboardingApplicationInput = z.infer<
  typeof ApproveTenantOnboardingApplicationSchema
>;
export type RejectTenantOnboardingApplicationInput = z.infer<
  typeof RejectTenantOnboardingApplicationSchema
>;
export type RetryTenantOnboardingNotificationInput = z.infer<
  typeof RetryTenantOnboardingNotificationSchema
>;
export type TenantOnboardingApplicationListQuery = z.infer<
  typeof TenantOnboardingApplicationListQuerySchema
>;
export type TenantOnboardingOwnedApplicationListQuery = z.infer<
  typeof TenantOnboardingOwnedApplicationListQuerySchema
>;
export type TenantOnboardingReviewListQuery = z.infer<
  typeof TenantOnboardingReviewListQuerySchema
>;
export type TenantOnboardingNotificationListQuery = z.infer<
  typeof TenantOnboardingNotificationListQuerySchema
>;
export type TenantOnboardingPartnerAssistListQuery = z.infer<
  typeof TenantOnboardingPartnerAssistListQuerySchema
>;
export type UpdateTenantServiceProviderProfileInput = z.infer<
  typeof UpdateTenantServiceProviderProfileSchema
>;
export type CreateTenantServiceProviderAreaInput = z.infer<
  typeof CreateTenantServiceProviderAreaSchema
>;
export type UpdateTenantServiceProviderAreaInput = z.infer<
  typeof UpdateTenantServiceProviderAreaSchema
>;
export type SubmitTenantServiceProviderProfileInput = z.infer<
  typeof SubmitTenantServiceProviderProfileSchema
>;
export type PublishTenantServiceProviderProfileInput = z.infer<
  typeof PublishTenantServiceProviderProfileSchema
>;
export type ReturnTenantServiceProviderProfileToDraftInput = z.infer<
  typeof ReturnTenantServiceProviderProfileToDraftSchema
>;
export type SuspendTenantServiceProviderProfileInput = z.infer<
  typeof SuspendTenantServiceProviderProfileSchema
>;
export type TenantServiceProviderAreaListQuery = z.infer<
  typeof TenantServiceProviderAreaListQuerySchema
>;
export type TenantServiceProviderPublicationListQuery = z.infer<
  typeof TenantServiceProviderPublicationListQuerySchema
>;
export type VisitorLocalServiceProviderListQuery = z.infer<
  typeof VisitorLocalServiceProviderListQuerySchema
>;
