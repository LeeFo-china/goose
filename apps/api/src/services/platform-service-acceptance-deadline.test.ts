import { describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const authContext = {
  authUserId: "user-1",
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  employeeId: "admin-1",
  permissions: [{ code: "platform.service_work_order.manage", scope: "all" }],
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
} satisfies AuthContext;

const baseOrder = {
  id: "order-1",
  tenant_id: "tenant-1",
  order_no: "TSO202608040001",
  product_code: "platform_service_1y",
  term_years: 1,
  amount_fen: 980000,
  payment_status: "paid",
  service_status: "accepted",
  payer_openid: "openid-1",
  transaction_id: "4200000000202608040000000001",
  out_trade_no: "TSO202608040001",
  product_snapshot: { title: "平台年度技术服务" },
  payment_expires_at: "2026-08-04T10:05:00.000Z",
  paid_at: "2026-08-04T10:01:00.000Z",
  closed_at: null,
  prepay_id: null,
  terms_version: 1,
  version: 2,
  created_at: "2026-08-04T10:00:00.000Z",
  updated_at: "2026-08-04T10:01:00.000Z",
};

const baseWorkOrder = {
  id: "work-1",
  tenant_id: "tenant-1",
  service_order_id: "order-1",
  order_no: "TSO202608040001",
  status: "awaiting_acceptance",
  assignee_employee_id: null,
  created_by_employee_id: "admin-1",
  version: 1,
  created_at: "2026-08-04T10:01:00.000Z",
  updated_at: "2026-08-04T10:01:00.000Z",
};

const baseAcceptancePreparation = {
  id: "acceptance-1",
  tenant_id: "tenant-1",
  service_order_id: "order-1",
  work_order_id: "work-1",
  status: "accepted",
  summary: "验收准备已提交",
  prepared_by_employee_id: "admin-1",
  prepared_at: "2026-08-01T10:00:00.000Z",
  submitted_at: "2026-08-01T10:00:00.000Z",
  acceptance_due_at: "2026-08-04T10:00:00.000Z",
  created_at: "2026-08-01T10:00:00.000Z",
  updated_at: "2026-08-04T10:01:00.000Z",
};

function createRepository() {
  return {
    listPlatformServiceOrders: mock(async () => ({ list: [], pagination: {} })),
    findPlatformServiceOrderById: mock(async () => baseOrder),
    listPlatformServiceWorkOrders: mock(async () => ({ list: [], pagination: {} })),
    findPlatformServiceWorkOrderById: mock(async () => baseWorkOrder),
    assignServiceWorkOrder: mock(async () => ({ order: null, workOrder: null })),
    transitionServiceWorkOrder: mock(async () => ({ order: null, workOrder: null })),
    createFulfillmentRecord: mock(async () => ({ id: "record-1" })),
    upsertAcceptancePreparation: mock(async () => ({ id: "acceptance-1" })),
    confirmOverdueAcceptance: mock(async () => ({
      workOrder: { ...baseWorkOrder, status: "accepted", version: 2 },
      order: baseOrder,
      acceptancePreparation: baseAcceptancePreparation,
    })),
    listPlatformServiceRefundRequests: mock(async () => ({ list: [], pagination: {} })),
    reviewServiceRefundRequest: mock(async () => ({ order: null, refundRequest: null })),
  };
}

describe("PlatformServiceFulfillmentService acceptance deadline", () => {
  test("adds configurable acceptance due time when submitting acceptance preparation", async () => {
    const { PlatformServiceFulfillmentService } = await import(
      "./platform-service-fulfillment"
    );
    const repository = createRepository();
    const settingsService = { getNumber: mock(async () => 3) };
    const service = new PlatformServiceFulfillmentService({
      repository,
      settingsService,
      nowFactory: () => new Date("2026-08-04T10:00:00.000Z"),
    } as never);

    await service.upsertAcceptancePreparation(authContext, "work-1", {
      status: "submitted",
      summary: "客户专属系统环境已部署，服务器配置及首次操作培训已完成。",
      file_ids: [],
    });

    expect(settingsService.getNumber).toHaveBeenCalledWith(
      "PLATFORM_SERVICE_ACCEPTANCE_WINDOW_DAYS",
      3,
      { min: 1, max: 30 },
    );
    expect(repository.upsertAcceptancePreparation).toHaveBeenCalledWith(
      expect.objectContaining({
        acceptanceDueAt: "2026-08-07T10:00:00.000Z",
      }),
    );
  });

  test("lets platform confirm overdue acceptance and reports WeChat fulfillment", async () => {
    const { PlatformServiceFulfillmentService } = await import(
      "./platform-service-fulfillment"
    );
    const repository = createRepository();
    const orderShippingReporter = {
      reportAcceptedOrder: mock(async () => ({
        status: "succeeded" as const,
        idempotent: false,
        report: null,
        error_code: null,
        skipped_reason: null,
      })),
    };
    const service = new PlatformServiceFulfillmentService({
      repository,
      orderShippingReporter,
      nowFactory: () => new Date("2026-08-04T10:05:00.000Z"),
    } as never);

    const result = await service.confirmOverdueAcceptance(
      authContext,
      "work-1",
      {
        expected_version: 1,
        remark: "客户超过 3 天未确认，平台根据履约材料确认验收",
        metadata: {},
      },
    );

    expect(repository.confirmOverdueAcceptance).toHaveBeenCalledWith(
      expect.objectContaining({ workOrderId: "work-1", expectedVersion: 1 }),
    );
    expect(orderShippingReporter.reportAcceptedOrder).toHaveBeenCalledWith({
      order: expect.objectContaining({ id: "order-1", service_status: "accepted" }),
      source: "platform_acceptance",
    });
    expect(result.acceptance_preparation).toMatchObject({
      status: "accepted",
      acceptance_due_at: "2026-08-04T10:00:00.000Z",
    });
  });
});
