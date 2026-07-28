import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const calls: Array<[string, ...unknown[]]> = [];
let listResult: { data: unknown; error: unknown; count: number | null } = {
  data: [],
  error: null,
  count: 0,
};
let singleResult: { data: unknown; error: unknown } = {
  data: null,
  error: null,
};
let maybeResult: { data: unknown; error: unknown } = {
  data: null,
  error: null,
};
let rpcResult: { data: unknown; error: unknown } = {
  data: null,
  error: null,
};
type QueryResult = typeof listResult;

const query = {
  select(columns: string, options?: unknown) {
    calls.push(["select", columns, options]);
    return query;
  },
  insert(record: Record<string, unknown>) {
    calls.push(["insert", record]);
    return query;
  },
  update(patch: Record<string, unknown>) {
    calls.push(["update", patch]);
    return query;
  },
  eq(column: string, value: unknown) {
    calls.push(["eq", column, value]);
    return query;
  },
  is(column: string, value: unknown) {
    calls.push(["is", column, value]);
    return query;
  },
  gt() {
    return query;
  },
  gte() {
    return query;
  },
  lte() {
    return query;
  },
  ilike() {
    return query;
  },
  or(filter: string) {
    calls.push(["or", filter]);
    return query;
  },
  order() {
    return query;
  },
  range() {
    return query;
  },
  limit() {
    return query;
  },
  maybeSingle: mock(async () => maybeResult),
  single: mock(async () => singleResult),
  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null,
  ) {
    return Promise.resolve(listResult).then(onfulfilled, onrejected);
  },
};

const client = {
  from(table: string) {
    calls.push(["from", table]);
    return query;
  },
  rpc: mock(async () => rpcResult),
};

describe("BrandingAddonOrderRepository hardening", () => {
  beforeEach(() => {
    calls.length = 0;
    listResult = { data: [], error: null, count: 0 };
    singleResult = { data: null, error: null };
    maybeResult = { data: null, error: null };
    rpcResult = { data: null, error: null };
    query.maybeSingle.mockClear();
    query.single.mockClear();
    client.rpc.mockClear();
  });

  test("quotes and escapes raw PostgREST or-filter values", async () => {
    const { BrandingAddonOrderRepository } = await import(
      "./branding-addon-orders"
    );
    const repository = new BrandingAddonOrderRepository(() => client);

    await repository.listPlatformOrders({
      keyword: "(),\"%_\\",
    });

    const filter = calls.find(([method]) => method === "or")?.[1];
    expect(filter).toBe(
      'order_no.ilike."%(),\\"\\\\%\\\\_\\\\\\\\%",' +
      'out_trade_no.ilike."%(),\\"\\\\%\\\\_\\\\\\\\%",' +
      'transaction_id.ilike."%(),\\"\\\\%\\\\_\\\\\\\\%"',
    );
  });

  test("does not expose query or unknown RPC diagnostics", async () => {
    const secretError = {
      message: "secret sql",
      details: "private row",
    };
    listResult = { data: null, error: secretError, count: null };
    const { BrandingAddonOrderRepository } = await import(
      "./branding-addon-orders"
    );
    const repository = new BrandingAddonOrderRepository(() => client);

    await expect(repository.listTenantOrders({
      tenantId: "tenant-a",
    })).rejects.toMatchObject({
      code: "DB_ERROR",
      details: undefined,
    });

    rpcResult = { data: null, error: secretError };
    await expect(repository.confirmPurchase({
      orderId: "order-1",
      outTradeNo: "trade-1",
      transactionId: "transaction-1",
      paidAmountFen: 1,
      paidAt: "2026-07-28T08:01:00.000Z",
      mchid: "mchid-1",
      appid: "appid-1",
      notificationId: null,
      metadata: {},
    })).rejects.toMatchObject({
      code: "DB_ERROR",
      details: undefined,
    });
  });

  test("does not overwrite a notification that is already processed", async () => {
    const { BrandingAddonOrderRepository } = await import(
      "./branding-addon-orders"
    );
    const repository = new BrandingAddonOrderRepository(() => client);

    const actual = await repository.markNotificationFailed({
      notificationId: "notification-1",
      errorMessage: "temporary failure",
    });

    expect(calls).toContainEqual(["eq", "processed", false]);
    expect(query.maybeSingle).toHaveBeenCalledTimes(1);
    expect(query.single).not.toHaveBeenCalled();
    expect(actual).toBeNull();
  });

  test("rejects a notify-id collision across order identities", async () => {
    singleResult = {
      data: null,
      error: { code: "23505", message: "duplicate notify_id" },
    };
    maybeResult = {
      data: {
        id: "notification-existing",
        notify_id: "notify-1",
        tenant_id: "tenant-b",
        order_id: "order-2",
        event_type: "TRANSACTION.SUCCESS",
      },
      error: null,
    };
    const { BrandingAddonOrderRepository } = await import(
      "./branding-addon-orders"
    );
    const repository = new BrandingAddonOrderRepository(() => client);

    await expect(repository.createNotification({
      tenant_id: "tenant-a",
      order_id: "order-1",
      notify_id: "notify-1",
      event_type: "TRANSACTION.SUCCESS",
      resource_type: "encrypt-resource",
      raw_payload: { id: "notify-1" },
      signature_valid: true,
      processed: false,
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_ADDON_NOTIFICATION_ID_COLLISION",
    });
  });
});
