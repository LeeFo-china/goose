import { z } from "zod";

import {
  BRANDING_ADDON_ORDER_STATUSES,
  BRANDING_ADDON_PRODUCT_CODE,
} from "../services/branding-addon-contracts";
import { PaginationQuerySchema } from "./request";

const positiveIntegerFen = z.number()
  .int("金额必须是整数分")
  .positive("金额必须大于 0");

export const BrandingAddonProductPatchSchema = z.object({
  name: z.string().trim().min(1, "商品名称不能为空"),
  amount_fen: positiveIntegerFen,
  purchase_notes: z.string().trim().min(1, "购买说明不能为空"),
  enabled: z.boolean(),
  version: z.number().int("版本号必须是整数").positive("版本号必须大于 0"),
}).strict();

export const BrandingAddonCreateOrderSchema = z.object({
  product_code: z.literal(BRANDING_ADDON_PRODUCT_CODE),
  payer_openid: z.string().trim().min(1, "OpenID 不能为空"),
  idempotency_key: z.uuidv4("幂等键必须是合法的 UUID v4"),
}).strict();

export const BrandingAddonOrderStatusSchema = z.enum(
  BRANDING_ADDON_ORDER_STATUSES,
);

export const BrandingAddonOrderListQuerySchema = PaginationQuerySchema.extend({
  status: BrandingAddonOrderStatusSchema.optional(),
});

export type BrandingAddonProductPatchInput =
  z.infer<typeof BrandingAddonProductPatchSchema>;
export type BrandingAddonCreateOrderInput =
  z.infer<typeof BrandingAddonCreateOrderSchema>;
export type BrandingAddonOrderListQuery =
  z.infer<typeof BrandingAddonOrderListQuerySchema>;
