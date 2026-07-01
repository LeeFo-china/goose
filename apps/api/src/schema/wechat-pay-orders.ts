import { z } from "zod";
import { PaginationQuerySchema } from "@/schema/request";

export const WECHAT_PAY_ORDER_STATUS_VALUES = [
  "pending",
  "paid",
  "closed",
  "refunded",
  "failed",
] as const;

export const WechatPayOrderStatusSchema = z.enum(
  WECHAT_PAY_ORDER_STATUS_VALUES,
  { message: "无效的微信支付订单状态" },
);

export const CreateWechatPayOrderSchema = z.object({
  project_id: z.uuid("请选择有效的项目"),
  receivable_plan_id: z.uuid("请选择有效的应收计划"),
  workflow_task_id: z.uuid("请选择有效的流程待办"),
  amount: z.coerce.number("金额必须是数字")
    .positive("金额必须大于 0"),
}).strict();

export const WechatPayOrderListQuerySchema = PaginationQuerySchema.extend({
  status: WechatPayOrderStatusSchema.optional(),
  project_id: z.uuid("请选择有效的项目").optional(),
  receivable_plan_id: z.uuid("请选择有效的应收计划").optional(),
  workflow_task_id: z.uuid("请选择有效的流程待办").optional(),
});

export type WechatPayOrderStatus =
  (typeof WECHAT_PAY_ORDER_STATUS_VALUES)[number];
export type CreateWechatPayOrderInput =
  z.infer<typeof CreateWechatPayOrderSchema>;
export type WechatPayOrderListQuery =
  z.infer<typeof WechatPayOrderListQuerySchema>;
