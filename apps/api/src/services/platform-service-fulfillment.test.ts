import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { AtomicActionResult } from "@/repositories/platform-service-order-records";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const platformAuth = (
  permissions: AuthContext["permissions"],
): AuthContext => ({
  authUserId: "user-1",
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  employeeId: "admin-1",
  permissions,
  isPlatformAdmin: true,
  employeeName: "平台管理员",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["platform_admin"],
  roles: [],
});

const nonPlatformAuth = (): AuthContext => ({
  ...platformAuth([{ code: "platform.service_order.read", scope: "all" }]),
  isPlatformAdmin: false,
});

const orderRecord = {
  id: "order-1",
  tenant_id: "tenant-1",
  order_no: "TSO202608040001",
  product_code: "platform_service_1y",
  term_years: 1,
  amount_fen: 980000,
  payment_status: "paid",
  service_status: "waiting_assignment",
  payment_expires_at: "2026-08-04T10:05:00.000Z",
  paid_at: "2026-08-04T10:01:00.000Z",
  closed_at: null,
  prepay_id: null,
  terms_version: 1,
  version: 2,
  created_at: "2026-08-04T10:00:00.000Z",
  updated_at: "2026-08-04T10:01:00.000Z",
};

const workOrderRecord = {
  id: "work-1",
  tenant_id: "tenant-1",
  service_order_id: "order-1",
  order_no: "TSO202608040001",
  status: "waiting_assignment",
  assignee_employee_id: null,
  created_by_employee_id: "admin-1",
  version: 1,
  created_at: "2026-08-04T10:01:00.000Z",
  updated_at: "2026-08-04T10:01:00.000Z",
  order: {
    id: "order-1",
    order_no: "TSO202608040001",
    product_code: "platform_service_1y",
    term_years: 1,
    amount_fen: 980000,
    payment_status: "paid",
    service_status: "waiting_assignment",
    paid_at: "2026-08-04T10:01:00.000Z",
    tenant: {
      id: "tenant-1",
      name: "示例装企",
      status: "active",
    },
  },
};

const refundRequestRecord = {
  id: "refund-1",
  tenant_id: "tenant-1",
  service_order_id: "order-1",
  idempotency_key: "00000000-0000-4000-8000-000000000001",
  reason: "暂不需要服务",
  status: "reviewing",
  version: 1,
  created_by_employee_id: "employee-1",
  reviewed_by_employee_id: null,
  reviewed_at: null,
  review_remark: null,
  created_at: "2026-08-04T10:02:00.000Z",
  updated_at: "2026-08-04T10:02:00.000Z",
};

const shippingReportRecord = {
  id: "shipping-report-1",
  tenant_id: "tenant-1",
  service_order_id: "order-1",
  source: "tenant_acceptance" as const,
  status: "failed",
  attempt_count: 2,
  last_attempt_key: "00000000-0000-4000-8000-000000000901",
  request_payload: {
    logistics_type: 3,
    shipping_list: [{ item_desc: "客户专属系统环境已部署" }],
  },
  wechat_errcode: 10060004,
  wechat_errmsg: "WECHAT_ORDER_SHIPPING_UPLOAD_REJECTED",
  provider_request_id: null,
  last_attempt_at: "2026-08-04T10:30:00.000Z",
  succeeded_at: null,
  created_at: "2026-08-04T10:20:00.000Z",
  updated_at: "2026-08-04T10:30:00.000Z",
};

const repository = {
  listPlatformServiceOrders: mock(async () => ({
    list: [orderRecord],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  })),
  findPlatformServiceOrderById: mock(async () => orderRecord),
  listPlatformServiceWorkOrders: mock(async () => ({
    list: [workOrderRecord],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  })),
  findPlatformServiceWorkOrderById: mock(async () => workOrderRecord),
  assignServiceWorkOrder: mock(async () => ({
    workOrder: { ...workOrderRecord, status: "configuring", version: 2 },
    order: { ...orderRecord, service_status: "configuring", version: 3 },
  })),
  transitionServiceWorkOrder: mock(async () => ({
    workOrder: { ...workOrderRecord, status: "deploying", version: 2 },
    order: { ...orderRecord, service_status: "deploying", version: 3 },
  })),
  createFulfillmentRecord: mock(async () => ({ id: "record-1" })),
  upsertAcceptancePreparation: mock(async (): Promise<AtomicActionResult> => ({
    acceptancePreparation: null,
    order: null,
  })),
  confirmOverdueAcceptance: mock(async () => ({
    workOrder: null,
    order: null,
    acceptancePreparation: null,
  })),
  listPlatformServiceRefundRequests: mock(async () => ({
    list: [refundRequestRecord],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  })),
  reviewServiceRefundRequest: mock(async () => ({
    refundRequest: { ...refundRequestRecord, status: "rejected" },
    order: { ...orderRecord, payment_status: "paid" },
  })),
};

const shippingReportRepository = {
  listByServiceOrderIds: mock(async () => [shippingReportRecord]),
  findByServiceOrderId: mock(async () => shippingReportRecord),
  findReportableOrderById: mock(async () => ({
    ...orderRecord,
    tenant_id: "tenant-1",
    payment_status: "paid",
    service_status: "accepted",
    payer_openid: "openid-1",
    transaction_id: "4200000000202608040000000001",
    out_trade_no: "TSO202608040001",
    product_snapshot: { title: "平台年度技术服务" },
  })),
};

const orderShippingReporter = {
  reportAcceptedOrder: mock(async () => ({
    status: "succeeded" as const,
    idempotent: false,
    report: {
      ...shippingReportRecord,
      status: "succeeded" as const,
      wechat_errcode: 0,
      wechat_errmsg: "ok",
      succeeded_at: "2026-08-04T10:35:00.000Z",
    },
    error_code: null,
    skipped_reason: null,
  })),
};

describe("PlatformServiceFulfillmentService", () => {
  beforeEach(() => {
    for (const fn of Object.values(repository)) {
      if ("mockClear" in fn) fn.mockClear();
    }
    for (const fn of Object.values(shippingReportRepository)) {
      if ("mockClear" in fn) fn.mockClear();
    }
    orderShippingReporter.reportAcceptedOrder.mockClear();
  });

  test("lists platform service orders with read permission", async () => {
    const { PlatformServiceFulfillmentService } = await import(
      "./platform-service-fulfillment"
    );
    const service = new PlatformServiceFulfillmentService({
      repository,
      shippingReportRepository,
    } as never);

    const result = await service.listOrders(
      platformAuth([{ code: "platform.service_order.read", scope: "all" }]),
      { page: 1, pageSize: 20, paymentStatus: "paid" },
    );

    expect(repository.listPlatformServiceOrders).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20, paymentStatus: "paid" }),
    );
    expect(result.list[0]).toMatchObject({
      id: "order-1",
      available_actions: expect.any(Object),
      wechat_shipping_report: {
        id: "shipping-report-1",
        status: "failed",
        attempt_count: 2,
        wechat_errcode: 10060004,
      },
    });
    expect(shippingReportRepository.listByServiceOrderIds)
      .toHaveBeenCalledWith(["order-1"]);
  });

  test("retries WeChat shipping report for accepted paid service orders", async () => {
    const { PlatformServiceFulfillmentService } = await import(
      "./platform-service-fulfillment"
    );
    const service = new PlatformServiceFulfillmentService({
      repository,
      shippingReportRepository,
      orderShippingReporter,
    } as never);

    const result = await service.retryOrderShippingReport(
      platformAuth([{ code: "platform.service_work_order.manage", scope: "all" }]),
      "order-1",
    );

    expect(shippingReportRepository.findReportableOrderById)
      .toHaveBeenCalledWith("order-1");
    expect(orderShippingReporter.reportAcceptedOrder).toHaveBeenCalledWith({
      order: expect.objectContaining({
        id: "order-1",
        payer_openid: "openid-1",
        transaction_id: "4200000000202608040000000001",
      }),
      source: "platform_acceptance",
    });
    expect(result.order.wechat_shipping_report).toMatchObject({
      status: "succeeded",
      wechat_errcode: 0,
    });
  });

  test("returns a stable retry-not-ready error when order cannot be reported", async () => {
    const { PlatformServiceFulfillmentService } = await import(
      "./platform-service-fulfillment"
    );
    const skippedReporter = {
      reportAcceptedOrder: mock(async () => ({
        status: "skipped" as const,
        idempotent: false,
        report: null,
        error_code: null,
        skipped_reason: "ORDER_NOT_ACCEPTED",
      })),
    };
    const service = new PlatformServiceFulfillmentService({
      repository,
      shippingReportRepository,
      orderShippingReporter: skippedReporter,
    } as never);

    await expect(
      service.retryOrderShippingReport(
        platformAuth([{ code: "platform.service_work_order.manage", scope: "all" }]),
        "order-1",
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "SERVICE_ORDER_SHIPPING_REPORT_NOT_READY",
      details: { reason: "ORDER_NOT_ACCEPTED" },
    });
  });

  test("rejects non-platform users", async () => {
    const { PlatformServiceFulfillmentService } = await import(
      "./platform-service-fulfillment"
    );
    const service = new PlatformServiceFulfillmentService({ repository });

    await expect(service.listOrders(nonPlatformAuth(), {}))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  test("assigns and transitions work orders with manage permission", async () => {
    const { PlatformServiceFulfillmentService } = await import(
      "./platform-service-fulfillment"
    );
    const service = new PlatformServiceFulfillmentService({ repository });
    const auth = platformAuth([{
      code: "platform.service_work_order.manage",
      scope: "all",
    }]);

    await service.assignWorkOrder(auth, "work-1", {
      assignee_employee_id: "employee-2",
      expected_version: 1,
      metadata: {},
    });
    await service.transitionWorkOrder(auth, "work-1", {
      to_status: "deploying",
      expected_version: 2,
      metadata: {},
    });

    expect(repository.assignServiceWorkOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        workOrderId: "work-1",
        assigneeEmployeeId: "employee-2",
        operatorEmployeeId: "admin-1",
      }),
    );
    expect(repository.transitionServiceWorkOrder).toHaveBeenCalledWith(
      expect.objectContaining({ toStatus: "deploying", expectedVersion: 2 }),
    );
  });

  test("lists work orders with related order and tenant summary", async () => {
    const { PlatformServiceFulfillmentService } = await import(
      "./platform-service-fulfillment"
    );
    const service = new PlatformServiceFulfillmentService({ repository });

    const result = await service.listWorkOrders(
      platformAuth([{
        code: "platform.service_work_order.manage",
        scope: "all",
      }]),
      { page: 1, pageSize: 20 },
    );

    expect(result.list[0]).toMatchObject({
      id: "work-1",
      order: {
        id: "order-1",
        product_code: "platform_service_1y",
        amount_fen: 980000,
        tenant: {
          id: "tenant-1",
          name: "示例装企",
        },
      },
    });
  });

  test("maps work-order version conflicts to stable business errors", async () => {
    const { PlatformServiceFulfillmentService } = await import(
      "./platform-service-fulfillment"
    );
    const service = new PlatformServiceFulfillmentService({
      repository: {
        ...repository,
        assignServiceWorkOrder: mock(async () => ({
          workOrder: null,
          order: null,
          errorCode: "SERVICE_WORK_ORDER_VERSION_CONFLICT",
        })),
      },
    });

    await expect(service.assignWorkOrder(
      platformAuth([{ code: "platform.service_work_order.manage", scope: "all" }]),
      "work-1",
      { assignee_employee_id: "employee-2", expected_version: 1, metadata: {} },
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "SERVICE_WORK_ORDER_VERSION_CONFLICT",
    });
  });

  test("reviews refund requests with dedicated review permission", async () => {
    const { PlatformServiceFulfillmentService } = await import(
      "./platform-service-fulfillment"
    );
    const service = new PlatformServiceFulfillmentService({ repository });

    await service.reviewRefundRequest(
      platformAuth([{ code: "platform.service_refund.review", scope: "all" }]),
      "refund-1",
      {
        decision: "rejected",
        expected_version: 1,
        review_remark: "服务已开始实施",
      },
    );

    expect(repository.reviewServiceRefundRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        refundRequestId: "refund-1",
        decision: "rejected",
        operatorEmployeeId: "admin-1",
      }),
    );
  });

  test("derives fulfillment context from the target work order", async () => {
    const { PlatformServiceFulfillmentService } = await import(
      "./platform-service-fulfillment"
    );
    const service = new PlatformServiceFulfillmentService({ repository });
    const canonicalFileId = "abcdefab-cdef-4abc-8def-abcdefabcdef";

    await service.createFulfillmentRecord(
      platformAuth([{ code: "platform.service_work_order.manage", scope: "all" }]),
      "work-1",
      {
        record_type: "server_configuration",
        title: "服务器配置",
        content: "已完成配置",
        occurred_at: "2026-08-04T10:00:00+08:00",
        file_ids: [canonicalFileId.toUpperCase(), canonicalFileId],
      },
    );

    expect(repository.findPlatformServiceWorkOrderById).toHaveBeenCalledWith(
      "work-1",
    );
    expect(repository.createFulfillmentRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        serviceOrderId: "order-1",
        workOrderId: "work-1",
        fileIds: [canonicalFileId],
      }),
    );
  });

});
