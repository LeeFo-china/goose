import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import type {
  BrandingVirtualPaymentReconciliationClaim,
} from "@/repositories/branding-virtual-payment-reconciliation";
import type {
  BrandingVirtualSuccessfulTransaction,
} from "@/services/branding-virtual-payment-confirmation";
import type {
  QueryVirtualOrderResult,
} from "@/services/wechat-virtual-payment-gateway-contracts";

const RETRY_MINUTES = 5;
const MAX_RETRY_MINUTES = 30;

export function confirmationOrder(
  claim: BrandingVirtualPaymentReconciliationClaim,
) {
  return {
    id: claim.id,
    out_trade_no: claim.out_trade_no,
    environment: claim.environment,
    provider_product_id: claim.provider_product_id,
    payer_openid: claim.payer_openid,
    amount_fen: claim.amount_fen,
    provider_order_no: claim.provider_order_no,
    transaction_id: claim.transaction_id,
  };
}

export function queriedTransaction(
  claim: BrandingVirtualPaymentReconciliationClaim,
  result: QueryVirtualOrderResult,
): BrandingVirtualSuccessfulTransaction {
  return queryTransaction(claim, {
    providerOrderNo: requireText(result.wechatOrderId),
    transactionId: requireText(result.wechatPayOrderId),
    actualPriceFen: result.paidFee,
    paidAt: new Date(result.paidAt * 1_000).toISOString(),
  });
}

export function preparedTransaction(
  claim: BrandingVirtualPaymentReconciliationClaim,
): BrandingVirtualSuccessfulTransaction {
  return queryTransaction(claim, {
    providerOrderNo: requireText(claim.reconcile_query_provider_order_no),
    transactionId: requireText(claim.reconcile_query_transaction_id),
    actualPriceFen: requireAmount(claim.reconcile_query_paid_amount_fen),
    paidAt: requireText(claim.reconcile_query_paid_at),
  });
}

export function persistedTransaction(
  claim: BrandingVirtualPaymentReconciliationClaim,
): BrandingVirtualSuccessfulTransaction {
  return queryTransaction(claim, {
    providerOrderNo: requireText(claim.provider_order_no),
    transactionId: requireText(claim.transaction_id),
    actualPriceFen: requireAmount(claim.paid_amount_fen),
    paidAt: requireText(claim.paid_at),
  });
}

function queryTransaction(
  claim: BrandingVirtualPaymentReconciliationClaim,
  facts: {
    providerOrderNo: string;
    transactionId: string;
    actualPriceFen: number;
    paidAt: string;
  },
): BrandingVirtualSuccessfulTransaction {
  return {
    eventType: "query_order",
    successful: true,
    environment: claim.environment,
    recipientOriginalId: null,
    senderIdHash: null,
    providerCreatedAtUnix: null,
    messageType: null,
    openid: claim.payer_openid,
    outTradeNo: claim.out_trade_no,
    providerProductId: claim.provider_product_id,
    quantity: 1,
    currency: "CNY",
    origPriceFen: claim.amount_fen,
    actualPriceFen: facts.actualPriceFen,
    providerOrderNo: facts.providerOrderNo,
    transactionId: facts.transactionId,
    paidAt: facts.paidAt,
    attach: claim.id,
  };
}

export function assertQueryBinding(
  claim: BrandingVirtualPaymentReconciliationClaim,
  result: QueryVirtualOrderResult,
): void {
  if (
    result.environment !== claim.environment ||
    result.orderId !== claim.out_trade_no ||
    (result.channelOrderId !== null &&
      result.channelOrderId !== claim.out_trade_no) ||
    result.orderFee !== claim.amount_fen ||
    (result.status >= 2 && result.status <= 4 && (
      result.paidFee !== claim.amount_fen ||
      result.paidAt <= 0 ||
      !result.wechatOrderId ||
      !result.wechatPayOrderId
    ))
  ) {
    throw Errors.business(
      409,
      "微信虚拟支付查询事实与订单不一致",
      "BRANDING_VIRTUAL_RECONCILIATION_QUERY_MISMATCH",
    );
  }
}

export function requirePreparedStatus(
  claim: BrandingVirtualPaymentReconciliationClaim,
): 2 | 3 | 4 {
  const status = claim.reconcile_last_provider_status;
  if (status === 2 || status === 3 || status === 4) return status;
  throwStateInvalid();
}

export function requireAttemptKey(
  claim: BrandingVirtualPaymentReconciliationClaim,
): string {
  return requireText(claim.provider_delivery_attempt_key);
}

export function requireText(value: string | null): string {
  if (value) return value;
  throwStateInvalid();
}

function requireAmount(value: number | null): number {
  if (value !== null && Number.isSafeInteger(value) && value > 0) return value;
  throwStateInvalid();
}

function throwStateInvalid(): never {
  throw Errors.business(
    409,
    "虚拟支付补偿任务状态不完整",
    "BRANDING_VIRTUAL_RECONCILIATION_STATE_INVALID",
  );
}

export function throwGrantPending(failureCode: string | null): never {
  throw Errors.business(
    409,
    "虚拟支付权益等待继续补偿",
    failureCode ?? "BRANDING_VIRTUAL_RECONCILIATION_GRANT_PENDING",
  );
}

export function throwSecretInvalid(): never {
  throw Errors.business(
    409,
    "虚拟支付密钥未配置或版本不匹配",
    "BRANDING_VIRTUAL_PAYMENT_SECRET_INVALID",
  );
}

export function safeErrorCode(error: unknown): string {
  return error instanceof AppError
    ? error.code.trim().slice(0, 100) || "BRANDING_VIRTUAL_RECONCILIATION_FAILED"
    : "BRANDING_VIRTUAL_RECONCILIATION_FAILED";
}

export function requestIdFrom(error: unknown): string | null {
  if (!(error instanceof AppError) || !error.details ||
    typeof error.details !== "object" || !("requestId" in error.details)) {
    return null;
  }
  const value = error.details.requestId;
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 128)
    : null;
}

export function retryAt(now: Date, attemptCount: number): string {
  const minutes = Math.min(
    RETRY_MINUTES * 2 ** Math.max(0, Math.min(attemptCount - 1, 3)),
    MAX_RETRY_MINUTES,
  );
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

export function clampBatchSize(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(Math.max(Math.floor(value), 1), 100);
}
