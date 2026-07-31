import { describe, expect, test } from "bun:test";

import { closeThenCheckFreshResidual } from
  "./supplier-payment-smoke-residual";

describe("supplier payment finalization failures", () => {
  test("keeps primary first and exposes cleanup and residual failures", async () => {
    const primary = new Error("primary failure");
    const cleanup = new Error("cleanup failure");

    try {
      await closeThenCheckFreshResidual({
        original: {
          async close() {
            throw cleanup;
          },
        },
        createFresh: () => ({ async close() {} }),
        async countResidual() {
          return 1;
        },
        primaryFailure: { failed: true, value: primary },
      });
      throw new Error("expected finalization failure");
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      const aggregate = error as AggregateError;
      expect(aggregate.errors[0]).toBe(primary);
      expect(aggregate.errors[1]).toBe(cleanup);
      expect(String(aggregate.errors[2])).toContain("residual");
    }
  });

  test("does not swallow a cleanup-only failure", async () => {
    const cleanup = new Error("cleanup only");
    await expect(closeThenCheckFreshResidual({
      original: {
        async close() {
          throw cleanup;
        },
      },
      createFresh: () => ({ async close() {} }),
      async countResidual() {
        return 0;
      },
      primaryFailure: { failed: false },
    })).rejects.toBe(cleanup);
  });
});
