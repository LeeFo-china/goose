import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("ProjectWorkflowPaymentGate admin write boundary", () => {
  test("does not create project payments directly for workflow collection tasks", () => {
    const source = readFileSync(
      new URL("./project-workflow-payment-gate.tsx", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("createProjectPayment");
    expect(source).not.toContain("确认已入账");
    expect(source).toContain("请在待办中心确认收款，确认后流程会自动推进。");
  });
});
