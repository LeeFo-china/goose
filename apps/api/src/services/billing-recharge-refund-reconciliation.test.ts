import { beforeAll, describe, expect, test } from "bun:test";

import { Errors } from "@/errors/error-factory";

import {
  CLAIM_TOKEN,
  createClaim,
  createHarness,
  createWechatRefundPayload,
  NOW,
} from "./billing-recharge-refund-reconciliation.test-fixtures";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let BillingRechargeRefundReconciliationService: typeof import(
  "./billing-recharge-refund-reconciliation"
)["BillingRechargeRefundReconciliationService"];
let refundReconcileDelayMs: typeof import(
  "./billing-recharge-refund-reconciliation"
)["refundReconcileDelayMs"];

beforeAll(async () => {
  const subject = await import("./billing-recharge-refund-reconciliation");
  BillingRechargeRefundReconciliationService =
    subject.BillingRechargeRefundReconciliationService;
  refundReconcileDelayMs = subject.refundReconcileDelayMs;
});

describe("refundReconcileDelayMs", () => {
  test("uses the approved attempt-based backoff schedule", () => {
    expect(refundReconcileDelayMs(1)).toBe(60_000);
    expect(refundReconcileDelayMs(5)).toBe(60_000);
    expect(refundReconcileDelayMs(6)).toBe(5 * 60_000);
    expect(refundReconcileDelayMs(7)).toBe(10 * 60_000);
    expect(refundReconcileDelayMs(8)).toBe(20 * 60_000);
    expect(refundReconcileDelayMs(9)).toBe(30 * 60_000);
    expect(refundReconcileDelayMs(100)).toBe(30 * 60_000);
  });
});

describe("BillingRechargeRefundReconciliationService", () => {
  test("rejects a batch limit outside 1 to 100 before claiming", async () => {
    const dependencies = createHarness();
    const service = new BillingRechargeRefundReconciliationService({
      ...dependencies,
      nowFactory: () => NOW,
      claimTokenFactory: () => CLAIM_TOKEN,
    });

    for (const limit of [0, 1.5, 101]) {
      await expect(service.runBatch({ limit })).rejects.toMatchObject({
        code: "BILLING_RECHARGE_REFUND_RECONCILE_LIMIT_INVALID",
      });
    }
    expect(dependencies.repository.claimDue).not.toHaveBeenCalled();
  });

  test("claims once and reschedules a processing refund", async () => {
    const dependencies = createHarness();
    const service = new BillingRechargeRefundReconciliationService({
      ...dependencies,
      nowFactory: () => NOW,
      claimTokenFactory: () => CLAIM_TOKEN,
    });

    const result = await service.runBatch({ limit: 20 });

    expect(dependencies.repository.claimDue).toHaveBeenCalledTimes(1);
    expect(dependencies.repository.claimDue).toHaveBeenCalledWith({
      limit: 20,
      leaseSeconds: 120,
      claimToken: CLAIM_TOKEN,
      now: NOW.toISOString(),
    });
    expect(dependencies.secretBundleService.load).toHaveBeenCalledWith(
      "secret://wechat-pay-config-1",
    );
    expect(
      dependencies.wechatPayGateway.queryRefundByOutRefundNo,
    ).toHaveBeenCalledWith({
      config: expect.objectContaining({ id: "payment-config-1" }),
      outRefundNo: "TRR202607190001",
      secretBundle: expect.objectContaining({ privateKeyPem: "private-key" }),
    });
    expect(dependencies.repository.reschedule).toHaveBeenCalledWith(
      expect.objectContaining({
        claimToken: CLAIM_TOKEN,
        reconcileNextAt: "2026-07-19T02:01:00.000Z",
        lastError: null,
      }),
    );
    expect(result).toEqual({
      claimed: 1,
      success: 0,
      processing: 1,
      closed: 0,
      abnormal: 0,
      rescheduled: 1,
      failed: 0,
    });
  });

  test("confirms SUCCESS with only validated values and the exact token", async () => {
    const claim = createClaim();
    const dependencies = createHarness([claim]);
    dependencies.wechatPayGateway.queryRefundByOutRefundNo.mockImplementation(
      async () => createWechatRefundPayload(claim, "SUCCESS"),
    );
    const service = new BillingRechargeRefundReconciliationService({
      ...dependencies,
      nowFactory: () => NOW,
      claimTokenFactory: () => CLAIM_TOKEN,
    });

    const result = await service.runBatch({ limit: 20 });

    expect(dependencies.repository.confirmSuccess).toHaveBeenCalledWith({
      refundRequestId: "10000000-0000-4000-8000-000000000001",
      claimToken: CLAIM_TOKEN,
      outRefundNo: "TRR202607190001",
      wechatRefundId: "5030000000202607190000000001",
      refundAmountFen: 10_000,
      refundedAt: "2026-07-19T10:01:02+08:00",
      metadata: {
        reconcile_source: "billing_reconcile_worker",
        reconcile_checked_at: NOW.toISOString(),
        wechat_refund_status: "SUCCESS",
        wechat_request_id: "wechat-request-id-1",
      },
    });
    expect(dependencies.repository.reschedule).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: 1, rescheduled: 0, failed: 0 });
  });

  test("closes CLOSED with the exact token and does not reschedule", async () => {
    const claim = createClaim();
    const dependencies = createHarness([claim]);
    dependencies.wechatPayGateway.queryRefundByOutRefundNo.mockImplementation(
      async () => createWechatRefundPayload(claim, "CLOSED"),
    );
    const service = new BillingRechargeRefundReconciliationService({
      ...dependencies,
      nowFactory: () => NOW,
      claimTokenFactory: () => CLAIM_TOKEN,
    });

    const result = await service.runBatch({ limit: 20 });

    expect(dependencies.repository.close).toHaveBeenCalledWith({
      refundRequestId: claim.id,
      claimToken: CLAIM_TOKEN,
      checkedAt: NOW.toISOString(),
      metadata: {
        reconcile_source: "billing_reconcile_worker",
        reconcile_checked_at: NOW.toISOString(),
        wechat_refund_status: "CLOSED",
        wechat_request_id: "wechat-request-id-1",
      },
    });
    expect(dependencies.repository.reschedule).not.toHaveBeenCalled();
    expect(result).toMatchObject({ closed: 1, rescheduled: 0, failed: 0 });
  });

  test("keeps ABNORMAL active with a stable error and a 30 minute delay", async () => {
    const claim = createClaim({ reconcile_attempt_count: 2 });
    const dependencies = createHarness([claim]);
    dependencies.wechatPayGateway.queryRefundByOutRefundNo.mockImplementation(
      async () => createWechatRefundPayload(claim, "ABNORMAL"),
    );
    const service = new BillingRechargeRefundReconciliationService({
      ...dependencies,
      nowFactory: () => NOW,
      claimTokenFactory: () => CLAIM_TOKEN,
    });

    const result = await service.runBatch({ limit: 20 });

    expect(dependencies.repository.reschedule).toHaveBeenCalledWith({
      refundRequestId: claim.id,
      claimToken: CLAIM_TOKEN,
      reconcileNextAt: "2026-07-19T02:30:00.000Z",
      checkedAt: NOW.toISOString(),
      lastError: "WECHAT_REFUND_ABNORMAL",
      metadata: {
        reconcile_source: "billing_reconcile_worker",
        reconcile_checked_at: NOW.toISOString(),
        wechat_refund_status: "ABNORMAL",
        wechat_request_id: "wechat-request-id-1",
      },
      wechatRefundId: "5030000000202607190000000001",
      refundAmountFen: 10_000,
    });
    expect(result).toMatchObject({
      abnormal: 1,
      rescheduled: 1,
      failed: 0,
    });
  });

  test("retries RESOURCE_NOT_EXISTS once with the exact original refund input", async () => {
    const claim = createClaim();
    const dependencies = createHarness([claim]);
    dependencies.wechatPayGateway.queryRefundByOutRefundNo.mockRejectedValue(
      Errors.business(
        502,
        "微信支付查询退款失败",
        "WECHAT_PAY_REFUND_QUERY_FAILED",
        { code: "RESOURCE_NOT_EXISTS" },
      ),
    );
    const service = new BillingRechargeRefundReconciliationService({
      ...dependencies,
      nowFactory: () => NOW,
      claimTokenFactory: () => CLAIM_TOKEN,
    });

    const result = await service.runBatch({ limit: 20 });

    expect(dependencies.wechatPayGateway.requestRefund).toHaveBeenCalledTimes(1);
    expect(dependencies.wechatPayGateway.requestRefund).toHaveBeenCalledWith({
      config: claim.config,
      secretBundle: expect.objectContaining({ privateKeyPem: "private-key" }),
      transactionId: claim.order?.transaction_id,
      outRefundNo: claim.out_refund_no,
      reason: claim.reason,
      refundAmountFen: claim.requested_amount_fen,
      totalAmountFen: claim.order?.paid_amount_fen,
    });
    expect(result).toMatchObject({
      processing: 1,
      rescheduled: 1,
      failed: 0,
    });
  });

  test("routes a certain retry SUCCESS through claimed confirmation", async () => {
    const claim = createClaim();
    const dependencies = createHarness([claim]);
    dependencies.wechatPayGateway.queryRefundByOutRefundNo.mockRejectedValue(
      Errors.business(502, "退款单不存在", "WECHAT_PAY_REFUND_QUERY_FAILED", {
        code: "RESOURCE_NOT_EXISTS",
      }),
    );
    const raw = createWechatRefundPayload(claim, "SUCCESS");
    dependencies.wechatPayGateway.requestRefund.mockResolvedValue({
      out_refund_no: raw.out_refund_no,
      refund_id: raw.refund_id,
      status: raw.status,
      requestId: raw.requestId,
      raw,
    });
    const service = new BillingRechargeRefundReconciliationService({
      ...dependencies,
      nowFactory: () => NOW,
      claimTokenFactory: () => CLAIM_TOKEN,
    });

    const result = await service.runBatch({ limit: 20 });

    expect(dependencies.repository.confirmSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        claimToken: CLAIM_TOKEN,
        refundedAt: "2026-07-19T10:01:02+08:00",
      }),
    );
    expect(result).toMatchObject({ success: 1, failed: 0 });
  });

  test("reschedules a second uncertain refund request without finalizing", async () => {
    const claim = createClaim({ reconcile_attempt_count: 6 });
    const dependencies = createHarness([claim]);
    dependencies.wechatPayGateway.queryRefundByOutRefundNo.mockRejectedValue(
      Errors.business(502, "退款单不存在", "WECHAT_PAY_REFUND_QUERY_FAILED", {
        code: "RESOURCE_NOT_EXISTS",
      }),
    );
    dependencies.wechatPayGateway.requestRefund.mockRejectedValue(
      Errors.business(504, "微信支付接口请求超时", "WECHAT_PAY_TRANSPORT_TIMEOUT", {
        requestId: "wechat-uncertain-request-id",
        authorization: "must-not-leak",
      }),
    );
    const service = new BillingRechargeRefundReconciliationService({
      ...dependencies,
      nowFactory: () => NOW,
      claimTokenFactory: () => CLAIM_TOKEN,
    });

    const result = await service.runBatch({ limit: 20 });

    expect(dependencies.repository.reschedule).toHaveBeenCalledWith({
      refundRequestId: claim.id,
      claimToken: CLAIM_TOKEN,
      reconcileNextAt: "2026-07-19T02:05:00.000Z",
      checkedAt: NOW.toISOString(),
      lastError: "WECHAT_PAY_TRANSPORT_TIMEOUT",
      metadata: {
        reconcile_source: "billing_reconcile_worker",
        reconcile_checked_at: NOW.toISOString(),
        wechat_refund_status: null,
        wechat_request_id: "wechat-uncertain-request-id",
      },
      wechatRefundId: claim.wechat_refund_id,
      refundAmountFen: claim.refund_amount_fen,
    });
    expect(dependencies.repository.confirmSuccess).not.toHaveBeenCalled();
    expect(dependencies.repository.close).not.toHaveBeenCalled();
    expect(result).toMatchObject({ rescheduled: 1, failed: 1 });
  });

  for (
    const errorCode of [
      "WECHAT_PAY_RESPONSE_SIGNATURE_INVALID",
      "WECHAT_PAY_TRANSPORT_TIMEOUT",
    ]
  ) {
    test(`reschedules ${errorCode} without a terminal write`, async () => {
      const claim = createClaim();
      const dependencies = createHarness([claim]);
      dependencies.wechatPayGateway.queryRefundByOutRefundNo.mockRejectedValue(
        Errors.business(502, "微信退款查单不确定", errorCode),
      );
      const service = new BillingRechargeRefundReconciliationService({
        ...dependencies,
        nowFactory: () => NOW,
        claimTokenFactory: () => CLAIM_TOKEN,
      });

      const result = await service.runBatch({ limit: 20 });

      expect(dependencies.repository.reschedule).toHaveBeenCalledWith(
        expect.objectContaining({ lastError: errorCode }),
      );
      expect(dependencies.repository.confirmSuccess).not.toHaveBeenCalled();
      expect(dependencies.repository.close).not.toHaveBeenCalled();
      expect(result).toMatchObject({ rescheduled: 1, failed: 1 });
    });
  }

  test("reschedules a bound-field mismatch without trusting the payload", async () => {
    const claim = createClaim();
    const dependencies = createHarness([claim]);
    dependencies.wechatPayGateway.queryRefundByOutRefundNo.mockImplementation(
      async () => ({
        ...createWechatRefundPayload(claim),
        transaction_id: "different-transaction",
        authorization: "must-not-leak",
      }),
    );
    const service = new BillingRechargeRefundReconciliationService({
      ...dependencies,
      nowFactory: () => NOW,
      claimTokenFactory: () => CLAIM_TOKEN,
    });

    const result = await service.runBatch({ limit: 20 });

    expect(dependencies.repository.reschedule).toHaveBeenCalledWith(
      expect.objectContaining({
        lastError: "BILLING_RECHARGE_WECHAT_REFUND_MISMATCH",
        metadata: {
          reconcile_source: "billing_reconcile_worker",
          reconcile_checked_at: NOW.toISOString(),
          wechat_refund_status: null,
          wechat_request_id: null,
        },
      }),
    );
    expect(JSON.stringify(
      dependencies.repository.reschedule.mock.calls[0]?.[0],
    )).not.toContain("must-not-leak");
    expect(result).toMatchObject({ rescheduled: 1, failed: 1 });
  });

  test("treats false or null finalization as a callback-wins race", async () => {
    const successClaim = createClaim();
    const closedClaim = createClaim({
      id: "10000000-0000-4000-8000-000000000002",
      out_refund_no: "TRR202607190002",
      wechat_refund_id: "5030000000202607190000000002",
    });
    const processingClaim = createClaim({
      id: "10000000-0000-4000-8000-000000000003",
      out_refund_no: "TRR202607190003",
      wechat_refund_id: "5030000000202607190000000003",
    });
    const dependencies = createHarness([
      successClaim,
      closedClaim,
      processingClaim,
    ]);
    dependencies.repository.confirmSuccess.mockResolvedValue(null);
    dependencies.repository.close.mockResolvedValue(false);
    dependencies.repository.reschedule.mockResolvedValue(false);
    dependencies.wechatPayGateway.queryRefundByOutRefundNo
      .mockImplementationOnce(async () =>
        createWechatRefundPayload(successClaim, "SUCCESS")
      )
      .mockImplementationOnce(async () =>
        createWechatRefundPayload(closedClaim, "CLOSED")
      )
      .mockImplementationOnce(async () =>
        createWechatRefundPayload(processingClaim, "PROCESSING")
      );
    const service = new BillingRechargeRefundReconciliationService({
      ...dependencies,
      nowFactory: () => NOW,
      claimTokenFactory: () => CLAIM_TOKEN,
    });

    const result = await service.runBatch({ limit: 20 });

    expect(result).toEqual({
      claimed: 3,
      success: 1,
      processing: 1,
      closed: 1,
      abnormal: 0,
      rescheduled: 0,
      failed: 0,
    });
  });

  test("continues with later claims after one row fails", async () => {
    const firstClaim = createClaim();
    const secondClaim = createClaim({
      id: "10000000-0000-4000-8000-000000000002",
      out_refund_no: "TRR202607190002",
      wechat_refund_id: "5030000000202607190000000002",
    });
    const dependencies = createHarness([firstClaim, secondClaim]);
    dependencies.wechatPayGateway.queryRefundByOutRefundNo
      .mockImplementationOnce(async () => ({
        ...createWechatRefundPayload(firstClaim),
        transaction_id: "mismatched-transaction",
      }))
      .mockImplementationOnce(async () =>
        createWechatRefundPayload(secondClaim, "PROCESSING")
      );
    const service = new BillingRechargeRefundReconciliationService({
      ...dependencies,
      nowFactory: () => NOW,
      claimTokenFactory: () => CLAIM_TOKEN,
    });

    const result = await service.runBatch({ limit: 20 });

    expect(
      dependencies.wechatPayGateway.queryRefundByOutRefundNo,
    ).toHaveBeenCalledTimes(2);
    expect(dependencies.repository.reschedule).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      claimed: 2,
      processing: 1,
      rescheduled: 2,
      failed: 1,
    });
  });
});
