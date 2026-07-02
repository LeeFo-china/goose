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
  "reviewing",
  "account_verifying",
  "signing",
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
  "settlement_account_proof",
  "business_scene_material",
] as const, { message: "无效的微信支付开通申请附件类型" });

const AttachmentSchema = z.object({
  category: WechatPayApplymentAttachmentCategorySchema.optional(),
  object_key: requiredText(300, "附件对象 key 不能为空", "附件对象 key 不能超过 300 个字符"),
  file_name: optionalText(120, "附件文件名不能超过 120 个字符"),
  content_type: optionalText(120, "附件类型不能超过 120 个字符"),
  size: z.coerce.number().int().min(0, "附件大小不能为负数").optional(),
}).strict();

const TenantApplymentFields = {
  merchant_short_name: requiredText(64, "请输入商户简称", "商户简称不能超过 64 个字符"),
  license_name: requiredText(100, "请输入营业执照主体名称", "主体名称不能超过 100 个字符"),
  license_code: requiredText(64, "请输入统一社会信用代码", "统一社会信用代码不能超过 64 个字符"),
  legal_representative_name: requiredText(50, "请输入法人姓名", "法人姓名不能超过 50 个字符"),
  super_admin_name: requiredText(50, "请输入超级管理员姓名", "超级管理员姓名不能超过 50 个字符"),
  super_admin_phone: z.string()
    .trim()
    .regex(/^1[3-9]\d{9}$/, "超级管理员手机号格式不正确"),
  super_admin_email: optionalText(120, "超级管理员邮箱不能超过 120 个字符")
    .refine((value) => {
      if (!value) return true;
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }, "超级管理员邮箱格式不正确"),
  settlement_account_name: requiredText(100, "请输入结算账户开户名", "结算账户开户名不能超过 100 个字符"),
  settlement_bank_name: requiredText(100, "请输入结算账户开户银行", "开户银行不能超过 100 个字符"),
  settlement_account_summary: requiredText(120, "请输入结算账户摘要", "结算账户摘要不能超过 120 个字符"),
  business_scene_description: requiredText(500, "请输入经营场景说明", "经营场景说明不能超过 500 个字符"),
  contact_address: requiredText(200, "请输入联系地址", "联系地址不能超过 200 个字符"),
  attachments: z.array(AttachmentSchema).max(20, "附件数量不能超过 20").optional(),
  remark: optionalText(500, "备注不能超过 500 个字符"),
};

export const CreateWechatPayApplymentSchema = z.object(
  TenantApplymentFields,
).strict();

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

export const ActivateWechatPayApplymentConfigSchema = z.object({
  merchant_id: requiredText(64, "请输入服务商商户号", "服务商商户号不能超过 64 个字符"),
  app_id: requiredText(64, "请输入平台小程序 AppID", "平台小程序 AppID 不能超过 64 个字符"),
  merchant_name: optionalText(100, "商户名称不能超过 100 个字符"),
  encrypted_config_ref: requiredText(300, "请输入密钥引用", "密钥引用不能超过 300 个字符"),
  notify_url: z.string()
    .trim()
    .url("回调地址格式不正确")
    .max(300, "回调地址不能超过 300 个字符"),
  serial_no: requiredText(128, "请输入证书序列号", "证书序列号不能超过 128 个字符"),
  settlement_account_summary: optionalText(200, "结算账户摘要不能超过 200 个字符"),
}).strict();

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
