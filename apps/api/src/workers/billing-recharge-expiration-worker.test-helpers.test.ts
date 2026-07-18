import { expect, test } from "bun:test";
import { withProbeTimeout } from "./billing-recharge-expiration-worker.test-helpers";

test("probe timeout rejects and always cleans the child process", async () => {
  let cleanupCalls = 0;

  await expect(withProbeTimeout({
    operation: new Promise<never>(() => undefined),
    timeoutMs: 1,
    cleanup: async () => {
      cleanupCalls += 1;
    },
  })).rejects.toThrow("worker probe timed out after 1ms");

  expect(cleanupCalls).toBe(1);
});
