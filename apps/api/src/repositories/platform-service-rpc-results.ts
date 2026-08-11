import { z } from "zod";

import { Errors } from "../errors/error-factory";
import type {
  AtomicActionResult,
  OrderRecord,
  RefundRequestRecord,
} from "./platform-service-order-records";
import {
  contractPeriodSchema,
  contractSchema,
  overdueAcceptanceResultSchema,
  paymentConfirmationSchema,
  refundClosureSchema,
  refundConfirmationSchema,
  tenantAcceptanceResultSchema,
  trustedRefundExecutionSchema,
} from "./platform-service-rpc-fact-schemas";

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
export type PaymentConfirmationRpcResult = {
  order: { id: string; payment_status?: string } & Record<string, unknown>;
  work_order: { id: string; status?: string } & Record<string, unknown>;
  access_mode: "paid_onboarding" | null;
  conversion_anomaly: {
    code: "TRIAL_ALREADY_ATTRIBUTED";
    trial_id: string;
    order_id: string;
    attributed_order_id: string;
  } | null;
  idempotent: boolean;
  error_code?: string | null;
};
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
  service_access_terminated_at: string | null;
  service_access_termination_reason: string | null;
  service_access_terminated_by_employee_id: string | null;
} & Record<string, unknown>;
export type RefundExecutionRequestRecord = RefundRequestRecord & {
  provider_refund_status?: "CLOSED" | null;
  provider_out_refund_no?: string | null;
  provider_wechat_refund_id?: string | null;
  provider_refund_amount_fen?: number | null;
  provider_checked_at?: string | null;
  provider_checked_by_employee_id?: string | null;
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

export type RefundClosureResult = {
  refundRequest: Omit<RefundExecutionRequestRecord, "order">;
  order: OrderRecord & Pick<
    RefundExecutionOrderRecord,
    | "service_access_terminated_at"
    | "service_access_termination_reason"
    | "service_access_terminated_by_employee_id"
  >;
  providerStatus: "CLOSED";
  refunded: false;
  accessTerminated: false;
  retryable: false;
  idempotent: boolean;
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

export type CloseServiceRefundInput = Omit<
  ConfirmServiceRefundInput,
  "refundedAt"
>;

export function buildConfirmServiceRefundRpcParams(
  input: ConfirmServiceRefundInput,
) {
  return {
    ...buildRefundExecutionBindingParams(input),
    p_refunded_at: input.refundedAt,
    p_operator_employee_id: input.operatorEmployeeId,
    p_metadata: input.metadata,
  };
}

export function buildCloseServiceRefundRpcParams(
  input: CloseServiceRefundInput,
) {
  return {
    ...buildRefundExecutionBindingParams(input),
    p_operator_employee_id: input.operatorEmployeeId,
    p_metadata: input.metadata,
  };
}

function buildRefundExecutionBindingParams(input: CloseServiceRefundInput) {
  return {
    p_refund_request_id: input.refundRequestId,
    p_service_order_id: input.serviceOrderId,
    p_transaction_id: input.transactionId,
    p_out_trade_no: input.outTradeNo,
    p_payment_config_id: input.paymentConfigId,
    p_payment_config_guard_version: input.paymentConfigGuardVersion,
    p_out_refund_no: input.outRefundNo,
    p_wechat_refund_id: input.wechatRefundId,
    p_refund_amount_fen: input.refundAmountFen,
  };
}

export function parsePaymentConfirmationResult(
  data: unknown,
): PaymentConfirmationRpcResult {
  const result = parseRpc(
    paymentConfirmationSchema,
    data,
    "确认平台技术服务支付失败",
  );
  return {
    order: result.order,
    work_order: result.work_order,
    access_mode: result.access_mode,
    conversion_anomaly: result.conversion_anomaly,
    idempotent: result.idempotent,
    error_code: result.error_code,
  };
}

export function parseAcceptanceResult(data: unknown): AtomicActionResult {
  return mapAcceptanceResult(parseRpc(
    tenantAcceptanceResultSchema,
    data,
    "提交平台技术服务验收决定失败",
  ));
}

export function parseOverdueAcceptanceResult(data: unknown): AtomicActionResult {
  return mapAcceptanceResult(parseRpc(
    overdueAcceptanceResultSchema,
    data,
    "平台确认逾期验收失败",
  ));
}

export function parseRefundExecutionRequest(
  data: unknown,
): RefundExecutionRequestRecord {
  const result = parseRpc(
    trustedRefundExecutionSchema,
    data,
    "查询平台技术服务退款执行事实失败",
  );
  return result;
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
    refundRequest: result.refund_request,
    order: result.order,
    contract: result.contract,
    contractPeriod: result.contract_period,
    idempotent: result.idempotent,
  };
}

export function parseRefundClosureResult(data: unknown): RefundClosureResult {
  const result = parseRpc(
    refundClosureSchema,
    data,
    "关闭平台技术服务退款执行失败",
  );
  return {
    refundRequest: result.refund_request,
    order: result.order,
    providerStatus: result.provider_status,
    refunded: result.refunded,
    accessTerminated: result.access_terminated,
    retryable: result.retryable,
    idempotent: result.idempotent,
  };
}

function mapAcceptanceResult(
  result: z.output<typeof tenantAcceptanceResultSchema> |
    z.output<typeof overdueAcceptanceResultSchema>,
): AtomicActionResult {
  return {
    order: result.order,
    workOrder: result.work_order,
    acceptancePreparation: result.acceptance_preparation,
    contract: result.contract,
    contractPeriod: result.contract_period,
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
