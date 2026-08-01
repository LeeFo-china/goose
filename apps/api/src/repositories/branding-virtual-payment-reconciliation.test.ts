import { describe, expect, test } from "bun:test";

import type { BrandingVirtualPaymentReconciliationClaim } from "./branding-virtual-orders";
import {
  CLAIM_TOKEN,
  ORDER_ID,
  TENANT_ID,
  order,
  repositoryWith,
} from "./branding-virtual-orders.test-fixtures";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const ATTEMPT_KEY = "88888888-8888-4888-8888-888888888888";
const RETRY_ATTEMPT_KEY = "99999999-9999-4999-8999-999999999999";
const successfulQueryFacts = {
  environment: "production" as const,
  openid: order.payer_openid,
  outTradeNo: order.out_trade_no,
  providerProductId: order.provider_product_id,
  quantity: 1 as const,
  currency: "CNY" as const,
  origPriceFen: order.amount_fen,
  actualPriceFen: order.amount_fen,
  providerOrderNo: "provider-order-1",
  transactionId: "transaction-1",
  paidAt: "2026-08-01T01:01:00.000Z",
  attach: ORDER_ID,
};
const reconciliationClaim = {
  id: ORDER_ID,
  tenant_id: TENANT_ID,
  out_trade_no: order.out_trade_no,
  environment: "production",
  offer_id: order.offer_id,
  secret_revision: 1,
  provider_product_id: order.provider_product_id,
  payer_openid: order.payer_openid,
  amount_fen: order.amount_fen,
  provider_order_no: "provider-order-1",
  transaction_id: "transaction-1",
  payment_status: "succeeded",
  fulfillment_status: "grant_failed",
  paid_amount_fen: order.amount_fen,
  paid_at: "2026-08-01T01:01:00.000Z",
  payment_expires_at: "2026-08-01T01:05:00.000Z",
  payment_request_issued_at: "2026-08-01T01:00:00.000Z",
  entitlement_event_id: null,
  reconcile_claim_token: CLAIM_TOKEN,
  reconcile_claim_expires_at: "2026-08-01T01:07:00.000Z",
  reconcile_attempt_count: 1,
  reconcile_last_error_code: null,
  reconcile_last_error: null,
  reconcile_next_at: "2026-08-01T01:05:00.000Z",
  reconcile_last_checked_at: null,
  reconcile_last_provider_status: null,
  reconcile_completion_kind: "grant_recovery",
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
} satisfies BrandingVirtualPaymentReconciliationClaim;

describe("BrandingVirtualOrderRepository reconciliation", () => {
  test("claims and parses only the bounded worker facts", async () => {
    const f = await repositoryWith({ rpcData: [reconciliationClaim] });

    expect(await f.repository.claimReconciliationBatch({
      limit: 10_000,
      leaseSeconds: 10_000,
    })).toEqual([reconciliationClaim]);
    expect(f.calls).toContainEqual([
      "rpc",
      "branding_claim_virtual_payment_reconciliation_batch",
      { p_limit: 100, p_lease_seconds: 600 },
    ]);
    expect(reconciliationClaim).not.toHaveProperty("idempotency_key");
    expect(reconciliationClaim).not.toHaveProperty("purchase_notes");
    expect(reconciliationClaim).not.toHaveProperty("refund_policy");
    expect(reconciliationClaim).not.toHaveProperty("created_by");
  });

  test("returns prepared query facts needed to resume after a crash", async () => {
    const preparedClaim = {
      ...reconciliationClaim,
      provider_order_no: null,
      transaction_id: null,
      payment_status: "pending" as const,
      fulfillment_status: "pending" as const,
      paid_amount_fen: null,
      paid_at: null,
      reconcile_last_provider_status: 2,
      reconcile_completion_kind: "query" as const,
      reconcile_query_provider_order_no: successfulQueryFacts.providerOrderNo,
      reconcile_query_transaction_id: successfulQueryFacts.transactionId,
      reconcile_query_paid_amount_fen: successfulQueryFacts.actualPriceFen,
      reconcile_query_paid_at: successfulQueryFacts.paidAt,
    } satisfies BrandingVirtualPaymentReconciliationClaim;
    const f = await repositoryWith({ rpcData: [preparedClaim] });

    expect(await f.repository.claimReconciliationBatch({
      limit: 1,
      leaseSeconds: 120,
    })).toEqual([preparedClaim]);
  });

  test("reschedules with a nullable full-range official status", async () => {
    const f = await repositoryWith({ rpcData: true });

    expect(await f.repository.rescheduleReconciliation({
      orderId: ORDER_ID,
      claimToken: CLAIM_TOKEN,
      nextAt: "2026-08-01T01:10:00.000Z",
      officialStatus: 10,
      errorCode: `QUERY_${"X".repeat(120)}`,
      errorSummary: "Y".repeat(600),
    })).toBe(true);
    expect(f.calls).toContainEqual([
      "rpc",
      "branding_reschedule_virtual_payment_reconciliation",
      {
        p_order_id: ORDER_ID,
        p_claim_token: CLAIM_TOKEN,
        p_next_at: "2026-08-01T01:10:00.000Z",
        p_official_status: 10,
        p_error_code: `QUERY_${"X".repeat(94)}`,
        p_error_summary: "Y".repeat(500),
      },
    ]);
  });

  test.each([5, 7, 8, 9, 10] as const)(
    "passes official status %i to the structured reschedule audit",
    async (officialStatus) => {
      const f = await repositoryWith({ rpcData: true });
      await f.repository.rescheduleReconciliation({
        orderId: ORDER_ID,
        claimToken: CLAIM_TOKEN,
        nextAt: "2026-08-01T01:10:00.000Z",
        officialStatus,
        errorCode: "QUERY_RETRY",
        errorSummary: "等待下次查询",
      });
      expect(f.calls).toContainEqual([
        "rpc",
        "branding_reschedule_virtual_payment_reconciliation",
        expect.objectContaining({ p_official_status: officialStatus }),
      ]);
    },
  );

  test("keeps the official status nullable for grant recovery failures", async () => {
    const f = await repositoryWith({ rpcData: true });
    await f.repository.rescheduleReconciliation({
      orderId: ORDER_ID,
      claimToken: CLAIM_TOKEN,
      nextAt: "2026-08-01T01:10:00.000Z",
      officialStatus: null,
      errorCode: "GRANT_RETRY",
      errorSummary: "权益发放等待重试",
    });
    expect(f.calls).toContainEqual([
      "rpc",
      "branding_reschedule_virtual_payment_reconciliation",
      expect.objectContaining({ p_official_status: null }),
    ]);
  });

  test.each([2, 3, 4] as const)(
    "prepares successful query status %i before shared confirmation",
    async (officialStatus) => {
      const f = await repositoryWith({ rpcData: true });

      expect(await f.repository.prepareSuccessfulQueryReconciliation({
        orderId: ORDER_ID,
        claimToken: CLAIM_TOKEN,
        officialStatus,
        ...successfulQueryFacts,
      })).toBe(true);
      expect(f.calls).toContainEqual([
        "rpc",
        "branding_prepare_successful_query_reconciliation",
        {
          p_order_id: ORDER_ID,
          p_claim_token: CLAIM_TOKEN,
          p_official_status: officialStatus,
          p_environment: "production",
          p_openid: order.payer_openid,
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
        },
      ]);
    },
  );

  test.each([2, 3, 4] as const)(
    "finalizes already-confirmed payment for official status %i",
    async (officialStatus) => {
      const f = await repositoryWith({ rpcData: true });
      await f.repository.finalizeReconciliationAfterConfirmation({
        orderId: ORDER_ID,
        claimToken: CLAIM_TOKEN,
        officialStatus,
        providerOrderNo: "provider-order-1",
        transactionId: "transaction-1",
        paidAmountFen: order.amount_fen,
        paidAt: "2026-08-01T01:01:00.000Z",
        deliveryAttemptKey: officialStatus === 2 ? ATTEMPT_KEY : null,
      });
      expect(f.calls).toContainEqual([
        "rpc",
        "branding_finalize_virtual_payment_reconciliation",
        {
          p_order_id: ORDER_ID,
          p_claim_token: CLAIM_TOKEN,
          p_official_status: officialStatus,
          p_provider_order_no: "provider-order-1",
          p_transaction_id: "transaction-1",
          p_paid_amount_fen: order.amount_fen,
          p_paid_at: "2026-08-01T01:01:00.000Z",
          p_delivery_attempt_key: officialStatus === 2 ? ATTEMPT_KEY : null,
        },
      ]);
    },
  );

  test("finalizes grant recovery without inventing an official status", async () => {
    const f = await repositoryWith({ rpcData: true });

    expect(await f.repository.finalizeReconciliationAfterConfirmation({
      orderId: ORDER_ID,
      claimToken: CLAIM_TOKEN,
      officialStatus: null,
      providerOrderNo: null,
      transactionId: null,
      paidAmountFen: null,
      paidAt: null,
      deliveryAttemptKey: null,
    })).toBe(true);
    expect(f.calls).toContainEqual([
      "rpc",
      "branding_finalize_virtual_payment_reconciliation",
      {
        p_order_id: ORDER_ID,
        p_claim_token: CLAIM_TOKEN,
        p_official_status: null,
        p_provider_order_no: null,
        p_transaction_id: null,
        p_paid_amount_fen: null,
        p_paid_at: null,
        p_delivery_attempt_key: null,
      },
    ]);
  });

  test("marks delivery by local attempt key and nullable provider request id", async () => {
    const f = await repositoryWith({ rpcData: true });

    expect(await f.repository.markReconciliationDelivery({
      orderId: ORDER_ID,
      claimToken: CLAIM_TOKEN,
      status: "failed",
      attemptKey: ATTEMPT_KEY,
      providerRequestId: null,
      errorCode: "PROVIDER_TIMEOUT",
      errorSummary: "请求超时",
    })).toBe(true);
    expect(f.calls).toContainEqual([
      "rpc",
      "branding_mark_virtual_payment_delivery",
      {
        p_order_id: ORDER_ID,
        p_claim_token: CLAIM_TOKEN,
        p_delivery_status: "failed",
        p_attempt_key: ATTEMPT_KEY,
        p_provider_request_id: null,
        p_error_code: "PROVIDER_TIMEOUT",
        p_error_summary: "请求超时",
      },
    ]);
  });

  test("begins a failed delivery retry with a new local attempt key", async () => {
    const f = await repositoryWith({ rpcData: true });

    expect(await f.repository.beginReconciliationDeliveryRetry({
      orderId: ORDER_ID,
      claimToken: CLAIM_TOKEN,
      attemptKey: RETRY_ATTEMPT_KEY,
    })).toBe(true);
    expect(f.calls).toContainEqual([
      "rpc",
      "branding_begin_virtual_payment_delivery_retry",
      {
        p_order_id: ORDER_ID,
        p_claim_token: CLAIM_TOKEN,
        p_attempt_key: RETRY_ATTEMPT_KEY,
      },
    ]);
  });

  test("rejects oversized, malformed, and weakly bounded claim rows", async () => {
    const oversized = await repositoryWith({
      rpcData: Array.from({ length: 101 }, () => reconciliationClaim),
    });
    await expect(oversized.repository.claimReconciliationBatch({
      limit: 100,
      leaseSeconds: 120,
    })).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });

    for (const invalid of [
      { ...reconciliationClaim, paid_at: "not-a-time" },
      { ...reconciliationClaim, out_trade_no: "x".repeat(33) },
      { ...reconciliationClaim, provider_order_no: "x".repeat(129) },
      { ...reconciliationClaim, reconcile_last_error: "x".repeat(1_001) },
      { ...reconciliationClaim, reconcile_last_provider_status: 11 },
    ]) {
      const malformed = await repositoryWith({ rpcData: [invalid] });
      await expect(malformed.repository.claimReconciliationBatch({
        limit: 1,
        leaseSeconds: 120,
      })).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });
    }
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
