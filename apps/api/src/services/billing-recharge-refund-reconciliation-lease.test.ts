import { beforeAll, describe, expect, test } from "bun:test";

import { Errors } from "@/errors/error-factory";

import {
  CLAIM_TOKEN,
  createClaim,
  createHarness,
  createWechatRefundPayload,
} from "./billing-recharge-refund-reconciliation.test-fixtures";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Service: typeof import(
  "./billing-recharge-refund-reconciliation"
)["BillingRechargeRefundReconciliationService"];

beforeAll(async () => {
  const subject = await import("./billing-recharge-refund-reconciliation");
  Service = subject.BillingRechargeRefundReconciliationService;
});

describe("BillingRechargeRefundReconciliationService lease safety", () => {
  test("does not start a later row after the safe lease cutoff", async () => {
    const firstClaim = createClaim();
    const secondClaim = createClaim({
      id: "10000000-0000-4000-8000-000000000002",
      out_refund_no: "TRR202607190002",
      wechat_refund_id: "5030000000202607190000000002",
    });
    const dependencies = createHarness([firstClaim, secondClaim]);
    const nowFactory = advancingClock([
      "2026-07-19T02:00:00.000Z",
      "2026-07-19T02:00:00.000Z",
      "2026-07-19T02:00:00.000Z",
      "2026-07-19T02:00:00.000Z",
      "2026-07-19T02:01:31.000Z",
      "2026-07-19T02:01:31.000Z",
    ]);
    const service = new Service({
      ...dependencies,
      nowFactory,
      claimTokenFactory: () => CLAIM_TOKEN,
    });

    const result = await service.runBatch({ limit: 20 });

    expect(
      dependencies.wechatPayGateway.queryRefundByOutRefundNo,
    ).toHaveBeenCalledTimes(1);
    expect(dependencies.secretBundleService.load).toHaveBeenCalledTimes(1);
    expect(dependencies.repository.reschedule).toHaveBeenCalledTimes(1);
    expect(dependencies.repository.reschedule).toHaveBeenCalledWith(
      expect.objectContaining({ refundRequestId: firstClaim.id }),
    );
    expect(result).toEqual({
      claimed: 2,
      success: 0,
      processing: 1,
      closed: 0,
      abnormal: 0,
      rescheduled: 1,
      failed: 0,
    });
  });

  test("does not start a query when preparation crosses the cutoff", async () => {
    const dependencies = createHarness();
    const service = new Service({
      ...dependencies,
      nowFactory: advancingClock([
        "2026-07-19T02:00:00.000Z",
        "2026-07-19T02:01:20.000Z",
        "2026-07-19T02:01:20.000Z",
        "2026-07-19T02:01:31.000Z",
      ]),
      claimTokenFactory: () => CLAIM_TOKEN,
    });

    const result = await service.runBatch({ limit: 20 });

    expect(dependencies.secretBundleService.load).toHaveBeenCalledTimes(1);
    expect(
      dependencies.wechatPayGateway.queryRefundByOutRefundNo,
    ).not.toHaveBeenCalled();
    expect(dependencies.repository.reschedule).not.toHaveBeenCalled();
    expect(result).toEqual({
      claimed: 1,
      success: 0,
      processing: 0,
      closed: 0,
      abnormal: 0,
      rescheduled: 0,
      failed: 0,
    });
  });

  test("does not retry a missing refund after the retry safety cutoff", async () => {
    const claim = createClaim({ reconcile_attempt_count: 1 });
    const dependencies = createHarness([claim]);
    dependencies.wechatPayGateway.queryRefundByOutRefundNo.mockRejectedValue(
      Errors.business(502, "退款单不存在", "WECHAT_PAY_REFUND_QUERY_FAILED", {
        code: "RESOURCE_NOT_EXISTS",
        requestId: "wechat-query-request-id",
      }),
    );
    const service = new Service({
      ...dependencies,
      nowFactory: advancingClock([
        "2026-07-19T02:00:00.000Z",
        "2026-07-19T02:00:00.000Z",
        "2026-07-19T02:00:00.000Z",
        "2026-07-19T02:00:00.000Z",
        "2026-07-19T02:01:45.000Z",
      ]),
      claimTokenFactory: () => CLAIM_TOKEN,
    });

    const result = await service.runBatch({ limit: 20 });

    expect(dependencies.wechatPayGateway.requestRefund).not.toHaveBeenCalled();
    expect(dependencies.repository.reschedule).toHaveBeenCalledWith(
      expect.objectContaining({
        checkedAt: "2026-07-19T02:01:45.000Z",
        reconcileNextAt: "2026-07-19T02:02:45.000Z",
        lastError: "BILLING_RECHARGE_REFUND_RECONCILE_LEASE_BUDGET_EXHAUSTED",
        metadata: expect.objectContaining({
          reconcile_checked_at: "2026-07-19T02:01:45.000Z",
          wechat_refund_status: null,
          wechat_request_id: "wechat-query-request-id",
        }),
      }),
    );
    expect(result).toMatchObject({ rescheduled: 1, failed: 1 });
  });

  test("bases checked and next times on actual row completion", async () => {
    const dependencies = createHarness();
    const service = new Service({
      ...dependencies,
      nowFactory: advancingClock([
        "2026-07-19T02:00:00.000Z",
        "2026-07-19T02:00:10.000Z",
        "2026-07-19T02:00:10.000Z",
        "2026-07-19T02:00:10.000Z",
        "2026-07-19T02:00:45.000Z",
      ]),
      claimTokenFactory: () => CLAIM_TOKEN,
    });

    await service.runBatch({ limit: 20 });

    expect(dependencies.repository.reschedule).toHaveBeenCalledWith(
      expect.objectContaining({
        checkedAt: "2026-07-19T02:00:45.000Z",
        reconcileNextAt: "2026-07-19T02:01:45.000Z",
        metadata: expect.objectContaining({
          reconcile_checked_at: "2026-07-19T02:00:45.000Z",
        }),
      }),
    );
  });

  test("rejects an invalid injected clock before claiming", async () => {
    const dependencies = createHarness();
    const service = new Service({
      ...dependencies,
      nowFactory: () => new Date("invalid"),
      claimTokenFactory: () => CLAIM_TOKEN,
    });

    await expect(service.runBatch({ limit: 20 })).rejects.toMatchObject({
      code: "BILLING_RECHARGE_REFUND_RECONCILE_CLOCK_INVALID",
    });
    expect(dependencies.repository.claimDue).not.toHaveBeenCalled();
  });

  test("preserves ABNORMAL semantics when its first reschedule throws", async () => {
    const claim = createClaim({ reconcile_attempt_count: 2 });
    const dependencies = createHarness([claim]);
    dependencies.wechatPayGateway.queryRefundByOutRefundNo.mockResolvedValue(
      createWechatRefundPayload(claim, "ABNORMAL"),
    );
    dependencies.repository.reschedule
      .mockRejectedValueOnce(Errors.dbError("第一次重排失败"))
      .mockResolvedValueOnce(true);
    const service = new Service({
      ...dependencies,
      nowFactory: advancingClock([
        "2026-07-19T02:00:00.000Z",
        "2026-07-19T02:00:00.000Z",
        "2026-07-19T02:00:00.000Z",
        "2026-07-19T02:00:00.000Z",
        "2026-07-19T02:00:20.000Z",
        "2026-07-19T02:00:21.000Z",
      ]),
      claimTokenFactory: () => CLAIM_TOKEN,
    });

    const result = await service.runBatch({ limit: 20 });

    expect(dependencies.repository.reschedule).toHaveBeenCalledTimes(2);
    expect(dependencies.repository.reschedule.mock.calls[0]?.[0]).toEqual(
      dependencies.repository.reschedule.mock.calls[1]?.[0],
    );
    expect(dependencies.repository.reschedule.mock.calls[1]?.[0]).toMatchObject({
      checkedAt: "2026-07-19T02:00:20.000Z",
      reconcileNextAt: "2026-07-19T02:30:20.000Z",
      lastError: "WECHAT_REFUND_ABNORMAL",
      metadata: expect.objectContaining({
        reconcile_checked_at: "2026-07-19T02:00:20.000Z",
        wechat_refund_status: "ABNORMAL",
      }),
    });
    expect(result).toMatchObject({
      abnormal: 1,
      rescheduled: 1,
      failed: 1,
    });
  });
});

function advancingClock(values: string[]) {
  let index = 0;
  return () => {
    const value = values[Math.min(index, values.length - 1)]!;
    index += 1;
    return new Date(value);
  };
}
