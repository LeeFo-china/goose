import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { TenantCreditOrderRecord } from "@/repositories/billing-recharge";
import type { PlatformRechargeRefundRequestRecord } from "@/repositories/platform-billing-recharge-refunds";
import {
  approvedRequest,
  authContext,
  failedRequest,
  order,
  paymentConfig,
  refundingRequest,
  requestWithWechatResult,
} from "@/services/platform-billing-recharge-refund-execution.test-fixtures";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

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
  queryRefundByOutRefundNo: mock(async () => {
    events.push("wechat-query-refund");
    return {
      out_refund_no: "TRR202607100800000001",
      refund_id: "5030000000202607150000000001",
      status: "PROCESSING",
      amount: { refund: 10000, total: 10000, currency: "CNY" },
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
    wechatPayGateway.queryRefundByOutRefundNo.mockImplementation(async () => {
      events.push("wechat-query-refund");
      return {
        out_refund_no: "TRR202607100800000001",
        refund_id: "5030000000202607150000000001",
        status: "PROCESSING",
        amount: { refund: 10000, total: 10000, currency: "CNY" },
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
    const service = await createService();

    await expect(
      service.execute(authContext, "refund-request-1"),
    ).rejects.toMatchObject({
      code: "BILLING_RECHARGE_WECHAT_TRANSACTION_NOT_SUCCESS",
    });
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
    const service = await createService();

    await expect(
      service.execute(authContext, "refund-request-1"),
    ).rejects.toMatchObject({
      code: "BILLING_RECHARGE_WECHAT_TRANSACTION_MISMATCH",
    });
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
    const service = await createService();

    await expect(
      service.execute(authContext, "refund-request-1"),
    ).rejects.toMatchObject({
      code: "BILLING_RECHARGE_WECHAT_AMOUNT_MISMATCH",
    });
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
    expect(repository.markRequestFailed).not.toHaveBeenCalled();
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
    const service = await createService();

    await expect(
      service.execute(authContext, "refund-request-1"),
    ).rejects.toMatchObject({
      code: "BILLING_RECHARGE_REFUND_STATUS_UNKNOWN",
    });
    expect(repository.markRequestFailed).not.toHaveBeenCalled();
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
      const raw = {
        out_refund_no: "TRR202607100800000001",
        refund_id: "5030000000202607150000000001",
        status: "PROCESSING",
      };
      return { ...raw, raw };
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
    expect(refundInputs[1]).toEqual(refundInputs[0]);
    expect(refundInputs[1]).toMatchObject({
      transactionId: "4200000001",
      outRefundNo: "TRR202607100800000001",
      reason: "客户误充值，需要申请退款",
      refundAmountFen: 10000,
      totalAmountFen: 10000,
    });
    expect(repository.markRequestFailed).not.toHaveBeenCalled();
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
    const service = await createService();

    await expect(
      service.execute(authContext, "refund-request-1"),
    ).rejects.toMatchObject({
      code: "BILLING_RECHARGE_REFUND_STATUS_UNKNOWN",
    });
    expect(wechatPayGateway.requestRefund).toHaveBeenCalledTimes(2);
    expect(refundInputs[1]).toEqual(refundInputs[0]);
    expect(repository.markRequestFailed).not.toHaveBeenCalled();
    expect(repository.markOrderRefundStatus).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      "wechat-query-transaction",
      "mark-request-refunding",
      "mark-order-refunding",
      "wechat-refund",
      "wechat-query-refund",
      "wechat-refund",
    ]);
  });
});
