import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const rpc = mock(async (
  _name: string,
  _args: Record<string, unknown>,
): Promise<{ data: unknown; error: unknown }> => ({ data: [], error: null }));
const select = mock((_columns?: string, _options?: unknown) => query);
const update = mock((_patch: Record<string, unknown>) => query);
const eq = mock((_column: string, _value: unknown) => query);
const range = mock((_from: number, _to: number) => query);
const limit = mock((_value: number) => query);
const maybeSingle = mock(async () => ({ data: null as unknown, error: null as unknown }));
let queryResult: { data: unknown[] | null; error: unknown; count: number | null } = {
  data: [],
  error: null,
  count: 0,
};
const query = {
  select,
  update,
  eq,
  or: mock(() => query),
  order: mock(() => query),
  range,
  limit,
  maybeSingle,
  then: (
    resolve: (value: typeof queryResult) => unknown,
  ) => Promise.resolve(queryResult).then(resolve),
};

mock.module("@/utils/supabase/index", () => ({
  SupabaseDB: {
    getAdminClient: () => ({ from: () => query, rpc }),
  },
}));

describe("BillingRechargeRepository", () => {
  beforeEach(() => {
    rpc.mockClear();
    select.mockClear();
    update.mockClear();
    eq.mockClear();
    range.mockClear();
    limit.mockClear();
    maybeSingle.mockClear();
    queryResult = { data: [], error: null, count: 0 };
    rpc.mockImplementation(async () => ({ data: [], error: null }));
    maybeSingle.mockImplementation(async () => ({ data: null, error: null }));
  });

  test("selects payment expiration in the paginated tenant order list", async () => {
    const { billingRechargeRepository } = await import("./billing-recharge");

    await billingRechargeRepository.listOrders({
      tenantId: "tenant-1",
      page: 2,
      pageSize: 10,
    });

    expect(select).toHaveBeenCalledWith(
      expect.stringContaining("payment_expires_at"),
      { count: "exact" },
    );
    expect(range).toHaveBeenCalledWith(10, 19);
  });

  test("confirms recharge and recovers subscriptions through one atomic RPC", async () => {
    const atomicResult = {
      order: { id: "order-1", tenant_id: "tenant-1" },
      account: { id: "account-1" },
      ledger: { id: "ledger-1" },
      recovery: { recovered: true },
      idempotent: false,
    };
    rpc.mockImplementationOnce(async () => ({ data: atomicResult, error: null }));
    const { billingRechargeRepository } = await import("./billing-recharge");

    const result = await billingRechargeRepository.confirmWechatRecharge({
      orderId: "order-1",
      transactionId: "transaction-1",
      paidAmountFen: 10000,
      paidAt: "2026-07-18T03:00:00.000Z",
      notificationId: null,
      metadata: { confirmation_source: "expiration_reconcile" },
    });

    expect(rpc).toHaveBeenCalledWith(
      "billing_confirm_wechat_recharge_and_recover",
      {
        p_order_id: "order-1",
        p_transaction_id: "transaction-1",
        p_paid_amount_fen: 10000,
        p_paid_at: "2026-07-18T03:00:00.000Z",
        p_notification_id: null,
        p_metadata: { confirmation_source: "expiration_reconcile" },
      },
    );
    expect(result).toEqual(atomicResult);
  });

  test("creates pending recharge only through the config-version CAS RPC", async () => {
    const created = { id: "order-1", status: "pending" };
    rpc.mockImplementationOnce(async () => ({ data: created, error: null }));
    const { billingRechargeRepository } = await import("./billing-recharge");

    const result = await billingRechargeRepository.createOrder({
      tenant_id: "tenant-1",
      order_no: "order-no-1",
      out_trade_no: "trade-no-1",
      idempotency_key: null,
      package_code: "credit_1000",
      credits: 1000,
      bonus_credits: 100,
      amount_fen: 10000,
      channel: "wechat_pay",
      status: "pending",
      created_by: "employee-1",
      payment_config_id: "config-1",
      expected_payment_config_guard_version: 7,
      payment_expires_at: "2026-07-18T02:05:00.000Z",
      metadata: { payer_openid: "openid-1" },
    });

    expect(rpc).toHaveBeenCalledWith(
      "billing_create_pending_wechat_recharge_order",
      expect.objectContaining({
        p_payment_config_id: "config-1",
        p_expected_guard_version: 7,
      }),
    );
    expect(result).toMatchObject(created);
  });

  test("maps only the exact config-version CAS failure to a retryable 409", async () => {
    rpc.mockImplementationOnce(async () => ({
      data: null,
      error: {
        code: "23514",
        message: "BILLING_RECHARGE_PAYMENT_CONFIG_VERSION_CHANGED",
      },
    }));
    const { billingRechargeRepository } = await import("./billing-recharge");

    await expect(billingRechargeRepository.createOrder({
      tenant_id: "tenant-1",
      order_no: "order-no-1",
      out_trade_no: "trade-no-1",
      idempotency_key: null,
      package_code: "credit_1000",
      credits: 1000,
      bonus_credits: 100,
      amount_fen: 10000,
      channel: "wechat_pay",
      status: "pending",
      created_by: "employee-1",
      payment_config_id: "config-1",
      expected_payment_config_guard_version: 7,
      payment_expires_at: "2026-07-18T02:05:00.000Z",
      metadata: {},
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "BILLING_RECHARGE_PAYMENT_CONFIG_VERSION_CHANGED",
    });
  });

  test("checks one matching pending wechat order by payment config id", async () => {
    queryResult = { data: [{ id: "order-1" }], error: null, count: null };
    const { billingRechargeRepository } = await import("./billing-recharge");

    const result = await billingRechargeRepository
      .hasPendingWechatOrdersForPaymentConfig("config-1");

    expect(select).toHaveBeenCalledWith("id");
    expect(eq.mock.calls).toEqual(expect.arrayContaining([
      ["payment_config_id", "config-1"],
      ["channel", "wechat_pay"],
      ["status", "pending"],
    ]));
    expect(limit).toHaveBeenCalledWith(1);
    expect(result).toBe(true);
  });

  test("returns false when the payment config has no pending wechat order", async () => {
    const { billingRechargeRepository } = await import("./billing-recharge");

    await expect(
      billingRechargeRepository.hasPendingWechatOrdersForPaymentConfig(
        "config-1",
      ),
    ).resolves.toBe(false);
  });

  test("wraps pending-order existence query failures", async () => {
    queryResult = {
      data: null,
      error: { message: "database detail" },
      count: null,
    };
    const { billingRechargeRepository } = await import("./billing-recharge");

    await expect(
      billingRechargeRepository.hasPendingWechatOrdersForPaymentConfig(
        "config-1",
      ),
    ).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      message: "检查微信充值待支付订单失败",
    });
  });

  test("claims one bounded page with at most 100 excluded order ids", async () => {
    const claimed = [{ id: "order-1", close_claim_token: "claim-1" }];
    const excludedOrderIds = Array.from(
      { length: 101 },
      (_, index) => `excluded-${index + 1}`,
    );
    rpc.mockImplementationOnce(async () => ({ data: claimed, error: null }));
    const { billingRechargeRepository } = await import("./billing-recharge");

    const result = await billingRechargeRepository.claimExpiredOrders({
      batchSize: 101,
      leaseSeconds: 2,
      excludedOrderIds,
    });

    expect(rpc).toHaveBeenCalledWith("billing_claim_expired_recharge_orders", {
      p_limit: 100,
      p_lease_seconds: 10,
      p_excluded_ids: excludedOrderIds.slice(0, 100),
    });
    expect(result.map((order) => ({
      id: order.id,
      close_claim_token: order.close_claim_token,
    }))).toEqual(claimed);
  });

  test("wraps claim RPC failures with the database error factory", async () => {
    rpc.mockImplementationOnce(async () => ({
      data: null,
      error: { message: "secret database detail" },
    }));
    const { billingRechargeRepository } = await import("./billing-recharge");

    await expect(billingRechargeRepository.claimExpiredOrders({
      batchSize: 50,
      leaseSeconds: 60,
      excludedOrderIds: [],
    })).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      message: "领取过期积分充值订单失败",
    });
  });

  test("renews only the matching pending claim through the database-clock RPC", async () => {
    const renewed = {
      id: "order-1",
      status: "pending",
      close_claim_token: "claim-1",
      close_claim_expires_at: "2026-07-18T03:00:11.000Z",
    };
    rpc.mockImplementationOnce(async () => ({ data: renewed, error: null }));
    const { billingRechargeRepository } = await import("./billing-recharge");

    const result = await billingRechargeRepository.renewCloseClaim({
      orderId: "order-1",
      claimToken: "claim-1",
      leaseSeconds: 2,
    });

    expect(rpc).toHaveBeenCalledWith("billing_renew_recharge_close_claim", {
      p_order_id: "order-1",
      p_claim_token: "claim-1",
      p_lease_seconds: 10,
    });
    expect(result?.id).toBe(renewed.id);
    expect(result?.close_claim_expires_at).toBe(renewed.close_claim_expires_at);
  });

  test("returns null when renewal ownership is lost", async () => {
    rpc.mockImplementationOnce(async () => ({ data: null, error: null }));
    const { billingRechargeRepository } = await import("./billing-recharge");

    await expect(billingRechargeRepository.renewCloseClaim({
      orderId: "order-1",
      claimToken: "stale-claim",
      leaseSeconds: 60,
    })).resolves.toBeNull();
  });

  test("wraps claim renewal database failures", async () => {
    rpc.mockImplementationOnce(async () => ({
      data: null,
      error: { message: "database detail" },
    }));
    const { billingRechargeRepository } = await import("./billing-recharge");

    await expect(billingRechargeRepository.renewCloseClaim({
      orderId: "order-1",
      claimToken: "claim-1",
      leaseSeconds: 60,
    })).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      message: "续租积分充值关单领取失败",
    });
  });

  test("conditionally marks a claimed pending order closed", async () => {
    const closed = { id: "order-1", status: "closed" };
    maybeSingle.mockImplementationOnce(async () => ({ data: closed, error: null }));
    const { billingRechargeRepository } = await import("./billing-recharge");

    const result = await billingRechargeRepository.markOrderClosed({
      orderId: "order-1",
      claimToken: "claim-1",
      closedAt: new Date("2026-07-18T03:00:01.000Z"),
    });

    expect(update).toHaveBeenCalledWith({
      status: "closed",
      closed_at: "2026-07-18T03:00:01.000Z",
      close_claim_token: null,
      close_claim_expires_at: null,
      close_last_error: null,
    });
    expect(eq.mock.calls).toEqual(expect.arrayContaining([
      ["id", "order-1"],
      ["status", "pending"],
      ["close_claim_token", "claim-1"],
    ]));
    expect(result).toMatchObject(closed);
  });

  test("releases only the matching claim and truncates diagnostics", async () => {
    const { billingRechargeRepository } = await import("./billing-recharge");

    await billingRechargeRepository.releaseCloseClaim({
      orderId: "order-1",
      claimToken: "claim-1",
      errorMessage: "x".repeat(600),
    });

    expect(update).toHaveBeenCalledWith({
      close_claim_token: null,
      close_claim_expires_at: null,
      close_last_error: "x".repeat(500),
    });
    expect(eq.mock.calls).toEqual(expect.arrayContaining([
      ["id", "order-1"],
      ["status", "pending"],
      ["close_claim_token", "claim-1"],
    ]));
  });

  test("clears a previous diagnostic when releasing a recovered claim", async () => {
    const { billingRechargeRepository } = await import("./billing-recharge");

    await billingRechargeRepository.releaseCloseClaim({
      orderId: "order-1",
      claimToken: "claim-1",
      errorMessage: null,
    });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      close_last_error: null,
    }));
  });

  test("wraps conditional close database failures", async () => {
    maybeSingle.mockImplementationOnce(async () => ({
      data: null,
      error: { message: "database detail" },
    }));
    const { billingRechargeRepository } = await import("./billing-recharge");

    await expect(billingRechargeRepository.markOrderClosed({
      orderId: "order-1",
      claimToken: "claim-1",
      closedAt: new Date("2026-07-18T03:00:01.000Z"),
    })).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      message: "关闭过期积分充值订单失败",
    });
  });

  test("wraps claim release database failures", async () => {
    maybeSingle.mockImplementationOnce(async () => ({
      data: null,
      error: { message: "database detail" },
    }));
    const { billingRechargeRepository } = await import("./billing-recharge");

    await expect(billingRechargeRepository.releaseCloseClaim({
      orderId: "order-1",
      claimToken: "claim-1",
      errorMessage: "STABLE_DIAGNOSTIC",
    })).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      message: "释放积分充值关单领取失败",
    });
  });
});
