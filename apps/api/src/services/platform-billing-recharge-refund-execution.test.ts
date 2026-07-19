import { beforeEach, describe, expect, test } from "bun:test";
import type { PlatformRechargeRefundRequestRecord } from "@/repositories/platform-billing-recharge-refunds";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import {
  approvedRequest,
  auditLogService,
  authContext,
  createRefundPayload,
  createRefundRequestResult,
  createTransactionQueryResult,
  events,
  order,
  partnerPaymentConfig,
  paymentConfig,
  paymentConfigRepository,
  repository,
  resetExecutionMocks,
  secretBundleService,
  wechatPayGateway,
} from "@/services/platform-billing-recharge-refund-execution.test-fixtures";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
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
    nowFactory: () => new Date("2026-07-18T04:00:00.000Z"),
  });
}
async function expectExecuteRejectsWithCode(code: string) {
  const service = await createService();
  await expect(service.execute(authContext, "refund-request-1"))
    .rejects.toMatchObject({ code });
}
describe("PlatformBillingRechargeRefundExecutionService", () => {
  beforeEach(() => {
    resetExecutionMocks();
  });

  test("atomically begins an approved refund before requesting WeChat refund", async () => {
    const service = await createService();
    const result = await service.execute(authContext, "refund-request-1");
    expect(wechatPayGateway.queryTransactionByOutTradeNo).toHaveBeenCalledWith({
      config: paymentConfig,
      outTradeNo: "TC202607020001",
      secretBundle: expect.objectContaining({ apiV3Key: "api-v3-key" }),
    });
    expect(repository.beginWechatRefund).toHaveBeenCalledWith({
      requestId: "refund-request-1",
      outRefundNo: "TRR202607100800000001",
      now: "2026-07-18T04:00:00.000Z",
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
      "begin-wechat-refund",
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
  test("rejects a lost begin race before requesting the WeChat refund", async () => {
    repository.beginWechatRefund.mockImplementationOnce(async () => {
      events.push("begin-wechat-refund");
      return null;
    });
    await expectExecuteRejectsWithCode(
      "BILLING_RECHARGE_REFUND_EXECUTE_STATE_INVALID",
    );
    expect(wechatPayGateway.requestRefund).not.toHaveBeenCalled();
  });
  test("uses the exact payment config stored on the paid order", async () => {
    const service = await createService();
    await service.execute(authContext, "refund-request-1");
    expect(paymentConfigRepository.findWechatPayConfigById)
      .toHaveBeenCalledWith("platform-config-1");
    expect(paymentConfigRepository.findWechatPayConfig).not.toHaveBeenCalled();
  });
  test("uses a complete historical config after it stops accepting new charges", async () => {
    const historicalConfig = {
      ...paymentConfig,
      status: "disabled",
      enabled_channels: [],
    } satisfies PlatformPaymentConfigRecord;
    paymentConfigRepository.findWechatPayConfigById.mockImplementationOnce(
      async () => historicalConfig,
    );
    const service = await createService();
    await service.execute(authContext, "refund-request-1");
    expect(wechatPayGateway.requestRefund).toHaveBeenCalledWith(
      expect.objectContaining({ config: historicalConfig }),
    );
  });
  test("rejects execution when the stored payment config no longer exists", async () => {
    paymentConfigRepository.findWechatPayConfigById.mockImplementationOnce(
      async () => null,
    );
    await expectExecuteRejectsWithCode(
      "BILLING_RECHARGE_PAYMENT_CONFIG_NOT_FOUND",
    );
    expect(repository.beginWechatRefund).not.toHaveBeenCalled();
  });
  test("rejects execution when the order has no stored payment config", async () => {
    repository.findRequestById.mockImplementationOnce(async () => ({
      ...approvedRequest,
      order: { ...order, payment_config_id: null },
    } satisfies PlatformRechargeRefundRequestRecord));
    await expectExecuteRejectsWithCode(
      "BILLING_RECHARGE_PAYMENT_CONFIG_REQUIRED",
    );
    expect(paymentConfigRepository.findWechatPayConfigById)
      .not.toHaveBeenCalled();
    expect(repository.beginWechatRefund).not.toHaveBeenCalled();
  });
  test("persists only validated refund metadata and returns a safe domain result", async () => {
    const service = await createService();
    const result = await service.execute(authContext, "refund-request-1");
    const saveInput = repository.saveWechatRefundResult.mock.calls[0]?.[0];
    const expectedMetadata = {
      correlation_id: "refund-correlation-1",
      wechat_refund_status: "PROCESSING",
      wechat_request_id: "wechat-refund-request-id",
      wechat_refund_executed_at: "2026-07-18T04:00:00.000Z",
    };
    expect(saveInput).toEqual({
      id: "refund-request-1",
      outRefundNo: "TRR202607100800000001",
      wechatRefundId: "5030000000202607150000000001",
      refundAmountFen: 10000,
      metadata: expectedMetadata,
    });
    expect(result.request.metadata).toEqual(expectedMetadata);
    const auditInput = auditLogService.recordBestEffort.mock.calls[0]?.[0];
    expect(auditInput?.metadata).toEqual({
      before_status: "approved",
      after_status: "refunding",
      order_id: "order-1",
      order_no: "TC202607020001",
      out_refund_no: "TRR202607100800000001",
      wechat_refund_id: "5030000000202607150000000001",
      wechat_refund_status: "PROCESSING",
      wechat_request_id: "wechat-refund-request-id",
      refund_amount_fen: 10000,
    });
    expect(JSON.stringify({ saveInput, auditInput }))
      .not.toContain("old-untrusted-authorization");
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
      successTime: null,
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
    expect(repository.beginWechatRefund).toHaveBeenCalledWith(
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
    expect(repository.beginWechatRefund).not.toHaveBeenCalled();
    expect(wechatPayGateway.requestRefund).not.toHaveBeenCalled();
  });
  test("rejects execution before state changes when WeChat order is not paid", async () => {
    wechatPayGateway.queryTransactionByOutTradeNo.mockImplementation(async () => {
      events.push("wechat-query-transaction");
      return createTransactionQueryResult(paymentConfig, {
        trade_state: "NOTPAY",
      });
    });
    await expectExecuteRejectsWithCode(
      "BILLING_RECHARGE_WECHAT_TRANSACTION_NOT_SUCCESS",
    );
    expect(repository.beginWechatRefund).not.toHaveBeenCalled();
    expect(events).toEqual(["wechat-query-transaction"]);
  });
  test("rejects execution before state changes when WeChat transaction id differs", async () => {
    wechatPayGateway.queryTransactionByOutTradeNo.mockImplementation(async () => {
      events.push("wechat-query-transaction");
      return createTransactionQueryResult(paymentConfig, {
        transaction_id: "4200000002",
      });
    });
    await expectExecuteRejectsWithCode(
      "BILLING_RECHARGE_WECHAT_TRANSACTION_MISMATCH",
    );
    expect(repository.beginWechatRefund).not.toHaveBeenCalled();
  });
  test("rejects execution before state changes when WeChat paid amount differs", async () => {
    wechatPayGateway.queryTransactionByOutTradeNo.mockImplementation(async () => {
      events.push("wechat-query-transaction");
      return createTransactionQueryResult(paymentConfig, {
        amount: { total: 9900, currency: "CNY" },
      });
    });
    await expectExecuteRejectsWithCode(
      "BILLING_RECHARGE_WECHAT_TRANSACTION_MISMATCH",
    );
    expect(repository.beginWechatRefund).not.toHaveBeenCalled();
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
      "begin-wechat-refund",
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
    expect(repository.beginWechatRefund).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      "wechat-query-transaction",
      "begin-wechat-refund",
      "wechat-refund",
      "wechat-query-refund",
    ]);
  });
  test("retries the same refund after the immediate query cannot find it", async () => {
    const refundInputs: unknown[] = [];
    let requestAttempts = 0;
    paymentConfigRepository.findWechatPayConfigById.mockImplementation(
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
    expect(repository.beginWechatRefund).toHaveBeenCalledTimes(1);
  });
});
