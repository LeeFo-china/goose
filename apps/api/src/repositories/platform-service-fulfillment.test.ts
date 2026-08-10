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
  insert(record: Record<string, unknown> | Array<Record<string, unknown>>) {
    calls.push(["insert", record]);
    return query;
  },
  upsert(
    record: Record<string, unknown> | Array<Record<string, unknown>>,
    options: Record<string, unknown>,
  ) {
    calls.push(["upsert", record, options]);
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
  in(column: string, values: readonly unknown[]) {
    calls.push(["in", column, values]);
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

describe("PlatformServiceFulfillmentRepository", () => {
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

  test("lists platform service orders with bounded pagination and tenant keyword search", async () => {
    const { PlatformServiceFulfillmentRepository } = await import(
      "./platform-service-fulfillment"
    );
    const repository = new PlatformServiceFulfillmentRepository(() => client);

    await repository.listPlatformServiceOrders({
      page: 2,
      pageSize: 15,
      paymentStatus: "paid",
      serviceStatus: "deploying",
      tenantKeyword: "装企",
      keyword: "TSO",
    });

    expect(calls).toContainEqual(["from", "tenant_service_orders"]);
    expect(calls).toContainEqual(["eq", "payment_status", "paid"]);
    expect(calls).toContainEqual(["eq", "service_status", "deploying"]);
    expect(calls).toContainEqual(["range", 15, 29]);
    expect(calls).toContainEqual([
      "or",
      "order_no.ilike.%TSO%,product_code.ilike.%TSO%",
    ]);
    expect(calls).toContainEqual(["ilike", "tenant.name", "%装企%"]);
    const selectCall = calls.find(([method]) => method === "select");
    expect(selectCall?.[1]).not.toBe("*");
    expect(selectCall?.[1]).toContain("tenant:tenants");
    expect(selectCall?.[1]).toContain("transaction_id");
  });

  test("lists platform service work orders with bounded pagination", async () => {
    const { PlatformServiceFulfillmentRepository } = await import(
      "./platform-service-fulfillment"
    );
    const repository = new PlatformServiceFulfillmentRepository(() => client);

    await repository.listPlatformServiceWorkOrders({
      page: 1,
      pageSize: 20,
      status: "training",
      assigneeEmployeeId: "employee-1",
      keyword: "TSO",
    });

    expect(calls).toContainEqual(["from", "tenant_service_work_orders"]);
    expect(calls).toContainEqual(["eq", "status", "training"]);
    expect(calls).toContainEqual(["eq", "assignee_employee_id", "employee-1"]);
    expect(calls).toContainEqual(["range", 0, 19]);
    expect(calls).toContainEqual(["ilike", "order_no", "%TSO%"]);
    const selectCall = calls.find(([method]) => method === "select");
    expect(selectCall?.[1]).not.toBe("*");
    expect(selectCall?.[1]).toContain("order:tenant_service_orders");
  });

  test("runs work-order assignment and transition through atomic RPCs", async () => {
    const { PlatformServiceFulfillmentRepository } = await import(
      "./platform-service-fulfillment"
    );
    const repository = new PlatformServiceFulfillmentRepository(() => client);

    await repository.assignServiceWorkOrder({
      workOrderId: "work-1",
      assigneeEmployeeId: "employee-2",
      expectedVersion: 3,
      operatorEmployeeId: "admin-1",
      remark: "安排负责人",
      metadata: { source: "admin" },
    });
    await repository.transitionServiceWorkOrder({
      workOrderId: "work-1",
      toStatus: "deploying",
      expectedVersion: 4,
      operatorEmployeeId: "admin-1",
      remark: "开始部署",
      metadata: { source: "admin" },
    });

    expect(client.rpc).toHaveBeenCalledWith(
      "platform_service_assign_work_order",
      expect.objectContaining({
        p_work_order_id: "work-1",
        p_assignee_employee_id: "employee-2",
        p_expected_version: 3,
      }),
    );
    expect(client.rpc).toHaveBeenCalledWith(
      "platform_service_transition_work_order",
      expect.objectContaining({
        p_work_order_id: "work-1",
        p_to_status: "deploying",
        p_expected_version: 4,
      }),
    );
  });

  test("creates fulfillment records and attachments without N+1 reads", async () => {
    const { PlatformServiceFulfillmentRepository } = await import(
      "./platform-service-fulfillment"
    );
    const repository = new PlatformServiceFulfillmentRepository(() => client);
    singleResult = {
      data: { id: "record-1", work_order_id: "work-1" },
      error: null,
    };
    listResult = {
      data: [
        {
          id: "file-1",
          tenant_id: null,
          scene: "tenant_service_fulfillment_attachment",
          provider: "tencent_cos",
          visibility: "private",
          status: "active",
          deleted_at: null,
          created_by_employee_id: "admin-1",
          original_name: "部署说明.pdf",
          mime_type: "application/pdf",
          size_bytes: 2048,
        },
        {
          id: "file-2",
          tenant_id: null,
          scene: "tenant_service_fulfillment_attachment",
          provider: "tencent_cos",
          visibility: "private",
          status: "active",
          deleted_at: null,
          created_by_employee_id: "admin-1",
          original_name: "培训照片.png",
          mime_type: "image/png",
          size_bytes: 4096,
        },
      ],
      error: null,
      count: 2,
    };

    await repository.createFulfillmentRecord({
      tenantId: "tenant-1",
      serviceOrderId: "order-1",
      workOrderId: "work-1",
      recordType: "server_configuration",
      title: "服务器配置",
      content: "已完成配置",
      occurredAt: "2026-08-04T10:00:00.000Z",
      fileIds: ["file-1", "file-2"],
      createdByEmployeeId: "admin-1",
    });

    expect(calls).toContainEqual(["from", "tenant_service_fulfillment_records"]);
    expect(calls).toContainEqual(["from", "platform_file_objects"]);
    expect(calls).toContainEqual(["in", "id", ["file-1", "file-2"]]);
    expect(calls).toContainEqual(["from", "tenant_service_fulfillment_attachments"]);
    const insertCalls = calls.filter(([method]) => method === "insert");
    expect(insertCalls).toHaveLength(2);
    expect(insertCalls[1]?.[1]).toEqual([
      expect.objectContaining({
        file_id: "file-1",
        file_name: "部署说明.pdf",
        mime_type: "application/pdf",
        size_bytes: 2048,
      }),
      expect.objectContaining({
        file_id: "file-2",
        file_name: "培训照片.png",
        mime_type: "image/png",
        size_bytes: 4096,
      }),
    ]);
  });

  test("upserts acceptance preparation through the atomic RPC before attachments", async () => {
    const { PlatformServiceFulfillmentRepository } = await import(
      "./platform-service-fulfillment"
    );
    const repository = new PlatformServiceFulfillmentRepository(() => client);
    rpcResult = {
      data: {
        acceptance_preparation: {
          id: "acceptance-1",
          work_order_id: "work-1",
          status: "submitted",
        },
        order: { id: "order-1" },
        work_order: { id: "work-1" },
        error_code: null,
      },
      error: null,
    };
    listResult = {
      data: [{
        id: "file-1",
        tenant_id: null,
        scene: "tenant_service_fulfillment_attachment",
        provider: "tencent_cos",
        visibility: "private",
        status: "active",
        deleted_at: null,
        created_by_employee_id: "admin-1",
        original_name: "验收记录.pdf",
        mime_type: "application/pdf",
        size_bytes: 1024,
      }],
      error: null,
      count: 1,
    };

    const result = await repository.upsertAcceptancePreparation({
      tenantId: "tenant-1",
      serviceOrderId: "order-1",
      workOrderId: "work-1",
      status: "submitted",
      summary: "部署和培训已完成",
      fileIds: ["file-1"],
      preparedByEmployeeId: "admin-1",
      acceptanceDueAt: "2026-08-13T10:00:00.000Z",
    });

    expect(client.rpc).toHaveBeenCalledWith(
      "platform_service_upsert_acceptance_preparation",
      {
        p_work_order_id: "work-1",
        p_status: "submitted",
        p_summary: "部署和培训已完成",
        p_prepared_by_employee_id: "admin-1",
        p_acceptance_due_at: "2026-08-13T10:00:00.000Z",
      },
    );
    expect(calls).not.toContainEqual([
      "from",
      "tenant_service_acceptance_preparations",
    ]);
    const rpcPosition = calls.findIndex(([method]) => method === "rpc");
    const attachmentPosition = calls.findIndex((call) =>
      call[0] === "from" && call[1] === "tenant_service_fulfillment_attachments"
    );
    expect(attachmentPosition).toBeGreaterThan(rpcPosition);
    expect(calls.slice(attachmentPosition)).toContainEqual([
      "upsert",
      [expect.objectContaining({ file_id: "file-1" })],
      {
        onConflict: "work_order_id,fulfillment_record_id,file_id",
        ignoreDuplicates: true,
      },
    ]);
    expect(result).toMatchObject({
      acceptancePreparation: { id: "acceptance-1", status: "submitted" },
      errorCode: undefined,
    });
  });

  test("wraps acceptance preparation RPC database errors", async () => {
    const { PlatformServiceFulfillmentRepository } = await import(
      "./platform-service-fulfillment"
    );
    const repository = new PlatformServiceFulfillmentRepository(() => client);
    rpcResult = { data: null, error: { message: "rpc failed" } };

    await expect(repository.upsertAcceptancePreparation({
      tenantId: "tenant-1",
      serviceOrderId: "order-1",
      workOrderId: "work-1",
      status: "draft",
      summary: "部署准备",
      fileIds: [],
      preparedByEmployeeId: "admin-1",
      acceptanceDueAt: null,
    })).rejects.toMatchObject({ code: "DB_ERROR" });
  });

  test("reviews service refunds through the dedicated atomic RPC", async () => {
    const { PlatformServiceFulfillmentRepository } = await import(
      "./platform-service-fulfillment"
    );
    const repository = new PlatformServiceFulfillmentRepository(() => client);

    await repository.reviewServiceRefundRequest({
      refundRequestId: "refund-1",
      decision: "rejected",
      expectedVersion: 2,
      operatorEmployeeId: "admin-1",
      reviewRemark: "服务已开始实施",
    });

    expect(client.rpc).toHaveBeenCalledWith(
      "platform_service_review_refund_request",
      expect.objectContaining({
        p_refund_request_id: "refund-1",
        p_decision: "rejected",
        p_expected_version: 2,
      }),
    );
  });
});
