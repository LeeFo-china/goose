import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const calls: Array<[string, ...unknown[]]> = [];
let listResult: { data: unknown; error: unknown } = { data: [], error: null };
let maybeResult: { data: unknown; error: unknown } = { data: null, error: null };
let rpcResult: { data: unknown; error: unknown } = { data: null, error: null };

const query = {
  select(columns: string) {
    calls.push(["select", columns]);
    return query;
  },
  eq(column: string, value: unknown) {
    calls.push(["eq", column, value]);
    return query;
  },
  in(column: string, values: unknown[]) {
    calls.push(["in", column, values]);
    return query;
  },
  limit(value: number) {
    calls.push(["limit", value]);
    return query;
  },
  maybeSingle: mock(async () => maybeResult),
  then<TResult1 = typeof listResult, TResult2 = never>(
    onfulfilled?: ((value: typeof listResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(listResult).then(onfulfilled, onrejected);
  },
};

const client = {
  from(table: string) {
    calls.push(["from", table]);
    return query;
  },
  rpc: mock(async (name: string, params: Record<string, unknown>) => {
    calls.push(["rpc", name, params]);
    return rpcResult;
  }),
};

describe("PlatformServiceOrderShippingReportRepository", () => {
  beforeEach(() => {
    calls.length = 0;
    listResult = { data: [], error: null };
    maybeResult = { data: null, error: null };
    rpcResult = { data: null, error: null };
    query.maybeSingle.mockClear();
    client.rpc.mockClear();
  });

  test("loads shipping reports for a bounded service order page in one query", async () => {
    const { PlatformServiceOrderShippingReportRepository } = await import(
      "./platform-service-order-shipping-reports"
    );
    const repository = new PlatformServiceOrderShippingReportRepository(() => client);

    await repository.listByServiceOrderIds(["order-1", "order-2", "order-1"]);

    expect(calls).toContainEqual(["from", "tenant_service_order_shipping_reports"]);
    expect(calls).toContainEqual(["in", "service_order_id", ["order-1", "order-2"]]);
    expect(calls).toContainEqual(["limit", 100]);
    const selectCall = calls.find(([method]) => method === "select");
    expect(selectCall?.[1]).not.toBe("*");
    expect(selectCall?.[1]).toContain("wechat_errcode");
    expect(selectCall?.[1]).not.toContain("access_token");
  });

  test("loads an internal reportable order for retry without exposing it through public list select", async () => {
    const { PlatformServiceOrderShippingReportRepository } = await import(
      "./platform-service-order-shipping-reports"
    );
    const repository = new PlatformServiceOrderShippingReportRepository(() => client);

    await repository.findReportableOrderById("order-1");

    expect(calls).toContainEqual(["from", "tenant_service_orders"]);
    expect(calls).toContainEqual(["eq", "id", "order-1"]);
    const selectCall = calls.find(([method]) => method === "select");
    expect(selectCall?.[1]).toContain("payer_openid");
    expect(selectCall?.[1]).toContain("transaction_id");
  });
});
