import { z } from "zod";
import { PaginationQuerySchema } from "@/schema/request";
import {
  PAYMENT_STATUS_VALUES,
  PAYMENT_TYPE_VALUES,
} from "@gooes/domain";

/**
 * 基础支付/款项 Schema
 */
export const PaymentBaseSchema = z.object({
  // ID 由数据库生成
  id: z.string().uuid("无效的支付记录 ID").optional(),

  // 金额：强制转换为数字，且必须大于 0
  amount: z.coerce.number().positive("金额必须大于 0").nullable().optional(),

  // 项目 ID：关联 projects 表
  project_id: z.string().uuid("请选择有效的关联项目").nullable().optional(),

  // 支付状态：例如 已支付、待支付、已退款
  status: z
    .enum(PAYMENT_STATUS_VALUES, {
      message: "无效的支付状态",
    })
    .default("pending"),

  // 支付类型：例如 预付款、尾款、进度款，或者 微信、支付宝、银行转账
  type: z
    .enum(PAYMENT_TYPE_VALUES, {
      message: "请选择有效的支付类型",
    })
    .default("deposit"),

  // 创建时间
  created_at: z.string().datetime("无效的时间格式").nullable().optional(),

  evidence_images: z.array(z.unknown()).default([]).optional(),
  handled_by: z.uuid("请选择有效的经办人").nullable().optional(),
  pay_date: z.string().datetime("无效的入账时间").nullable().optional(),
  paid_at: z.string().datetime("无效的入账时间").nullable().optional(),
  workflow_task_id: z.uuid("无效的流程待办 ID").nullable().optional(),
  source_type: z.string().trim().max(100, "来源类型过长").nullable().optional(),
  source_id: z.uuid("无效的来源 ID").nullable().optional(),
  remark: z.string().trim().max(500, "备注不能超过 500 个字符").nullable().optional(),
  payment_channel: z.string().trim().max(50, "收款渠道过长").default("manual"),
  provider: z.string().trim().max(50, "支付提供方过长").nullable().optional(),
  provider_transaction_id: z.string().trim().max(100, "支付交易号过长").nullable().optional(),
  out_trade_no: z.string().trim().max(100, "商户订单号过长").nullable().optional(),
});

/**
 * 创建支付记录校验 (POST)
 */
export const CreatePaymentSchema = PaymentBaseSchema.omit({
  id: true,
  created_at: true,
});

/**
 * 更新支付记录校验 (PATCH)
 */
export const UpdatePaymentSchema = CreatePaymentSchema.partial();

export const PaymentListQuerySchema = PaginationQuerySchema.extend({
  project_id: z.string().uuid("请选择有效的关联项目").optional(),
  status: z.enum(PAYMENT_STATUS_VALUES, {
    message: "无效的支付状态",
  }).optional(),
  type: z.enum(PAYMENT_TYPE_VALUES, {
    message: "请选择有效的支付类型",
  }).optional(),
});

// 导出类型
export type PaymentType = z.infer<typeof PaymentBaseSchema>;
export type CreatePaymentInput = z.infer<typeof CreatePaymentSchema>;
export type UpdatePaymentInput = z.infer<typeof UpdatePaymentSchema>;
export type PaymentListQuery = z.infer<typeof PaymentListQuerySchema>;
