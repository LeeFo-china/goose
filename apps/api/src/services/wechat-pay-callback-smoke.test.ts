import { beforeEach, describe, expect, mock, test } from "bun:test";

import type {
  CustomerWechatPaySmokeNotificationRecord,
  CustomerWechatPaySmokeOrderRecord,
} from "@/repositories/customer-wechat-pay-smoke";
import { handleCustomerWechatPaySmokeCallback } from "./wechat-pay-callback-smoke";
import {
  activeConfig,
  paymentConfigId,
  tenantId,
} from "./wechat-pay-orders.test-helpers";

const customerId = "99999999-9999-4999-8999-999999999999";
const orderId = "88888888-8888-4888-8888-888888888888";
const notificationId = "77777777-7777-4777-8777-777777777777";
const outTradeNo = "CS20260725133000ABCD1234";
const transactionId = "4200000000000000000000000000";
const paidAt = "2026-07-25T13:31:00+08:00";
const createdAt = "2026-07-25T13:30:00.000Z";

const smokeOrder: CustomerWechatPaySmokeOrderRecord = {
  id: orderId,
  tenant_id: tenantId,
  customer_id: customerId,
  payment_config_id: paymentConfigId,
  out_trade_no: outTradeNo,
  idempotency_key: null,
  amount_fen: 100,
  paid_amount_fen: 0,
  currency: "CNY",
  status: "pending",
  payer_openid: "o-customer-openid",
  prepay_id: "prepay-test",
  transaction_id: null,
  trade_state: null,
  trade_state_desc: null,
  paid_at: null,
  closed_at: null,
  failed_at: null,
  failure_reason: null,
  latest_notification_id: null,
  metadata: {},
  created_at: createdAt,
  updated_at: createdAt,
};

const notification: CustomerWechatPaySmokeNotificationRecord = {
  id: notificationId,
  tenant_id: tenantId,
  smoke_order_id: orderId,
  notify_id: "notify-smoke-1",
  event_type: "TRANSACTION.SUCCESS",
  resource_type: "encrypt-resource",
  raw_payload: {},
  signature_valid: true,
  processed: false,
  processed_at: null,
  error_message: null,
  created_at: createdAt,
  updated_at: createdAt,
};

const payload = {
  id: notification.notify_id,
  event_type: "TRANSACTION.SUCCESS",
  resource_type: "encrypt-resource",
};
const resource = {
  mchid: activeConfig.merchant_id,
  out_trade_no: outTradeNo,
  transaction_id: transactionId,
  trade_state: "SUCCESS",
  trade_state_desc: "支付成功",
  success_time: paidAt,
  amount: {
    total: 100,
    currency: "CNY",
  },
};

const findNotificationByNotifyId = mock(
  async (): Promise<CustomerWechatPaySmokeNotificationRecord | null> => null,
);
const createNotification = mock(async () => notification);
const markNotificationProcessed = mock(async () => ({
  ...notification,
  processed: true,
}));
const markNotificationFailed = mock(async () => ({
  ...notification,
  error_message: "failed",
}));
const markOrderPaid = mock(async () => ({
  ...smokeOrder,
  status: "paid" as const,
  transaction_id: transactionId,
  paid_amount_fen: 100,
  paid_at: paidAt,
  latest_notification_id: notificationId,
}));

describe("handleCustomerWechatPaySmokeCallback", () => {
  beforeEach(() => {
    findNotificationByNotifyId.mockClear();
    createNotification.mockClear();
    markNotificationProcessed.mockClear();
    markNotificationFailed.mockClear();
    markOrderPaid.mockClear();
  });

  test("marks the customer smoke order paid without finance workflow side effects", async () => {
    const result = await handleCustomerWechatPaySmokeCallback({
      matched: {
        kind: "customer_wechat_pay_smoke",
        config: activeConfig,
        payload,
        resource,
        order: smokeOrder,
      },
      notifyId: notification.notify_id,
      payload,
      repository: {
        findNotificationByNotifyId,
        createNotification,
        markNotificationProcessed,
        markNotificationFailed,
        markOrderPaid,
      },
    });

    expect(result).toEqual({ code: "SUCCESS", message: "成功" });
    expect(markOrderPaid).toHaveBeenCalledWith({
      tenantId,
      customerId,
      orderId,
      transactionId,
      paidAmountFen: 100,
      paidAt,
      notificationId,
      tradeStateDesc: "支付成功",
      metadata: expect.objectContaining({
        source: "wechat_callback",
        out_trade_no: outTradeNo,
      }),
    });
    expect(markNotificationProcessed).toHaveBeenCalledWith({
      notificationId,
    });
    expect(markNotificationFailed).not.toHaveBeenCalled();
  });
});
