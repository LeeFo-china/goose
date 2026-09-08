import { describe, expect, test } from "bun:test";

describe("project cost event direction", () => {
  test("subtracts positive fact amounts with exact cents and preserves legacy increases", async () => {
    const { projectCostEventCents } = await import("./project-cost-direction");
    expect(projectCostEventCents("3.34", "decrease")).toBe(BigInt(-334));
    expect(projectCostEventCents("10.01", "increase")).toBe(BigInt(1001));
    expect(projectCostEventCents("0.01", undefined)).toBe(BigInt(1));
    expect(projectCostEventCents("0.00", "decrease")).toBe(BigInt(0));
  });

  test("rejects malformed directions and negative facts instead of hiding corrupt data", async () => {
    const { projectCostEventCents } = await import("./project-cost-direction");
    for (const direction of [null, "refund", "", 1]) {
      expect(() => projectCostEventCents("1.00", direction)).toThrow();
    }
    expect(() => projectCostEventCents("-1.00", "decrease")).toThrow();
    expect(() => projectCostEventCents("1.001", "increase")).toThrow();
  });
});
