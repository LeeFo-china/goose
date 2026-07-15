import { Errors } from "@/errors/error-factory";
import {
  billingRechargeRepository,
  type TenantCreditWechatNotificationRecord,
} from "@/repositories/billing-recharge";
import type { CreditRechargeRefundCallbackContext } from "@/services/wechat-pay-callback-context-matcher";

type CreditRechargeRefundRepositoryPort = Pick<
  typeof billingRechargeRepository,
  | "findWechatNotificationByNotifyId"
  | "createWechatNotification"
  | "markWechatNotificationProcessed"
  | "markWechatNotificationFailed"
  | "confirmWechatRechargeRefund"
  | "markWechatRechargeRefundFailed"
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
  const refundStatus = optionalString(matched.resource.refund_status);
  const outRefundNo = requireString(
    matched.resource,
    "out_refund_no",
    "微信支付退款回调缺少商户退款单号",
  );
  const refundId = optionalString(matched.resource.refund_id);

  if (eventType === "REFUND.SUCCESS" || refundStatus === "SUCCESS") {
    await repository.confirmWechatRechargeRefund({
      refundRequestId: matched.refundRequest.id,
      outRefundNo,
      wechatRefundId: refundId,
      refundAmountFen: getResourceRefundAmount(matched.resource),
      refundedAt: optionalString(matched.resource.success_time) ??
        new Date().toISOString(),
      notificationId: notification.id,
      metadata: {
        callback_notify_id: notification.notify_id,
        out_refund_no: outRefundNo,
        refund_id: refundId,
      },
    });
    return;
  }

  if (
    eventType === "REFUND.ABNORMAL" ||
    eventType === "REFUND.CLOSED" ||
    refundStatus === "ABNORMAL" ||
    refundStatus === "CLOSED"
  ) {
    await repository.markWechatRechargeRefundFailed({
      refundRequestId: matched.refundRequest.id,
      tenantId: matched.order.tenant_id,
      orderId: matched.order.id,
      failureMessage: eventType || refundStatus || "REFUND_FAILED",
      metadata: {
        callback_notify_id: notification.notify_id,
        out_refund_no: outRefundNo,
        refund_id: refundId,
        refund_status: refundStatus,
      },
    });
  }
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

function getResourceRefundAmount(resource: Record<string, unknown>) {
  const amount = resource.amount;
  if (!amount || typeof amount !== "object" || Array.isArray(amount)) {
    throw Errors.badRequest("微信支付退款回调金额缺失");
  }
  const refund = Number((amount as Record<string, unknown>).refund ?? 0);
  if (!Number.isFinite(refund) || refund <= 0) {
    throw Errors.badRequest("微信支付退款回调金额不正确");
  }
  return refund;
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return "微信支付回调处理失败";
}
