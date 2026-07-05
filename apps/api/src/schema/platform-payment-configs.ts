import { z } from "zod";

const nullableText = (max: number, message: string) =>
  z.preprocess((value) => {
    if (value == null) return null;
    if (typeof value !== "string") return value;
    const normalized = value.trim();
    return normalized || null;
  }, z.string().max(max, message).nullable().optional());

export const PlatformWechatPayEnabledChannelSchema = z.enum(
  ["tenant_recharge", "project_payment", "applyment"],
  { message: "无效的平台支付启用渠道" },
);

export const PlatformPaymentProfileCodeSchema = z.enum(
  ["platform_direct_recharge", "tenant_service_provider"],
  { message: "无效的平台支付配置 profile" },
);

export const PlatformPaymentConfigStatusSchema = z.enum(
  ["pending", "active", "disabled", "suspended"],
  { message: "无效的平台支付配置状态" },
);

export const UpdatePlatformWechatPayConfigSchema = z.object({
  merchant_mode: z.enum(
    ["direct_merchant", "service_provider_sub_merchant"],
    { message: "无效的平台支付商户模式" },
  ).default("direct_merchant"),
  merchant_name: nullableText(100, "商户名称不能超过 100 个字符"),
  merchant_id: nullableText(64, "商户号不能超过 64 个字符"),
  sub_merchant_id: nullableText(64, "子商户号不能超过 64 个字符"),
  app_id: nullableText(64, "AppID 不能超过 64 个字符"),
  sub_app_id: nullableText(64, "子商户 AppID 不能超过 64 个字符"),
  encrypted_config_ref: nullableText(300, "密钥引用不能超过 300 个字符"),
  serial_no: nullableText(128, "证书序列号不能超过 128 个字符"),
  notify_url: z.preprocess((value) => {
    if (value == null) return null;
    if (typeof value !== "string") return value;
    const normalized = value.trim();
    return normalized || null;
  }, z.string().url("回调地址格式不正确").max(300, "回调地址不能超过 300 个字符").nullable().optional()),
  enabled_channels: z.array(PlatformWechatPayEnabledChannelSchema)
    .min(1, "至少启用一个平台支付渠道")
    .max(5, "启用渠道过多")
    .optional(),
  status: PlatformPaymentConfigStatusSchema.default("pending"),
  risk_switches: z.record(z.string(), z.unknown()).optional(),
}).strict();

export type UpdatePlatformWechatPayConfigInput =
  z.infer<typeof UpdatePlatformWechatPayConfigSchema>;

const requiredText = (max: number, message: string) =>
  z.preprocess((value) => {
    if (typeof value !== "string") return value;
    return value.trim();
  }, z.string().min(1, "字段不能为空").max(max, message));

export const UpdatePlatformWechatPaySecretBundleSchema = z.object({
  private_key_pem: requiredText(12000, "API 私钥 PEM 不能超过 12000 个字符"),
  api_v3_key: requiredText(128, "APIv3 Key 不能超过 128 个字符"),
  wechat_pay_public_key_id: nullableText(128, "微信支付公钥 ID 不能超过 128 个字符"),
  wechat_pay_public_key_pem: nullableText(12000, "微信支付公钥 PEM 不能超过 12000 个字符"),
  base_url: z.preprocess((value) => {
    if (value == null) return undefined;
    if (typeof value !== "string") return value;
    const normalized = value.trim();
    return normalized || undefined;
  }, z.string().url("微信支付 API 地址格式不正确").max(300, "微信支付 API 地址不能超过 300 个字符").optional()),
}).strict();

export type UpdatePlatformWechatPaySecretBundleInput =
  z.infer<typeof UpdatePlatformWechatPaySecretBundleSchema>;
