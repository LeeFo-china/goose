import { beforeEach, describe, expect, test } from "bun:test";

import {
  authContext,
  config,
  configId,
  createHarness,
  createService,
  employeeId,
  order,
  orderId,
  outRefundNo,
  outTradeNo,
  refundId,
  refundRequest,
  refundResponse,
  secretBundle,
  transactionId,
  transactionResponse,
} from "./platform-service-refund-execution.test-helpers";

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

  test("replays request A after a later request B refunded the order without gateway calls", async () => {
    harness.repository.findPlatformServiceRefundRequestById.mockResolvedValueOnce({
      ...refundRequest,
      status: "cancelled",
      provider_refund_status: "CLOSED",
      provider_out_refund_no: outRefundNo,
      provider_wechat_refund_id: "5030000000202608100000000001",
      provider_refund_amount_fen: 980000,
      provider_checked_at: "2026-08-10T10:30:00.000Z",
      provider_checked_by_employee_id: employeeId,
      order: {
        ...order,
        payment_status: "refunded",
        service_status: "canceled",
        service_access_terminated_at: "2026-08-11T10:30:00.000Z",
        service_access_termination_reason: "full_refund_confirmed",
        service_access_terminated_by_employee_id: employeeId,
      },
    });
    harness.repository.closeServiceRefund.mockResolvedValueOnce({
      refundRequest: {
        ...refundRequest,
        status: "cancelled",
        provider_refund_status: "CLOSED",
        provider_out_refund_no: outRefundNo,
        provider_wechat_refund_id: "5030000000202608100000000001",
        provider_refund_amount_fen: 980000,
        provider_checked_at: "2026-08-10T10:30:00.000Z",
        provider_checked_by_employee_id: employeeId,
      },
      order: {
        ...order,
        payment_status: "refunded",
        service_status: "canceled",
        service_access_terminated_at: "2026-08-11T10:30:00.000Z",
        service_access_termination_reason: "full_refund_confirmed",
        service_access_terminated_by_employee_id: employeeId,
      },
      providerStatus: "CLOSED",
      refunded: false,
      accessTerminated: false,
      retryable: false,
      idempotent: true,
    });
    const service = await createService(harness);

    const result = await service.execute(authContext, refundId);

    expect(result).toMatchObject({
      outcome: "provider_closed",
      idempotent: true,
      access_terminated: false,
    });
    expect(harness.repository.closeServiceRefund).toHaveBeenCalledTimes(1);
    expect(harness.paymentConfigRepository.findWechatPayConfigById).not.toHaveBeenCalled();
    expect(harness.gateway.queryTransactionByOutTradeNo).not.toHaveBeenCalled();
    expect(harness.gateway.requestRefund).not.toHaveBeenCalled();
    expect(harness.repository.confirmServiceRefund).not.toHaveBeenCalled();
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
