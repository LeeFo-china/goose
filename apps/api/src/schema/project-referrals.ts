import { z } from "zod";
import { PaginationQuerySchema } from "@/schema/request";
import {
  EXTERNAL_REFERRER_STATUS_VALUES,
  PROJECT_REFERRAL_RATE_BPS_MAX,
  PROJECT_REFERRAL_RATE_BPS_MIN,
  PROJECT_REFERRAL_STATUS_VALUES,
} from "@gooes/domain";

export const ExternalReferrerStatusSchema = z.enum(
  EXTERNAL_REFERRER_STATUS_VALUES,
  {
    message: "无效的外部介绍人状态",
  },
);

export const ProjectReferralStatusSchema = z.enum(
  PROJECT_REFERRAL_STATUS_VALUES,
  {
    message: "无效的项目介绍费状态",
  },
);

export const ReferralRateBpsSchema = z.coerce
  .number("提成比例必须是数字")
  .int("提成比例必须是整数基点")
  .min(PROJECT_REFERRAL_RATE_BPS_MIN, `提成比例不能低于 ${PROJECT_REFERRAL_RATE_BPS_MIN}`)
  .max(PROJECT_REFERRAL_RATE_BPS_MAX, `提成比例不能高于 ${PROJECT_REFERRAL_RATE_BPS_MAX}`);

export const ExternalReferrerBaseSchema = z.object({
  id: z.uuid("无效的外部介绍人 ID").optional(),
  name: z.string("介绍人姓名不能为空").trim().min(1, "介绍人姓名不能为空").max(100, "介绍人姓名过长"),
  phone: z.string().trim().min(1, "介绍人手机号不能为空").max(20, "介绍人手机号过长").nullable().optional(),
  bank_name: z.string().trim().max(100, "开户行名称过长").nullable().optional(),
  bank_account: z.string().trim().max(100, "银行卡号过长").nullable().optional(),
  wechat_account: z.string().trim().max(100, "微信账号过长").nullable().optional(),
  alipay_account: z.string().trim().max(100, "支付宝账号过长").nullable().optional(),
  status: ExternalReferrerStatusSchema.default("active"),
  remark: z.string().trim().max(500, "备注过长").nullable().optional(),
  created_at: z.string().datetime("无效的时间格式").optional(),
  updated_at: z.string().datetime("无效的时间格式").optional(),
});

export const CreateExternalReferrerSchema = ExternalReferrerBaseSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export const UpdateExternalReferrerSchema = CreateExternalReferrerSchema.partial();

export const ExternalReferrerListQuerySchema = PaginationQuerySchema.extend({
  status: ExternalReferrerStatusSchema.optional(),
  keyword: z.string().trim().max(100, "搜索关键词过长").optional(),
});

export const ProjectReferralBaseSchema = z.object({
  id: z.uuid("无效的项目介绍费 ID").optional(),
  project_id: z.uuid("无效的项目 ID"),
  referrer_id: z.uuid("无效的外部介绍人 ID"),
  rate_bps: ReferralRateBpsSchema,
  base_amount: z.coerce
    .number("计算基数必须是数字")
    .min(0, "计算基数不能为负数")
    .nullable()
    .optional(),
  commission_amount: z.coerce
    .number("介绍费金额必须是数字")
    .min(0, "介绍费金额不能为负数")
    .nullable()
    .optional(),
  status: ProjectReferralStatusSchema.default("pending"),
  calculated_at: z.string().datetime("无效的时间格式").nullable().optional(),
  recalculated_at: z.string().datetime("无效的时间格式").nullable().optional(),
  paid_at: z.string().datetime("无效的时间格式").nullable().optional(),
  paid_evidence_images: z.array(z.string().trim().min(1, "支付凭证不能为空")).optional(),
  paid_remark: z.string().trim().max(500, "支付备注过长").nullable().optional(),
  paid_by: z.uuid("无效的支付登记员工 ID").nullable().optional(),
  remark: z.string().trim().max(500, "备注过长").nullable().optional(),
  created_at: z.string().datetime("无效的时间格式").optional(),
  updated_at: z.string().datetime("无效的时间格式").optional(),
});

export const CreateProjectReferralSchema = z.object({
  project_id: z.uuid("无效的项目 ID"),
  referrer_id: z.uuid("无效的外部介绍人 ID"),
  rate_bps: ReferralRateBpsSchema,
  remark: z.string().trim().max(500, "备注过长").nullable().optional(),
});

export const UpdateProjectReferralSchema = z.object({
  referrer_id: z.uuid("无效的外部介绍人 ID").optional(),
  rate_bps: ReferralRateBpsSchema.optional(),
  remark: z.string().trim().max(500, "备注过长").nullable().optional(),
});

export const MarkProjectReferralPaidSchema = z.object({
  paid_at: z.string().datetime("无效的时间格式").optional(),
  paid_evidence_images: z.array(z.string().trim().min(1, "支付凭证不能为空"))
    .min(1, "请至少上传一张支付凭证"),
  paid_remark: z.string().trim().max(500, "支付备注过长").nullable().optional(),
  paid_by: z.uuid("无效的支付登记员工 ID"),
});

export const ProjectReferralProjectQuerySchema = z.object({
  project_id: z.uuid("无效的项目 ID"),
});

export const ProjectReferralListQuerySchema = PaginationQuerySchema.extend({
  status: ProjectReferralStatusSchema.optional(),
  project_id: z.uuid("无效的项目 ID").optional(),
});

export type ExternalReferrerType = z.infer<typeof ExternalReferrerBaseSchema>;
export type CreateExternalReferrerInput = z.infer<typeof CreateExternalReferrerSchema>;
export type UpdateExternalReferrerInput = z.infer<typeof UpdateExternalReferrerSchema>;
export type ExternalReferrerListQueryType = z.infer<typeof ExternalReferrerListQuerySchema>;
export type ProjectReferralType = z.infer<typeof ProjectReferralBaseSchema>;
export type CreateProjectReferralInput = z.infer<typeof CreateProjectReferralSchema>;
export type UpdateProjectReferralInput = z.infer<typeof UpdateProjectReferralSchema>;
export type MarkProjectReferralPaidInput = z.infer<typeof MarkProjectReferralPaidSchema>;
export type ProjectReferralProjectQueryType = z.infer<typeof ProjectReferralProjectQuerySchema>;
export type ProjectReferralListQueryType = z.infer<typeof ProjectReferralListQuerySchema>;
