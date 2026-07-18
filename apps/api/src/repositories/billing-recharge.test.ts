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
const maybeSingle = mock(async () => ({ data: null as unknown, error: null as unknown }));
const query = {
  select,
  update,
  eq,
  or: mock(() => query),
  order: mock(() => query),
  range,
  maybeSingle,
  then: (
    resolve: (value: { data: unknown[]; error: null; count: number }) => unknown,
  ) => Promise.resolve({ data: [], error: null, count: 0 }).then(resolve),
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
    maybeSingle.mockClear();
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

  test("claims one bounded page of expired orders through the lease RPC", async () => {
    const claimed = [{ id: "order-1", close_claim_token: "claim-1" }];
    rpc.mockImplementationOnce(async () => ({ data: claimed, error: null }));
    const { billingRechargeRepository } = await import("./billing-recharge");

    const result = await billingRechargeRepository.claimExpiredOrders({
      now: new Date("2026-07-18T03:00:00.000Z"),
      batchSize: 101,
      leaseSeconds: 2,
    });

    expect(rpc).toHaveBeenCalledWith("billing_claim_expired_recharge_orders", {
      p_now: "2026-07-18T03:00:00.000Z",
      p_limit: 100,
      p_lease_seconds: 10,
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
      now: new Date("2026-07-18T03:00:00.000Z"),
      batchSize: 50,
      leaseSeconds: 60,
    })).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      message: "领取过期积分充值订单失败",
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
