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
  gt(column: string, value: unknown) {
    calls.push(["gt", column, value]);
    return query;
  },
  gte(column: string, value: unknown) {
    calls.push(["gte", column, value]);
    return query;
  },
  lte(column: string, value: unknown) {
    calls.push(["lte", column, value]);
    return query;
  },
  ilike(column: string, value: string) {
    calls.push(["ilike", column, value]);
    return query;
  },
  or(filter: string) {
    calls.push(["or", filter]);
    return query;
  },
  order(column: string, options: unknown) {
    calls.push(["order", column, options]);
    return query;
  },
  range(from: number, to: number) {
    calls.push(["range", from, to]);
    return query;
  },
  limit(value: number) {
    calls.push(["limit", value]);
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
  rpc: mock(async (name: string, params: Record<string, unknown>) => {
    calls.push(["rpc", name, params]);
    return rpcResult;
  }),
};
const orderCreateInput = {
  tenant_id: "tenant-a",
  order_no: "order-no-1",
  out_trade_no: "trade-no-1",
  idempotency_key: "00000000-0000-4000-8000-000000000001",
  product_id: "product-1",
  product_code: "custom_support_branding_annual" as const,
  entitlement_code: "custom_support_branding" as const,
  product_name: "年度品牌技术支持",
  amount_fen: 1,
  term_years: 1 as const,
  purchase_notes: "自动开通一年",
  refund_policy: "数字权益支付成功并开通后不支持退款",
  status: "pending" as const,
  channel: "wechat_pay" as const,
  payer_openid: "openid-1",
  payment_config_id: "config-1",
  expected_guard_version: 2,
  payment_mchid: "mchid-1",
  payment_appid: "appid-1",
  payment_expires_at: "2026-07-28T08:05:00.000Z",
  created_by: "employee-1",
  metadata: {},
};
describe("BrandingAddonOrderRepository", () => {
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
  test("paginates and tenant-scopes the tenant order list", async () => {
    const { BrandingAddonOrderRepository } = await import(
      "./branding-addon-orders"
    );
    const repository = new BrandingAddonOrderRepository(() => client);
    await repository.listTenantOrders({
      tenantId: "tenant-a",
      page: 2,
      pageSize: 20,
      keyword: "BA-1",
    });
    expect(calls).toContainEqual(["eq", "tenant_id", "tenant-a"]);
    expect(calls).toContainEqual(["range", 20, 39]);
    const selectCall = calls.find(([method]) => method === "select");
    expect(selectCall?.[1]).toContain("payment_expires_at");
    expect(selectCall?.[1]).not.toBe("*");
    expect(selectCall?.[1]).not.toContain("payer_openid");
    expect(selectCall?.[1]).not.toContain("payment_config_id");
    expect(selectCall?.[1]).not.toContain("metadata");
    expect(selectCall?.[1]).not.toContain("close_claim_token");
    expect(calls).toContainEqual([
      "ilike",
      "order_no",
      "%BA-1%",
    ]);
  });
  test("clamps platform pagination and applies filters", async () => {
    const { BrandingAddonOrderRepository } = await import(
      "./branding-addon-orders"
    );
    const repository = new BrandingAddonOrderRepository(() => client);
    const page = await repository.listPlatformOrders({
      page: 0,
      pageSize: 150,
      tenantId: "tenant-a",
      status: "paid",
      keyword: "ORDER-1",
      createdFrom: "2026-07-01T00:00:00.000Z",
      createdTo: "2026-07-31T23:59:59.999Z",
    });
    expect(calls).toContainEqual(["range", 0, 99]);
    expect(calls).toContainEqual(["eq", "tenant_id", "tenant-a"]);
    expect(calls).toContainEqual(["eq", "status", "paid"]);
    expect(calls).toContainEqual([
      "or",
      'order_no.ilike."%ORDER-1%",out_trade_no.ilike."%ORDER-1%",transaction_id.ilike."%ORDER-1%"',
    ]);
    expect(calls).toContainEqual([
      "gte",
      "created_at",
      "2026-07-01T00:00:00.000Z",
    ]);
    expect(calls).toContainEqual([
      "lte",
      "created_at",
      "2026-07-31T23:59:59.999Z",
    ]);
    const selectCall = calls.find(([method]) => method === "select");
    for (const internalField of [
      "payer_openid",
      "payment_config_id",
      "expected_guard_version",
      "payment_mchid",
      "payment_appid",
      "metadata",
      "close_claim_token",
      "close_claim_expires_at",
      "close_last_error",
    ]) {
      expect(selectCall?.[1]).not.toContain(internalField);
    }
    expect(page.pagination).toMatchObject({ page: 1, pageSize: 100 });
  });
  test("always tenant-scopes order detail and deduplication lookups", async () => {
    const { BrandingAddonOrderRepository } = await import(
      "./branding-addon-orders"
    );
    const repository = new BrandingAddonOrderRepository(() => client);
    await repository.findTenantOrderById({
      tenantId: "tenant-a",
      orderId: "order-1",
    });
    expect(calls).toContainEqual(["eq", "tenant_id", "tenant-a"]);
    expect(calls).toContainEqual(["eq", "id", "order-1"]);
    const tenantDetailSelect = calls.find(([method]) => method === "select");
    expect(tenantDetailSelect?.[1]).toContain("refund_policy");
    expect(tenantDetailSelect?.[1]).not.toContain("payer_openid");
    expect(tenantDetailSelect?.[1]).not.toContain("metadata");
    calls.length = 0;
    await repository.findByIdempotencyKey({
      tenantId: "tenant-a",
      idempotencyKey: "idem-1",
    });
    expect(calls).toContainEqual(["eq", "tenant_id", "tenant-a"]);
    expect(calls).toContainEqual(["eq", "idempotency_key", "idem-1"]);
    calls.length = 0;
    await repository.findPendingByTenantProduct({
      tenantId: "tenant-a",
      productCode: "custom_support_branding_annual",
    });
    expect(calls).toContainEqual(["eq", "tenant_id", "tenant-a"]);
    expect(calls).toContainEqual(["eq", "status", "pending"]);
    expect(calls).toContainEqual([
      "eq",
      "product_code",
      "custom_support_branding_annual",
    ]);
    const internalSelect = calls.find(([method]) => method === "select");
    expect(internalSelect?.[1]).toContain("payer_openid");
    expect(internalSelect?.[1]).toContain("payment_config_id");
    expect(internalSelect?.[1]).not.toContain("metadata");
    expect(internalSelect?.[1]).not.toContain("close_claim_token");
  });
  test("keeps platform detail free of OpenID and close-worker fields", async () => {
    const { BrandingAddonOrderRepository } = await import(
      "./branding-addon-orders"
    );
    const repository = new BrandingAddonOrderRepository(() => client);
    await repository.findPlatformOrderById("order-1");
    const selectCall = calls.find(([method]) => method === "select");
    expect(selectCall?.[1]).toContain("refund_policy");
    expect(selectCall?.[1]).toContain("transaction_id");
    for (const internalField of [
      "payer_openid",
      "payment_config_id",
      "expected_guard_version",
      "payment_mchid",
      "payment_appid",
      "metadata",
      "close_claim_token",
      "close_claim_expires_at",
      "close_last_error",
    ]) {
      expect(selectCall?.[1]).not.toContain(internalField);
    }
  });

  test("conditionally stores prepay on a pending unexpired order", async () => {
    const { BrandingAddonOrderRepository } = await import(
      "./branding-addon-orders"
    );
    const repository = new BrandingAddonOrderRepository(() => client);
    await repository.markPrepayCreated({
      tenantId: "tenant-a",
      orderId: "order-1",
      prepayId: "prepay-1",
      now: new Date("2026-07-28T08:00:00.000Z"),
    });
    expect(calls).toContainEqual(["update", { prepay_id: "prepay-1" }]);
    expect(calls).toContainEqual(["eq", "tenant_id", "tenant-a"]);
    expect(calls).toContainEqual(["eq", "status", "pending"]);
    expect(calls).toContainEqual([
      "gt",
      "payment_expires_at",
      "2026-07-28T08:00:00.000Z",
    ]);
  });

  test("detects duplicate merchant and transaction identifiers", async () => {
    listResult = {
      data: [{ id: "order-1" }, { id: "order-2" }],
      error: null,
      count: null,
    };
    const { BrandingAddonOrderRepository } = await import(
      "./branding-addon-orders"
    );
    const repository = new BrandingAddonOrderRepository(() => client);

    await expect(repository.findByOutTradeNo("trade-no-1")).rejects
      .toMatchObject({ code: "BRANDING_ADDON_OUT_TRADE_NO_DUPLICATED" });
    expect(calls).toContainEqual(["limit", 2]);
    const callbackSelect = calls.find(([method]) => method === "select");
    expect(callbackSelect?.[1]).toContain("payment_config_id,payment_mchid,payment_appid");
    expect(callbackSelect?.[1]).not.toContain("payer_openid");
    expect(callbackSelect?.[1]).not.toContain("metadata");

    calls.length = 0;
    await expect(repository.findByTransactionId("transaction-1")).rejects
      .toMatchObject({ code: "BRANDING_ADDON_TRANSACTION_ID_DUPLICATED" });
    expect(calls).toContainEqual(["limit", 2]);
  });

  test("stores and updates idempotent callback notifications", async () => {
    const { BrandingAddonOrderRepository } = await import(
      "./branding-addon-orders"
    );
    const repository = new BrandingAddonOrderRepository(() => client);
    const notification = {
      tenant_id: "tenant-a",
      order_id: "order-1",
      notify_id: "notify-1",
      event_type: "TRANSACTION.SUCCESS",
      resource_type: "encrypt-resource",
      raw_payload: { id: "notify-1" },
      signature_valid: true,
      processed: false,
    };

    await repository.findNotificationByNotifyId("notify-1");
    expect(calls).toContainEqual(["eq", "notify_id", "notify-1"]);

    calls.length = 0;
    await repository.createNotification(notification);
    expect(calls).toContainEqual(["insert", notification]);

    calls.length = 0;
    await repository.markNotificationProcessed({
      notificationId: "notification-1",
      processedAt: new Date("2026-07-28T08:01:00.000Z"),
    });
    expect(calls).toContainEqual([
      "update",
      {
        processed: true,
        processed_at: "2026-07-28T08:01:00.000Z",
        error_message: null,
      },
    ]);

    calls.length = 0;
    await repository.markNotificationFailed({
      notificationId: "notification-1",
      errorMessage: "x".repeat(501),
    });
    const updateCall = calls.find(([method]) => method === "update");
    expect((updateCall?.[1] as { error_message: string }).error_message)
      .toHaveLength(500);
  });
  test("returns the existing notification after a concurrent notify-id insert", async () => {
    singleResult = {
      data: null,
      error: { code: "23505", message: "duplicate notify_id" },
    };
    maybeResult = {
      data: {
        id: "notification-1",
        notify_id: "notify-1",
        tenant_id: "tenant-a",
        order_id: "order-1",
        event_type: "TRANSACTION.SUCCESS",
        resource_type: "encrypt-resource",
      },
      error: null,
    };
    const { BrandingAddonOrderRepository } = await import(
      "./branding-addon-orders"
    );
    const repository = new BrandingAddonOrderRepository(() => client);

    const actual = await repository.createNotification({
      tenant_id: "tenant-a",
      order_id: "order-1",
      notify_id: "notify-1",
      event_type: "TRANSACTION.SUCCESS",
      resource_type: "encrypt-resource",
      raw_payload: { id: "notify-1" },
      signature_valid: true,
      processed: false,
    });

    expect(actual.id).toBe("notification-1");
    expect(calls).toContainEqual(["eq", "notify_id", "notify-1"]);
  });

  test("confirms one purchase through the exact atomic RPC contract", async () => {
    const confirmed = {
      idempotent: false,
      order: { id: "order-1", status: "paid" },
      entitlement: { id: "entitlement-1", status: "active" },
      event: { id: "event-1" },
      source_type: "purchase",
    };
    rpcResult = { data: confirmed, error: null };
    const { BrandingAddonOrderRepository } = await import(
      "./branding-addon-orders"
    );
    const repository = new BrandingAddonOrderRepository(() => client);

    const actual = await repository.confirmPurchase({
      orderId: "order-1",
      outTradeNo: "trade-no-1",
      transactionId: "transaction-1",
      paidAmountFen: 1,
      paidAt: "2026-07-28T08:01:00.000Z",
      mchid: "mchid-1",
      appid: "appid-1",
      notificationId: "notification-1",
      metadata: { confirmation_source: "wechat_callback" },
    });

    expect(calls).toContainEqual([
      "rpc",
      "branding_confirm_addon_purchase",
      {
        p_order_id: "order-1",
        p_out_trade_no: "trade-no-1",
        p_transaction_id: "transaction-1",
        p_paid_amount_fen: 1,
        p_paid_at: "2026-07-28T08:01:00.000Z",
        p_mchid: "mchid-1",
        p_appid: "appid-1",
        p_notification_id: "notification-1",
        p_metadata: { confirmation_source: "wechat_callback" },
      },
    ]);
    expect(actual.idempotent).toBe(false);
    expect(actual.order?.id).toBe("order-1");
    expect(actual.entitlement?.id).toBe("entitlement-1");
  });

  test("maps atomic confirmation tokens to stable business errors", async () => {
    rpcResult = {
      data: null,
      error: {
        code: "P0001",
        message: "Branding add-on payment amount mismatch",
        details: "BRANDING_ADDON_CALLBACK_AMOUNT_MISMATCH",
      },
    };
    const { BrandingAddonOrderRepository } = await import(
      "./branding-addon-orders"
    );
    const repository = new BrandingAddonOrderRepository(() => client);

    await expect(repository.confirmPurchase({
      orderId: "order-1",
      outTradeNo: "trade-no-1",
      transactionId: "transaction-1",
      paidAmountFen: 2,
      paidAt: "2026-07-28T08:01:00.000Z",
      mchid: "mchid-1",
      appid: "appid-1",
      notificationId: null,
      metadata: {},
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_ADDON_CALLBACK_AMOUNT_MISMATCH",
    });
  });
});
