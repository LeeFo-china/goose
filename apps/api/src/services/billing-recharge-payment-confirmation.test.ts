import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { TenantCreditOrderRecord } from "@/repositories/billing-recharge";
import { BillingRechargePaymentConfirmation } from "./billing-recharge-payment-confirmation";

const order = {
  id: "credit-order-1",
  tenant_id: "tenant-1",
  order_no: "TC202607180001",
  idempotency_key: "idem-1",
  package_code: "credit_1000",
  credits: 1000,
  amount_fen: 10000,
  bonus_credits: 100,
  channel: "wechat_pay",
  status: "pending",
  paid_at: null,
  created_by: "employee-1",
  remark: null,
  metadata: {},
  payment_config_id: "platform-config-1",
  out_trade_no: "TC202607180001",
  prepay_id: "prepay-credit-1",
  transaction_id: null,
  paid_amount_fen: 0,
  closed_at: null,
  latest_notification_id: null,
  created_at: "2026-07-18T02:00:00.000Z",
  updated_at: "2026-07-18T02:00:00.000Z",
} satisfies TenantCreditOrderRecord;

const transaction = {
  trade_state: "SUCCESS",
  transaction_id: "4200000001202607180001",
  success_time: "2026-07-18T02:04:30+00:00",
  amount: { total: order.amount_fen, currency: "CNY" },
};

const confirmWechatRecharge = mock(async () => ({
  order: {},
  account: {},
  ledger: {},
  recovery: { recovered: true },
  idempotent: false,
}));

function createService() {
  return new BillingRechargePaymentConfirmation({
    repository: { confirmWechatRecharge },
  });
}

describe("BillingRechargePaymentConfirmation", () => {
  beforeEach(() => {
    confirmWechatRecharge.mockClear();
    confirmWechatRecharge.mockImplementation(async () => ({
      order: {},
      account: {},
      ledger: {},
      recovery: { recovered: true },
      idempotent: false,
    }));
  });

  test("confirms a successful queried recharge transaction", async () => {
    const service = createService();

    await service.confirm({
      order,
      transaction,
      notificationId: null,
      source: "expiration_reconcile",
    });

    expect(confirmWechatRecharge).toHaveBeenCalledWith({
      orderId: order.id,
      transactionId: "4200000001202607180001",
      paidAmountFen: order.amount_fen,
      paidAt: "2026-07-18T02:04:30+00:00",
      notificationId: null,
      metadata: {
        confirmation_source: "expiration_reconcile",
        out_trade_no: order.out_trade_no,
      },
    });
    expect(confirmWechatRecharge).toHaveBeenCalledTimes(1);
  });

  test("rejects a recharge transaction whose amount differs from the order", async () => {
    const service = createService();

    await expect(service.confirm({
      order,
      transaction: {
        ...transaction,
        amount: { total: order.amount_fen + 1 },
      },
      notificationId: null,
      source: "expiration_reconcile",
    })).rejects.toMatchObject({ code: "BILLING_RECHARGE_AMOUNT_MISMATCH" });

    expect(confirmWechatRecharge).not.toHaveBeenCalled();
  });

  test("rejects a successful transaction without a transaction id", async () => {
    const service = createService();

    await expect(service.confirm({
      order,
      transaction: { ...transaction, transaction_id: "" },
      notificationId: null,
      source: "expiration_reconcile",
    })).rejects.toMatchObject({
      code: "BILLING_RECHARGE_TRANSACTION_ID_REQUIRED",
    });

    expect(confirmWechatRecharge).not.toHaveBeenCalled();
  });

  test("uses one atomic repository operation for an idempotent confirmation", async () => {
    confirmWechatRecharge.mockImplementationOnce(async () => ({
      order: {},
      account: {},
      ledger: {},
      recovery: { recovered: false, reason: "no_past_due_invoice" },
      idempotent: true,
    }));
    const service = createService();

    await service.confirm({
      order,
      transaction,
      notificationId: null,
      source: "expiration_reconcile",
    });

    expect(confirmWechatRecharge).toHaveBeenCalledTimes(1);
  });

  test("rejects a transaction that is not successful", async () => {
    const service = createService();

    await expect(service.confirm({
      order,
      transaction: { ...transaction, trade_state: "NOTPAY" },
      notificationId: null,
      source: "expiration_reconcile",
    })).rejects.toMatchObject({
      code: "BILLING_RECHARGE_TRANSACTION_NOT_SUCCESS",
    });

    expect(confirmWechatRecharge).not.toHaveBeenCalled();
  });

  test("propagates an atomic repository failure", async () => {
    confirmWechatRecharge.mockImplementationOnce(async () => {
      throw new Error("confirm failed");
    });
    const service = createService();

    await expect(service.confirm({
      order,
      transaction,
      notificationId: null,
      source: "expiration_reconcile",
    })).rejects.toThrow("confirm failed");

    expect(confirmWechatRecharge).toHaveBeenCalledTimes(1);
  });
});
