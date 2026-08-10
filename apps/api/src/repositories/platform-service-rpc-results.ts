import { z } from "zod";

import { Errors } from "../errors/error-factory";
import type {
  AcceptancePreparationRecord,
  AtomicActionResult,
  OrderRecord,
  RefundRequestRecord,
  WorkOrderRecord,
} from "./platform-service-order-records";

export type ServiceContractRecord = {
  id: string;
  tenant_id: string;
  status: string;
  service_start_at: string;
  service_end_at: string;
};

export type ServiceContractPeriodRecord = {
  id: string;
  contract_id: string;
  tenant_id: string;
  service_order_id: string;
  status: string;
  starts_at: string;
  ends_at: string;
};

const rpcRowSchema = z.object({ id: z.string().trim().min(1) }).passthrough();
const orderRpcRowSchema = rpcRowSchema.extend({
  payment_status: z.string().optional(),
  service_status: z.string().optional(),
});
const workOrderRpcRowSchema = rpcRowSchema.extend({
  status: z.string().optional(),
});
const acceptanceRpcRowSchema = rpcRowSchema.extend({
  status: z.string().optional(),
});
const contractSchema = z.object({
  id: z.string().trim().min(1),
  tenant_id: z.string().trim().min(1),
  status: z.string().trim().min(1),
  service_start_at: z.string().trim().min(1),
  service_end_at: z.string().trim().min(1),
}).passthrough();
const contractPeriodSchema = z.object({
  id: z.string().trim().min(1),
  contract_id: z.string().trim().min(1),
  tenant_id: z.string().trim().min(1),
  service_order_id: z.string().trim().min(1),
  status: z.string().trim().min(1),
  starts_at: z.string().trim().min(1),
  ends_at: z.string().trim().min(1),
}).passthrough();
const errorCodeSchema = z.string().nullable().optional();

const paymentConfirmationSchema = z.object({
  order: orderRpcRowSchema,
  work_order: workOrderRpcRowSchema,
  access_mode: z.literal("paid_onboarding").nullable(),
  idempotent: z.boolean(),
  error_code: errorCodeSchema,
}).passthrough();

const acceptanceResultSchema = z.object({
  order: orderRpcRowSchema.nullable(),
  work_order: workOrderRpcRowSchema.nullable(),
  acceptance_preparation: acceptanceRpcRowSchema.nullable(),
  contract: contractSchema.nullable(),
  contract_period: contractPeriodSchema.nullable(),
  idempotent: z.boolean(),
  error_code: errorCodeSchema,
}).passthrough().superRefine((value, context) => {
  if (
    value.order?.service_status === "accepted" ||
    value.order?.service_status === "active"
  ) {
    if (!value.contract || !value.contract_period) {
      context.addIssue({
        code: "custom",
        message: "accepted service requires contract facts",
      });
    }
  }
});

const refundRequestSchema = rpcRowSchema.extend({
  tenant_id: z.string().trim().min(1),
  service_order_id: z.string().trim().min(1),
  idempotency_key: z.string().trim().min(1),
  reason: z.string(),
  status: z.string().trim().min(1),
  version: z.number().int().positive().optional(),
  created_by_employee_id: z.string().trim().min(1),
  reviewed_by_employee_id: z.string().nullable().optional(),
  reviewed_at: z.string().nullable().optional(),
  review_remark: z.string().nullable().optional(),
  out_refund_no: z.string().nullable().optional(),
  wechat_refund_id: z.string().nullable().optional(),
  refund_amount_fen: z.number().int().positive().nullable().optional(),
  refunded_at: z.string().nullable().optional(),
  refunded_by_employee_id: z.string().nullable().optional(),
  created_at: z.string().trim().min(1),
  updated_at: z.string().trim().min(1),
});

export type RefundExecutionOrderRecord = {
  id: string;
  tenant_id: string;
  order_no: string;
  out_trade_no: string;
  amount_fen: number;
  paid_amount_fen: number;
  payment_status: string;
  service_status: string;
  payment_config_id: string;
  payment_config_guard_version: number;
  transaction_id: string;
} & Record<string, unknown>;

const refundExecutionOrderSchema = z.object({
  id: z.string().trim().min(1),
  tenant_id: z.string().trim().min(1),
  order_no: z.string().trim().min(1),
  out_trade_no: z.string().trim().min(1),
  amount_fen: z.number().int().positive(),
  paid_amount_fen: z.number().int().positive(),
  payment_status: z.string().trim().min(1),
  service_status: z.string().trim().min(1),
  payment_config_id: z.string().trim().min(1),
  payment_config_guard_version: z.number().int().positive(),
  transaction_id: z.string().trim().min(1),
}).passthrough();

const refundExecutionRequestSchema = refundRequestSchema.extend({
  order: refundExecutionOrderSchema,
}).superRefine((value, context) => {
  if (
    value.order.tenant_id !== value.tenant_id ||
    value.order.id !== value.service_order_id
  ) {
    context.addIssue({ code: "custom", message: "refund order binding mismatch" });
  }
});

const refundConfirmationSchema = z.object({
  refund_request: rpcRowSchema.extend({ status: z.string().trim().min(1) }),
  order: orderRpcRowSchema,
  contract: contractSchema.nullable(),
  contract_period: contractPeriodSchema.nullable(),
  idempotent: z.boolean(),
  error_code: errorCodeSchema,
}).passthrough();

export type PaymentConfirmationRpcResult = {
  order: { id: string; payment_status?: string } & Record<string, unknown>;
  work_order: { id: string; status?: string } & Record<string, unknown>;
  access_mode: "paid_onboarding" | null;
  idempotent: boolean;
  error_code?: string | null;
};

export type RefundExecutionRequestRecord = RefundRequestRecord & {
  order: RefundExecutionOrderRecord;
};

export type RefundConfirmationResult = {
  refundRequest: RefundRequestRecord;
  order: OrderRecord;
  contract: ServiceContractRecord | null;
  contractPeriod: ServiceContractPeriodRecord | null;
  idempotent: boolean;
  errorCode?: string;
};

export type ConfirmServiceRefundInput = {
  refundRequestId: string;
  serviceOrderId: string;
  transactionId: string;
  outTradeNo: string;
  paymentConfigId: string;
  paymentConfigGuardVersion: number;
  outRefundNo: string;
  wechatRefundId: string;
  refundAmountFen: number;
  refundedAt: string;
  operatorEmployeeId: string;
  metadata: Record<string, unknown>;
};

export function parsePaymentConfirmationResult(
  data: unknown,
): PaymentConfirmationRpcResult {
  const parsed = parseRpc(paymentConfirmationSchema, data, "确认平台技术服务支付失败");
  return parsed as unknown as PaymentConfirmationRpcResult;
}

export function parseAcceptanceResult(data: unknown): AtomicActionResult {
  const result = parseRpc(
    acceptanceResultSchema,
    data,
    "提交平台技术服务验收决定失败",
  );
  return {
    order: result.order as OrderRecord | null,
    workOrder: result.work_order as WorkOrderRecord | null,
    acceptancePreparation:
      result.acceptance_preparation as AcceptancePreparationRecord | null,
    contract: result.contract as ServiceContractRecord | null,
    contractPeriod: result.contract_period as ServiceContractPeriodRecord | null,
    idempotent: result.idempotent,
    errorCode: result.error_code ?? undefined,
  };
}

export function parseRefundExecutionRequest(
  data: unknown,
): RefundExecutionRequestRecord {
  return parseRpc(
    refundExecutionRequestSchema,
    data,
    "查询平台技术服务退款执行事实失败",
  ) as RefundExecutionRequestRecord;
}

export function parseRefundConfirmationResult(
  data: unknown,
): RefundConfirmationResult {
  const result = parseRpc(
    refundConfirmationSchema,
    data,
    "确认平台技术服务退款失败",
  );
  return {
    refundRequest: result.refund_request as RefundRequestRecord,
    order: result.order as OrderRecord,
    contract: result.contract as ServiceContractRecord | null,
    contractPeriod: result.contract_period as ServiceContractPeriodRecord | null,
    idempotent: result.idempotent,
    errorCode: result.error_code ?? undefined,
  };
}

function parseRpc<Schema extends z.ZodType>(
  schema: Schema,
  data: unknown,
  message: string,
): z.output<Schema> {
  const result = schema.safeParse(data);
  if (!result.success) throw Errors.dbError(message);
  return result.data;
}
