import { PaginationQuerySchema } from "@/schema/request";
import { z } from "zod";

const BooleanQuerySchema = z.preprocess((value) => {
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  return value;
}, z.boolean());

export const PlatformRechargeProductParamSchema = z.object({
  id: z.uuid("无效的充值套餐 ID"),
});

export const PlatformRechargeOrderParamSchema = z.object({
  id: z.uuid("无效的充值订单 ID"),
});

export const PlatformRechargeProductQuerySchema = PaginationQuerySchema.extend({
  enabled: BooleanQuerySchema.optional(),
});

const PlatformRechargeProductBaseSchema = z.object({
  code: z.string().trim().min(1, "套餐编码不能为空").max(80, "套餐编码不能超过 80 个字符"),
  title: z.string().trim().min(1, "套餐名称不能为空").max(100, "套餐名称不能超过 100 个字符"),
  amount_fen: z.coerce.number().int().min(1, "充值金额必须大于 0"),
  credits: z.coerce.number().int().min(1, "到账积分必须大于 0"),
  bonus_credits: z.coerce.number().int().min(0, "赠送积分不能小于 0"),
  enabled: z.boolean(),
  sort_order: z.coerce.number().int().min(0, "排序不能小于 0"),
  metadata: z.record(z.string(), z.unknown()),
});

export const PlatformRechargeProductCreateSchema =
  PlatformRechargeProductBaseSchema.extend({
    bonus_credits: PlatformRechargeProductBaseSchema.shape.bonus_credits
      .default(0),
    enabled: PlatformRechargeProductBaseSchema.shape.enabled.default(true),
    sort_order: PlatformRechargeProductBaseSchema.shape.sort_order.default(100),
    metadata: PlatformRechargeProductBaseSchema.shape.metadata.default({}),
}).strict();

export const PlatformRechargeProductUpdateSchema =
  PlatformRechargeProductBaseSchema.partial().strict();

export const PlatformRechargeOrderQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(["pending", "paid", "closed", "refunded"]).optional(),
  keyword: z.string().trim().max(120, "关键词不能超过 120 个字符").optional(),
});

export const PlatformRechargeOrderCompensateSchema = z.object({
  reason: z.string().trim().max(200, "补偿原因不能超过 200 个字符").optional(),
}).strict();

export type PlatformRechargeProductQuery =
  z.infer<typeof PlatformRechargeProductQuerySchema>;
export type PlatformRechargeProductCreateInput =
  z.infer<typeof PlatformRechargeProductCreateSchema>;
export type PlatformRechargeProductUpdateInput =
  z.infer<typeof PlatformRechargeProductUpdateSchema>;
export type PlatformRechargeOrderQuery =
  z.infer<typeof PlatformRechargeOrderQuerySchema>;
export type PlatformRechargeOrderCompensateInput =
  z.infer<typeof PlatformRechargeOrderCompensateSchema>;
