import { describe, expect, test } from "bun:test";
import type { TenantCreditOrderRecord } from "@/repositories/billing-recharge";
import { toBillingRechargeOrderView } from "@/services/billing-recharge-views";

const paidOrder = {
  id: "order-1",
  tenant_id: "tenant-1",
  order_no: "TC202607020001",
  idempotency_key: "idem-1",
  package_code: "credit_1000",
  credits: 1000,
  amount_fen: 10000,
  bonus_credits: 100,
  channel: "wechat_pay",
  status: "paid",
  paid_at: "2026-07-02T08:03:00.000Z",
  created_by: "employee-1",
  remark: null,
  metadata: {
    product_snapshot: {
      code: "credit_1000",
      title: "1000 积分",
    },
  },
  payment_config_id: "platform-config-1",
  out_trade_no: "TC202607020001",
  prepay_id: null,
  transaction_id: "4200000001",
  paid_amount_fen: 10000,
  closed_at: null,
  latest_notification_id: null,
  created_at: "2026-07-02T08:01:00.000Z",
  updated_at: "2026-07-02T08:03:00.000Z",
} satisfies TenantCreditOrderRecord;

describe("billing recharge views", () => {
  test("reads product title from product snapshot metadata", () => {
    const view = toBillingRechargeOrderView(paidOrder);

    expect(view.product_title).toBe("1000 积分");
  });

  test.each([
    [
      "pending order",
      { status: "pending" },
      { enabled: false, label: "不可退款", disabled_reason: "ORDER_NOT_PAID" },
    ],
    [
      "closed order",
      { status: "closed" },
      { enabled: false, label: "不可退款", disabled_reason: "ORDER_CLOSED" },
    ],
    [
      "refunded order",
      { status: "refunded" },
      {
        enabled: false,
        label: "已退款",
        disabled_reason: "ORDER_ALREADY_REFUNDED",
      },
    ],
    [
      "pending review refund",
      { refund_status: "pending_review" },
      {
        enabled: false,
        label: "退款审核中",
        disabled_reason: "REFUND_REQUEST_PENDING",
      },
    ],
    [
      "approved refund",
      { refund_status: "approved" },
      {
        enabled: false,
        label: "退款审核中",
        disabled_reason: "REFUND_REQUEST_PENDING",
      },
    ],
    [
      "refunding refund",
      { refund_status: "refunding" },
      {
        enabled: false,
        label: "退款审核中",
        disabled_reason: "REFUND_REQUEST_PENDING",
      },
    ],
    [
      "rejected refund",
      { refund_status: "rejected" },
      { enabled: true, label: "申请退款", disabled_reason: null },
    ],
    [
      "failed refund",
      { refund_status: "failed" },
      { enabled: true, label: "申请退款", disabled_reason: null },
    ],
    [
      "paid order without refund",
      {},
      { enabled: true, label: "申请退款", disabled_reason: null },
    ],
  ])("builds refund action for %s", (_, override, expected) => {
    const view = toBillingRechargeOrderView({
      ...paidOrder,
      ...override,
    } as TenantCreditOrderRecord);

    expect(view.refund_action).toEqual({
      ...expected,
      requires_reason: true,
    });
  });
});
