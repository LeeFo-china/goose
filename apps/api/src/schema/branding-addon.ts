import { z } from "zod";

import {
  BRANDING_ADDON_ORDER_STATUSES,
  BRANDING_ADDON_PRODUCT_CODE,
  MAX_POSTGRES_INTEGER_FEN,
} from "../services/branding-addon-contracts";
import {
  BRANDING_PURCHASE_MODES,
  VIRTUAL_PAYMENT_ENVIRONMENTS,
} from "../services/branding-virtual-payment-contracts";
import { PaginationQuerySchema } from "./request";

const PRODUCT_NAME_MAX_LENGTH = 100;
const PURCHASE_NOTES_MAX_LENGTH = 500;
const ORDER_KEYWORD_PATTERN = /^[\p{L}\p{N} .-]+$/u;
const PRODUCT_PATCH_MUTABLE_FIELDS = [
  "name",
  "amount_fen",
  "purchase_notes",
  "enabled",
  "purchase_mode",
  "virtual_product",
] as const;

const VirtualPaymentSecretRefSchema = z.enum([
  "WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE",
  "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE",
]);

export const BrandingAddonAmountFenSchema = z.number()
  .int("金额必须是整数分")
  .positive("金额必须大于 0")
  .max(MAX_POSTGRES_INTEGER_FEN, "金额超出支持范围");

export const BrandingVirtualProductPatchSchema = z.object({
  environment: z.enum(VIRTUAL_PAYMENT_ENVIRONMENTS),
  app_id: z.string().trim().min(1).max(64),
  virtual_merchant_id: z.string().trim().min(1).max(64),
  offer_id: z.string().trim().min(1).max(128),
  provider_product_id: z.string().trim().min(1).max(128),
  expected_amount_fen: BrandingAddonAmountFenSchema,
  encrypted_secret_ref: VirtualPaymentSecretRefSchema,
  secret_revision: z.number()
    .int("密钥版本号必须是整数")
    .positive("密钥版本号必须大于 0")
    .max(2_147_483_647, "密钥版本号超出支持范围"),
  status: z.enum(["draft", "active", "disabled"]),
  version: z.number()
    .int("版本号必须是整数")
    .positive("版本号必须大于 0")
    .max(2_147_483_647, "版本号超出支持范围"),
}).strict().refine(
  (input) => input.encrypted_secret_ref === (
    input.environment === "production"
      ? "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE"
      : "WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE"
  ),
  {
    message: "虚拟支付密钥引用必须与环境一致",
    path: ["encrypted_secret_ref"],
  },
);

export const BrandingAddonProductPatchSchema = z.object({
  name: z.string()
    .trim()
    .min(1, "商品名称不能为空")
    .max(PRODUCT_NAME_MAX_LENGTH, "商品名称不能超过 100 个字符")
    .optional(),
  amount_fen: BrandingAddonAmountFenSchema.optional(),
  purchase_notes: z.string()
    .trim()
    .min(1, "购买说明不能为空")
    .max(PURCHASE_NOTES_MAX_LENGTH, "购买说明不能超过 500 个字符")
    .optional(),
  enabled: z.boolean().optional(),
  purchase_mode: z.enum(BRANDING_PURCHASE_MODES).optional(),
  virtual_product: BrandingVirtualProductPatchSchema.optional(),
  version: z.number()
    .int("版本号必须是整数")
    .positive("版本号必须大于 0")
    .max(2_147_483_647, "版本号超出支持范围"),
}).strict().refine(
  (input) => PRODUCT_PATCH_MUTABLE_FIELDS.some(
    (field) => input[field] !== undefined,
  ),
  { message: "至少提交一个可修改字段" },
);

export const BrandingAddonCreateOrderSchema = z.object({
  product_code: z.literal(BRANDING_ADDON_PRODUCT_CODE),
  idempotency_key: z.uuidv4("幂等键必须是合法的 UUID v4"),
}).strict();

export const BrandingAddonEmptySchema = z.object({}).strict();

export const BrandingVirtualProductEnvironmentParamsSchema = z.object({
  environment: z.enum(VIRTUAL_PAYMENT_ENVIRONMENTS),
}).strict();

export const BrandingVirtualProductValidationSchema = z.object({
  version: z.number()
    .int("版本号必须是整数")
    .positive("版本号必须大于 0")
    .max(2_147_483_647, "版本号超出支持范围"),
}).strict();

export const BrandingAddonOrderParamsSchema = z.object({
  id: z.uuid("订单 ID 格式不正确"),
}).strict();

export const BrandingAddonOrderStatusSchema = z.enum(
  BRANDING_ADDON_ORDER_STATUSES,
);

export const BrandingAddonOrderListQuerySchema = PaginationQuerySchema.extend({
  status: BrandingAddonOrderStatusSchema.optional(),
  keyword: z.string()
    .trim()
    .min(1, "关键词不能为空")
    .max(120, "关键词不能超过 120 个字符")
    .regex(ORDER_KEYWORD_PATTERN, "关键词包含不支持的字符")
    .optional(),
}).strict();

export const PlatformBrandingAddonOrderListQuerySchema =
  BrandingAddonOrderListQuerySchema.extend({
    tenant_id: z.uuid("租户 ID 格式不正确").optional(),
    created_from: z.iso.datetime("开始时间格式不正确").optional(),
    created_to: z.iso.datetime("结束时间格式不正确").optional(),
  }).refine(
    (input) => !input.created_from ||
      !input.created_to ||
      Date.parse(input.created_from) <= Date.parse(input.created_to),
    {
      message: "开始时间不能晚于结束时间",
      path: ["created_from"],
    },
  );

export type BrandingAddonProductPatchInput =
  z.infer<typeof BrandingAddonProductPatchSchema>;
export type BrandingVirtualProductPatchInput =
  z.infer<typeof BrandingVirtualProductPatchSchema>;
export type BrandingVirtualProductValidationInput =
  z.infer<typeof BrandingVirtualProductValidationSchema>;
export type BrandingAddonCreateOrderInput =
  z.infer<typeof BrandingAddonCreateOrderSchema>;
export type BrandingAddonOrderListQuery =
  z.infer<typeof BrandingAddonOrderListQuerySchema>;
export type PlatformBrandingAddonOrderListQuery =
  z.infer<typeof PlatformBrandingAddonOrderListQuerySchema>;
