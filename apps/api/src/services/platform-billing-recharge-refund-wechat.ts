import { Errors } from "@/errors/error-factory";
import type {
  WechatPayRefundQueryResult,
  WechatPayRequestRefundResult,
} from "@/services/wechat-pay-gateway";
import type { WechatRefundApiPayload } from "@/services/wechat-pay-refund-contract";

export function toWechatRequestedRefundPayload(
  refund: WechatPayRequestRefundResult,
): WechatRefundApiPayload {
  return selectWechatRefundPayload(refund, refund.requestId);
}

export function toWechatQueriedRefundPayload(
  refund: WechatPayRefundQueryResult,
): WechatRefundApiPayload {
  return selectWechatRefundPayload(refund, refund.requestId);
}

function selectWechatRefundPayload(
  refund: WechatPayRequestRefundResult | WechatPayRefundQueryResult,
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

function getErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.trim()) return code.trim();
  }
  return null;
}
