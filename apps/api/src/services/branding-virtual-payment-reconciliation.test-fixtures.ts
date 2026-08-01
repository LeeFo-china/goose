import { mock } from "bun:test";

import type {
  BrandingVirtualPaymentReconciliationClaim,
} from "@/repositories/branding-virtual-payment-reconciliation";
import type {
  QueryVirtualOrderInput,
  QueryVirtualOrderResult,
} from "@/services/wechat-virtual-payment-gateway-contracts";

export const ORDER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const CLAIM_TOKEN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const RECONCILIATION_NOW = new Date("2026-08-01T02:00:00.000Z");

export function createReconciliationClaim(
  patch: Partial<BrandingVirtualPaymentReconciliationClaim> = {},
): BrandingVirtualPaymentReconciliationClaim {
  return {
    id: ORDER_ID,
    tenant_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    out_trade_no: "BV202608010001",
    environment: "production",
    offer_id: "offer-1",
    secret_revision: 1,
    provider_product_id: "branding-annual",
    payer_openid: "payer-openid",
    amount_fen: 100,
    provider_order_no: null,
    transaction_id: null,
    payment_status: "pending",
    fulfillment_status: "pending",
    paid_amount_fen: null,
    paid_at: null,
    payment_expires_at: "2026-08-01T01:05:00.000Z",
    payment_request_issued_at: "2026-08-01T01:00:00.000Z",
    entitlement_event_id: null,
    reconcile_claim_token: CLAIM_TOKEN,
    reconcile_claim_expires_at: "2026-08-01T02:02:00.000Z",
    reconcile_attempt_count: 1,
    reconcile_last_error_code: null,
    reconcile_last_error: null,
    reconcile_next_at: "2026-08-01T02:00:00.000Z",
    reconcile_last_checked_at: null,
    reconcile_last_provider_status: null,
    reconcile_completion_kind: null,
    reconcile_query_provider_order_no: null,
    reconcile_query_transaction_id: null,
    reconcile_query_paid_amount_fen: null,
    reconcile_query_paid_at: null,
    provider_delivery_status: "not_required",
    provider_delivery_attempt_count: 0,
    provider_delivery_attempt_key: null,
    provider_delivery_last_error_code: null,
    provider_delivery_last_error: null,
    provider_delivery_provided_at: null,
    provider_delivery_request_id: null,
    ...patch,
  };
}

export function createQueryResult(
  patch: Partial<QueryVirtualOrderResult> = {},
): QueryVirtualOrderResult {
  return {
    requestId: "wechat-request-1",
    environment: "production",
    orderId: "BV202608010001",
    status: 2,
    businessType: 0,
    orderType: 0,
    orderFee: 100,
    couponFee: 0,
    paidFee: 100,
    refundFee: 0,
    leftFee: 100,
    createdAt: 1_785_546_000,
    updatedAt: 1_785_546_060,
    paidAt: 1_785_546_060,
    providedAt: 0,
    wechatOrderId: "wechat-order-1",
    channelOrderId: "independent-channel-order-1",
    wechatPayOrderId: "wechat-pay-order-1",
    settledAt: null,
    settlementState: null,
    platformFeeFen: null,
    cpsFeeFen: null,
    ...patch,
  };
}

export function createReconciliationHarness(
  claims = [createReconciliationClaim()],
) {
  return {
    repository: {
      claimReconciliationBatch: mock(async () => claims),
      rescheduleReconciliation: mock(async () => true),
      closeUnpaidReconciliation: mock(async () => true),
      prepareSuccessfulQueryReconciliation: mock(async () => true),
      finalizeReconciliationAfterConfirmation: mock(async () => true),
      markReconciliationDelivery: mock(async () => true),
      beginReconciliationDeliveryRetry: mock(async () => true),
    },
    gateway: {
      queryOrder: mock(async (_input: QueryVirtualOrderInput) =>
        createQueryResult()
      ),
      notifyProvideGoods: mock(async () => ({
        accepted: true as const,
        requestId: "provide-request-1",
      })),
    },
    confirmation: {
      confirm: mock(async () => ({
        idempotent: false,
        payment_recorded: true,
        fulfilled: true,
        recoverable: false,
        entitlement_event_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        entitlement_status: "active" as const,
        failure_code: null,
      })),
    },
    accessTokenProvider: { getAccessToken: mock(async () => "access-token") },
    settingsService: {
      getPlatformSecretString: mock(async () => JSON.stringify({
        appKey: "app-key",
        revision: 1,
      })),
    },
    nowFactory: () => RECONCILIATION_NOW,
  };
}
