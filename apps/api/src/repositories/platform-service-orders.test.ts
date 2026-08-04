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
let maybeResult: { data: unknown; error: unknown } = {
  data: null,
  error: null,
};
let singleResult: { data: unknown; error: unknown } = {
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

describe("PlatformServiceOrderRepository", () => {
  beforeEach(() => {
    calls.length = 0;
    listResult = { data: [], error: null, count: 0 };
    maybeResult = { data: null, error: null };
    singleResult = { data: null, error: null };
    rpcResult = { data: null, error: null };
    query.maybeSingle.mockClear();
    query.single.mockClear();
    client.rpc.mockClear();
  });

  test("lists enabled products with range pagination and selected columns", async () => {
    const { PlatformServiceOrderRepository } = await import(
      "./platform-service-orders"
    );
    const repository = new PlatformServiceOrderRepository(() => client);

    await repository.listEnabledProducts({ page: 2, pageSize: 20 });

    expect(calls).toContainEqual(["from", "platform_service_products"]);
    expect(calls).toContainEqual(["eq", "status", "enabled"]);
    expect(calls).toContainEqual(["range", 20, 39]);
    const selectCall = calls.find(([method]) => method === "select");
    expect(selectCall?.[1]).toContain("published_version");
    expect(selectCall?.[1]).not.toBe("*");
    expect(selectCall?.[1]).not.toContain("created_by_employee_id");
    expect(selectCall?.[1]).not.toContain("updated_by_employee_id");
  });

  test("lists orders by tenant without internal payment binding fields", async () => {
    const { PlatformServiceOrderRepository } = await import(
      "./platform-service-orders"
    );
    const repository = new PlatformServiceOrderRepository(() => client);

    await repository.listOrders({
      tenantId: "tenant-1",
      page: 1,
      pageSize: 10,
      paymentStatus: "pending",
      keyword: "TSO",
    });

    expect(calls).toContainEqual(["from", "tenant_service_orders"]);
    expect(calls).toContainEqual(["eq", "tenant_id", "tenant-1"]);
    expect(calls).toContainEqual(["eq", "payment_status", "pending"]);
    expect(calls).toContainEqual(["range", 0, 9]);
    expect(calls).toContainEqual(["ilike", "order_no", "%TSO%"]);
    const selectCall = calls.find(([method]) => method === "select");
    expect(selectCall?.[1]).not.toBe("*");
    expect(selectCall?.[1]).not.toContain("payer_openid");
    expect(selectCall?.[1]).not.toContain("payment_config_id");
    expect(selectCall?.[1]).not.toContain("payment_config_guard_version");
    expect(selectCall?.[1]).not.toContain("product_snapshot");
    expect(selectCall?.[1]).not.toContain("prepay_id");
    expect(selectCall?.[1]).not.toContain("transaction_id");
  });

  test("finds tenant order detail without internal payment binding fields", async () => {
    const { PlatformServiceOrderRepository } = await import(
      "./platform-service-orders"
    );
    const repository = new PlatformServiceOrderRepository(() => client);

    await repository.findOrderByTenantAndId({
      tenantId: "tenant-1",
      orderId: "order-1",
    });

    expect(calls).toContainEqual(["eq", "tenant_id", "tenant-1"]);
    expect(calls).toContainEqual(["eq", "id", "order-1"]);
    const selectCall = calls.find(([method]) => method === "select");
    expect(selectCall?.[1]).not.toContain("payer_openid");
    expect(selectCall?.[1]).not.toContain("payment_config_id");
    expect(selectCall?.[1]).not.toContain("product_snapshot");
  });

  test("loads internal payment fields only for payment continuation", async () => {
    const { PlatformServiceOrderRepository } = await import(
      "./platform-service-orders"
    );
    const repository = new PlatformServiceOrderRepository(() => client);

    await repository.findOrderForPaymentByTenantAndId({
      tenantId: "tenant-1",
      orderId: "order-1",
    });

    const selectCall = calls.find(([method]) => method === "select");
    expect(selectCall?.[1]).toContain("payer_openid");
    expect(selectCall?.[1]).toContain("payment_config_id");
    expect(selectCall?.[1]).toContain("prepay_id");
  });

  test("finds a platform product draft by id for publishing", async () => {
    const { PlatformServiceOrderRepository } = await import(
      "./platform-service-orders"
    );
    const repository = new PlatformServiceOrderRepository(() => client);

    await repository.findPlatformProductById("product-1");

    expect(calls).toContainEqual(["from", "platform_service_products"]);
    expect(calls).toContainEqual(["eq", "id", "product-1"]);
    const selectCall = calls.find(([method]) => method === "select");
    expect(selectCall?.[1]).toContain("terms_content");
    expect(selectCall?.[1]).toContain("published_version");
  });

  test("loads tenant products from the published version instead of editable draft fields", async () => {
    const { PlatformServiceOrderRepository } = await import(
      "./platform-service-orders"
    );
    const repository = new PlatformServiceOrderRepository(() => client);

    await repository.findEnabledProductByCode("platform_service_1y");

    const selectCall = calls.find(([method]) => method === "select");
    const selectedColumns = String(selectCall?.[1] ?? "");
    const productColumns = selectedColumns.split("published_version:")[0] ?? "";
    expect(selectedColumns).toContain("published_version");
    expect(productColumns).not.toContain("list_amount_fen");
    expect(productColumns).not.toContain("amount_fen");
    expect(calls).toContainEqual(["eq", "code", "platform_service_1y"]);
    expect(calls).toContainEqual(["eq", "status", "enabled"]);
  });

  test("publishes a product version through atomic RPC", async () => {
    const { PlatformServiceOrderRepository } = await import(
      "./platform-service-orders"
    );
    const repository = new PlatformServiceOrderRepository(() => client);
    rpcResult = {
      data: {
        id: "version-2",
        product_id: "product-1",
        version: 2,
      },
      error: null,
    };

    await repository.publishProductVersion({
      productId: "product-1",
      expectedVersion: 1,
      title: "平台服务",
      termYears: 1,
      listAmountFen: 100,
      amountFen: 80,
      serviceScope: ["部署"],
      termsVersion: 1,
      termsContent: "服务条款",
      employeeId: "employee-1",
    });

    expect(client.rpc).toHaveBeenCalledWith(
      "platform_service_publish_product_version",
      expect.objectContaining({
        p_product_id: "product-1",
        p_expected_version: 1,
        p_published_by_employee_id: "employee-1",
      }),
    );
    expect(calls).not.toContainEqual([
      "from",
      "platform_service_product_versions",
    ]);
  });

  test("requests refund review through atomic RPC", async () => {
    const { PlatformServiceOrderRepository } = await import(
      "./platform-service-orders"
    );
    const repository = new PlatformServiceOrderRepository(() => client);
    rpcResult = {
      data: {
        ok: true,
        idempotent: false,
        refund_request: { id: "refund-1" },
        order: { id: "order-1", payment_status: "refund_reviewing" },
      },
      error: null,
    };

    await repository.requestRefundReview({
      tenantId: "tenant-1",
      orderId: "order-1",
      expectedVersion: 1,
      idempotencyKey: "00000000-0000-4000-8000-000000000001",
      reason: "暂不需要服务",
      createdByEmployeeId: "employee-1",
    });

    expect(client.rpc).toHaveBeenCalledWith(
      "platform_service_request_refund_review",
      expect.objectContaining({
        p_tenant_id: "tenant-1",
        p_order_id: "order-1",
        p_expected_version: 1,
      }),
    );
  });

  test("creates a pending order through platform_service_create_pending_order", async () => {
    const { PlatformServiceOrderRepository } = await import(
      "./platform-service-orders"
    );
    const repository = new PlatformServiceOrderRepository(() => client);

    await repository.createPendingOrder({
      tenantId: "tenant-1",
      productId: "product-1",
      productVersionId: "version-1",
      orderNo: "TSO202608030001",
      outTradeNo: "TSO202608030001",
      idempotencyKey: "00000000-0000-4000-8000-000000000001",
      productCode: "platform_service_1y",
      pricingVersion: 1,
      productSnapshot: { title: "平台服务" },
      termYears: 1,
      amountFen: 100,
      paymentConfigId: "config-1",
      paymentConfigGuardVersion: 2,
      payerOpenid: "openid",
      paymentExpiresAt: "2026-08-03T12:05:00.000Z",
      termsVersion: 1,
      termsAcceptedAt: "2026-08-03T12:00:00.000Z",
      createdByEmployeeId: "employee-1",
    });

    expect(client.rpc).toHaveBeenCalledWith(
      "platform_service_create_pending_order",
      expect.objectContaining({
        p_tenant_id: "tenant-1",
        p_amount_fen: 100,
      }),
    );
  });

  test("maps database errors with Errors.dbError", async () => {
    const { PlatformServiceOrderRepository } = await import(
      "./platform-service-orders"
    );
    const repository = new PlatformServiceOrderRepository(() => client);
    listResult = {
      data: null,
      error: { message: "db failed" },
      count: null,
    };

    await expect(
      repository.listEnabledProducts({ page: 1, pageSize: 20 }),
    ).rejects.toMatchObject({ statusCode: 500 });
  });
});
