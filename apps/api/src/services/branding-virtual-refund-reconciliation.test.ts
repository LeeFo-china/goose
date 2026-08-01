import { describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
import type { BrandingVirtualRefundReconciliationClaim } from
  "@/repositories/branding-virtual-refund-reconciliation";

const claim: BrandingVirtualRefundReconciliationClaim = {
  refund_id: "11111111-1111-4111-8111-111111111111",
  order_id: "22222222-2222-4222-8222-222222222222",
  claim_token: "33333333-3333-4333-8333-333333333333",
  claim_expires_at: "2026-08-01T00:02:00.000Z",
  attempt_count: 1, refund_status: "submitted" as const,
  compensation_status: "pending" as const,
  platform_mode: "merchant_initiated" as const,
  out_trade_no: "BV202608010001", payer_openid: "payer-openid",
  environment: "production" as const, secret_revision: 1,
  amount_fen: 100, provider_order_no: "wx-order-1",
};

const queryResult = (status: 5 | 7 | 8) => ({
  requestId: null, environment: "production" as const,
  orderId: claim.out_trade_no, status, businessType: 0 as const,
  orderType: 0 as const, orderFee: 100, couponFee: null,
  paidFee: 100, refundFee: status === 7 ? 0 : 100,
  leftFee: status === 7 ? 100 : 0,
  createdAt: 1, updatedAt: 2, paidAt: 1, providedAt: 1,
  wechatOrderId: "wx-order-1", channelOrderId: null,
  wechatPayOrderId: null, settledAt: null, settlementState: null,
  platformFeeFen: null, cpsFeeFen: null,
});

async function setup(
  overrides: Partial<BrandingVirtualRefundReconciliationClaim> = {},
  status: 5 | 7 | 8 = 5,
) {
  const current = { ...claim, ...overrides };
  const repository = {
    claim: mock(async () => [current]), finalize: mock(async () => undefined),
    reschedule: mock(async () => undefined),
  };
  const compensate = mock(async () => ({ refund_id: current.refund_id,
    compensation_status: "succeeded" as const,
    compensation_entitlement_event_id: "44444444-4444-4444-8444-444444444444" }));
  const gateway = { queryOrder: mock(async () => ({
    ...queryResult(status), orderType: current.platform_mode === "apple_external"
      ? 7 as const : 0 as const,
  })) };
  const { BrandingVirtualRefundReconciliationService } = await import(
    "./branding-virtual-refund-reconciliation"
  );
  const service = new BrandingVirtualRefundReconciliationService({
    repository: repository as never, refunds: { compensate }, gateway,
    accessToken: { getAccessToken: async () => "token" },
    settings: { getPlatformSecretString: async () => JSON.stringify({
      revision: 1, appKey: "a".repeat(32),
    }) },
    now: () => new Date("2026-08-01T00:00:00.000Z"),
  });
  return { service, repository, gateway, compensate };
}

describe("virtual refund reconciliation", () => {
  test("accepts merchant status 5 and compensates", async () => {
    const subject = await setup({}, 5);
    const result = await subject.service.reconcile({ batchSize: 20 });
    expect(subject.repository.finalize).toHaveBeenCalledWith(expect.objectContaining({
      officialStatus: 5, refundFeeFen: 100, leftFeeFen: 0,
    }));
    expect(subject.compensate).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ refundSucceeded: 1, refundCompensated: 1 });
  });

  test("does not accept merchant status 8 or Apple status 5", async () => {
    for (const [platform_mode, status] of [
      ["merchant_initiated", 8], ["apple_external", 5],
    ] as const) {
      const subject = await setup({ platform_mode }, status);
      const telemetry = await subject.service.reconcile({ batchSize: 20 });
      expect(subject.repository.finalize).not.toHaveBeenCalled();
      expect(subject.repository.reschedule).toHaveBeenCalledTimes(1);
      expect(telemetry.refundFailed).toBe(0);
      expect(telemetry.refundPending).toBe(1);
    }
  });

  test("accepts Apple status 8 and status 7 as a terminal failure", async () => {
    const apple = await setup({ platform_mode: "apple_external",
      refund_status: "external_required" }, 8);
    await apple.service.reconcile({ batchSize: 20 });
    expect(apple.repository.finalize).toHaveBeenCalledWith(expect.objectContaining({
      officialStatus: 8,
    }));
    const failed = await setup({}, 7);
    await failed.service.reconcile({ batchSize: 20 });
    expect(failed.repository.finalize).toHaveBeenCalledWith(expect.objectContaining({
      officialStatus: 7,
    }));
    expect(failed.compensate).not.toHaveBeenCalled();
  });

  test("compensates an already succeeded refund without querying", async () => {
    const subject = await setup({ refund_status: "succeeded" });
    const result = await subject.service.reconcile({ batchSize: 20 });
    expect(subject.gateway.queryOrder).not.toHaveBeenCalled();
    expect(subject.compensate).toHaveBeenCalledTimes(1);
    expect(result.refundCompensated).toBe(1);
  });

  test("persists a compensation failure independently after refund success", async () => {
    const subject = await setup({}, 5);
    subject.compensate.mockRejectedValueOnce({ code: "DB_ERROR" });
    const result = await subject.service.reconcile({ batchSize: 20 });
    expect(subject.repository.finalize).toHaveBeenCalledTimes(1);
    expect(subject.repository.reschedule).toHaveBeenCalledWith(
      expect.objectContaining({
        refundId: claim.refund_id,
        claimToken: claim.claim_token,
        errorCode: "DB_ERROR",
      }),
    );
    expect(result).toMatchObject({ refundSucceeded: 1, refundFailed: 1 });
  });

  test("caps compensation concurrency at twenty", async () => {
    const { BrandingVirtualRefundReconciliationService } = await import(
      "./branding-virtual-refund-reconciliation"
    );
    const claims = Array.from({ length: 25 }, (_, index) => ({
      ...claim, refund_id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      refund_status: "succeeded" as const,
    }));
    let active = 0;
    let maximum = 0;
    const compensate = mock(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return { refund_id: claim.refund_id, compensation_status: "succeeded" as const,
        compensation_entitlement_event_id: claim.order_id };
    });
    const service = new BrandingVirtualRefundReconciliationService({
      repository: { claim: async () => claims, finalize: async () => undefined,
        reschedule: async () => undefined } as never,
      refunds: { compensate }, now: () => new Date("2026-08-01T00:00:00Z"),
    });
    await service.reconcile({ batchSize: 100 });
    expect(maximum).toBeLessThanOrEqual(20);
    expect(maximum).toBe(20);
  });

  test("memoizes one token and one secret per environment for a batch", async () => {
    const { BrandingVirtualRefundReconciliationService } = await import(
      "./branding-virtual-refund-reconciliation"
    );
    const claims = ["production", "production", "sandbox"].map((environment, index) => ({
      ...claim, refund_id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      out_trade_no: `BV20260801000${index}`,
      environment: environment as "sandbox" | "production",
    }));
    const token = mock(async () => "token");
    const setting = mock(async () => JSON.stringify({ revision: 1, appKey: "a".repeat(32) }));
    const service = new BrandingVirtualRefundReconciliationService({
      repository: { claim: async () => claims, finalize: async () => undefined,
        reschedule: async () => undefined } as never,
      gateway: { queryOrder: async (input) => ({
        ...queryResult(5), status: 0 as const, orderId: input.orderId!,
        environment: input.environment,
      }) },
      accessToken: { getAccessToken: token },
      settings: { getPlatformSecretString: setting },
      now: () => new Date("2026-08-01T00:00:00Z"),
    });
    const result = await service.reconcile({ batchSize: 20 });
    expect(token).toHaveBeenCalledTimes(1);
    expect(setting).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ refundPending: 3, refundRescheduled: 3,
      refundFailed: 0 });
  });

  test.each([
    ["orderFee", 99], ["paidFee", 99], ["orderType", 7],
  ] as const)("rejects a mismatched query %s binding", async (field, value) => {
    const subject = await setup({}, 5);
    subject.gateway.queryOrder.mockResolvedValueOnce({
      ...queryResult(5), [field]: value,
    });
    const telemetry = await subject.service.reconcile({ batchSize: 20 });
    expect(subject.repository.finalize).not.toHaveBeenCalled();
    expect(subject.repository.reschedule).toHaveBeenCalledTimes(1);
    expect(telemetry.refundFailed).toBe(1);
  });
});
