import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { TenantCreditOrderRecord } from "@/repositories/billing-recharge";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import type { PlatformRechargeRefundRequestRecord } from "@/repositories/platform-billing-recharge-refunds";
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
  refund_status: "approved",
  refund_requested_at: "2026-07-10T08:00:00.000Z",
  refunded_at: null,
  refund_amount_fen: null,
  created_at: "2026-07-02T08:01:00.000Z",
  updated_at: "2026-07-10T08:00:00.000Z",
} satisfies TenantCreditOrderRecord;

const approvedRequest = {
  id: "refund-request-1",
  tenant_id: "tenant-1",
  order_id: "order-1",
  request_no: "TRR202607100800000001",
  idempotency_key: "550e8400-e29b-41d4-a716-446655440000",
  status: "approved",
  reason: "客户误充值，需要申请退款",
  requested_amount_fen: 10000,
  requested_credits: 1100,
  requested_by_employee_id: "employee-1",
  reviewed_by_employee_id: "employee-platform",
  reviewed_at: "2026-07-15T10:00:00.000Z",
  review_note: "同意退款，进入退款执行",
  out_refund_no: null,
  wechat_refund_id: null,
  refund_amount_fen: null,
  refunded_at: null,
  failure_message: null,
  metadata: {},
  created_at: "2026-07-10T08:00:00.000Z",
  updated_at: "2026-07-15T10:00:00.000Z",
  order,
  tenant: { id: "tenant-1", name: "固始晴天装饰", slug: "qingtian" },
} satisfies PlatformRechargeRefundRequestRecord;

const refundingRequest = {
  ...approvedRequest,
  status: "refunding",
  out_refund_no: "TRR202607100800000001",
} satisfies PlatformRechargeRefundRequestRecord;

const requestWithWechatResult = {
  ...refundingRequest,
  wechat_refund_id: "5030000000202607150000000001",
  refund_amount_fen: 10000,
  metadata: {
    wechat_refund_response: {
      out_refund_no: "TRR202607100800000001",
      refund_id: "5030000000202607150000000001",
      status: "PROCESSING",
    },
  },
} satisfies PlatformRechargeRefundRequestRecord;

const failedRequest = {
  ...refundingRequest,
  status: "failed",
  failure_message: "微信退款请求失败",
} satisfies PlatformRechargeRefundRequestRecord;

const paymentConfig = {
  id: "platform-config-1",
  provider: "wechat_pay",
  profile_code: "platform_direct_recharge",
  principal_type: "platform",
  merchant_mode: "direct_merchant",
  merchant_name: "平台微信支付",
  merchant_id: "1112582521",
  sub_merchant_id: null,
  app_id: "wxbac3b1e168fd968a",
  sub_app_id: null,
  encrypted_config_ref: "env://WECHAT_PAY_TEST",
  serial_no: "SERIALNO",
  notify_url: "https://api.example.com/pay/wechat/callback",
  enabled_channels: ["tenant_recharge"],
  status: "active",
  validation_status: "valid",
  last_validated_at: null,
  risk_switches: {},
  created_by_employee_id: null,
  updated_by_employee_id: null,
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
} satisfies PlatformPaymentConfigRecord;

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

const events: string[] = [];

const repository = {
  findRequestById: mock(
    async (): Promise<PlatformRechargeRefundRequestRecord | null> =>
      approvedRequest,
  ),
  markRequestRefunding: mock(
    async (): Promise<PlatformRechargeRefundRequestRecord | null> => {
      events.push("mark-request-refunding");
      return refundingRequest;
    },
  ),
  markOrderRefundStatus: mock(async (input: {
    refundStatus: string;
  }): Promise<TenantCreditOrderRecord> => {
    events.push(`mark-order-${input.refundStatus}`);
    return { ...order, refund_status: "refunding" };
  }),
  saveWechatRefundResult: mock(
    async (): Promise<PlatformRechargeRefundRequestRecord> => {
      events.push("save-wechat-result");
      return requestWithWechatResult;
    },
  ),
  markRequestFailed: mock(
    async (): Promise<PlatformRechargeRefundRequestRecord | null> => {
      events.push("mark-request-failed");
      return failedRequest;
    },
  ),
};

const paymentConfigRepository = {
  findWechatPayConfig: mock(async () => paymentConfig),
};

const secretBundleService = {
  load: mock(async () => ({
    privateKeyPem: "private-key",
    apiV3Key: "api-v3-key",
    wechatPayPublicKeyId: null,
    wechatPayPublicKeyPem: null,
    baseUrl: "https://api.mch.weixin.qq.com",
  })),
};

const wechatPayGateway = {
  requestRefund: mock(async () => {
    events.push("wechat-refund");
    return {
      out_refund_no: "TRR202607100800000001",
      refund_id: "5030000000202607150000000001",
      status: "PROCESSING",
      raw: {
        out_refund_no: "TRR202607100800000001",
        refund_id: "5030000000202607150000000001",
        status: "PROCESSING",
      },
    };
  }),
};

const auditLogService = {
  recordBestEffort: mock(async () => null),
};

async function createService() {
  const { PlatformBillingRechargeRefundExecutionService } = await import(
    "./platform-billing-recharge-refund-execution"
  );
  return new PlatformBillingRechargeRefundExecutionService({
    repository,
    paymentConfigRepository,
    secretBundleService,
    wechatPayGateway,
    auditLogService,
  });
}

describe("PlatformBillingRechargeRefundExecutionService", () => {
  beforeEach(() => {
    events.length = 0;
    for (const fn of [
      ...Object.values(repository),
      ...Object.values(paymentConfigRepository),
      ...Object.values(secretBundleService),
      ...Object.values(wechatPayGateway),
      ...Object.values(auditLogService),
    ]) {
      fn.mockClear();
    }
    repository.findRequestById.mockImplementation(async () => approvedRequest);
    repository.markRequestRefunding.mockImplementation(async () => {
      events.push("mark-request-refunding");
      return refundingRequest;
    });
    repository.markOrderRefundStatus.mockImplementation(async (input: {
      refundStatus: string;
    }) => {
      events.push(`mark-order-${input.refundStatus}`);
      return { ...order, refund_status: "refunding" };
    });
    repository.saveWechatRefundResult.mockImplementation(async () => {
      events.push("save-wechat-result");
      return requestWithWechatResult;
    });
    repository.markRequestFailed.mockImplementation(async () => {
      events.push("mark-request-failed");
      return failedRequest;
    });
    paymentConfigRepository.findWechatPayConfig.mockImplementation(
      async () => paymentConfig,
    );
    secretBundleService.load.mockImplementation(async () => ({
      privateKeyPem: "private-key",
      apiV3Key: "api-v3-key",
      wechatPayPublicKeyId: null,
      wechatPayPublicKeyPem: null,
      baseUrl: "https://api.mch.weixin.qq.com",
    }));
    wechatPayGateway.requestRefund.mockImplementation(async () => {
      events.push("wechat-refund");
      return {
        out_refund_no: "TRR202607100800000001",
        refund_id: "5030000000202607150000000001",
        status: "PROCESSING",
        raw: {
          out_refund_no: "TRR202607100800000001",
          refund_id: "5030000000202607150000000001",
          status: "PROCESSING",
        },
      };
    });
  });

  test("executes an approved refund request after marking request and order refunding", async () => {
    const service = await createService();

    const result = await service.execute(authContext, "refund-request-1");

    expect(repository.markRequestRefunding).toHaveBeenCalledWith({
      id: "refund-request-1",
      fromStatuses: ["approved", "failed"],
      outRefundNo: "TRR202607100800000001",
    });
    expect(repository.markOrderRefundStatus).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      orderId: "order-1",
      refundStatus: "refunding",
    });
    expect(wechatPayGateway.requestRefund).toHaveBeenCalledWith({
      config: paymentConfig,
      secretBundle: expect.objectContaining({ apiV3Key: "api-v3-key" }),
      transactionId: "4200000001",
      outRefundNo: "TRR202607100800000001",
      reason: "客户误充值，需要申请退款",
      refundAmountFen: 10000,
      totalAmountFen: 10000,
    });
    expect(events).toEqual([
      "mark-request-refunding",
      "mark-order-refunding",
      "wechat-refund",
      "save-wechat-result",
    ]);
    expect(result).toMatchObject({
      request: {
        id: "refund-request-1",
        status: "refunding",
        out_refund_no: "TRR202607100800000001",
        wechat_refund_id: "5030000000202607150000000001",
      },
      wechat_refund: { status: "PROCESSING" },
    });
  });

  test("reuses existing out refund no when retrying a failed request", async () => {
    repository.findRequestById.mockImplementation(async () => ({
      ...approvedRequest,
      status: "failed",
      out_refund_no: "TRR202607100800000001",
      failure_message: "上次微信退款请求失败",
    } satisfies PlatformRechargeRefundRequestRecord));
    const service = await createService();

    await service.execute(authContext, "refund-request-1");

    expect(repository.markRequestRefunding).toHaveBeenCalledWith(
      expect.objectContaining({ outRefundNo: "TRR202607100800000001" }),
    );
  });

  test("rejects execution when request is not approved or failed", async () => {
    repository.findRequestById.mockImplementation(async () => ({
      ...approvedRequest,
      status: "pending_review",
    } satisfies PlatformRechargeRefundRequestRecord));
    const service = await createService();

    await expect(
      service.execute(authContext, "refund-request-1"),
    ).rejects.toMatchObject({
      code: "BILLING_RECHARGE_REFUND_EXECUTE_STATE_INVALID",
    });
    expect(wechatPayGateway.requestRefund).not.toHaveBeenCalled();
  });

  test("rejects execution when order has no transaction id", async () => {
    repository.findRequestById.mockImplementation(async () => ({
      ...approvedRequest,
      order: { ...order, transaction_id: null },
    } satisfies PlatformRechargeRefundRequestRecord));
    const service = await createService();

    await expect(
      service.execute(authContext, "refund-request-1"),
    ).rejects.toMatchObject({
      code: "BILLING_RECHARGE_REFUND_TRANSACTION_ID_REQUIRED",
    });
    expect(repository.markRequestRefunding).not.toHaveBeenCalled();
    expect(wechatPayGateway.requestRefund).not.toHaveBeenCalled();
  });

  test("marks request failed when upstream refund request fails after refunding state is saved", async () => {
    wechatPayGateway.requestRefund.mockImplementation(async () => {
      events.push("wechat-refund");
      throw {
        code: "WECHAT_PAY_REFUND_REQUEST_FAILED",
        message: "微信退款请求失败",
      };
    });
    const service = await createService();

    await expect(
      service.execute(authContext, "refund-request-1"),
    ).rejects.toMatchObject({
      code: "WECHAT_PAY_REFUND_REQUEST_FAILED",
    });
    expect(repository.markRequestFailed).toHaveBeenCalledWith({
      id: "refund-request-1",
      failureMessage: "微信退款请求失败",
      metadata: expect.objectContaining({
        wechat_refund_failure: expect.objectContaining({
          code: "WECHAT_PAY_REFUND_REQUEST_FAILED",
          message: "微信退款请求失败",
        }),
      }),
    });
    expect(repository.markOrderRefundStatus).toHaveBeenLastCalledWith({
      tenantId: "tenant-1",
      orderId: "order-1",
      refundStatus: "failed",
    });
    expect(events).toEqual([
      "mark-request-refunding",
      "mark-order-refunding",
      "wechat-refund",
      "mark-request-failed",
      "mark-order-failed",
    ]);
  });
});
