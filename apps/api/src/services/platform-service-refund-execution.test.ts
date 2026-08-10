import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { RefundExecutionRequestRecord } from "@/repositories/platform-service-rpc-results";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const refundId = "00000000-0000-4000-8000-000000000701";
const orderId = "00000000-0000-4000-8000-000000000301";
const configId = "00000000-0000-4000-8000-000000000201";
const employeeId = "00000000-0000-4000-8000-000000000101";
const outTradeNo = "TSO202608100001";
const transactionId = "4200000000202608100000000001";
const outRefundNo = `TSRF${refundId.replaceAll("-", "").toUpperCase()}`;

const authContext = {
  authUserId: "platform-user",
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  employeeId,
  isPlatformAdmin: false,
  isPlatformStaff: true,
  employeeName: "退款专员",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["refund_operator"],
  roles: [],
  permissions: [{ code: "platform.service_refund.review", scope: "all" }],
} satisfies AuthContext;

const order = {
  id: orderId,
  tenant_id: "00000000-0000-4000-8000-000000000011",
  order_no: outTradeNo,
  out_trade_no: outTradeNo,
  product_code: "platform_service_1y",
  term_years: 1,
  amount_fen: 980000,
  paid_amount_fen: 980000,
  payment_status: "refund_reviewing",
  service_status: "awaiting_acceptance",
  payment_config_id: configId,
  payment_config_guard_version: 7,
  transaction_id: transactionId,
  prepay_id: "prepay-1",
  payment_expires_at: "2026-08-10T10:05:00.000Z",
  paid_at: "2026-08-10T10:01:00.000Z",
  closed_at: null,
  terms_version: 1,
  version: 4,
  created_at: "2026-08-10T10:00:00.000Z",
  updated_at: "2026-08-10T10:10:00.000Z",
};

const refundRequest: RefundExecutionRequestRecord = {
  id: refundId,
  tenant_id: order.tenant_id,
  service_order_id: orderId,
  idempotency_key: "00000000-0000-4000-8000-000000000801",
  reason: "不再需要平台技术服务",
  status: "approved",
  version: 2,
  created_by_employee_id: "00000000-0000-4000-8000-000000000102",
  reviewed_by_employee_id: employeeId,
  reviewed_at: "2026-08-10T10:20:00.000Z",
  review_remark: "同意全额退款",
  out_refund_no: null,
  wechat_refund_id: null,
  refund_amount_fen: null,
  refunded_at: null,
  refunded_by_employee_id: null,
  created_at: "2026-08-10T10:15:00.000Z",
  updated_at: "2026-08-10T10:20:00.000Z",
  order,
};

const config = {
  id: configId,
  provider: "wechat_pay" as const,
  profile_code: "platform_direct_recharge" as const,
  principal_type: "platform" as const,
  merchant_mode: "direct_merchant" as const,
  merchant_name: "平台商户",
  merchant_id: "1900000001",
  sub_merchant_id: null,
  app_id: "wx-platform",
  sub_app_id: null,
  encrypted_config_ref: "secret://wechat-pay",
  secret_bundle_revision: "revision-7",
  serial_no: "SERIAL-1",
  notify_url: "https://example.com/callback",
  enabled_channels: ["platform_service"],
  status: "active" as const,
  validation_status: "valid" as const,
  last_validated_at: "2026-08-10T09:00:00.000Z",
  risk_switches: {},
  recharge_guard_version: 7,
  created_by_employee_id: employeeId,
  updated_by_employee_id: employeeId,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-10T09:00:00.000Z",
};

const secretBundle = {
  privateKeyPem: "private-key",
  apiV3Key: "12345678901234567890123456789012",
  wechatPayPublicKeyId: "PUB_KEY_ID",
  wechatPayPublicKeyPem: "public-key",
  baseUrl: "https://api.mch.weixin.qq.com",
  revision: "revision-7",
};

function transactionResponse() {
  return {
    appid: "wx-platform",
    mchid: "1900000001",
    out_trade_no: outTradeNo,
    transaction_id: transactionId,
    trade_state: "SUCCESS",
    success_time: "2026-08-10T10:01:00+08:00",
    amount: { total: 980000, currency: "CNY" },
    requestId: "transaction-request-id",
  };
}

function refundResponse(status: "SUCCESS" | "PROCESSING" | "ABNORMAL" | "CLOSED") {
  return {
    out_refund_no: outRefundNo,
    refund_id: "5030000000202608100000000001",
    transaction_id: transactionId,
    out_trade_no: outTradeNo,
    status,
    success_time: status === "SUCCESS" ? "2026-08-10T10:30:00+08:00" : undefined,
    amount: { refund: 980000, total: 980000, currency: "CNY" },
    requestId: "refund-request-id",
  };
}

function createHarness() {
  const repository = {
    findPlatformServiceRefundRequestById: mock(async () => refundRequest),
    confirmServiceRefund: mock(async () => ({
      refundRequest: { ...refundRequest, status: "refunded" },
      order: { ...order, payment_status: "refunded" },
      contract: null,
      contractPeriod: null,
      idempotent: false,
    })),
    closeServiceRefund: mock(async () => ({
      refundRequest: {
        ...refundRequest,
        status: "cancelled",
        provider_refund_status: "CLOSED",
        provider_out_refund_no: outRefundNo,
        provider_wechat_refund_id: "5030000000202608100000000001",
        provider_refund_amount_fen: 980000,
        provider_checked_at: "2026-08-10T10:31:00.000Z",
        provider_checked_by_employee_id: employeeId,
      },
      order: { ...order, payment_status: "paid" },
      providerStatus: "CLOSED" as const,
      refunded: false as const,
      accessTerminated: false as const,
      retryable: false as const,
      idempotent: false,
    })),
  };
  const gateway = {
    queryTransactionByOutTradeNo: mock(async () => transactionResponse()),
    requestRefund: mock(async (_input?: unknown) => refundResponse("SUCCESS")),
    queryRefundByOutRefundNo: mock(async () => refundResponse("SUCCESS")),
  };
  return {
    repository,
    paymentConfigRepository: {
      findWechatPayConfigById: mock(async () => config),
    },
    secretBundleService: { load: mock(async () => secretBundle) },
    gateway,
    nowFactory: () => new Date("2026-08-10T10:31:00.000Z"),
  };
}

async function createService(harness: ReturnType<typeof createHarness>) {
  const { PlatformServiceRefundExecutionService } = await import(
    "./platform-service-refund-execution"
  );
  return new PlatformServiceRefundExecutionService({
    repository: harness.repository,
    paymentConfigRepository: harness.paymentConfigRepository,
    secretBundleService: harness.secretBundleService,
    wechatPayGateway: harness.gateway,
    nowFactory: harness.nowFactory,
  });
}

describe("PlatformServiceRefundExecutionService", () => {
  let harness: ReturnType<typeof createHarness>;

  beforeEach(() => {
    harness = createHarness();
  });

  test("confirms local access termination only for a verified WeChat SUCCESS", async () => {
    const service = await createService(harness);
    const result = await service.execute(authContext, refundId);

    expect(harness.gateway.queryTransactionByOutTradeNo).toHaveBeenCalledWith({
      config,
      secretBundle,
      outTradeNo,
    });
    expect(harness.gateway.requestRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId,
        outRefundNo,
        refundAmountFen: 980000,
        totalAmountFen: 980000,
      }),
    );
    expect(harness.repository.confirmServiceRefund).toHaveBeenCalledWith({
      refundRequestId: refundId,
      serviceOrderId: orderId,
      transactionId,
      outTradeNo,
      paymentConfigId: configId,
      paymentConfigGuardVersion: 7,
      outRefundNo,
      wechatRefundId: "5030000000202608100000000001",
      refundAmountFen: 980000,
      refundedAt: "2026-08-10T10:30:00+08:00",
      operatorEmployeeId: employeeId,
      metadata: {
        confirmation_source: "platform_service_refund_execution",
        wechat_request_id: "refund-request-id",
      },
    });
    expect(result).toMatchObject({
      refund_request: { status: "refunded" },
      order: { payment_status: "refunded" },
      idempotent: false,
    });
  });

  test("queries PROCESSING with the original refund number before confirming SUCCESS", async () => {
    harness.gateway.requestRefund.mockResolvedValueOnce(refundResponse("PROCESSING"));
    const service = await createService(harness);

    await service.execute(authContext, refundId);

    expect(harness.gateway.queryRefundByOutRefundNo).toHaveBeenCalledWith({
      config,
      secretBundle,
      outRefundNo,
    });
    expect(harness.repository.confirmServiceRefund).toHaveBeenCalledTimes(1);
  });

  test("queries with the same refund number after an uncertain request error", async () => {
    harness.gateway.requestRefund.mockRejectedValueOnce(new Error("network timeout"));
    const service = await createService(harness);

    await service.execute(authContext, refundId);

    expect(harness.gateway.queryRefundByOutRefundNo).toHaveBeenCalledWith(
      expect.objectContaining({ outRefundNo }),
    );
    expect(harness.repository.confirmServiceRefund).toHaveBeenCalledTimes(1);
  });

  test.each(["ABNORMAL"] as const)(
    "never confirms terminal non-success status %s",
    async (status) => {
      harness.gateway.requestRefund.mockResolvedValueOnce(refundResponse(status));
      const service = await createService(harness);

      await expect(service.execute(authContext, refundId)).rejects.toMatchObject({
        code: `SERVICE_REFUND_WECHAT_${status}`,
      });
      expect(harness.repository.confirmServiceRefund).not.toHaveBeenCalled();
    },
  );

  test("closes a provider-CLOSED request without terminating access", async () => {
    harness.gateway.requestRefund.mockResolvedValueOnce(refundResponse("CLOSED"));
    const service = await createService(harness);

    const result = await service.execute(authContext, refundId);

    expect(harness.repository.confirmServiceRefund).not.toHaveBeenCalled();
    expect(harness.repository.closeServiceRefund).toHaveBeenCalledWith({
      refundRequestId: refundId,
      serviceOrderId: orderId,
      transactionId,
      outTradeNo,
      paymentConfigId: configId,
      paymentConfigGuardVersion: 7,
      outRefundNo,
      wechatRefundId: "5030000000202608100000000001",
      refundAmountFen: 980000,
      operatorEmployeeId: employeeId,
      metadata: {
        confirmation_source: "platform_service_refund_execution",
        wechat_request_id: "refund-request-id",
      },
    });
    expect(result).toMatchObject({
      outcome: "provider_closed",
      provider_status: "CLOSED",
      refunded: false,
      access_terminated: false,
      retryable: false,
    });
  });

  test("keeps access unchanged when WeChat remains PROCESSING", async () => {
    harness.gateway.requestRefund.mockResolvedValueOnce(refundResponse("PROCESSING"));
    harness.gateway.queryRefundByOutRefundNo.mockResolvedValueOnce(
      refundResponse("PROCESSING"),
    );
    const service = await createService(harness);

    await expect(service.execute(authContext, refundId)).rejects.toMatchObject({
      code: "SERVICE_REFUND_STATUS_UNKNOWN",
      details: { out_refund_no: outRefundNo, status: "PROCESSING" },
    });
    expect(harness.repository.confirmServiceRefund).not.toHaveBeenCalled();
  });

  test.each(["ABNORMAL"] as const)(
    "never confirms when a PROCESSING request is queried as %s",
    async (status) => {
      harness.gateway.requestRefund.mockResolvedValueOnce(
        refundResponse("PROCESSING"),
      );
      harness.gateway.queryRefundByOutRefundNo.mockResolvedValueOnce(
        refundResponse(status),
      );
      const service = await createService(harness);

      await expect(service.execute(authContext, refundId)).rejects.toMatchObject({
        code: `SERVICE_REFUND_WECHAT_${status}`,
      });
      expect(harness.repository.confirmServiceRefund).not.toHaveBeenCalled();
    },
  );

  test("closes a PROCESSING refund that query resolves as CLOSED", async () => {
    harness.gateway.requestRefund.mockResolvedValueOnce(refundResponse("PROCESSING"));
    harness.gateway.queryRefundByOutRefundNo.mockResolvedValueOnce(
      refundResponse("CLOSED"),
    );
    const service = await createService(harness);

    const result = await service.execute(authContext, refundId);

    expect(harness.repository.closeServiceRefund).toHaveBeenCalledTimes(1);
    expect(harness.repository.confirmServiceRefund).not.toHaveBeenCalled();
    expect(result).toMatchObject({ provider_status: "CLOSED", refunded: false });
  });

  test("keeps access unchanged when both refund request and query are uncertain", async () => {
    harness.gateway.requestRefund.mockRejectedValueOnce(new Error("timeout"));
    harness.gateway.queryRefundByOutRefundNo.mockRejectedValueOnce(
      new Error("query timeout SENSITIVE_GATEWAY_SENTINEL"),
    );
    const service = await createService(harness);

    try {
      await service.execute(authContext, refundId);
      throw new Error("expected refund uncertainty");
    } catch (error) {
      expect(error).toMatchObject({ code: "SERVICE_REFUND_STATUS_UNKNOWN" });
      expect(JSON.stringify(error)).not.toContain("SENSITIVE_GATEWAY_SENTINEL");
    }
    expect(harness.repository.confirmServiceRefund).not.toHaveBeenCalled();
  });

  test("reuses the same deterministic refund number after an unknown first attempt", async () => {
    harness.gateway.requestRefund
      .mockResolvedValueOnce(refundResponse("PROCESSING"))
      .mockResolvedValueOnce(refundResponse("SUCCESS"));
    harness.gateway.queryRefundByOutRefundNo.mockResolvedValueOnce(
      refundResponse("PROCESSING"),
    );
    const service = await createService(harness);

    await expect(service.execute(authContext, refundId)).rejects.toMatchObject({
      code: "SERVICE_REFUND_STATUS_UNKNOWN",
    });
    const result = await service.execute(authContext, refundId);

    expect(harness.gateway.requestRefund).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ outRefundNo }),
    );
    expect(harness.gateway.requestRefund).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ outRefundNo }),
    );
    expect(harness.gateway.queryRefundByOutRefundNo).toHaveBeenCalledWith(
      expect.objectContaining({ outRefundNo }),
    );
    expect(result).toMatchObject({
      outcome: "refunded",
      provider_status: "SUCCESS",
    });
  });

  test("replays an already finalized local refund idempotently without WeChat", async () => {
    harness.repository.findPlatformServiceRefundRequestById.mockResolvedValueOnce({
      ...refundRequest,
      status: "refunded",
      out_refund_no: outRefundNo,
      wechat_refund_id: "5030000000202608100000000001",
      refund_amount_fen: 980000,
      refunded_at: "2026-08-10T10:30:00+08:00",
      refunded_by_employee_id: employeeId,
      order: { ...order, payment_status: "refunded" },
    });
    harness.repository.confirmServiceRefund.mockResolvedValueOnce({
      refundRequest: { ...refundRequest, status: "refunded" },
      order: { ...order, payment_status: "refunded" },
      contract: null,
      contractPeriod: null,
      idempotent: true,
    });
    const service = await createService(harness);

    const result = await service.execute(authContext, refundId);

    expect(result.idempotent).toBe(true);
    expect(harness.gateway.queryTransactionByOutTradeNo).not.toHaveBeenCalled();
    expect(harness.gateway.requestRefund).not.toHaveBeenCalled();
    expect(harness.repository.confirmServiceRefund).toHaveBeenCalledWith(
      expect.objectContaining({ outRefundNo, operatorEmployeeId: employeeId }),
    );
  });

  test.each([
    ["merchant", { mchid: "1900009999" }],
    ["order", { out_trade_no: "OTHER_ORDER" }],
    ["amount", { amount: { total: 1, currency: "CNY" } }],
  ] as const)("rejects a mismatched original transaction %s binding", async (_label, patch) => {
    harness.gateway.queryTransactionByOutTradeNo.mockResolvedValueOnce({
      ...transactionResponse(),
      ...patch,
    });
    const service = await createService(harness);

    await expect(service.execute(authContext, refundId)).rejects.toMatchObject({
      code: "BILLING_RECHARGE_WECHAT_TRANSACTION_MISMATCH",
    });
    expect(harness.gateway.requestRefund).not.toHaveBeenCalled();
    expect(harness.repository.confirmServiceRefund).not.toHaveBeenCalled();
  });

  test("rejects payment configuration guard drift before calling WeChat", async () => {
    harness.paymentConfigRepository.findWechatPayConfigById.mockResolvedValueOnce({
      ...config,
      recharge_guard_version: 8,
    });
    const service = await createService(harness);

    await expect(service.execute(authContext, refundId)).rejects.toMatchObject({
      code: "SERVICE_PAYMENT_CONFIG_INVALID",
    });
    expect(harness.gateway.requestRefund).not.toHaveBeenCalled();
    expect(harness.repository.confirmServiceRefund).not.toHaveBeenCalled();
  });
});
