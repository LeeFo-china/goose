import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { TenantCreditOrderRecord } from "@/repositories/billing-recharge";
import { platformBillingRechargeRefundRepository, type PlatformRechargeRefundRequestRecord } from "@/repositories/platform-billing-recharge-refunds";
import {
  approvedRequest,
  authContext,
  order,
  partnerPaymentConfig,
  paymentConfig,
  refundingRequest,
  requestWithWechatResult,
} from "@/services/platform-billing-recharge-refund-execution.test-fixtures";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
const events: string[] = [];
const refundPayload = {
  out_refund_no: "TRR202607100800000001",
  refund_id: "5030000000202607150000000001",
  transaction_id: "4200000001",
  out_trade_no: "TC202607020001",
  status: "PROCESSING",
  amount: { refund: 10000, total: 10000, currency: "CNY" },
};
function createRefundPayload(overrides: Partial<typeof refundPayload> = {}) {
  return { ...refundPayload, ...overrides };
}
function createRefundRequestResult(
  overrides: Partial<typeof refundPayload> = {},
  requestId = "wechat-refund-request-id",
) {
  const raw = createRefundPayload(overrides);
  return {
    out_refund_no: raw.out_refund_no,
    refund_id: raw.refund_id,
    status: raw.status,
    requestId,
    raw,
  };
}
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
    async (_input: Parameters<typeof platformBillingRechargeRefundRepository.saveWechatRefundResult>[0]): Promise<PlatformRechargeRefundRequestRecord> => {
      events.push("save-wechat-result");
      return requestWithWechatResult;
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
  queryTransactionByOutTradeNo: mock(async () => {
    events.push("wechat-query-transaction");
    return {
      out_trade_no: "TC202607020001",
      transaction_id: "4200000001",
      trade_state: "SUCCESS",
      amount: { total: 10000, currency: "CNY" },
    };
  }),
  requestRefund: mock(async (_input?: unknown) => {
    events.push("wechat-refund");
    return createRefundRequestResult();
  }),
  queryRefundByOutRefundNo: mock(async () => {
    events.push("wechat-query-refund");
    return {
      ...createRefundPayload(),
      requestId: "wechat-refund-query-request-id",
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
async function expectExecuteRejectsWithCode(code: string) {
  const service = await createService();
  await expect(service.execute(authContext, "refund-request-1"))
    .rejects.toMatchObject({ code });
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
    wechatPayGateway.queryTransactionByOutTradeNo.mockImplementation(async () => {
      events.push("wechat-query-transaction");
      return {
        out_trade_no: "TC202607020001",
        transaction_id: "4200000001",
        trade_state: "SUCCESS",
        amount: { total: 10000, currency: "CNY" },
      };
    });
    wechatPayGateway.requestRefund.mockImplementation(async () => {
      events.push("wechat-refund");
      return createRefundRequestResult();
    });
    wechatPayGateway.queryRefundByOutRefundNo.mockImplementation(async () => {
      events.push("wechat-query-refund");
      return {
        ...createRefundPayload(),
        requestId: "wechat-refund-query-request-id",
      };
    });
  });

  test("executes an approved refund request after marking request and order refunding", async () => {
    const service = await createService();
    const result = await service.execute(authContext, "refund-request-1");
    expect(wechatPayGateway.queryTransactionByOutTradeNo).toHaveBeenCalledWith({
      config: paymentConfig,
      outTradeNo: "TC202607020001",
      secretBundle: expect.objectContaining({ apiV3Key: "api-v3-key" }),
    });
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
      "wechat-query-transaction",
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
  test("persists only validated refund metadata and returns a safe domain result", async () => {
    const service = await createService();
    const result = await service.execute(authContext, "refund-request-1");
    const saveInput = repository.saveWechatRefundResult.mock.calls[0]?.[0];
    expect(saveInput).toMatchObject({
      outRefundNo: "TRR202607100800000001",
      wechatRefundId: "5030000000202607150000000001",
      refundAmountFen: 10000,
      metadata: {
        wechat_refund_status: "PROCESSING",
        wechat_request_id: "wechat-refund-request-id",
      },
    });
    expect(saveInput?.metadata).not.toHaveProperty("wechat_refund_response");
    expect(result.wechat_refund).toEqual({
      outRefundNo: "TRR202607100800000001",
      wechatRefundId: "5030000000202607150000000001",
      transactionId: "4200000001",
      outTradeNo: "TC202607020001",
      status: "PROCESSING",
      refundAmountFen: 10000,
      totalAmountFen: 10000,
      currency: "CNY",
      requestId: "wechat-refund-request-id",
    });
  });
  test("rejects a mismatched refund response without persisting it", async () => {
    wechatPayGateway.requestRefund.mockImplementation(async () => {
      events.push("wechat-refund");
      return createRefundRequestResult({ out_refund_no: "TRR-OTHER" });
    });
    await expectExecuteRejectsWithCode(
      "BILLING_RECHARGE_WECHAT_REFUND_MISMATCH",
    );
    expect(repository.saveWechatRefundResult).not.toHaveBeenCalled();
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
  test("rejects a response whose refund id differs from the stored id", async () => {
    repository.findRequestById.mockImplementation(async () => ({
      ...approvedRequest,
      status: "failed",
      out_refund_no: "TRR202607100800000001",
      wechat_refund_id: "5030000000202607150000009999",
    } satisfies PlatformRechargeRefundRequestRecord));
    await expectExecuteRejectsWithCode(
      "BILLING_RECHARGE_WECHAT_REFUND_MISMATCH",
    );
    expect(repository.saveWechatRefundResult).not.toHaveBeenCalled();
  });
  test("rejects execution when request is not approved or failed", async () => {
    repository.findRequestById.mockImplementation(async () => ({
      ...approvedRequest,
      status: "pending_review",
    } satisfies PlatformRechargeRefundRequestRecord));
    await expectExecuteRejectsWithCode(
      "BILLING_RECHARGE_REFUND_EXECUTE_STATE_INVALID",
    );
    expect(wechatPayGateway.requestRefund).not.toHaveBeenCalled();
  });
  test("rejects execution when order has no transaction id", async () => {
    repository.findRequestById.mockImplementation(async () => ({
      ...approvedRequest,
      order: { ...order, transaction_id: null },
    } satisfies PlatformRechargeRefundRequestRecord));
    await expectExecuteRejectsWithCode(
      "BILLING_RECHARGE_REFUND_TRANSACTION_ID_REQUIRED",
    );
    expect(repository.markRequestRefunding).not.toHaveBeenCalled();
    expect(wechatPayGateway.requestRefund).not.toHaveBeenCalled();
  });
  test("rejects execution before state changes when WeChat order is not paid", async () => {
    wechatPayGateway.queryTransactionByOutTradeNo.mockImplementation(async () => {
      events.push("wechat-query-transaction");
      return {
        out_trade_no: "TC202607020001",
        transaction_id: "4200000001",
        trade_state: "NOTPAY",
        amount: { total: 10000, currency: "CNY" },
      };
    });
    await expectExecuteRejectsWithCode(
      "BILLING_RECHARGE_WECHAT_TRANSACTION_NOT_SUCCESS",
    );
    expect(repository.markRequestRefunding).not.toHaveBeenCalled();
    expect(events).toEqual(["wechat-query-transaction"]);
  });
  test("rejects execution before state changes when WeChat transaction id differs", async () => {
    wechatPayGateway.queryTransactionByOutTradeNo.mockImplementation(async () => {
      events.push("wechat-query-transaction");
      return {
        out_trade_no: "TC202607020001",
        transaction_id: "4200000002",
        trade_state: "SUCCESS",
        amount: { total: 10000, currency: "CNY" },
      };
    });
    await expectExecuteRejectsWithCode(
      "BILLING_RECHARGE_WECHAT_TRANSACTION_MISMATCH",
    );
    expect(repository.markRequestRefunding).not.toHaveBeenCalled();
  });
  test("rejects execution before state changes when WeChat paid amount differs", async () => {
    wechatPayGateway.queryTransactionByOutTradeNo.mockImplementation(async () => {
      events.push("wechat-query-transaction");
      return {
        out_trade_no: "TC202607020001",
        transaction_id: "4200000001",
        trade_state: "SUCCESS",
        amount: { total: 9900, currency: "CNY" },
      };
    });
    await expectExecuteRejectsWithCode(
      "BILLING_RECHARGE_WECHAT_AMOUNT_MISMATCH",
    );
    expect(repository.markRequestRefunding).not.toHaveBeenCalled();
  });
  test("saves the queried refund when the refund request result is uncertain", async () => {
    wechatPayGateway.requestRefund.mockImplementation(async () => {
      events.push("wechat-refund");
      throw {
        code: "WECHAT_PAY_REFUND_REQUEST_FAILED",
        message: "微信退款请求超时",
      };
    });
    const service = await createService();
    const result = await service.execute(authContext, "refund-request-1");
    expect(wechatPayGateway.queryRefundByOutRefundNo).toHaveBeenCalledWith({
      config: paymentConfig,
      outRefundNo: "TRR202607100800000001",
      secretBundle: expect.objectContaining({ apiV3Key: "api-v3-key" }),
    });
    expect(repository.saveWechatRefundResult).toHaveBeenCalledWith(
      expect.objectContaining({
        outRefundNo: "TRR202607100800000001",
        wechatRefundId: "5030000000202607150000000001",
      }),
    );
    expect(events).toEqual([
      "wechat-query-transaction",
      "mark-request-refunding",
      "mark-order-refunding",
      "wechat-refund",
      "wechat-query-refund",
      "save-wechat-result",
    ]);
    expect(result.wechat_refund).toMatchObject({ status: "PROCESSING" });
  });
  test("strictly checks a refund-query recovery result before persistence", async () => {
    wechatPayGateway.requestRefund.mockImplementation(async () => {
      events.push("wechat-refund");
      throw { code: "WECHAT_PAY_REFUND_REQUEST_FAILED" };
    });
    wechatPayGateway.queryRefundByOutRefundNo.mockImplementation(async () => {
      events.push("wechat-query-refund");
      return {
        ...createRefundPayload({ transaction_id: "4200000002" }),
        requestId: "wechat-refund-query-request-id",
      };
    });
    await expectExecuteRejectsWithCode(
      "BILLING_RECHARGE_WECHAT_REFUND_MISMATCH",
    );
    expect(repository.saveWechatRefundResult).not.toHaveBeenCalled();
  });
  test("keeps refunding when both refund request and status query are uncertain", async () => {
    wechatPayGateway.requestRefund.mockImplementation(async () => {
      events.push("wechat-refund");
      throw {
        code: "WECHAT_PAY_REFUND_REQUEST_FAILED",
        message: "微信退款请求超时",
      };
    });
    wechatPayGateway.queryRefundByOutRefundNo.mockImplementation(async () => {
      events.push("wechat-query-refund");
      throw {
        code: "WECHAT_PAY_REFUND_QUERY_FAILED",
        message: "微信退款查询超时",
        details: { code: "SYSTEM_ERROR" },
      };
    });
    await expectExecuteRejectsWithCode(
      "BILLING_RECHARGE_REFUND_STATUS_UNKNOWN",
    );
    expect(repository.markOrderRefundStatus).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      "wechat-query-transaction",
      "mark-request-refunding",
      "mark-order-refunding",
      "wechat-refund",
      "wechat-query-refund",
    ]);
  });
  test("retries the same refund after the immediate query cannot find it", async () => {
    const refundInputs: unknown[] = [];
    let requestAttempts = 0;
    paymentConfigRepository.findWechatPayConfig.mockImplementation(
      async () => partnerPaymentConfig,
    );
    wechatPayGateway.requestRefund.mockImplementation(async (input) => {
      events.push("wechat-refund");
      refundInputs.push(input);
      requestAttempts += 1;
      if (requestAttempts === 1) {
        throw {
          code: "WECHAT_PAY_REFUND_REQUEST_FAILED",
          message: "微信退款请求超时",
        };
      }
      return createRefundRequestResult();
    });
    wechatPayGateway.queryRefundByOutRefundNo.mockImplementation(async () => {
      events.push("wechat-query-refund");
      throw {
        code: "WECHAT_PAY_REFUND_QUERY_FAILED",
        message: "退款单不存在",
        details: { code: "RESOURCE_NOT_EXISTS" },
      };
    });
    const service = await createService();
    const result = await service.execute(authContext, "refund-request-1");
    expect(wechatPayGateway.requestRefund).toHaveBeenCalledTimes(2);
    expect(wechatPayGateway.queryRefundByOutRefundNo).toHaveBeenCalledWith(
      expect.objectContaining({ config: partnerPaymentConfig }),
    );
    expect(refundInputs[1]).toEqual(refundInputs[0]);
    expect(refundInputs[1]).toMatchObject({
      config: partnerPaymentConfig,
      transactionId: "4200000001",
      outRefundNo: "TRR202607100800000001",
      reason: "客户误充值，需要申请退款",
      refundAmountFen: 10000,
      totalAmountFen: 10000,
    });
    expect(repository.saveWechatRefundResult).toHaveBeenCalled();
    expect(result.wechat_refund).toMatchObject({ status: "PROCESSING" });
  });
  test("keeps refunding when the same-parameter retry is also uncertain", async () => {
    const refundInputs: unknown[] = [];
    wechatPayGateway.requestRefund.mockImplementation(async (input) => {
      events.push("wechat-refund");
      refundInputs.push(input);
      throw {
        code: "WECHAT_PAY_REFUND_REQUEST_FAILED",
        message: "微信退款请求超时",
      };
    });
    wechatPayGateway.queryRefundByOutRefundNo.mockImplementation(async () => {
      events.push("wechat-query-refund");
      throw {
        code: "WECHAT_PAY_REFUND_QUERY_FAILED",
        message: "退款单不存在",
        details: { code: "RESOURCE_NOT_EXISTS" },
      };
    });
    await expectExecuteRejectsWithCode(
      "BILLING_RECHARGE_REFUND_STATUS_UNKNOWN",
    );
    expect(wechatPayGateway.requestRefund).toHaveBeenCalledTimes(2);
    expect(refundInputs[1]).toEqual(refundInputs[0]);
    expect(repository.markOrderRefundStatus).toHaveBeenCalledTimes(1);
  });
});
