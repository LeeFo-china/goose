import { Errors } from "@/errors/error-factory";
import {
  customerWechatPaySmokeRepository,
  type CustomerWechatPaySmokeNotificationRecord,
} from "@/repositories/customer-wechat-pay-smoke";
import type { CustomerWechatPaySmokeCallbackContext } from "@/services/wechat-pay-callback-context-matcher";
import {
  buildWechatPayTransactionExpectedBinding,
  convertWechatPayTransactionCallbackResource,
  parseAndAssertWechatPayTransactionCallback,
} from "@/services/wechat-pay-transaction-contract";

export type CustomerWechatPaySmokeCallbackRepositoryPort = Pick<
  typeof customerWechatPaySmokeRepository,
  | "findNotificationByNotifyId"
  | "createNotification"
  | "markNotificationProcessed"
  | "markNotificationFailed"
  | "markOrderPaid"
>;

const SUCCESS_RESPONSE = { code: "SUCCESS", message: "成功" } as const;

export async function handleCustomerWechatPaySmokeCallback(input: {
  matched: CustomerWechatPaySmokeCallbackContext;
  notifyId: string;
  payload: Record<string, unknown>;
  repository: CustomerWechatPaySmokeCallbackRepositoryPort;
}) {
  const { matched, notifyId, payload, repository } = input;
  const existing = await repository.findNotificationByNotifyId({ notifyId });
  if (existing?.processed) return SUCCESS_RESPONSE;

  const notification = existing ?? await repository.createNotification({
    tenant_id: matched.order.tenant_id,
    smoke_order_id: matched.order.id,
    notify_id: notifyId,
    event_type: requireString(payload, "event_type", "回调事件类型缺失"),
    resource_type: optionalString(payload.resource_type),
    raw_payload: payload,
    signature_valid: true,
    processed: false,
  });

  try {
    await processCustomerWechatPaySmokeTransaction({
      matched,
      notification,
      repository,
    });
    await repository.markNotificationProcessed({
      notificationId: notification.id,
    });
    return SUCCESS_RESPONSE;
  } catch (error) {
    await repository.markNotificationFailed({
      notificationId: notification.id,
      errorMessage: getErrorMessage(error),
    });
    throw error;
  }
}

async function processCustomerWechatPaySmokeTransaction(input: {
  matched: CustomerWechatPaySmokeCallbackContext;
  notification: CustomerWechatPaySmokeNotificationRecord;
  repository: CustomerWechatPaySmokeCallbackRepositoryPort;
}) {
  const { matched, notification, repository } = input;
  const resource = convertWechatPayTransactionCallbackResource(
    matched.resource,
  );
  const transaction = parseAndAssertWechatPayTransactionCallback(
    notification.event_type,
    resource,
    buildWechatPayTransactionExpectedBinding({
      merchantMode: matched.config.merchant_mode ===
          "service_provider_sub_merchant"
        ? "service_provider_sub_merchant"
        : "direct_merchant",
      merchantId: matched.config.merchant_id,
      subMerchantId: matched.config.sub_merchant_id,
      outTradeNo: matched.order.out_trade_no,
      amountFen: matched.order.amount_fen,
      transactionId: matched.order.transaction_id,
    }),
  );
  if (
    matched.order.status === "paid" &&
    matched.order.transaction_id === transaction.transactionId
  ) {
    return;
  }

  await repository.markOrderPaid({
    tenantId: matched.order.tenant_id,
    customerId: matched.order.customer_id,
    orderId: matched.order.id,
    transactionId: transaction.transactionId,
    paidAmountFen: transaction.amountFen,
    paidAt: transaction.successTime,
    notificationId: notification.id,
    tradeStateDesc: optionalString(matched.resource.trade_state_desc),
    metadata: {
      ...asRecord(matched.order.metadata),
      source: "wechat_callback",
      confirmation_source: "wechat_callback",
      notification_id: notification.id,
      out_trade_no: matched.order.out_trade_no,
    },
  });
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return "微信支付回调处理失败";
}
