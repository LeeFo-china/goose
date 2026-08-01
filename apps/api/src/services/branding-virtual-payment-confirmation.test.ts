import { describe, expect, mock, test } from "bun:test";

import type { BrandingVirtualOrderRecord } from "@/repositories/branding-virtual-orders";
import type { BrandingVirtualPurchaseConfirmationResult } from "@/repositories/branding-virtual-orders";
import type {
  BrandingVirtualPaymentConfirmationOrder,
  BrandingVirtualSuccessfulTransaction,
} from "./branding-virtual-payment-confirmation";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const order = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  tenant_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  order_no: "BVO-1",
  out_trade_no: "BV202608010001",
  idempotency_key: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  product_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  product_code: "custom_support_branding_annual",
  entitlement_code: "custom_support_branding",
  product_name: "年度品牌权益",
  amount_fen: 100,
  term_years: 1,
  purchase_notes: "支付后开通",
  refund_policy: "按规则退款",
  environment: "production",
  offer_id: "offer-1",
  provider_product_id: "branding-annual",
  requested_platform: "android",
  settlement_channel: null,
  payer_openid: "payer-openid",
  provider_order_no: null,
  transaction_id: null,
  payment_status: "pending",
  fulfillment_status: "pending",
  refund_status: "none",
  paid_amount_fen: null,
  paid_at: null,
  entitlement_event_id: null,
  config_version: 1,
  secret_revision: 1,
  payment_expires_at: "2026-08-01T01:05:00.000Z",
  failure_code: null,
  failure_message: null,
  payment_request_claim_token: null,
  payment_request_claimed_at: null,
  payment_request_claim_expires_at: null,
  payment_request_issued_at: "2026-08-01T01:00:00.000Z",
  payment_request_attempt_revision: 1,
  created_by: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  created_at: "2026-08-01T01:00:00.000Z",
  updated_at: "2026-08-01T01:00:00.000Z",
} satisfies BrandingVirtualOrderRecord;

const transaction = {
  eventType: "xpay_goods_deliver_notify" as const,
  successful: true as const,
  environment: "production" as const,
  recipientOriginalId: "gh_original",
  senderIdHash: "a".repeat(64),
  providerCreatedAtUnix: 1_714_037_059,
  messageType: "event" as const,
  openid: "payer-openid",
  outTradeNo: order.out_trade_no,
  providerProductId: order.provider_product_id,
  quantity: 1 as const,
  currency: null,
  origPriceFen: 100,
  actualPriceFen: 100,
  providerOrderNo: "provider-order-1",
  transactionId: "transaction-1",
  paidAt: "2026-08-01T01:01:00.000Z",
  attach: order.id,
};

describe("BrandingVirtualPaymentConfirmation", () => {
  test("accepts the minimal claimed-order facts used by reconciliation", async () => {
    const { BrandingVirtualPaymentConfirmation } = await import(
      "./branding-virtual-payment-confirmation"
    );
    const minimalOrder = {
      id: order.id,
      out_trade_no: order.out_trade_no,
      environment: order.environment,
      provider_product_id: order.provider_product_id,
      payer_openid: order.payer_openid,
      amount_fen: order.amount_fen,
      provider_order_no: null,
      transaction_id: null,
    } satisfies BrandingVirtualPaymentConfirmationOrder;
    const confirmPurchase = mock(async () => ({
      idempotent: false,
      payment_recorded: true,
      fulfilled: true,
      recoverable: false,
      entitlement_event_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      entitlement_status: "active" as const,
      failure_code: null,
    }));
    const confirmation = new BrandingVirtualPaymentConfirmation({ confirmPurchase });

    await confirmation.confirm({
      source: "reconciliation",
      order: minimalOrder,
      transaction: {
        ...transaction,
        eventType: "query_order",
        recipientOriginalId: null,
        senderIdHash: null,
        providerCreatedAtUnix: null,
        messageType: null,
      },
      notificationId: null,
      allowLateClosedRecovery: true,
    });

    expect(confirmPurchase).toHaveBeenCalledTimes(1);
  });

  test("passes every server-owned payment binding to the shared RPC", async () => {
    const { BrandingVirtualPaymentConfirmation } = await import(
      "./branding-virtual-payment-confirmation"
    );
    const confirmPurchase = mock(async (): Promise<BrandingVirtualPurchaseConfirmationResult> => ({
      idempotent: false,
      payment_recorded: true,
      fulfilled: true,
      recoverable: false,
      entitlement_event_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      entitlement_status: "active",
      failure_code: null,
    }));
    const confirmation = new BrandingVirtualPaymentConfirmation({ confirmPurchase });

    await confirmation.confirm({
      source: "notification",
      order,
      transaction,
      notificationId: "99999999-9999-4999-8999-999999999999",
    });

    expect(confirmPurchase).toHaveBeenCalledWith({
      orderId: order.id,
      notificationId: "99999999-9999-4999-8999-999999999999",
      source: "notification",
      allowLateClosedRecovery: false,
      ...transaction,
    });
  });

  test("rejects an OpenID mismatch before the RPC without exposing the value", async () => {
    const { BrandingVirtualPaymentConfirmation } = await import(
      "./branding-virtual-payment-confirmation"
    );
    const confirmPurchase = mock(async () => ({
      idempotent: false,
      payment_recorded: false,
      fulfilled: false,
      recoverable: false,
      entitlement_event_id: null,
      entitlement_status: null,
      failure_code: null,
    }));
    const confirmation = new BrandingVirtualPaymentConfirmation({ confirmPurchase });

    await expect(confirmation.confirm({
      source: "notification",
      order,
      transaction: { ...transaction, openid: "other-openid" },
      notificationId: "99999999-9999-4999-8999-999999999999",
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_VIRTUAL_PAYMENT_OPENID_MISMATCH",
      details: { field: "openid" },
    });
    expect(confirmPurchase).not.toHaveBeenCalled();
  });

  test("notification and query both delegate to the idempotent confirmation RPC", async () => {
    const { BrandingVirtualPaymentConfirmation } = await import(
      "./branding-virtual-payment-confirmation"
    );
    const originalFact = {
      idempotent: true,
      payment_recorded: true,
      fulfilled: true,
      recoverable: false,
      entitlement_event_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      entitlement_status: "active",
      failure_code: null,
    } as const;
    const confirmPurchase = mock(async () => originalFact);
    const confirmation = new BrandingVirtualPaymentConfirmation({ confirmPurchase });

    const queryTransaction = {
      ...transaction,
      eventType: "query_order" as const,
      recipientOriginalId: null,
      senderIdHash: null,
      providerCreatedAtUnix: null,
      messageType: null,
    };
    const results = await Promise.all([
      confirmation.confirm({
        source: "notification",
        order,
        transaction,
        notificationId: "99999999-9999-4999-8999-999999999999",
      }),
      confirmation.confirm({
        source: "query",
        order,
        transaction: queryTransaction,
        notificationId: null,
      }),
    ]);

    expect(results).toEqual([originalFact, originalFact]);
    expect(confirmPurchase).toHaveBeenCalledTimes(2);
  });

  test.each([
    {
      source: "notification" as const,
      notificationId: null,
      transaction,
    },
    {
      source: "query" as const,
      notificationId: null,
      transaction,
    },
    {
      source: "notification" as const,
      notificationId: "99999999-9999-4999-8999-999999999999",
      transaction: { ...transaction, messageType: null },
    },
  ])("rejects an invalid source/event/metadata tuple before the RPC", async (input) => {
    const { BrandingVirtualPaymentConfirmation } = await import(
      "./branding-virtual-payment-confirmation"
    );
    const confirmPurchase = mock(async () => ({
      idempotent: false,
      payment_recorded: false,
      fulfilled: false,
      recoverable: false,
      entitlement_event_id: null,
      entitlement_status: null,
      failure_code: null,
    }));
    const confirmation = new BrandingVirtualPaymentConfirmation({ confirmPurchase });

    await expect(confirmation.confirm({
      order,
      ...input,
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_VIRTUAL_PAYMENT_SOURCE_EVENT_MISMATCH",
    });
    expect(confirmPurchase).not.toHaveBeenCalled();
  });

  test.each([
    ["outTradeNo", "other-order", "BRANDING_VIRTUAL_PAYMENT_OUT_TRADE_NO_MISMATCH"],
    ["environment", "sandbox", "BRANDING_VIRTUAL_PAYMENT_ENVIRONMENT_MISMATCH"],
    ["providerProductId", "other-product", "BRANDING_VIRTUAL_PAYMENT_PRODUCT_MISMATCH"],
    ["quantity", 2, "BRANDING_VIRTUAL_PAYMENT_QUANTITY_MISMATCH"],
    ["currency", "USD", "BRANDING_VIRTUAL_PAYMENT_CURRENCY_MISMATCH"],
    ["origPriceFen", 101, "BRANDING_VIRTUAL_PAYMENT_AMOUNT_MISMATCH"],
    ["actualPriceFen", 101, "BRANDING_VIRTUAL_PAYMENT_AMOUNT_MISMATCH"],
    ["attach", "other-order-id", "BRANDING_VIRTUAL_PAYMENT_ATTACH_MISMATCH"],
  ] as const)("rejects a %s mismatch before the RPC", async (
    field,
    value,
    code,
  ) => {
    const { BrandingVirtualPaymentConfirmation } = await import(
      "./branding-virtual-payment-confirmation"
    );
    const confirmPurchase = mock(async () => ({
      idempotent: false,
      payment_recorded: false,
      fulfilled: false,
      recoverable: false,
      entitlement_event_id: null,
      entitlement_status: null,
      failure_code: null,
    }));
    const confirmation = new BrandingVirtualPaymentConfirmation({ confirmPurchase });
    const invalid = {
      ...transaction,
      [field]: value,
    } as unknown as BrandingVirtualSuccessfulTransaction;

    await expect(confirmation.confirm({
      source: "notification",
      order,
      transaction: invalid,
      notificationId: "99999999-9999-4999-8999-999999999999",
    })).rejects.toMatchObject({ statusCode: 409, code });
    expect(confirmPurchase).not.toHaveBeenCalled();
  });
});
