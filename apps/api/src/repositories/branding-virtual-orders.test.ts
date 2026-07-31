import { describe, expect, mock, test } from "bun:test";
import type { BrandingVirtualOrderRecord } from "./branding-virtual-orders";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const ORDER_ID = "22222222-2222-4222-8222-222222222222";
const MAPPING_ID = "33333333-3333-4333-8333-333333333333";
const EMPLOYEE_ID = "44444444-4444-4444-8444-444444444444";
const IDEMPOTENCY_KEY = "55555555-5555-4555-8555-555555555555";
const CLAIM_TOKEN = "77777777-7777-4777-8777-777777777777";

const order = {
  id: ORDER_ID,
  tenant_id: TENANT_ID,
  order_no: "BVO-20260801010000000-ABCDEF123456",
  out_trade_no: "BV20260801010000ABCDEF1234567890",
  idempotency_key: IDEMPOTENCY_KEY,
  product_id: "66666666-6666-4666-8666-666666666666",
  product_code: "custom_support_branding_annual",
  entitlement_code: "custom_support_branding",
  product_name: "年度品牌技术支持",
  amount_fen: 9_900,
  term_years: 1,
  purchase_notes: "购买说明",
  refund_policy: "退款规则",
  environment: "production",
  offer_id: "offer-1",
  provider_product_id: "product-1",
  requested_platform: "unknown",
  settlement_channel: null,
  payer_openid: "openid",
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
  payment_request_issued_at: null,
  payment_request_attempt_revision: 0,
  created_by: EMPLOYEE_ID,
  created_at: "2026-08-01T01:00:00.000Z",
  updated_at: "2026-08-01T01:00:00.000Z",
} satisfies BrandingVirtualOrderRecord;

async function repositoryWith(input: {
  queryData?: unknown;
  queryError?: unknown;
  rpcData?: unknown;
  rpcError?: unknown;
}) {
  const calls: Array<[string, ...unknown[]]> = [];
  const query = {
    select(columns: string) {
      calls.push(["select", columns]);
      return query;
    },
    eq(column: string, value: unknown) {
      calls.push(["eq", column, value]);
      return query;
    },
    limit(value: number) {
      calls.push(["limit", value]);
      return query;
    },
    maybeSingle: mock(async () => ({
      data: input.queryData ?? null,
      error: input.queryError ?? null,
    })),
  };
  const client = {
    from(table: string) {
      calls.push(["from", table]);
      return query;
    },
    rpc: mock(async (name: string, parameters: Record<string, unknown>) => {
      calls.push(["rpc", name, parameters]);
      return { data: input.rpcData ?? null, error: input.rpcError ?? null };
    }),
  };
  const { BrandingVirtualOrderRepository } = await import(
    "./branding-virtual-orders"
  );
  return {
    repository: new BrandingVirtualOrderRepository(() => client),
    calls,
    client,
  };
}

describe("BrandingVirtualOrderRepository", () => {
  test("looks up one production mapping id for the fixed product", async () => {
    const f = await repositoryWith({
      queryData: {
        id: MAPPING_ID,
        environment: "production",
        secret_revision: 1,
      },
    });
    expect(await f.repository.findProductionMappingId({
      productCode: "custom_support_branding_annual",
    })).toBe(MAPPING_ID);
    expect(f.calls).toContainEqual(["from", "platform_virtual_payment_products"]);
    expect(f.calls).toContainEqual(["eq", "environment", "production"]);
    expect(f.calls).toContainEqual([
      "eq",
      "platform_addon_products.code",
      "custom_support_branding_annual",
    ]);
    expect(f.calls).toContainEqual(["limit", 1]);
  });

  test("creates only through the narrow atomic RPC and parses its result", async () => {
    const f = await repositoryWith({ rpcData: order });
    expect(await f.repository.create({
      tenantId: TENANT_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      virtualProductId: MAPPING_ID,
      requestedPlatform: "ios",
      payerOpenid: "openid",
      createdBy: EMPLOYEE_ID,
    })).toEqual(order);
    expect(f.calls).toContainEqual([
      "rpc",
      "branding_create_virtual_addon_order",
      {
        p_tenant_id: TENANT_ID,
        p_idempotency_key: IDEMPOTENCY_KEY,
        p_virtual_product_id: MAPPING_ID,
        p_requested_platform: "ios",
        p_payer_openid: "openid",
        p_created_by: EMPLOYEE_ID,
      },
    ]);
  });

  test("uses narrow claim finalize and release RPCs with tenant-bound identity", async () => {
    const claimed = {
      ...order,
      payment_request_claim_token: CLAIM_TOKEN,
      payment_request_claimed_at: "2026-08-01T01:00:00.000Z",
      payment_request_claim_expires_at: "2026-08-01T01:00:30.000Z",
    };
    const f = await repositoryWith({ rpcData: claimed });
    const identity = {
      tenantId: TENANT_ID,
      orderId: ORDER_ID,
      payerOpenid: "openid",
      createdBy: EMPLOYEE_ID,
    };

    expect(await f.repository.claimPaymentRequest(identity)).toEqual(claimed);
    expect(await f.repository.finalizePaymentRequest({
      ...identity,
      claimToken: CLAIM_TOKEN,
    })).toEqual(claimed);
    expect(await f.repository.releasePaymentRequestClaim({
      ...identity,
      claimToken: CLAIM_TOKEN,
    })).toEqual(claimed);

    expect(f.calls.filter(([method]) => method === "rpc")).toEqual([
      ["rpc", "branding_claim_virtual_addon_payment_request", {
        p_tenant_id: TENANT_ID,
        p_order_id: ORDER_ID,
        p_payer_openid: "openid",
        p_created_by: EMPLOYEE_ID,
      }],
      ["rpc", "branding_finalize_virtual_addon_payment_request", {
        p_tenant_id: TENANT_ID,
        p_order_id: ORDER_ID,
        p_payer_openid: "openid",
        p_created_by: EMPLOYEE_ID,
        p_claim_token: CLAIM_TOKEN,
      }],
      ["rpc", "branding_release_virtual_addon_payment_request_claim", {
        p_tenant_id: TENANT_ID,
        p_order_id: ORDER_ID,
        p_payer_openid: "openid",
        p_created_by: EMPLOYEE_ID,
        p_claim_token: CLAIM_TOKEN,
      }],
    ]);
  });

  test.each([
    ["BRANDING_ENTITLEMENT_SUSPENDED", 409],
    ["BRANDING_ENTITLEMENT_REVOKED", 409],
    ["BRANDING_VIRTUAL_ORDER_NOT_FOUND", 404],
    ["BRANDING_VIRTUAL_ORDER_NOT_PENDING", 409],
    ["BRANDING_VIRTUAL_PAYMENT_REQUEST_IN_PROGRESS", 409],
    ["BRANDING_VIRTUAL_PAYMENT_RECONCILIATION_REQUIRED", 409],
    ["BRANDING_VIRTUAL_PAYMENT_REQUEST_CLAIM_INVALID", 409],
    ["BRANDING_VIRTUAL_ORDER_CONFIG_CHANGED", 409],
  ])("maps exact payment-request RPC error %s", async (message, statusCode) => {
    const f = await repositoryWith({
      rpcError: { code: "P0001", message },
    });
    await expect(f.repository.claimPaymentRequest({
      tenantId: TENANT_ID,
      orderId: ORDER_ID,
      payerOpenid: "openid",
      createdBy: EMPLOYEE_ID,
    })).rejects.toMatchObject({ statusCode, code: message });
  });

  test.each([
    ["BRANDING_VIRTUAL_ORDER_INPUT_INVALID", 400],
    ["BRANDING_VIRTUAL_PRODUCT_NOT_FOUND", 404],
    ["BRANDING_VIRTUAL_ORDER_PAYER_MISMATCH", 409],
    ["BRANDING_VIRTUAL_ORDER_ACTOR_MISMATCH", 409],
    ["BRANDING_VIRTUAL_PURCHASE_MODE_UNAVAILABLE", 409],
    ["BRANDING_VIRTUAL_PRODUCT_DISABLED", 409],
    ["BRANDING_VIRTUAL_PRODUCT_MAPPING_UNAVAILABLE", 409],
    ["BRANDING_VIRTUAL_PRODUCT_AMOUNT_MISMATCH", 409],
    ["BRANDING_VIRTUAL_PRODUCT_AMOUNT_TOO_LOW", 409],
    ["BRANDING_VIRTUAL_ORDER_CONFLICT", 409],
  ])("maps exact RPC error %s", async (message, statusCode) => {
    const f = await repositoryWith({
      rpcError: { code: "P0001", message },
    });
    await expect(f.repository.create({
      tenantId: TENANT_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      virtualProductId: MAPPING_ID,
      requestedPlatform: "unknown",
      payerOpenid: "openid",
      createdBy: EMPLOYEE_ID,
    })).rejects.toMatchObject({ statusCode, code: message });
  });

  test("sanitizes unknown database failures and malformed RPC rows", async () => {
    const database = await repositoryWith({
      rpcError: { code: "XX000", message: "private SQL and secret" },
    });
    await expect(database.repository.create({
      tenantId: TENANT_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      virtualProductId: MAPPING_ID,
      requestedPlatform: "unknown",
      payerOpenid: "openid",
      createdBy: EMPLOYEE_ID,
    })).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      details: undefined,
    });

    const malformed = await repositoryWith({ rpcData: { id: ORDER_ID } });
    await expect(malformed.repository.create({
      tenantId: TENANT_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      virtualProductId: MAPPING_ID,
      requestedPlatform: "unknown",
      payerOpenid: "openid",
      createdBy: EMPLOYEE_ID,
    })).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });
  });

  test("reads one tenant-bound order using only required columns", async () => {
    const f = await repositoryWith({ queryData: order });
    expect(await f.repository.findTenantOrderById({
      tenantId: TENANT_ID,
      orderId: ORDER_ID,
    })).toEqual(order);
    expect(f.calls).toContainEqual(["from", "tenant_virtual_addon_orders"]);
    expect(f.calls).toContainEqual(["eq", "tenant_id", TENANT_ID]);
    expect(f.calls).toContainEqual(["eq", "id", ORDER_ID]);
    expect(f.calls).toContainEqual(["limit", 1]);
    const selected = f.calls.find(([method]) => method === "select")?.[1];
    expect(selected).not.toBe("*");
    expect(String(selected)).not.toContain("reconcile_");
  });

  test("reads one tenant idempotent fact with a bounded exact query", async () => {
    const f = await repositoryWith({ queryData: order });
    expect(await f.repository.findTenantOrderByIdempotencyKey({
      tenantId: TENANT_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
    })).toEqual(order);
    expect(f.calls).toContainEqual(["from", "tenant_virtual_addon_orders"]);
    expect(f.calls).toContainEqual(["eq", "tenant_id", TENANT_ID]);
    expect(f.calls).toContainEqual(["eq", "idempotency_key", IDEMPOTENCY_KEY]);
    expect(f.calls).toContainEqual(["limit", 1]);
  });

  test("reads one virtual order by exact provider merchant order identity", async () => {
    const f = await repositoryWith({ queryData: order });
    expect(await f.repository.findByOutTradeNo(order.out_trade_no)).toEqual(order);
    expect(f.calls).toContainEqual(["eq", "out_trade_no", order.out_trade_no]);
    expect(f.calls).toContainEqual(["limit", 1]);
  });

  test("passes the complete provider fact to the shared confirmation RPC", async () => {
    const result = {
      idempotent: false,
      payment_recorded: true,
      fulfilled: true,
      recoverable: false,
      entitlement_event_id: "88888888-8888-4888-8888-888888888888",
      entitlement_status: "active",
      failure_code: null,
    } as const;
    const f = await repositoryWith({ rpcData: result });
    expect(await f.repository.confirmPurchase({
      orderId: ORDER_ID,
      notificationId: "99999999-9999-4999-8999-999999999999",
      source: "notification",
      allowLateClosedRecovery: false,
      eventType: "xpay_goods_deliver_notify",
      successful: true,
      environment: "production",
      recipientOriginalId: "gh_original",
      senderIdHash: "a".repeat(64),
      providerCreatedAtUnix: 1_714_037_059,
      messageType: "event",
      openid: "openid",
      outTradeNo: order.out_trade_no,
      providerProductId: order.provider_product_id,
      quantity: 1,
      currency: null,
      origPriceFen: order.amount_fen,
      actualPriceFen: order.amount_fen,
      providerOrderNo: "provider-order-1",
      transactionId: "transaction-1",
      paidAt: "2026-08-01T01:01:00.000Z",
      attach: ORDER_ID,
    })).toEqual(result);
    expect(f.calls).toContainEqual([
      "rpc",
      "branding_confirm_virtual_addon_purchase",
      {
        p_order_id: ORDER_ID,
        p_notification_id: "99999999-9999-4999-8999-999999999999",
        p_source: "notification",
        p_allow_late_closed_recovery: false,
        p_event_type: "xpay_goods_deliver_notify",
        p_recipient_original_id: "gh_original",
        p_sender_id_hash: "a".repeat(64),
        p_provider_created_at: 1_714_037_059,
        p_msg_type: "event",
        p_successful_state: true,
        p_environment: "production",
        p_openid: "openid",
        p_out_trade_no: order.out_trade_no,
        p_provider_product_id: order.provider_product_id,
        p_quantity: 1,
        p_currency: null,
        p_orig_price_fen: order.amount_fen,
        p_actual_price_fen: order.amount_fen,
        p_provider_order_no: "provider-order-1",
        p_transaction_id: "transaction-1",
        p_paid_at: "2026-08-01T01:01:00.000Z",
        p_attach: ORDER_ID,
      },
    ]);
  });

  test("maps exact confirmation mismatches but sanitizes unknown failures", async () => {
    const mismatch = await repositoryWith({
      rpcError: {
        code: "P0001",
        message: "BRANDING_VIRTUAL_NOTIFICATION_MISMATCH",
      },
    });
    const input = {
      orderId: ORDER_ID,
      notificationId: "99999999-9999-4999-8999-999999999999",
      source: "notification" as const,
      allowLateClosedRecovery: false,
      eventType: "xpay_goods_deliver_notify" as const,
      successful: true as const,
      environment: "production" as const,
      recipientOriginalId: "gh_original",
      senderIdHash: "a".repeat(64),
      providerCreatedAtUnix: 1_714_037_059,
      messageType: "event" as const,
      openid: "openid",
      outTradeNo: order.out_trade_no,
      providerProductId: order.provider_product_id,
      quantity: 1 as const,
      currency: null,
      origPriceFen: order.amount_fen,
      actualPriceFen: order.amount_fen,
      providerOrderNo: "provider-order-1",
      transactionId: "transaction-1",
      paidAt: "2026-08-01T01:01:00.000Z",
      attach: ORDER_ID,
    };
    await expect(mismatch.repository.confirmPurchase(input)).rejects
      .toMatchObject({
        statusCode: 409,
        code: "BRANDING_VIRTUAL_NOTIFICATION_MISMATCH",
      });

    const unknown = await repositoryWith({
      rpcError: { code: "XX000", message: "secret SQL" },
    });
    await expect(unknown.repository.confirmPurchase(input)).rejects
      .toMatchObject({ statusCode: 500, code: "DB_ERROR", details: undefined });
  });
});
