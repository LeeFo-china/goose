import { z } from "zod";

import {
  BRANDING_ADDON_ORDER_STATUSES,
  BRANDING_ADDON_PRODUCT_CODE,
} from "../services/branding-addon-contracts";
import { PaginationQuerySchema } from "./request";

const PRODUCT_NAME_MAX_LENGTH = 100;
const PURCHASE_NOTES_MAX_LENGTH = 500;
const PAYER_OPENID_MAX_LENGTH = 128;
const ORDER_KEYWORD_PATTERN = /^[\p{L}\p{N} .-]+$/u;
const PRODUCT_PATCH_MUTABLE_FIELDS = [
  "name",
  "amount_fen",
  "purchase_notes",
  "enabled",
] as const;

const positiveIntegerFen = z.number()
  .int("金额必须是整数分")
  .positive("金额必须大于 0");

export const BrandingAddonProductPatchSchema = z.object({
  name: z.string()
    .trim()
    .min(1, "商品名称不能为空")
    .max(PRODUCT_NAME_MAX_LENGTH, "商品名称不能超过 100 个字符")
    .optional(),
  amount_fen: positiveIntegerFen.optional(),
  purchase_notes: z.string()
    .trim()
    .min(1, "购买说明不能为空")
    .max(PURCHASE_NOTES_MAX_LENGTH, "购买说明不能超过 500 个字符")
    .optional(),
  enabled: z.boolean().optional(),
  version: z.number().int("版本号必须是整数").positive("版本号必须大于 0"),
}).strict().refine(
  (input) => PRODUCT_PATCH_MUTABLE_FIELDS.some(
    (field) => input[field] !== undefined,
  ),
  { message: "至少提交一个可修改字段" },
);

export const BrandingAddonCreateOrderSchema = z.object({
  product_code: z.literal(BRANDING_ADDON_PRODUCT_CODE),
  payer_openid: z.string()
    .trim()
    .min(1, "OpenID 不能为空")
    .max(PAYER_OPENID_MAX_LENGTH, "OpenID 不能超过 128 个字符"),
  idempotency_key: z.uuidv4("幂等键必须是合法的 UUID v4"),
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
});

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
export type BrandingAddonCreateOrderInput =
  z.infer<typeof BrandingAddonCreateOrderSchema>;
export type BrandingAddonOrderListQuery =
  z.infer<typeof BrandingAddonOrderListQuerySchema>;
export type PlatformBrandingAddonOrderListQuery =
  z.infer<typeof PlatformBrandingAddonOrderListQuerySchema>;
