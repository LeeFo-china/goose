import { PaginationQuerySchema } from "@/schema/request";
import { PlatformPartnerPhoneSchema } from "@/schema/platform-partner-phone";
import { z } from "zod";

export const PlatformPartnerApplicationStatusSchema = z.enum([
  "submitted",
  "reviewing",
  "approved",
  "rejected",
]);

export const PlatformPartnerApplicationIdParamSchema = z.object({
  id: z.uuid("无效的合伙人申请 ID"),
});

const OptionalTextSchema = (max: number, message: string) =>
  z.preprocess(
    (value) => {
      if (value === undefined || value === null) return undefined;
      if (typeof value === "string" && value.trim() === "") return undefined;
      return value;
    },
    z.string().trim().max(max, message).optional(),
  );

const SourceUrlSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === "string" && value.trim() === "") return undefined;
    return value;
  },
  z.string().trim().url("来源页面 URL 格式无效").max(500, "来源页面 URL 不能超过 500 个字符").optional(),
);

const RegionCodeSchema = z
  .string()
  .trim()
  .min(1, "区域编码不能为空")
  .max(20, "区域编码不能超过 20 个字符");

const RegionCodesSchema = z
  .array(RegionCodeSchema)
  .max(20, "意向区域不能超过 20 个")
  .default([]);

const OperatingDistrictCodesSchema = z
  .array(RegionCodeSchema)
  .min(1, "请至少选择一个运营区县")
  .max(100, "单个合伙人最多选择 100 个运营区县");

export const PlatformPartnerApplicationSendCodeSchema = z.object({
  phone: PlatformPartnerPhoneSchema,
}).strict();

export const SubmitPlatformPartnerApplicationSchema = z.object({
  applicant_name: z.string().trim().min(1, "申请主体不能为空").max(120, "申请主体不能超过 120 个字符"),
  subject_type: z.enum(["personal", "individual_business", "company"]),
  contact_name: z.string().trim().min(1, "联系人不能为空").max(60, "联系人不能超过 60 个字符"),
  phone: PlatformPartnerPhoneSchema,
  sms_code: z.string().trim().regex(/^\d{4,6}$/, "验证码格式不正确").optional(),
  region_codes: RegionCodesSchema,
  region_name: OptionalTextSchema(120, "意向区域不能超过 120 个字符"),
  business_description: OptionalTextSchema(1000, "业务基础不能超过 1000 个字符"),
  resource_description: OptionalTextSchema(1000, "资源说明不能超过 1000 个字符"),
  message: OptionalTextSchema(1000, "补充说明不能超过 1000 个字符"),
  source_channel: z.string().trim().min(1).max(80).default("official_website"),
  source_url: SourceUrlSchema,
  utm_source: OptionalTextSchema(120, "utm_source 不能超过 120 个字符"),
  utm_medium: OptionalTextSchema(120, "utm_medium 不能超过 120 个字符"),
  utm_campaign: OptionalTextSchema(120, "utm_campaign 不能超过 120 个字符"),
  agree_privacy: z.literal(true, {
    message: "请先同意隐私政策和合作申请规则",
  }),
}).strict();

export const PlatformPartnerApplicationListQuerySchema =
  PaginationQuerySchema.extend({
    status: PlatformPartnerApplicationStatusSchema.optional(),
    keyword: z.string().trim().max(120, "关键词不能超过 120 个字符").optional(),
    region_code: z.string().trim().max(12, "区域编码不能超过 12 个字符").optional(),
  });

export const UpdatePlatformPartnerApplicationStatusSchema = z.object({
  status: z.enum(["reviewing", "rejected"]),
  review_remark: z.string().trim().max(500, "审核备注不能超过 500 个字符").optional(),
}).strict().superRefine((value, context) => {
  if (value.status === "rejected" && !value.review_remark?.trim()) {
    context.addIssue({
      code: "custom",
      path: ["review_remark"],
      message: "驳回申请必须填写原因",
    });
  }
});

export const ApprovePlatformPartnerApplicationSchema = z.object({
  level_id: z.uuid("无效的合伙人等级 ID"),
  partner_name: z.string().trim().min(1, "合伙人名称不能为空").max(120, "合伙人名称不能超过 120 个字符").optional(),
  region_codes: OperatingDistrictCodesSchema,
  review_remark: z.string().trim().max(500, "审核备注不能超过 500 个字符").optional(),
}).strict();

export type SubmitPlatformPartnerApplicationInput =
  z.infer<typeof SubmitPlatformPartnerApplicationSchema>;
export type PlatformPartnerApplicationSendCodeInput =
  z.infer<typeof PlatformPartnerApplicationSendCodeSchema>;
export type PlatformPartnerApplicationListQuery =
  z.infer<typeof PlatformPartnerApplicationListQuerySchema>;
export type UpdatePlatformPartnerApplicationStatusInput =
  z.infer<typeof UpdatePlatformPartnerApplicationStatusSchema>;
export type ApprovePlatformPartnerApplicationInput =
  z.infer<typeof ApprovePlatformPartnerApplicationSchema>;
export type PlatformPartnerApplicationStatus =
  z.infer<typeof PlatformPartnerApplicationStatusSchema>;
