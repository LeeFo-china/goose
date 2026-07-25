import { z } from "zod";
import { IdParamSchema } from "@/schema/request";

export const CreateCustomerWechatPaySmokeOrderSchema = z.object({
  payer_openid: z.string()
    .trim()
    .min(1, "付款用户 openid 不能为空")
    .max(128, "付款用户 openid 不能超过 128 个字符"),
  idempotency_key: z.uuid("幂等键格式不正确").nullable().optional(),
}).strict();

export const CustomerWechatPaySmokeOrderParamSchema = IdParamSchema;

export type CreateCustomerWechatPaySmokeOrderInput =
  z.infer<typeof CreateCustomerWechatPaySmokeOrderSchema>;
export type CustomerWechatPaySmokeOrderParam =
  z.infer<typeof CustomerWechatPaySmokeOrderParamSchema>;
