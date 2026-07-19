import { Errors } from "@/errors/error-factory";
import {
  billingRechargeRepository,
  type TenantCreditWechatNotificationRecord,
} from "@/repositories/billing-recharge";
import type { CreditRechargeRefundCallbackContext } from "@/services/wechat-pay-callback-context-matcher";
import {
  assertWechatRefundEventMatches,
  parseAndAssertWechatRefundCallback,
  type WechatRefundCallbackExpectedBinding,
} from "@/services/wechat-pay-refund-contract";

type CreditRechargeRefundRepositoryPort = Pick<
  typeof billingRechargeRepository,
  | "findWechatNotificationByNotifyId"
  | "createWechatNotification"
  | "markWechatNotificationProcessed"
  | "markWechatNotificationFailed"
  | "confirmWechatRechargeRefund"
  | "applyWechatRechargeRefundCallbackState"
>;

const SUCCESS_RESPONSE = { code: "SUCCESS", message: "成功" } as const;

export async function handleCreditRechargeRefundCallback(input: {
  matched: CreditRechargeRefundCallbackContext;
  notifyId: string;
  payload: Record<string, unknown>;
  repository: CreditRechargeRefundRepositoryPort;
}) {
  const { matched, notifyId, payload, repository } = input;
  const existing = await repository.findWechatNotificationByNotifyId({
    notifyId,
  });
  if (existing?.processed) return SUCCESS_RESPONSE;

  const notification = existing ?? await repository.createWechatNotification({
    tenant_id: matched.order.tenant_id,
    credit_order_id: matched.order.id,
    notify_id: notifyId,
    event_type: requireString(payload, "event_type", "回调事件类型缺失"),
    resource_type: optionalString(payload.resource_type),
    raw_payload: payload,
    signature_valid: true,
    processed: false,
  });

  try {
    await processCreditRechargeRefund({ matched, notification, repository });
    await repository.markWechatNotificationProcessed({
      notificationId: notification.id,
    });
    return SUCCESS_RESPONSE;
  } catch (error) {
    await repository.markWechatNotificationFailed({
      notificationId: notification.id,
      errorMessage: getErrorMessage(error),
    });
    throw error;
  }
}

async function processCreditRechargeRefund(input: {
  matched: CreditRechargeRefundCallbackContext;
  notification: TenantCreditWechatNotificationRecord;
  repository: CreditRechargeRefundRepositoryPort;
}) {
  const { matched, notification, repository } = input;
  const eventType = notification.event_type;
  const refund = parseAndAssertWechatRefundCallback(
    matched.resource,
    buildExpectedRefundBinding(matched),
  );
  assertWechatRefundEventMatches(eventType, refund.status);

  if (refund.status === "SUCCESS") {
    await repository.confirmWechatRechargeRefund({
      refundRequestId: matched.refundRequest.id,
      outRefundNo: refund.outRefundNo,
      wechatRefundId: refund.wechatRefundId,
      refundAmountFen: refund.refundAmountFen,
      refundedAt: refund.successTime,
      notificationId: notification.id,
      metadata: {
        callback_notify_id: notification.notify_id,
        out_refund_no: refund.outRefundNo,
        refund_id: refund.wechatRefundId,
      },
    });
    return;
  }

  if (refund.status === "ABNORMAL" || refund.status === "CLOSED") {
    await repository.applyWechatRechargeRefundCallbackState({
      refundRequestId: matched.refundRequest.id,
      outRefundNo: refund.outRefundNo,
      status: refund.status,
      checkedAt: notification.created_at,
      metadata: {
        callback_notify_id: notification.notify_id,
        out_refund_no: refund.outRefundNo,
        refund_id: refund.wechatRefundId,
        refund_status: refund.status,
      },
    });
  }
}

function buildExpectedRefundBinding(
  matched: CreditRechargeRefundCallbackContext,
): WechatRefundCallbackExpectedBinding {
  const base = {
    outRefundNo: requireLocalString(
      matched.refundRequest.out_refund_no,
      "BILLING_RECHARGE_REFUND_OUT_REFUND_NO_REQUIRED",
    ),
    wechatRefundId: optionalString(matched.refundRequest.wechat_refund_id),
    transactionId: requireLocalString(
      matched.order.transaction_id,
      "BILLING_RECHARGE_REFUND_TRANSACTION_ID_REQUIRED",
    ),
    outTradeNo: requireLocalString(
      matched.order.out_trade_no,
      "BILLING_RECHARGE_REFUND_OUT_TRADE_NO_REQUIRED",
    ),
    refundAmountFen: matched.refundRequest.requested_amount_fen,
    totalAmountFen: matched.order.paid_amount_fen || matched.order.amount_fen,
    currency: "CNY" as const,
  };
  const merchantId = requireLocalString(
    matched.config.merchant_id,
    "WECHAT_PAY_CONFIG_INCOMPLETE",
  );
  if (matched.config.merchant_mode === "service_provider_sub_merchant") {
    return {
      ...base,
      merchantMode: "service_provider_sub_merchant",
      merchantId,
      subMerchantId: requireLocalString(
        matched.config.sub_merchant_id,
        "WECHAT_PAY_CONFIG_INCOMPLETE",
      ),
    };
  }
  return { ...base, merchantMode: "direct_merchant", merchantId };
}

function requireLocalString(value: unknown, code: string) {
  const result = optionalString(value);
  if (!result) {
    throw Errors.business(409, "积分充值退款本地绑定信息不完整", code);
  }
  return result;
}

function requireString(
  record: Record<string, unknown>,
  key: string,
  message: string,
) {
  const value = optionalString(record[key]);
  if (!value) throw Errors.badRequest(message);
  return value;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return "微信支付回调处理失败";
}
