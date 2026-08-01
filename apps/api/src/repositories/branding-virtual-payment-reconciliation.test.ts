import { describe, expect, test } from "bun:test";

import type { BrandingVirtualPaymentReconciliationClaim } from "./branding-virtual-orders";
import {
  CLAIM_TOKEN,
  ORDER_ID,
  order,
  repositoryWith,
} from "./branding-virtual-orders.test-fixtures";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const reconciliationClaim = {
  ...order,
  provider_order_no: "provider-order-1",
  transaction_id: "transaction-1",
  payment_status: "succeeded",
  fulfillment_status: "grant_failed",
  paid_amount_fen: order.amount_fen,
  paid_at: "2026-08-01T01:01:00.000Z",
  failure_code: "BRANDING_VIRTUAL_ENTITLEMENT_GRANT_FAILED",
  failure_message: "支付已确认，权益发放失败，等待重试",
  reconcile_claim_token: CLAIM_TOKEN,
  reconcile_claim_expires_at: "2026-08-01T01:07:00.000Z",
  reconcile_attempt_count: 1,
  reconcile_last_error_code: null,
  reconcile_last_error: null,
  reconcile_next_at: "2026-08-01T01:05:00.000Z",
  reconcile_last_checked_at: null,
  reconcile_last_provider_status: null,
  provider_delivery_status: "not_required",
  provider_delivery_attempt_count: 0,
  provider_delivery_last_error_code: null,
  provider_delivery_last_error: null,
  provider_delivery_notified_at: null,
  provider_delivery_request_id: null,
} satisfies BrandingVirtualPaymentReconciliationClaim;

describe("BrandingVirtualOrderRepository reconciliation", () => {
  test("claims and parses a bounded batch only through RPC", async () => {
    const f = await repositoryWith({ rpcData: [reconciliationClaim] });

    expect(await f.repository.claimReconciliationBatch({
      limit: 10_000,
      leaseSeconds: 10_000,
    })).toEqual([reconciliationClaim]);
    expect(reconciliationClaim).toMatchObject({
      provider_order_no: "provider-order-1",
      transaction_id: "transaction-1",
      paid_amount_fen: order.amount_fen,
      paid_at: "2026-08-01T01:01:00.000Z",
    });
    expect(f.calls).toContainEqual([
      "rpc",
      "branding_claim_virtual_payment_reconciliation_batch",
      { p_limit: 100, p_lease_seconds: 600 },
    ]);
  });

  test("uses exact command RPC names and arguments", async () => {
    const f = await repositoryWith({ rpcData: true });

    expect(await f.repository.rescheduleReconciliation({
      orderId: ORDER_ID,
      claimToken: CLAIM_TOKEN,
      nextAt: "2026-08-01T01:10:00.000Z",
      errorCode: `QUERY_${"X".repeat(120)}`,
      errorSummary: "Y".repeat(600),
    })).toBe(true);
    expect(await f.repository.closeUnpaidReconciliation({
      orderId: ORDER_ID,
      claimToken: CLAIM_TOKEN,
      officialStatus: 6,
    })).toBe(true);
    expect(await f.repository.completeReconciliation({
      orderId: ORDER_ID,
      claimToken: CLAIM_TOKEN,
      environment: "production",
      openid: "openid",
      outTradeNo: order.out_trade_no,
      providerProductId: order.provider_product_id,
      quantity: 1,
      currency: "CNY",
      origPriceFen: order.amount_fen,
      actualPriceFen: order.amount_fen,
      providerOrderNo: "provider-order-1",
      transactionId: "transaction-1",
      paidAt: "2026-08-01T01:01:00.000Z",
      attach: ORDER_ID,
      deliveryRequestId: "delivery-request-1",
    })).toBe(true);
    expect(await f.repository.markReconciliationDelivery({
      orderId: ORDER_ID,
      claimToken: CLAIM_TOKEN,
      status: "failed",
      requestId: "delivery-request-1",
      errorCode: "PROVIDER_TIMEOUT",
      errorSummary: "请求超时",
    })).toBe(true);

    expect(f.calls.filter(([method]) => method === "rpc")).toEqual([
      ["rpc", "branding_reschedule_virtual_payment_reconciliation", {
        p_order_id: ORDER_ID,
        p_claim_token: CLAIM_TOKEN,
        p_next_at: "2026-08-01T01:10:00.000Z",
        p_error_code: `QUERY_${"X".repeat(94)}`,
        p_error_summary: "Y".repeat(500),
      }],
      ["rpc", "branding_close_unpaid_virtual_payment_reconciliation", {
        p_order_id: ORDER_ID,
        p_claim_token: CLAIM_TOKEN,
        p_official_status: 6,
      }],
      ["rpc", "branding_complete_virtual_payment_reconciliation", {
        p_order_id: ORDER_ID,
        p_claim_token: CLAIM_TOKEN,
        p_environment: "production",
        p_openid: "openid",
        p_out_trade_no: order.out_trade_no,
        p_provider_product_id: order.provider_product_id,
        p_quantity: 1,
        p_currency: "CNY",
        p_orig_price_fen: order.amount_fen,
        p_actual_price_fen: order.amount_fen,
        p_provider_order_no: "provider-order-1",
        p_transaction_id: "transaction-1",
        p_paid_at: "2026-08-01T01:01:00.000Z",
        p_attach: ORDER_ID,
        p_delivery_request_id: "delivery-request-1",
      }],
      ["rpc", "branding_mark_virtual_payment_delivery", {
        p_order_id: ORDER_ID,
        p_claim_token: CLAIM_TOKEN,
        p_delivery_status: "failed",
        p_request_id: "delivery-request-1",
        p_error_code: "PROVIDER_TIMEOUT",
        p_error_summary: "请求超时",
      }],
    ]);
  });

  test("rejects oversized or malformed result sets", async () => {
    const oversized = await repositoryWith({
      rpcData: Array.from({ length: 101 }, () => reconciliationClaim),
    });
    await expect(oversized.repository.claimReconciliationBatch({
      limit: 100,
      leaseSeconds: 120,
    })).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });

    const malformed = await repositoryWith({ rpcData: [{ id: ORDER_ID }] });
    await expect(malformed.repository.claimReconciliationBatch({
      limit: 1,
      leaseSeconds: 120,
    })).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });
  });

  test("maps exact errors and sanitizes unknown database errors", async () => {
    const stale = await repositoryWith({
      rpcError: {
        code: "P0001",
        message: "BRANDING_VIRTUAL_RECONCILIATION_CLAIM_INVALID",
      },
    });
    await expect(stale.repository.closeUnpaidReconciliation({
      orderId: ORDER_ID,
      claimToken: CLAIM_TOKEN,
      officialStatus: 0,
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_VIRTUAL_RECONCILIATION_CLAIM_INVALID",
    });

    const unknown = await repositoryWith({
      rpcError: { code: "XX000", message: "private SQL and credential" },
    });
    await expect(unknown.repository.claimReconciliationBatch({
      limit: 20,
      leaseSeconds: 120,
    })).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      details: undefined,
    });
  });
});
