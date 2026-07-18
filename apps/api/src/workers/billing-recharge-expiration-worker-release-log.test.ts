import { describe, expect, mock, test } from "bun:test";
import type { BillingRechargeExpirationTelemetry } from "@/services/billing-recharge-expiration";

describe("billing recharge expiration worker release diagnostics", () => {
  test("emits one sanitized structured warning for each release failure", async () => {
    const { createBillingRechargeExpirationWorker } = await import(
      "./billing-recharge-expiration-worker"
    );
    const entries: Record<string, unknown>[] = [];
    const telemetry = {
      claimed: 1,
      paid: 0,
      closed: 0,
      retried: 1,
      failed: 0,
      release_failed: 1,
      release_failures: [{
        order_id: "order-1",
        diagnostic: "BILLING_RECHARGE_EXPIRE_TRADE_STATE_RETRY",
        error_code: "unsafe code with secret",
        error_message: "postgres://user:secret@internal-db.example/private",
      }],
    } as unknown as BillingRechargeExpirationTelemetry;
    const runExpiredOrderChecks = mock(async () => telemetry);
    const worker = createBillingRechargeExpirationWorker({
      service: { runExpiredOrderChecks },
      environment: {},
      now: () => 1_000,
      logger: (entry) => entries.push(entry),
    });

    await worker.tick();

    expect(entries).toContainEqual(expect.objectContaining({
      level: "warn",
      service: "billing-recharge-expiration-worker",
      message: "release close claim failed",
      order_id: "order-1",
      diagnostic: "BILLING_RECHARGE_EXPIRE_TRADE_STATE_RETRY",
      error_code: "BILLING_RECHARGE_EXPIRE_RELEASE_FAILED",
      error_message: "释放充值过期订单租约失败",
    }));
    expect(JSON.stringify(entries)).not.toContain("internal-db.example");
    expect(JSON.stringify(entries)).not.toContain("unsafe code with secret");
  });
});
