import { z } from "zod";

const nullableText = (max: number, message: string) =>
  z.preprocess((value) => {
    if (value == null) return null;
    if (typeof value !== "string") return value;
    const normalized = value.trim();
    return normalized || null;
  }, z.string().max(max, message).nullable().optional());

export const WechatPayMerchantModeSchema = z.enum(
  ["service_provider_sub_merchant", "direct_merchant"],
  { message: "无效的微信支付商户模式" },
);

export const WechatPayConfigStatusSchema = z.enum(
  ["disabled", "pending", "active", "suspended"],
  { message: "无效的微信支付配置状态" },
);

export const WechatPayEnabledChannelSchema = z.enum(
  ["project_payment"],
  { message: "无效的微信支付启用渠道" },
);

export const UpdateWechatPayConfigSchema = z.object({
  merchant_mode: WechatPayMerchantModeSchema.default("direct_merchant"),
  merchant_name: nullableText(100, "商户名称不能超过 100 个字符"),
  merchant_id: nullableText(64, "商户号不能超过 64 个字符"),
  sub_merchant_id: nullableText(64, "子商户号不能超过 64 个字符"),
  app_id: nullableText(64, "AppID 不能超过 64 个字符"),
  sub_app_id: nullableText(64, "子商户 AppID 不能超过 64 个字符"),
  status: WechatPayConfigStatusSchema.default("pending"),
  enabled_channels: z.array(WechatPayEnabledChannelSchema)
    .min(1, "至少启用一个渠道")
    .max(5, "启用渠道过多")
    .default(["project_payment"]),
  settlement_account_summary: nullableText(200, "结算账户摘要不能超过 200 个字符"),
  encrypted_config_ref: nullableText(300, "密钥引用不能超过 300 个字符"),
  risk_switches: z.record(z.string(), z.unknown()).default({}),
  serial_no: nullableText(128, "证书序列号不能超过 128 个字符"),
  notify_url: z.preprocess((value) => {
    if (value == null) return null;
    if (typeof value !== "string") return value;
    const normalized = value.trim();
    return normalized || null;
  }, z.string().url("回调地址格式不正确").max(300, "回调地址不能超过 300 个字符").nullable().optional()),
}).strict();

export type UpdateWechatPayConfigInput =
  z.infer<typeof UpdateWechatPayConfigSchema>;
