import { z } from "zod";

const nullableText = (max: number, message: string) =>
  z.preprocess((value) => {
    if (value == null) return null;
    if (typeof value !== "string") return value;
    const normalized = value.trim();
    return normalized || null;
  }, z.string().max(max, message).nullable().optional());

export const PlatformWechatPayEnabledChannelSchema = z.enum(
  ["tenant_recharge"],
  { message: "无效的平台支付启用渠道" },
);

export const PlatformPaymentConfigStatusSchema = z.enum(
  ["pending", "active", "disabled", "suspended"],
  { message: "无效的平台支付配置状态" },
);

export const UpdatePlatformWechatPayConfigSchema = z.object({
  merchant_mode: z.literal("direct_merchant").default("direct_merchant"),
  merchant_name: nullableText(100, "商户名称不能超过 100 个字符"),
  merchant_id: nullableText(64, "商户号不能超过 64 个字符"),
  app_id: nullableText(64, "AppID 不能超过 64 个字符"),
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
