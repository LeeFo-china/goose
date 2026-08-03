import { Errors } from "@/errors/error-factory";
import {
  billingRechargeRepository,
  type TenantCreditWechatNotificationRecord,
} from "@/repositories/billing-recharge";
import { BillingRechargePaymentConfirmation } from "@/services/billing-recharge-payment-confirmation";
import type { CreditRechargeCallbackContext } from "@/services/wechat-pay-callback-context-matcher";

export type CreditRechargeCallbackRepositoryPort = Pick<
  typeof billingRechargeRepository,
  | "findWechatNotificationByNotifyId"
  | "createWechatNotification"
  | "markWechatNotificationProcessed"
  | "markWechatNotificationFailed"
>;

export type RechargePaymentConfirmationPort = Pick<
  BillingRechargePaymentConfirmation,
  "confirm"
>;

const SUCCESS_RESPONSE = { code: "SUCCESS", message: "成功" } as const;

export async function handleCreditRechargeCallback(input: {
  matched: CreditRechargeCallbackContext;
  notifyId: string;
  payload: Record<string, unknown>;
  repository: CreditRechargeCallbackRepositoryPort;
  confirmation: RechargePaymentConfirmationPort;
}) {
  const { matched, notifyId, payload } = input;
  const existing = await input.repository.findWechatNotificationByNotifyId({
    notifyId,
  });
  if (existing?.processed) {
    return SUCCESS_RESPONSE;
  }

  const notification = existing ??
    await input.repository.createWechatNotification({
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
    await processCreditRechargeTransaction({
      matched,
      notification,
      confirmation: input.confirmation,
    });
    await input.repository.markWechatNotificationProcessed({
      notificationId: notification.id,
    });
    return SUCCESS_RESPONSE;
  } catch (error) {
    await input.repository.markWechatNotificationFailed({
      notificationId: notification.id,
      errorMessage: safeErrorSummary(error),
    });
    throw error;
  }
}

async function processCreditRechargeTransaction(input: {
  matched: CreditRechargeCallbackContext;
  notification: TenantCreditWechatNotificationRecord;
  confirmation: RechargePaymentConfirmationPort;
}) {
  await input.confirmation.confirm({
    order: input.matched.order,
    transaction: input.matched.transaction,
    notificationId: input.notification.id,
    source: "wechat_callback",
  });
}

function requireString(
  record: Record<string, unknown>,
  key: string,
  message: string,
) {
  const value = optionalString(record[key]);
  if (!value) {
    throw Errors.badRequest(message);
  }
  return value;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeErrorSummary(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }
  return "微信支付回调处理失败";
}
