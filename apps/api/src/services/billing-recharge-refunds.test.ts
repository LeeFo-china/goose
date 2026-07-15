import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { BillingAccountBalance } from "@/repositories/billing";
import type { TenantCreditOrderRecord } from "@/repositories/billing-recharge";
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
  status: "pending",
  paid_at: null,
  created_by: "employee-1",
  remark: null,
  metadata: { product_snapshot: { code: "credit_1000" } },
  payment_config_id: "platform-config-1",
  out_trade_no: "TC202607020001",
  prepay_id: null,
  transaction_id: null,
  paid_amount_fen: 0,
  closed_at: null,
  latest_notification_id: null,
  created_at: "2026-07-02T08:01:00.000Z",
  updated_at: "2026-07-02T08:01:00.000Z",
} satisfies TenantCreditOrderRecord;

const paidOrder = {
  ...order,
  status: "paid",
  paid_at: "2026-07-02T08:03:00.000Z",
  paid_amount_fen: 10000,
  transaction_id: "4200000001",
} satisfies TenantCreditOrderRecord;

const refundRequestedOrder = {
  ...paidOrder,
  refund_status: "pending_review",
  refund_requested_at: "2026-07-10T08:00:00.000Z",
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

const account = {
  id: "account-1",
  tenant_id: "tenant-1",
  balance_credits: 2000,
  frozen_credits: 0,
  available_credits: 2000,
  total_recharged_credits: 2000,
  total_consumed_credits: 0,
  status: "active",
  last_activity_at: null,
  updated_at: "2026-07-02T08:00:00.000Z",
} satisfies BillingAccountBalance;

const orderRepository = {
  findOrderById: mock(
    async (): Promise<TenantCreditOrderRecord | null> => paidOrder,
  ),
  getAccountByTenantId: mock(async (): Promise<BillingAccountBalance> => account),
};

const refundRepository = {
  findByIdempotencyKey: mock(
    async (): Promise<TenantCreditRefundRequestRecord | null> => null,
  ),
  findActiveByOrderId: mock(
    async (): Promise<TenantCreditRefundRequestRecord | null> => null,
  ),
  create: mock(
    async (): Promise<TenantCreditRefundRequestRecord> => refundRequest,
  ),
  markOrderRefundRequested: mock(
    async (): Promise<TenantCreditOrderRecord> => refundRequestedOrder,
  ),
};

const accessPolicy = {
  assertTenantContext: mock((authContext: AuthContext) => {
    if (!authContext.tenantId) {
      throw Object.assign(new Error("缺少租户上下文"), {
        statusCode: 403,
        code: "TENANT_CONTEXT_REQUIRED",
      });
    }
    return authContext.tenantId;
  }),
  hasPermission: mock((authContext: AuthContext, permissionCode: string) =>
    authContext.permissions.some((permission) => permission.code === permissionCode)
  ),
};

const authContext = {
  authUserId: "auth-1",
  employeeId: "employee-1",
  tenantId: "tenant-1",
  tenantName: null,
  tenantSlug: null,
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "管理员",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: [],
  roles: [],
  permissions: [
    { code: "billing.recharge.create", scope: "all" },
    { code: "billing.recharge.read", scope: "all" },
  ],
} satisfies AuthContext;

const refundAuthContext = {
  ...authContext,
  permissions: [
    ...authContext.permissions,
    { code: "billing.recharge.refund.request", scope: "all" },
  ],
} satisfies AuthContext;

async function createService() {
  const { BillingRechargeRefundService } = await import(
    "./billing-recharge-refunds"
  );
  return new BillingRechargeRefundService({
    orderRepository,
    refundRepository,
    accessPolicyService: accessPolicy,
    requestNoFactory: () => "TRR202607100800000001",
    nowFactory: () => new Date("2026-07-10T08:00:00.000Z"),
  });
}

describe("BillingRechargeRefundService", () => {
  beforeEach(() => {
    for (const item of [
      ...Object.values(orderRepository),
      ...Object.values(refundRepository),
      accessPolicy.assertTenantContext,
      accessPolicy.hasPermission,
    ]) {
      item.mockClear();
    }
    orderRepository.findOrderById.mockImplementation(async () => paidOrder);
    orderRepository.getAccountByTenantId.mockImplementation(async () => account);
    refundRepository.findByIdempotencyKey.mockImplementation(async () => null);
    refundRepository.findActiveByOrderId.mockImplementation(async () => null);
    refundRepository.create.mockImplementation(async () => refundRequest);
    refundRepository.markOrderRefundRequested.mockImplementation(
      async () => refundRequestedOrder,
    );
  });

  test("creates a pending refund request for paid wechat order inside window", async () => {
    const service = await createService();

    const result = await service.requestRefund(refundAuthContext, "order-1", {
      reason: " 客户误充值，需要申请退款 ",
      idempotency_key: "550e8400-e29b-41d4-a716-446655440000",
    });

    expect(orderRepository.findOrderById).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      orderId: "order-1",
    });
    expect(refundRepository.findByIdempotencyKey).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(refundRepository.findActiveByOrderId).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      orderId: "order-1",
    });
    expect(refundRepository.create).toHaveBeenCalledWith({
      tenant_id: "tenant-1",
      order_id: "order-1",
      request_no: "TRR202607100800000001",
      idempotency_key: "550e8400-e29b-41d4-a716-446655440000",
      status: "pending_review",
      reason: "客户误充值，需要申请退款",
      requested_amount_fen: 10000,
      requested_credits: 1100,
      requested_by_employee_id: "employee-1",
      metadata: {},
    });
    expect(refundRepository.markOrderRefundRequested).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      orderId: "order-1",
      refundStatus: "pending_review",
      refundRequestedAt: "2026-07-10T08:00:00.000Z",
    });
    expect(result.request).toMatchObject({
      id: "refund-request-1",
      status: "pending_review",
      reason: "客户误充值，需要申请退款",
    });
    expect(result.order).toMatchObject({
      id: "order-1",
      refund_status: "pending_review",
      refund_action: {
        enabled: false,
        label: "退款审核中",
        disabled_reason: "REFUND_REQUEST_PENDING",
        requires_reason: true,
      },
    });
  });

  test("returns existing refund request for same idempotency key", async () => {
    orderRepository.findOrderById.mockImplementation(
      async () => refundRequestedOrder,
    );
    refundRepository.findByIdempotencyKey.mockImplementation(
      async () => refundRequest,
    );
    const service = await createService();

    const result = await service.requestRefund(refundAuthContext, "order-1", {
      reason: "客户误充值，需要申请退款",
      idempotency_key: "550e8400-e29b-41d4-a716-446655440000",
    });

    expect(refundRepository.findActiveByOrderId).not.toHaveBeenCalled();
    expect(refundRepository.create).not.toHaveBeenCalled();
    expect(refundRepository.markOrderRefundRequested).not.toHaveBeenCalled();
    expect(result.request).toMatchObject({ id: "refund-request-1" });
    expect(result.order).toMatchObject({ refund_status: "pending_review" });
  });

  test("rejects idempotency key reused for a different order", async () => {
    refundRepository.findByIdempotencyKey.mockImplementation(async () => ({
      ...refundRequest,
      order_id: "other-order",
    }));
    const service = await createService();

    await expect(
      service.requestRefund(refundAuthContext, "order-1", {
        reason: "客户误充值，需要申请退款",
        idempotency_key: "550e8400-e29b-41d4-a716-446655440000",
      }),
    ).rejects.toMatchObject({
      code: "BILLING_RECHARGE_REFUND_IDEMPOTENCY_CONFLICT",
    });
    expect(refundRepository.findActiveByOrderId).not.toHaveBeenCalled();
    expect(refundRepository.create).not.toHaveBeenCalled();
  });

  test("rejects unpaid order refund request", async () => {
    orderRepository.findOrderById.mockImplementation(async () => order);
    const service = await createService();

    await expect(
      service.requestRefund(refundAuthContext, "order-1", {
        reason: "客户误充值，需要申请退款",
        idempotency_key: "550e8400-e29b-41d4-a716-446655440000",
      }),
    ).rejects.toMatchObject({ code: "BILLING_RECHARGE_ORDER_NOT_PAID" });
    expect(refundRepository.create).not.toHaveBeenCalled();
  });

  test("rejects missing order refund request", async () => {
    orderRepository.findOrderById.mockImplementation(async () => null);
    const service = await createService();

    await expect(
      service.requestRefund(refundAuthContext, "order-missing", {
        reason: "客户误充值，需要申请退款",
        idempotency_key: "550e8400-e29b-41d4-a716-446655440000",
      }),
    ).rejects.toMatchObject({ code: "BILLING_RECHARGE_ORDER_NOT_FOUND" });
    expect(refundRepository.create).not.toHaveBeenCalled();
  });

  test("rejects non wechat pay order refund request", async () => {
    orderRepository.findOrderById.mockImplementation(async () => ({
      ...paidOrder,
      channel: "manual",
    }));
    const service = await createService();

    await expect(
      service.requestRefund(refundAuthContext, "order-1", {
        reason: "客户误充值，需要申请退款",
        idempotency_key: "550e8400-e29b-41d4-a716-446655440000",
      }),
    ).rejects.toMatchObject({
      code: "BILLING_RECHARGE_ORDER_CHANNEL_INVALID",
    });
    expect(refundRepository.create).not.toHaveBeenCalled();
  });

  test("rejects already refunded order refund request", async () => {
    orderRepository.findOrderById.mockImplementation(async () => ({
      ...paidOrder,
      status: "refunded",
    }));
    const service = await createService();

    await expect(
      service.requestRefund(refundAuthContext, "order-1", {
        reason: "客户误充值，需要申请退款",
        idempotency_key: "550e8400-e29b-41d4-a716-446655440000",
      }),
    ).rejects.toMatchObject({
      code: "BILLING_RECHARGE_ORDER_ALREADY_REFUNDED",
    });
    expect(refundRepository.create).not.toHaveBeenCalled();
  });

  test("rejects order with active refund request", async () => {
    refundRepository.findActiveByOrderId.mockImplementation(
      async () => refundRequest,
    );
    const service = await createService();

    await expect(
      service.requestRefund(refundAuthContext, "order-1", {
        reason: "客户误充值，需要申请退款",
        idempotency_key: "550e8400-e29b-41d4-a716-446655440000",
      }),
    ).rejects.toMatchObject({
      code: "BILLING_RECHARGE_REFUND_REQUEST_PENDING",
    });
    expect(refundRepository.create).not.toHaveBeenCalled();
  });

  test("rejects refund request when credits were consumed", async () => {
    orderRepository.getAccountByTenantId.mockImplementation(async () => ({
      ...account,
      available_credits: 100,
    }));
    const service = await createService();

    await expect(
      service.requestRefund(refundAuthContext, "order-1", {
        reason: "客户误充值，需要申请退款",
        idempotency_key: "550e8400-e29b-41d4-a716-446655440000",
      }),
    ).rejects.toMatchObject({
      code: "BILLING_RECHARGE_CREDITS_CONSUMED",
    });
    expect(refundRepository.create).not.toHaveBeenCalled();
  });

  test("rejects refund request without refund request permission", async () => {
    const service = await createService();

    await expect(
      service.requestRefund(authContext, "order-1", {
        reason: "客户误充值，需要申请退款",
        idempotency_key: "550e8400-e29b-41d4-a716-446655440000",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(orderRepository.findOrderById).not.toHaveBeenCalled();
  });

  test("rejects refund request after refund window expired", async () => {
    orderRepository.findOrderById.mockImplementation(async () => ({
      ...paidOrder,
      paid_at: "2026-06-01T08:00:00.000Z",
    }));
    const service = await createService();

    await expect(
      service.requestRefund(refundAuthContext, "order-1", {
        reason: "客户误充值，需要申请退款",
        idempotency_key: "550e8400-e29b-41d4-a716-446655440000",
      }),
    ).rejects.toMatchObject({
      code: "BILLING_RECHARGE_REFUND_WINDOW_EXPIRED",
    });
    expect(refundRepository.create).not.toHaveBeenCalled();
  });
});
