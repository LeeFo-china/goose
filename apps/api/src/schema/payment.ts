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
