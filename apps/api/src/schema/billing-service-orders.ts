import {
  PLATFORM_SERVICE_PAYMENT_STATUS_VALUES,
  PLATFORM_SERVICE_STATUS_VALUES,
} from "@gooes/domain";
import { z } from "zod";

import { PaginationQuerySchema } from "./request";

export const ServiceProductListQuerySchema = PaginationQuerySchema.strict();

export const ServiceOrderListQuerySchema = PaginationQuerySchema.extend({
  paymentStatus: z.enum(PLATFORM_SERVICE_PAYMENT_STATUS_VALUES).optional(),
  serviceStatus: z.enum(PLATFORM_SERVICE_STATUS_VALUES).optional(),
  keyword: z.string().trim().max(120, "关键词不能超过 120 个字符").optional(),
}).strict();

export const ServiceOrderCreateSchema = z.object({
  product_code: z.string().trim().min(1, "服务商品不能为空")
    .max(80, "服务商品编码不能超过 80 个字符"),
  terms_version: z.number().int().positive("条款版本必须大于 0"),
  terms_accepted: z.literal(true),
  idempotency_key: z.uuid("幂等键格式不正确"),
}).strict();

export const ServiceOrderActionSchema = z.object({
  idempotency_key: z.uuid("幂等键格式不正确"),
  expected_version: z.number().int().positive("订单版本必须大于 0"),
}).strict();

export const ServiceRefundRequestSchema = ServiceOrderActionSchema.extend({
  reason: z.string().trim().min(1, "售后原因不能为空")
    .max(500, "售后原因不能超过 500 个字符"),
}).strict();

export const ServiceOrderParamSchema = z.object({
  id: z.uuid("无效的平台服务订单 ID"),
});

export type ServiceProductListQuery =
  z.infer<typeof ServiceProductListQuerySchema>;
export type ServiceOrderListQuery =
  z.infer<typeof ServiceOrderListQuerySchema>;
export type ServiceOrderCreateInput =
  z.infer<typeof ServiceOrderCreateSchema>;
export type ServiceOrderActionInput =
  z.infer<typeof ServiceOrderActionSchema>;
export type ServiceRefundRequestInput =
  z.infer<typeof ServiceRefundRequestSchema>;
