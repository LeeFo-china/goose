import {
  platformServiceOrderRepository,
} from "@/repositories/platform-service-orders";
import {
  PlatformServiceOrderPaymentConfirmation,
} from "@/services/platform-service-order-payment-confirmation";
import type { PlatformServiceOrderCallbackContext } from "@/services/wechat-pay-callback-platform-payment";

export type PlatformServiceOrderCallbackRepositoryPort = Pick<
  typeof platformServiceOrderRepository,
  | "findWechatNotificationByNotifyId"
  | "createWechatNotification"
  | "markWechatNotificationProcessed"
  | "markWechatNotificationFailed"
>;

export type PlatformServiceOrderPaymentConfirmationPort = Pick<
  PlatformServiceOrderPaymentConfirmation,
  "confirm"
>;

const SUCCESS_RESPONSE = { code: "SUCCESS", message: "成功" } as const;

export async function handlePlatformServiceOrderCallback(input: {
  matched: PlatformServiceOrderCallbackContext;
  notifyId: string;
  payload: Record<string, unknown>;
  repository: PlatformServiceOrderCallbackRepositoryPort;
  confirmation: PlatformServiceOrderPaymentConfirmationPort;
}) {
  const existing = await input.repository.findWechatNotificationByNotifyId(
    input.notifyId,
  );
  if (isProcessed(existing)) return SUCCESS_RESPONSE;

  const notification = existing ??
    await input.repository.createWechatNotification({
      notifyId: input.notifyId,
      tenantId: input.matched.order.tenant_id ?? null,
      orderId: input.matched.order.id,
      outTradeNo: input.matched.order.out_trade_no ??
        input.matched.order.order_no,
      transactionId: input.matched.transaction.transactionId,
      payload: input.payload,
    });

  try {
    await input.confirmation.confirm({
      order: input.matched.order,
      transaction: input.matched.transaction,
      notificationId: stringField(notification, "id"),
      source: "wechat_callback",
    });
    await input.repository.markWechatNotificationProcessed(
      stringField(notification, "id"),
    );
    return SUCCESS_RESPONSE;
  } catch (error) {
    await input.repository.markWechatNotificationFailed({
      id: stringField(notification, "id"),
      errorMessage: safeErrorSummary(error),
    });
    throw error;
  }
}

function isProcessed(record: Record<string, unknown> | null) {
  return Boolean(record?.processed);
}

function stringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function safeErrorSummary(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message.trim().slice(0, 500);
    }
  }
  return "平台服务支付回调处理失败";
}
