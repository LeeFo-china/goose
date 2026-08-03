import {
  BRANDING_PURCHASE_MODES,
  VIRTUAL_PAYMENT_ENVIRONMENTS,
} from "@gooes/domain";
import { z } from "zod";

import { MAX_POSTGRES_INTEGER_FEN } from "../services/branding-addon-contracts";

const nullableText = (max: number, message: string) =>
  z.preprocess((value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
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
  ).optional(),
  merchant_name: nullableText(100, "商户名称不能超过 100 个字符"),
  merchant_id: nullableText(64, "商户号不能超过 64 个字符"),
  sub_merchant_id: nullableText(64, "子商户号不能超过 64 个字符"),
  app_id: nullableText(64, "AppID 不能超过 64 个字符"),
  sub_app_id: nullableText(64, "子商户 AppID 不能超过 64 个字符"),
  encrypted_config_ref: nullableText(300, "密钥引用不能超过 300 个字符"),
  serial_no: nullableText(128, "证书序列号不能超过 128 个字符"),
  notify_url: z.preprocess((value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== "string") return value;
    const normalized = value.trim();
    return normalized || null;
  }, z.string().url("回调地址格式不正确").max(300, "回调地址不能超过 300 个字符").nullable().optional()),
  enabled_channels: z.array(PlatformWechatPayEnabledChannelSchema)
    .min(1, "至少启用一个平台支付渠道")
    .max(5, "启用渠道过多")
    .optional(),
  status: PlatformPaymentConfigStatusSchema.optional(),
  risk_switches: z.record(z.string(), z.json()).optional(),
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

const positiveInteger = (label: string) => z.number()
  .int(`${label}必须是整数`)
  .positive(`${label}必须大于 0`)
  .max(MAX_POSTGRES_INTEGER_FEN, `${label}超出支持范围`);

const requiredTrimmedText = (max: number, label: string) => z.string()
  .trim()
  .min(1, `${label}不能为空`)
  .max(max, `${label}不能超过 ${max} 个字符`);

const wechatVirtualGoodsId = z.string()
  .trim()
  .regex(
    /^[A-Za-z0-9_-]{1,20}$/,
    "支付渠道商品 ID 只能包含字母、数字、下划线或短横线，且不超过 20 个字符",
  );

const wechatVirtualGoodsImageUrl = z.string()
  .trim()
  .max(2_048, "微信商品图片地址不能超过 2048 个字符")
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" &&
        /\.(?:png|jpe?g)$/i.test(url.pathname) &&
        url.username === "" && url.password === "" && url.hash === "";
    } catch {
      return false;
    }
  }, "微信商品图片必须是 HTTPS JPG 或 PNG 地址");

export const PlatformWechatVirtualEnvironmentSchema = z.enum(
  VIRTUAL_PAYMENT_ENVIRONMENTS,
);

export const PlatformWechatVirtualProductPatchSchema = z.object({
  environment: PlatformWechatVirtualEnvironmentSchema,
  app_id: requiredTrimmedText(64, "AppID"),
  virtual_merchant_id: requiredTrimmedText(64, "虚拟支付商户号"),
  offer_id: requiredTrimmedText(128, "Offer ID"),
  provider_product_id: wechatVirtualGoodsId,
  item_url: wechatVirtualGoodsImageUrl,
  expected_amount_fen: z.number()
    .int("金额必须是整数分")
    .positive("金额必须大于 0")
    .max(MAX_POSTGRES_INTEGER_FEN, "金额超出支持范围"),
  secret_revision: positiveInteger("密钥版本号"),
  status: z.enum(["draft", "active", "disabled"]),
  version: positiveInteger("版本号"),
}).strict();

export const UpdatePlatformWechatVirtualChannelSchema = z.object({
  app_id: requiredTrimmedText(64, "AppID"),
  virtual_merchant_id: requiredTrimmedText(64, "虚拟支付商户号"),
  offer_id: requiredTrimmedText(128, "Offer ID"),
  secret_revision: positiveInteger("密钥版本号"),
  status: z.enum(["active", "disabled"]),
  version: positiveInteger("版本号"),
}).strict();

export const UpdatePlatformWechatVirtualSettingsSchema = z.object({
  version: positiveInteger("版本号"),
  purchase_mode: z.enum(BRANDING_PURCHASE_MODES).optional(),
  virtual_product: PlatformWechatVirtualProductPatchSchema.optional(),
}).strict().refine(
  (input) => input.purchase_mode !== undefined ||
    input.virtual_product !== undefined,
  { message: "至少提交购买模式或虚拟商品配置" },
);

export const PlatformWechatVirtualProductValidationSchema = z.object({
  version: positiveInteger("版本号"),
}).strict();

export const UpdatePlatformWechatVirtualSecretBundleSchema = z.object({
  app_key: requiredTrimmedText(512, "App Key"),
  revision: positiveInteger("密钥版本号"),
}).strict();

export const UpdatePlatformWechatVirtualMessageTokenSchema = z.object({
  message_token: requiredTrimmedText(512, "消息令牌"),
}).strict();

export type PlatformWechatVirtualEnvironmentInput =
  z.infer<typeof PlatformWechatVirtualEnvironmentSchema>;
export type PlatformWechatVirtualProductPatchInput =
  z.infer<typeof PlatformWechatVirtualProductPatchSchema>;
export type UpdatePlatformWechatVirtualChannelInput =
  z.infer<typeof UpdatePlatformWechatVirtualChannelSchema>;
export type UpdatePlatformWechatVirtualSettingsInput =
  z.infer<typeof UpdatePlatformWechatVirtualSettingsSchema>;
export type PlatformWechatVirtualProductValidationInput =
  z.infer<typeof PlatformWechatVirtualProductValidationSchema>;
export type UpdatePlatformWechatVirtualSecretBundleInput =
  z.infer<typeof UpdatePlatformWechatVirtualSecretBundleSchema>;
export type UpdatePlatformWechatVirtualMessageTokenInput =
  z.infer<typeof UpdatePlatformWechatVirtualMessageTokenSchema>;
