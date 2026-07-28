import { Errors } from "@/errors/error-factory";
import {
  brandingAddonOrderRepository,
  type BrandingAddonWechatNotificationRecord,
} from "@/repositories/branding-addon-orders";
import {
  BrandingAddonPaymentConfirmation,
} from "@/services/branding-addon-payment-confirmation";
import type { BrandingAddonCallbackContext } from "@/services/wechat-pay-callback-platform-payment";

export type BrandingAddonCallbackRepositoryPort = Pick<
  typeof brandingAddonOrderRepository,
  | "findNotificationByNotifyId"
  | "createNotification"
  | "markNotificationProcessed"
  | "markNotificationFailed"
>;

export type BrandingAddonPaymentConfirmationPort = Pick<
  BrandingAddonPaymentConfirmation,
  "confirm"
>;

const SUCCESS_RESPONSE = { code: "SUCCESS", message: "成功" } as const;

export async function handleBrandingAddonCallback(input: {
  matched: BrandingAddonCallbackContext;
  notifyId: string;
  payload: Record<string, unknown>;
  repository: BrandingAddonCallbackRepositoryPort;
  confirmation: BrandingAddonPaymentConfirmationPort;
}) {
  const eventType = requireString(
    input.payload.event_type,
    "微信支付回调事件类型缺失",
  );
  const resourceType = requireString(
    input.payload.resource_type,
    "微信支付回调资源类型缺失",
  );
  const existing = await input.repository.findNotificationByNotifyId(
    input.notifyId,
  );
  if (existing) {
    assertNotificationIdentity(
      existing,
      input.matched,
      eventType,
      resourceType,
    );
    if (existing.processed) return SUCCESS_RESPONSE;
  }

  const notification = existing ??
    await input.repository.createNotification({
      tenant_id: input.matched.order.tenant_id,
      order_id: input.matched.order.id,
      notify_id: input.notifyId,
      event_type: eventType,
      resource_type: resourceType,
      raw_payload: input.payload,
      signature_valid: true,
      processed: false,
    });

  try {
    await input.confirmation.confirm({
      order: input.matched.order,
      transaction: input.matched.transaction,
      notificationId: notification.id,
      source: "wechat_callback",
    });
    await input.repository.markNotificationProcessed({
      notificationId: notification.id,
    });
    return SUCCESS_RESPONSE;
  } catch (error) {
    await input.repository.markNotificationFailed({
      notificationId: notification.id,
      errorMessage: safeErrorSummary(error),
    });
    throw error;
  }
}

function assertNotificationIdentity(
  notification: BrandingAddonWechatNotificationRecord,
  matched: BrandingAddonCallbackContext,
  eventType: string,
  resourceType: string,
) {
  if (
    notification.tenant_id !== matched.order.tenant_id ||
    notification.order_id !== matched.order.id ||
    notification.event_type !== eventType ||
    notification.resource_type !== resourceType
  ) {
    throw Errors.business(
      409,
      "微信支付通知 ID 与既有订单不一致",
      "BRANDING_ADDON_NOTIFICATION_ID_COLLISION",
    );
  }
}

function safeErrorSummary(error: unknown) {
  if (isAppErrorLike(error)) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message.trim().slice(0, 500);
    }
  }
  return "品牌权益支付回调处理失败";
}

function requireString(value: unknown, message: string) {
  const normalized = optionalString(value);
  if (!normalized) throw Errors.badRequest(message);
  return normalized;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isAppErrorLike(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "statusCode" in error &&
      "code" in error,
  );
}
