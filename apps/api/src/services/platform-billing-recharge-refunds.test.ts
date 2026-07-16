import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { TenantCreditOrderRecord } from "@/repositories/billing-recharge";
import type { PlatformRechargeRefundRequestRecord } from "@/repositories/platform-billing-recharge-refunds";
import type { TenantCreditRefundRequestRecord } from "@/repositories/billing-recharge-refunds";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const order = {
  id: "order-1",
  tenant_id: "tenant-1",
  order_no: "TC202607020001",
  idempotency_key: "idem-1",
  package_code: "credit_1000",
  credits: 1000,
  amount_fen: 10000,
  bonus_credits: 100,
  channel: "wechat_pay",
  status: "paid",
  paid_at: "2026-07-02T08:03:00.000Z",
  created_by: "employee-1",
  remark: null,
  metadata: {},
  payment_config_id: "platform-config-1",
  out_trade_no: "TC202607020001",
  prepay_id: null,
  transaction_id: "4200000001",
  paid_amount_fen: 10000,
  closed_at: null,
  latest_notification_id: null,
  refund_status: "pending_review",
  refund_requested_at: "2026-07-10T08:00:00.000Z",
  refunded_at: null,
  refund_amount_fen: null,
  created_at: "2026-07-02T08:01:00.000Z",
  updated_at: "2026-07-10T08:00:00.000Z",
} satisfies TenantCreditOrderRecord;

const refundRequest = {
  id: "refund-request-1",
  tenant_id: "tenant-1",
  order_id: "order-1",
  request_no: "TRR202607100800000001",
  idempotency_key: "550e8400-e29b-41d4-a716-446655440000",
  status: "pending_review",
  reason: "客户误充值，需要申请退款",
  requested_amount_fen: 10000,
  requested_credits: 1100,
  requested_by_employee_id: "employee-1",
  reviewed_by_employee_id: null,
  reviewed_at: null,
  review_note: null,
  out_refund_no: null,
  wechat_refund_id: null,
  refund_amount_fen: null,
  refunded_at: null,
  failure_message: null,
  metadata: {},
  created_at: "2026-07-10T08:00:00.000Z",
  updated_at: "2026-07-10T08:00:00.000Z",
} satisfies TenantCreditRefundRequestRecord;

const requestWithOrder = {
  ...refundRequest,
  order,
  tenant: { id: "tenant-1", name: "固始晴天装饰", slug: "qingtian" },
} satisfies PlatformRechargeRefundRequestRecord;

const approvedRequest = {
  ...requestWithOrder,
  status: "approved",
  reviewed_by_employee_id: "employee-platform",
  reviewed_at: "2026-07-15T10:00:00.000Z",
  review_note: "同意退款，进入退款执行",
} satisfies PlatformRechargeRefundRequestRecord;

const rejectedRequest = {
  ...requestWithOrder,
  status: "rejected",
  reviewed_by_employee_id: "employee-platform",
  reviewed_at: "2026-07-15T10:00:00.000Z",
  review_note: "积分已消费，不予退款",
} satisfies PlatformRechargeRefundRequestRecord;

const refundingExecutionRequest = {
  ...approvedRequest,
  status: "refunding",
  out_refund_no: "TRR202607100800000001",
} satisfies PlatformRechargeRefundRequestRecord;

const authContext = {
  authUserId: "auth-platform",
  employeeId: "employee-platform",
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  isPlatformAdmin: true,
  employeeName: "平台超管",
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
  permissions: [
    { code: "platform.billing.recharge_refund.read", scope: "all" },
    { code: "platform.billing.recharge_refund.review", scope: "all" },
  ],
} satisfies AuthContext;

const repository = {
  listRequests: mock(async () => ({
    list: [requestWithOrder],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  })),
  findRequestById: mock(
    async (): Promise<PlatformRechargeRefundRequestRecord | null> =>
      requestWithOrder,
  ),
  reviewRequest: mock(
    async (): Promise<PlatformRechargeRefundRequestRecord | null> =>
      approvedRequest,
  ),
  markOrderRefundStatus: mock(
    async (): Promise<TenantCreditOrderRecord> => ({
      ...order,
      refund_status: "approved",
    }),
  ),
};

const auditLogService = {
  recordBestEffort: mock(async () => null),
};

const executionService = {
  execute: mock(async () => ({
    request: refundingExecutionRequest,
    wechat_refund: {
      out_refund_no: "TRR202607100800000001",
      refund_id: "5030000000202607150000000001",
      status: "PROCESSING",
      raw: {},
    },
  })),
};

async function createService() {
  const { PlatformBillingRechargeRefundService } = await import(
    "./platform-billing-recharge-refunds"
  );
  return new PlatformBillingRechargeRefundService({
    repository,
    auditLogService,
    executionService,
    nowFactory: () => new Date("2026-07-15T10:00:00.000Z"),
  });
}

describe("PlatformBillingRechargeRefundService", () => {
  beforeEach(() => {
    for (const fn of [
      ...Object.values(repository),
      ...Object.values(auditLogService),
      ...Object.values(executionService),
    ]) {
      fn.mockClear();
    }
    repository.listRequests.mockImplementation(async () => ({
      list: [requestWithOrder],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    }));
    repository.findRequestById.mockImplementation(async () => requestWithOrder);
    repository.reviewRequest.mockImplementation(async () => approvedRequest);
    repository.markOrderRefundStatus.mockImplementation(
      async (): Promise<TenantCreditOrderRecord> => ({
        ...order,
        refund_status: "approved",
      }),
    );
    executionService.execute.mockImplementation(async () => ({
      request: refundingExecutionRequest,
      wechat_refund: {
        out_refund_no: "TRR202607100800000001",
        refund_id: "5030000000202607150000000001",
        status: "PROCESSING",
        raw: {},
      },
    }));
  });

  test("lists refund requests for platform users with read permission", async () => {
    const service = await createService();

    const result = await service.list(authContext, {
      page: 1,
      pageSize: 20,
      status: "pending_review",
      keyword: "TC202607",
    });

    expect(repository.listRequests).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      status: "pending_review",
      keyword: "TC202607",
    });
    expect(result.list[0]).toMatchObject({
      id: "refund-request-1",
      request_no: "TRR202607100800000001",
      tenant: { name: "固始晴天装饰" },
      order: { order_no: "TC202607020001" },
    });
  });

  test("approves a pending refund request and writes audit log", async () => {
    const service = await createService();

    const result = await service.approve(authContext, "refund-request-1", {
      review_note: " 同意退款，进入退款执行 ",
    });

    expect(repository.findRequestById).toHaveBeenCalledWith("refund-request-1");
    expect(repository.reviewRequest).toHaveBeenCalledWith({
      id: "refund-request-1",
      fromStatuses: ["pending_review"],
      status: "approved",
      reviewedByEmployeeId: "employee-platform",
      reviewedAt: "2026-07-15T10:00:00.000Z",
      reviewNote: "同意退款，进入退款执行",
    });
    expect(repository.markOrderRefundStatus).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      orderId: "order-1",
      refundStatus: "approved",
    });
    expect(auditLogService.recordBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "platform_billing_recharge_refund_approve",
        actorEmployeeId: "employee-platform",
        actorUserId: "auth-platform",
        targetTenantId: "tenant-1",
        resourceType: "tenant_credit_refund_request",
        resourceId: "refund-request-1",
        resourceLabel: "TRR202607100800000001",
      }),
    );
    expect(result).toMatchObject({ request: { status: "approved" } });
  });

  test("rejects an approved refund request and writes audit log", async () => {
    repository.findRequestById.mockImplementation(async () => ({
      ...requestWithOrder,
      status: "approved",
    } satisfies PlatformRechargeRefundRequestRecord));
    repository.reviewRequest.mockImplementation(async () => rejectedRequest);
    repository.markOrderRefundStatus.mockImplementation(
      async (): Promise<TenantCreditOrderRecord> => ({
        ...order,
        refund_status: "rejected",
      }),
    );
    const service = await createService();

    const result = await service.reject(authContext, "refund-request-1", {
      review_note: "积分已消费，不予退款",
    });

    expect(repository.reviewRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        fromStatuses: ["pending_review", "approved"],
        status: "rejected",
      }),
    );
    expect(repository.markOrderRefundStatus).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      orderId: "order-1",
      refundStatus: "rejected",
    });
    expect(auditLogService.recordBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "platform_billing_recharge_refund_reject",
        resourceType: "tenant_credit_refund_request",
        resourceId: "refund-request-1",
      }),
    );
    expect(result).toMatchObject({ request: { status: "rejected" } });
  });

  test("rejects review without review permission", async () => {
    const service = await createService();

    await expect(
      service.approve(
        { ...authContext, permissions: [{ code: "platform.billing.recharge_refund.read", scope: "all" }] },
        "refund-request-1",
        { review_note: "同意退款" },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(repository.findRequestById).not.toHaveBeenCalled();
  });

  test("rejects invalid review state", async () => {
    repository.findRequestById.mockImplementation(async () => ({
      ...requestWithOrder,
      status: "refunding",
    } satisfies PlatformRechargeRefundRequestRecord));
    const service = await createService();

    await expect(
      service.approve(authContext, "refund-request-1", {
        review_note: "同意退款",
      }),
    ).rejects.toMatchObject({
      code: "BILLING_RECHARGE_REFUND_REVIEW_STATE_INVALID",
    });
    expect(repository.reviewRequest).not.toHaveBeenCalled();
  });

  test("executes refund request through execution service", async () => {
    const service = await createService();

    const result = await service.execute(authContext, "refund-request-1");

    expect(executionService.execute).toHaveBeenCalledWith(
      authContext,
      "refund-request-1",
    );
    expect(result).toMatchObject({
      request: {
        id: "refund-request-1",
        status: "refunding",
        out_refund_no: "TRR202607100800000001",
      },
      wechat_refund: { status: "PROCESSING" },
    });
  });
});
