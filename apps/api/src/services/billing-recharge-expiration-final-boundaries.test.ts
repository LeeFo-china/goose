import { describe, expect, test } from "bun:test";
import {
  createExpirationHarness,
  makeOrder,
} from "./billing-recharge-expiration.test-helpers";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("BillingRechargeExpirationService final ownership boundaries", () => {
  test("does not remotely close NOTPAY after losing the second lease renewal", async () => {
    const order = makeOrder();
    const harness = await createExpirationHarness({ orders: [order] });
    harness.queryTransaction.mockImplementationOnce(async () => ({
      trade_state: "NOTPAY",
    }));
    harness.repository.renewCloseClaim
      .mockImplementationOnce(async () => order)
      .mockImplementationOnce(async () => null);

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 1 });

    expect(harness.repository.renewCloseClaim).toHaveBeenCalledTimes(2);
    expect(harness.wechatPayGateway.closeTransactionByOutTradeNo).not
      .toHaveBeenCalled();
    expect(harness.repository.markOrderClosed).not.toHaveBeenCalled();
    expect(result).toMatchObject({ claimed: 1, retried: 1, closed: 0 });
  });

  test("returns a safe per-order diagnostic when releasing a claim fails", async () => {
    const order = makeOrder();
    const harness = await createExpirationHarness({ orders: [order] });
    harness.queryTransaction.mockImplementationOnce(async () => ({
      trade_state: "USERPAYING",
    }));
    harness.repository.releaseCloseClaim.mockImplementationOnce(async () => {
      throw new Error("postgres://user:secret@internal-db.example/private");
    });

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 1 });

    expect(result).toMatchObject({
      release_failed: 1,
      release_failures: [{
        order_id: order.id,
        diagnostic: "BILLING_RECHARGE_EXPIRE_TRADE_STATE_RETRY",
        error_code: "BILLING_RECHARGE_EXPIRE_RELEASE_FAILED",
        error_message: "释放充值过期订单租约失败",
      }],
    });
    expect(JSON.stringify(result)).not.toContain("internal-db.example");
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});
