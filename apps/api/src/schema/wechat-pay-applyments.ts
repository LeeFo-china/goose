import { PaginationQuerySchema } from "@/schema/request";
import { z } from "zod";

const optionalText = (max: number, message: string) =>
  z.preprocess((value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== "string") return value;
    const normalized = value.trim();
    return normalized || null;
  }, z.string().max(max, message).nullable().optional());

const requiredText = (max: number, emptyMessage: string, maxMessage: string) =>
  z.string().trim().min(1, emptyMessage).max(max, maxMessage);

const optionalQueryValue = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => {
    if (value == null) return undefined;
    if (typeof value !== "string") return value;
    const normalized = value.trim();
    return normalized || undefined;
  }, schema.optional());

export const WechatPayApplymentStatusSchema = z.enum([
  "draft",
  "submitted",
  "rejected",
  "approved",
  "applying",
  "wechat_editing",
  "reviewing",
  "account_verifying",
  "signing",
  "opening",
  "opened",
  "bound",
  "active",
  "suspended",
  "closed",
] as const, { message: "无效的微信支付开通申请状态" });

export const WechatPayApplymentWechatStateSchema = z.enum([
  "not_started",
  "draft",
  "submitted",
  "reviewing",
  "rejected",
  "account_verifying",
  "signing",
  "opened",
  "suspended",
  "closed",
] as const, { message: "无效的微信支付进件状态" });

export const WechatPayApplymentAppIdBindingStateSchema = z.enum([
  "not_required",
  "not_bound",
  "pending_confirm",
  "bound",
  "rejected",
] as const, { message: "无效的微信支付 AppID 绑定状态" });

export const WechatPayApplymentAttachmentCategorySchema = z.enum([
  "license_copy",
  "legal_representative_id_card_front",
  "legal_representative_id_card_back",
  "contact_id_card_front",
  "contact_id_card_back",
  "settlement_account_proof",
  "business_scene_material",
] as const, { message: "无效的微信支付开通申请附件类型" });

export const WechatPayApplymentSettlementAccountTypeSchema = z.enum([
  "BANK_ACCOUNT_TYPE_CORPORATE",
  "BANK_ACCOUNT_TYPE_PERSONAL",
] as const, { message: "无效的微信支付结算账户类型" });

export const WechatPayApplymentSubjectTypeSchema = z.enum([
  "SUBJECT_TYPE_ENTERPRISE",
  "SUBJECT_TYPE_INDIVIDUAL",
] as const, { message: "首版仅支持企业或个体工商户" });

export const WechatPayApplymentIdentityDocTypeSchema = z.literal(
  "IDENTIFICATION_TYPE_IDCARD",
  { message: "首版仅支持中国大陆居民身份证" },
);

export const WechatPayApplymentContactTypeSchema = z.enum([
  "LEGAL",
  "SUPER",
] as const, { message: "无效的超级管理员类型" });

const dateText = (message: string) => z.iso.date({ message });
const periodEndText = (message: string) => z.union([
  z.iso.date({ message }),
  z.literal("长期"),
]);

const optionalDateText = (message: string) => z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return value;
  const normalized = value.trim();
  return normalized || null;
}, dateText(message).nullable().optional());

const optionalPeriodEndText = (message: string) => z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return value;
  const normalized = value.trim();
  return normalized || null;
}, periodEndText(message).nullable().optional());

const AttachmentSchema = z.object({
  category: WechatPayApplymentAttachmentCategorySchema.optional(),
  object_key: requiredText(300, "附件对象 key 不能为空", "附件对象 key 不能超过 300 个字符"),
  file_name: optionalText(120, "附件文件名不能超过 120 个字符"),
  content_type: optionalText(120, "附件类型不能超过 120 个字符"),
  size: z.coerce.number().int().min(0, "附件大小不能为负数").optional(),
}).strict();

const TenantApplymentFields = {
  subject_type: WechatPayApplymentSubjectTypeSchema,
  merchant_short_name: requiredText(64, "请输入商户简称", "商户简称不能超过 64 个字符"),
  license_name: requiredText(100, "请输入营业执照主体名称", "主体名称不能超过 100 个字符"),
  license_code: requiredText(64, "请输入统一社会信用代码", "统一社会信用代码不能超过 64 个字符"),
  license_address: optionalText(128, "营业执照注册地址不能超过 128 个字符"),
  license_period_begin: optionalDateText("营业执照有效期开始日期格式无效"),
  license_period_end: optionalPeriodEndText("营业执照有效期结束日期格式无效"),
  legal_representative_name: requiredText(50, "请输入法人姓名", "法人姓名不能超过 50 个字符"),
  identity_doc_type: WechatPayApplymentIdentityDocTypeSchema,
  identity_name: requiredText(100, "请输入证件姓名", "证件姓名不能超过 100 个字符"),
  identity_number: z.string()
    .trim()
    .regex(/^\d{17}[\dXx]$/, "身份证号码格式不正确")
    .transform((value) => value.toUpperCase()),
  identity_address: optionalText(128, "身份证居住地址不能超过 128 个字符"),
  identity_period_begin: dateText("身份证有效期开始日期格式无效"),
  identity_period_end: periodEndText("身份证有效期结束日期格式无效"),
  contact_type: WechatPayApplymentContactTypeSchema,
  super_admin_name: requiredText(50, "请输入超级管理员姓名", "超级管理员姓名不能超过 50 个字符"),
  super_admin_phone: z.string()
    .trim()
    .regex(/^1[3-9]\d{9}$/, "超级管理员手机号格式不正确"),
  super_admin_email: z.string()
    .trim()
    .min(1, "请输入超级管理员邮箱")
    .max(120, "超级管理员邮箱不能超过 120 个字符")
    .email("超级管理员邮箱格式不正确"),
  contact_identity_doc_type: WechatPayApplymentIdentityDocTypeSchema.optional(),
  contact_identity_number: z.string()
    .trim()
    .regex(/^\d{17}[\dXx]$/, "经办人身份证号码格式不正确")
    .transform((value) => value.toUpperCase())
    .optional(),
  contact_identity_address: optionalText(128, "经办人身份证地址不能超过 128 个字符"),
  contact_identity_period_begin: dateText("经办人证件有效期开始日期格式无效").optional(),
  contact_identity_period_end: periodEndText("经办人证件有效期结束日期格式无效").optional(),
  service_phone: z.string()
    .trim()
    .regex(/^(?:1[3-9]\d{9}|[\d+-]{5,20})$/, "客服电话格式不正确"),
  settlement_account_type: WechatPayApplymentSettlementAccountTypeSchema,
  settlement_account_name: requiredText(100, "请输入结算账户开户名", "结算账户开户名不能超过 100 个字符"),
  settlement_bank_name: requiredText(100, "请输入结算账户开户银行", "开户银行不能超过 100 个字符"),
  settlement_bank_full_name: optionalText(128, "开户银行全称不能超过 128 个字符"),
  settlement_bank_branch_id: optionalText(128, "开户银行联行号不能超过 128 个字符"),
  settlement_account_number: z.string()
    .trim()
    .regex(/^\d{8,32}$/, "银行账号应为 8 到 32 位数字"),
  settlement_account_summary: optionalText(120, "结算账户摘要不能超过 120 个字符"),
  settlement_id: requiredText(32, "请选择结算规则", "结算规则 ID 不能超过 32 个字符"),
  qualification_type: requiredText(200, "请选择所属行业", "所属行业不能超过 200 个字符"),
  business_scene_description: requiredText(500, "请输入经营场景说明", "经营场景说明不能超过 500 个字符"),
  contact_address: requiredText(200, "请输入联系地址", "联系地址不能超过 200 个字符"),
  attachments: z.array(AttachmentSchema).max(20, "附件数量不能超过 20").optional(),
  remark: optionalText(500, "备注不能超过 500 个字符"),
};

export const CreateWechatPayApplymentSchema = z.object(TenantApplymentFields)
  .strict()
  .superRefine((input, context) => {
    if (
      input.subject_type === "SUBJECT_TYPE_ENTERPRISE" &&
      !input.identity_address
    ) {
      context.addIssue({
        code: "custom",
        path: ["identity_address"],
        message: "企业主体必须填写法人身份证居住地址",
      });
    }
    if (
      input.subject_type === "SUBJECT_TYPE_ENTERPRISE" &&
      input.settlement_account_type !== "BANK_ACCOUNT_TYPE_CORPORATE"
    ) {
      context.addIssue({
        code: "custom",
        path: ["settlement_account_type"],
        message: "企业主体只能使用对公银行账户",
      });
    }
    if (input.contact_type === "SUPER") {
      const requiredAgentFields = [
        ["contact_identity_doc_type", input.contact_identity_doc_type],
        ["contact_identity_number", input.contact_identity_number],
        ["contact_identity_address", input.contact_identity_address],
        ["contact_identity_period_begin", input.contact_identity_period_begin],
        ["contact_identity_period_end", input.contact_identity_period_end],
      ] as const;
      for (const [field, value] of requiredAgentFields) {
        if (!value) {
          context.addIssue({
            code: "custom",
            path: [field],
            message: "经办人超级管理员必须完整填写身份证资料",
          });
        }
      }
      const categories = new Set(
        (input.attachments ?? []).map((attachment) => attachment.category),
      );
      for (const category of [
        "contact_id_card_front",
        "contact_id_card_back",
      ] as const) {
        if (!categories.has(category)) {
          context.addIssue({
            code: "custom",
            path: ["attachments"],
            message: `经办人必须上传${category === "contact_id_card_front" ? "身份证人像面" : "身份证国徽面"}`,
          });
        }
      }
    }
  });

export const UpdateWechatPayApplymentSchema = z.object(
  TenantApplymentFields,
).partial().strict().refine((value) => Object.keys(value).length > 0, {
  message: "至少需要提交一个更新字段",
});

export const SubmitWechatPayApplymentSchema = z.object({
  remark: optionalText(500, "备注不能超过 500 个字符"),
}).strict();

export const ApproveWechatPayApplymentSchema = z.object({
  message: optionalText(500, "审核说明不能超过 500 个字符"),
}).strict();

export const RejectWechatPayApplymentSchema = z.object({
  reason: requiredText(500, "请输入驳回原因", "驳回原因不能超过 500 个字符"),
}).strict();

export const MarkWechatPayApplymentApplyingSchema = z.object({
  applyment_business_code: optionalText(100, "进件业务编号不能超过 100 个字符"),
  message: optionalText(500, "处理说明不能超过 500 个字符"),
}).strict();

export const UpdateWechatPayApplymentWechatStatusSchema = z.object({
  applyment_business_code: optionalText(100, "进件业务编号不能超过 100 个字符"),
  applyment_id: optionalText(100, "微信申请单号不能超过 100 个字符"),
  applyment_state: WechatPayApplymentWechatStateSchema.optional(),
  applyment_state_message: optionalText(500, "进件状态说明不能超过 500 个字符"),
  sub_mchid: optionalText(64, "子商户号不能超过 64 个字符"),
  sub_appid: optionalText(64, "子商户 AppID 不能超过 64 个字符"),
  appid_binding_state: WechatPayApplymentAppIdBindingStateSchema.optional(),
  appid_binding_message: optionalText(500, "AppID 绑定说明不能超过 500 个字符"),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: "至少需要提交一个进件状态字段",
});

export const ActivateWechatPayApplymentConfigSchema = z.object({}).strict();
export const SubmitWechatPayApplymentToWechatSchema = z.object({}).strict();

export const PlatformWechatPayApplymentListQuerySchema =
  PaginationQuerySchema.extend({
    status: optionalQueryValue(WechatPayApplymentStatusSchema),
    tenant_id: optionalQueryValue(z.uuid("无效的租户 ID")),
    keyword: optionalQueryValue(z.string().trim().max(80, "关键词不能超过 80 个字符")),
  });

export const WechatPayApplymentIdParamSchema = z.object({
  id: z.uuid("无效的申请 ID"),
});

export type CreateWechatPayApplymentInput =
  z.infer<typeof CreateWechatPayApplymentSchema>;
export type UpdateWechatPayApplymentInput =
  z.infer<typeof UpdateWechatPayApplymentSchema>;
export type SubmitWechatPayApplymentInput =
  z.infer<typeof SubmitWechatPayApplymentSchema>;
export type ApproveWechatPayApplymentInput =
  z.infer<typeof ApproveWechatPayApplymentSchema>;
export type RejectWechatPayApplymentInput =
  z.infer<typeof RejectWechatPayApplymentSchema>;
export type MarkWechatPayApplymentApplyingInput =
  z.infer<typeof MarkWechatPayApplymentApplyingSchema>;
export type UpdateWechatPayApplymentWechatStatusInput =
  z.infer<typeof UpdateWechatPayApplymentWechatStatusSchema>;
export type ActivateWechatPayApplymentConfigInput =
  z.infer<typeof ActivateWechatPayApplymentConfigSchema>;
export type PlatformWechatPayApplymentListQuery =
  z.infer<typeof PlatformWechatPayApplymentListQuerySchema>;
