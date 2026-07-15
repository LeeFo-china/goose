import { z } from "zod";

export const BillingRechargeProductQuerySchema = z.object({
  page: z.coerce.number().int().min(1, "页码必须大于 0").default(1),
  pageSize: z.coerce.number().int().min(1, "每页数量必须大于 0")
    .max(100, "每页数量不能超过 100")
    .default(20),
}).strict();

export const BillingRechargeOrderQuerySchema = z.object({
  page: z.coerce.number().int().min(1, "页码必须大于 0").default(1),
  pageSize: z.coerce.number().int().min(1, "每页数量必须大于 0")
    .max(100, "每页数量不能超过 100")
    .default(20),
  status: z.enum(["pending", "paid", "closed", "refunded"]).optional(),
  keyword: z.string().trim().max(120, "关键词不能超过 120 个字符").optional(),
}).strict();

export const BillingRechargeCreateOrderSchema = z.object({
  package_code: z.string().trim().min(1, "充值套餐不能为空")
    .max(80, "充值套餐编码不能超过 80 个字符"),
  payer_openid: z.string().trim().min(1, "付款用户 openid 不能为空")
    .max(128, "付款用户 openid 不能超过 128 个字符"),
  idempotency_key: z.uuid("幂等键格式不正确").nullable().optional(),
}).strict();

export const BillingRechargeOrderParamSchema = z.object({
  id: z.uuid("无效的充值订单 ID"),
});

export const BillingRechargeRefundRequestSchema = z.object({
  reason: z.string().trim().min(1, "退款原因不能为空")
    .max(500, "退款原因不能超过 500 个字符"),
  idempotency_key: z.uuid("幂等键格式不正确"),
}).strict();

export type BillingRechargeProductQuery =
  z.infer<typeof BillingRechargeProductQuerySchema>;
export type BillingRechargeOrderQuery =
  z.infer<typeof BillingRechargeOrderQuerySchema>;
export type BillingRechargeCreateOrderInput =
  z.infer<typeof BillingRechargeCreateOrderSchema>;
export type BillingRechargeOrderParam =
  z.infer<typeof BillingRechargeOrderParamSchema>;
export type BillingRechargeRefundRequestInput =
  z.infer<typeof BillingRechargeRefundRequestSchema>;
