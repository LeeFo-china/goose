import { describe, expect, test } from "bun:test";
import {
  createExpirationHarness,
  makeOrder,
  successTransaction,
} from "./billing-recharge-expiration.test-helpers";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const EMPTY_TELEMETRY = {
  claimed: 0,
  paid: 0,
  closed: 0,
  retried: 0,
  failed: 0,
  release_failed: 0,
};

describe("BillingRechargeExpirationService state matrix", () => {
  test("claims one order at a fresh time and stops on the first empty claim", async () => {
    const harness = await createExpirationHarness();

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 101 });

    expect(harness.repository.claimExpiredOrders).toHaveBeenCalledTimes(1);
    expect(harness.repository.claimExpiredOrders).toHaveBeenCalledWith({
      batchSize: 1,
      leaseSeconds: 60,
      excludedOrderIds: [],
    });
    expect(harness.paymentConfigRepository.findWechatPayConfigById).not
      .toHaveBeenCalled();
    expect(result).toEqual(EMPTY_TELEMETRY);
  });

  test("renews before querying and atomically confirms SUCCESS", async () => {
    const order = makeOrder();
    const transaction = successTransaction(order);
    const harness = await createExpirationHarness({ orders: [order] });
    harness.queryTransaction.mockImplementationOnce(async () => transaction);

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 1 });

    expect(harness.calls).toEqual([
      "claim:order-1",
      "renew:order-1:claim-1",
      "query:order-1",
      "confirm:order-1",
    ]);
    expect(harness.repository.renewCloseClaim).toHaveBeenCalledWith({
      orderId: order.id,
      claimToken: order.close_claim_token,
      leaseSeconds: 60,
    });
    expect(harness.repository.releaseCloseClaim).not.toHaveBeenCalled();
    expect(result).toEqual({ ...EMPTY_TELEMETRY, claimed: 1, paid: 1 });
  });

  test("mirrors CLOSED locally without another remote close", async () => {
    const harness = await createExpirationHarness({ orders: [makeOrder()] });
    harness.queryTransaction.mockImplementationOnce(async () => ({
      trade_state: "CLOSED",
    }));

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 1 });

    expect(harness.calls).toEqual([
      "claim:order-1",
      "renew:order-1:claim-1",
      "query:order-1",
      "mark:order-1",
    ]);
    expect(harness.wechatPayGateway.closeTransactionByOutTradeNo).not
      .toHaveBeenCalled();
    expect(harness.repository.markOrderClosed).toHaveBeenCalledWith({
      orderId: "order-1",
      claimToken: "claim-1",
      closedAt: new Date("2026-07-18T03:00:00.000Z"),
    });
    expect(harness.nowFactory).toHaveBeenCalledTimes(1);
    expect(result.closed).toBe(1);
  });

  test("closes NOTPAY remotely before conditionally closing locally", async () => {
    const harness = await createExpirationHarness({ orders: [makeOrder()] });
    harness.queryTransaction.mockImplementationOnce(async () => ({
      trade_state: "NOTPAY",
    }));

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 1 });

    expect(harness.calls).toEqual([
      "claim:order-1",
      "renew:order-1:claim-1",
      "query:order-1",
      "renew:order-1:claim-1",
      "close:order-1",
      "mark:order-1",
    ]);
    expect(harness.repository.markOrderClosed).toHaveBeenCalledWith({
      orderId: "order-1",
      claimToken: "claim-1",
      closedAt: new Date("2026-07-18T03:00:00.000Z"),
    });
    expect(harness.nowFactory).toHaveBeenCalledTimes(1);
    expect(result.closed).toBe(1);
  });

  test("defers an unknown state release until after later claims", async () => {
    const first = makeOrder();
    const second = makeOrder(2);
    const harness = await createExpirationHarness({ orders: [first, second] });
    harness.queryTransaction
      .mockImplementationOnce(async () => ({ trade_state: "USERPAYING" }))
      .mockImplementationOnce(async () => ({ trade_state: "CLOSED" }));

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 3 });

    expect(harness.repository.claimExpiredOrders).toHaveBeenNthCalledWith(2, {
      batchSize: 1,
      leaseSeconds: 60,
      excludedOrderIds: [first.id],
    });
    expect(harness.calls.indexOf("claim:order-2")).toBeLessThan(
      harness.calls.indexOf(
        "release:order-1:BILLING_RECHARGE_EXPIRE_TRADE_STATE_RETRY",
      ),
    );
    expect(harness.calls.at(-1)).toBe(
      "release:order-1:BILLING_RECHARGE_EXPIRE_TRADE_STATE_RETRY",
    );
    expect(result).toEqual({
      ...EMPTY_TELEMETRY,
      claimed: 2,
      closed: 1,
      retried: 1,
    });
  });

  test("isolates a query failure and still processes the next order", async () => {
    const harness = await createExpirationHarness({
      orders: [makeOrder(), makeOrder(2)],
    });
    harness.queryTransaction
      .mockImplementationOnce(async () => {
        throw new Error("credential and host details");
      })
      .mockImplementationOnce(async () => ({ trade_state: "CLOSED" }));

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 3 });

    expect(harness.calls).toContain("mark:order-2");
    expect(harness.calls.at(-1)).toBe(
      "release:order-1:BILLING_RECHARGE_EXPIRE_QUERY_FAILED",
    );
    expect(result).toEqual({
      ...EMPTY_TELEMETRY,
      claimed: 2,
      closed: 1,
      failed: 1,
    });
  });

  test.each([
    ["SUCCESS", "paid"],
    ["CLOSED", "closed"],
    ["NOTPAY", "retried"],
  ] as const)(
    "re-queries once after close failure and handles %s safely",
    async (secondState, outcome) => {
      const order = makeOrder();
      const harness = await createExpirationHarness({ orders: [order] });
      harness.queryTransaction
        .mockImplementationOnce(async () => ({ trade_state: "NOTPAY" }))
        .mockImplementationOnce(async () =>
          secondState === "SUCCESS"
            ? successTransaction(order)
            : { trade_state: secondState }
        );
      harness.closeTransaction.mockImplementationOnce(async () => {
        throw new Error("close timeout");
      });

      const result = await harness.service.runExpiredOrderChecks({ batchSize: 1 });

      expect(harness.wechatPayGateway.queryTransactionByOutTradeNo)
        .toHaveBeenCalledTimes(2);
      expect(harness.repository.markOrderClosed).toHaveBeenCalledTimes(
        secondState === "CLOSED" ? 1 : 0,
      );
      expect(result[outcome]).toBe(1);
    },
  );

  test("defers release when the second query also fails", async () => {
    const harness = await createExpirationHarness({ orders: [makeOrder()] });
    harness.queryTransaction
      .mockImplementationOnce(async () => ({ trade_state: "NOTPAY" }))
      .mockImplementationOnce(async () => {
        throw new Error("second query failed");
      });
    harness.closeTransaction.mockImplementationOnce(async () => {
      throw new Error("close timeout");
    });

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 1 });

    expect(harness.calls.at(-1)).toBe(
      "release:order-1:BILLING_RECHARGE_EXPIRE_SECOND_QUERY_FAILED",
    );
    expect(result.failed).toBe(1);
  });

  test("does not count a conditional close race as closed", async () => {
    const harness = await createExpirationHarness({ orders: [makeOrder()] });
    harness.repository.markOrderClosed.mockImplementationOnce(async () => null);

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 1 });

    expect(result).toEqual({ ...EMPTY_TELEMETRY, claimed: 1, retried: 1 });
  });
});
