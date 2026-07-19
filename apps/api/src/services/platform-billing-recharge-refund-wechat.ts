import { Errors } from "@/errors/error-factory";
import type {
  WechatPayRefundQueryResult,
  WechatPayRequestRefundResult,
  WechatPayTransactionQueryResult,
} from "@/services/wechat-pay-gateway";
import type { WechatRefundApiPayload } from "@/services/wechat-pay-refund-contract";

export function assertWechatTransactionMatches(input: {
  wechatTransaction: WechatPayTransactionQueryResult;
  transactionId: string;
  totalAmountFen: number;
}) {
  const tradeState = optionalString(input.wechatTransaction.trade_state);
  if (tradeState !== "SUCCESS") {
    throw Errors.business(
      409,
      "微信支付订单不是支付成功状态，不能执行退款",
      "BILLING_RECHARGE_WECHAT_TRANSACTION_NOT_SUCCESS",
      { trade_state: tradeState },
    );
  }

  const wechatTransactionId = optionalString(
    input.wechatTransaction.transaction_id,
  );
  if (wechatTransactionId !== input.transactionId) {
    throw Errors.business(
      409,
      "微信支付交易号与本地充值订单不一致",
      "BILLING_RECHARGE_WECHAT_TRANSACTION_MISMATCH",
      {
        local_transaction_id: input.transactionId,
        wechat_transaction_id: wechatTransactionId,
      },
    );
  }

  const wechatTotalAmountFen = numberField(
    input.wechatTransaction.amount,
    "total",
  );
  if (wechatTotalAmountFen !== input.totalAmountFen) {
    throw Errors.business(
      409,
      "微信支付金额与本地充值订单不一致",
      "BILLING_RECHARGE_WECHAT_AMOUNT_MISMATCH",
      {
        local_total_amount_fen: input.totalAmountFen,
        wechat_total_amount_fen: wechatTotalAmountFen,
      },
    );
  }
}

export function toWechatRequestedRefundPayload(
  refund: WechatPayRequestRefundResult,
): WechatRefundApiPayload {
  return selectWechatRefundPayload(refund.raw, refund.requestId);
}

export function toWechatQueriedRefundPayload(
  refund: WechatPayRefundQueryResult,
): WechatRefundApiPayload {
  return selectWechatRefundPayload(refund, refund.requestId);
}

function selectWechatRefundPayload(
  refund: Record<string, unknown>,
  requestId: string | null,
): WechatRefundApiPayload {
  return {
    out_refund_no: refund.out_refund_no,
    refund_id: refund.refund_id,
    transaction_id: refund.transaction_id,
    out_trade_no: refund.out_trade_no,
    status: refund.status,
    success_time: refund.success_time,
    amount: refund.amount,
    requestId,
  };
}

export function getWechatErrorDetailCode(error: unknown) {
  if (!error || typeof error !== "object" || !("details" in error)) return null;
  const details = (error as { details?: unknown }).details;
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return null;
  }
  return optionalString((details as Record<string, unknown>).code);
}

export function uncertainRefundStatusError(input: {
  outRefundNo: string;
  requestError: unknown;
  queryError: unknown;
}) {
  return Errors.business(
    502,
    "微信退款结果暂无法确认，请稍后按原退款单号查询",
    "BILLING_RECHARGE_REFUND_STATUS_UNKNOWN",
    {
      out_refund_no: input.outRefundNo,
      request_error_code: getErrorCode(input.requestError),
      query_error_code: getErrorCode(input.queryError),
      wechat_query_error_code: getWechatErrorDetailCode(input.queryError),
    },
  );
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberField(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "number" && Number.isFinite(field) ? field : null;
}

function getErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.trim()) return code.trim();
  }
  return null;
}
