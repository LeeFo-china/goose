import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  OrderRecord,
  RefundReviewResult,
} from "@/repositories/platform-service-order-records";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const tenantId = "00000000-0000-4000-8000-000000000011";
const employeeId = "00000000-0000-4000-8000-000000000012";
const orderId = "00000000-0000-4000-8000-000000000301";

const tenantAuth = {
  authUserId: "auth-tenant",
  employeeId,
  tenantId,
  tenantName: "装企",
  tenantSlug: "tenant",
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "采购员",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["system_admin"],
  roles: [],
  permissions: [{ code: "billing.service_order.refund.request", scope: "all" }],
} satisfies AuthContext;

const order = {
  id: orderId,
  tenant_id: tenantId,
  order_no: "TSO202608030001",
  out_trade_no: "TSO202608030001",
  product_code: "platform_service_1y",
  term_years: 1,
  amount_fen: 980000,
  payment_status: "paid",
  service_status: "waiting_assignment",
  prepay_id: "prepay-1",
  payment_expires_at: "2026-08-03T12:05:00.000Z",
  paid_at: "2026-08-03T12:01:00.000Z",
  closed_at: null,
  terms_version: 1,
  version: 1,
  created_at: "2026-08-03T12:00:00.000Z",
  updated_at: "2026-08-03T12:01:00.000Z",
} satisfies OrderRecord;

const refundRequest = {
  id: "refund-1",
  tenant_id: tenantId,
  service_order_id: orderId,
  idempotency_key: "00000000-0000-4000-8000-000000000911",
  reason: "暂不需要服务",
  status: "reviewing",
  created_by_employee_id: employeeId,
  created_at: "2026-08-03T12:02:00.000Z",
  updated_at: "2026-08-03T12:02:00.000Z",
};

function createDependencies() {
  return {
    repository: {
      listEnabledProducts: mock(async () => ({
        list: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      })),
      listOrders: mock(async () => ({
        list: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      })),
      findEnabledProductByCode: mock(async () => null),
      findOrderByIdempotencyKey: mock(async () => null),
      createPendingOrder: mock(async () => order),
      markPrepayCreated: mock(async () => order),
      findOrderByTenantAndId: mock(async () => order),
      findOrderForPaymentByTenantAndId: mock(async () => order),
      findAcceptanceViewByTenantAndOrderId: mock(async () => null),
      decideAcceptance: mock(async () => ({
        workOrder: null,
        order: null,
        acceptancePreparation: null,
        errorCode: "SERVICE_ACCEPTANCE_INVALID_STATE",
      })),
      requestRefundReview: mock(async (): Promise<RefundReviewResult> => ({
        idempotent: false,
        refundRequest,
        order: {
          ...order,
          payment_status: "refund_reviewing",
          version: 2,
        },
      })),
    },
    paymentConfigRepository: {
      findWechatPayConfig: mock(async () => null),
      findWechatPayConfigById: mock(async () => null),
    },
    accessPolicyService: {
      assertTenantContext: mock(() => tenantId),
      hasPermission: mock((authContext: AuthContext, permissionCode: string) =>
        authContext.permissions.some((permission) =>
          permission.code === permissionCode
        )
      ),
    },
    secretBundleService: { load: mock(async () => ({} as never)) },
    wechatPayGateway: {
      createJsapiPrepay: mock(async () => ({} as never)),
      createMiniProgramPaymentRequest: mock(() => ({} as never)),
    },
    nowFactory: () => new Date("2026-08-03T12:02:00.000Z"),
  };
}

describe("TenantPlatformServiceOrderService refund requests", () => {
  let dependencies: ReturnType<typeof createDependencies>;

  beforeEach(() => {
    dependencies = createDependencies();
  });

  test("creates one refund request for the same idempotency key", async () => {
    dependencies.repository.requestRefundReview
      .mockImplementationOnce(async () => ({
        idempotent: false,
        refundRequest,
        order: {
          ...order,
          payment_status: "refund_reviewing",
          version: 2,
        },
      }))
      .mockImplementationOnce(async () => ({
        idempotent: true,
        refundRequest,
        order: {
          ...order,
          payment_status: "refund_reviewing",
          version: 2,
        },
      }));
    const { TenantPlatformServiceOrderService } = await import(
      "./tenant-platform-service-orders"
    );
    const service = new TenantPlatformServiceOrderService(dependencies);
    const input = {
      expected_version: 1,
      idempotency_key: "00000000-0000-4000-8000-000000000911",
      reason: "暂不需要服务",
    };

    const first = await service.requestRefund(tenantAuth, orderId, input);
    const second = await service.requestRefund(tenantAuth, orderId, input);

    expect(first.idempotent).toBe(false);
    expect(second.idempotent).toBe(true);
    expect(dependencies.repository.requestRefundReview).toHaveBeenCalledTimes(2);
  });

  test("moves a paid service order to refund_reviewing", async () => {
    const { TenantPlatformServiceOrderService } = await import(
      "./tenant-platform-service-orders"
    );
    const service = new TenantPlatformServiceOrderService(dependencies);

    const result = await service.requestRefund(tenantAuth, orderId, {
      expected_version: 1,
      idempotency_key: "00000000-0000-4000-8000-000000000912",
      reason: "暂不需要服务",
    });

    expect(dependencies.repository.requestRefundReview).toHaveBeenCalledWith({
      tenantId,
      orderId,
      expectedVersion: 1,
      idempotencyKey: "00000000-0000-4000-8000-000000000912",
      reason: "暂不需要服务",
      createdByEmployeeId: employeeId,
    });
    expect(result.order.payment_status).toBe("refund_reviewing");
  });

  test("does not create a standalone refund row when atomic transition conflicts", async () => {
    dependencies.repository.requestRefundReview.mockImplementationOnce(async () => ({
      idempotent: false,
      refundRequest: null,
      order: null,
      errorCode: "SERVICE_ORDER_VERSION_CONFLICT",
    }));
    const { TenantPlatformServiceOrderService } = await import(
      "./tenant-platform-service-orders"
    );
    const service = new TenantPlatformServiceOrderService(dependencies);

    await expect(service.requestRefund(tenantAuth, orderId, {
      expected_version: 1,
      idempotency_key: "00000000-0000-4000-8000-000000000914",
      reason: "暂不需要服务",
    })).rejects.toMatchObject({
      code: "SERVICE_ORDER_VERSION_CONFLICT",
    });
  });

  test("rejects refund requests for pending, closed or refunded orders", async () => {
    const { TenantPlatformServiceOrderService } = await import(
      "./tenant-platform-service-orders"
    );
    const service = new TenantPlatformServiceOrderService(dependencies);

    for (const paymentStatus of ["pending", "closed", "refunded"]) {
      dependencies.repository.findOrderByTenantAndId.mockImplementationOnce(
        async () => ({ ...order, payment_status: paymentStatus }),
      );
      await expect(service.requestRefund(tenantAuth, orderId, {
        expected_version: 1,
        idempotency_key: "00000000-0000-4000-8000-000000000913",
        reason: "暂不需要服务",
      })).rejects.toMatchObject({
        code: "SERVICE_ORDER_INVALID_STATE",
      });
    }
  });
});
