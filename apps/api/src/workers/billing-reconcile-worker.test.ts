import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("billing reconcile worker source", () => {
  test("wires subscription due checks and bounded worker config", () => {
    const source = readFileSync(
      join(import.meta.dir, "billing-reconcile-worker.ts"),
      "utf8",
    );

    expect(source).toContain("billingSubscriptionService.runDueChecks");
    expect(source).toContain("BILLING_RECONCILE_INTERVAL_MS");
    expect(source).toContain("BILLING_RECONCILE_BATCH_SIZE");
    expect(source).toContain("tick completed");
    expect(source).toContain("billing-reconcile-worker");
    expect(source).toContain("import.meta.main");
  });
});
