import { afterEach, describe, expect, test } from "bun:test";

const VALID_CONTEXT = {
  appointmentNo: "DYLF-20260825-000001",
  preferredVisitDate: "2026-08-25",
  preferredVisitPeriod: "afternoon",
  linkedEstimateId: "22222222-2222-4222-8222-222222222222",
} as const;

async function loadContextModule() {
  return import("./measurement-success-context");
}

describe("measurement success process context", () => {
  afterEach(async () => {
    const context = await loadContextModule();
    context.clearMeasurementSuccessContext();
  });

  test("stores only a strict real-submit result in process memory", async () => {
    const context = await loadContextModule();
    expect(context.writeMeasurementSuccessContext(VALID_CONTEXT)).toBe(true);
    expect(context.readMeasurementSuccessContext()).toEqual(VALID_CONTEXT);
    expect(context.writeMeasurementSuccessContext({
      ...VALID_CONTEXT,
      phone: "13800138000",
    })).toBe(false);
    expect(context.readMeasurementSuccessContext()).toEqual(VALID_CONTEXT);

    const source = await Bun.file(
      `${__dirname}/measurement-success-context.ts`,
    ).text();
    expect(source).not.toMatch(/getStorage|setStorage|removeStorage/);
    expect(source).not.toMatch(/name|phone|community|demand/);
  });

  test("rejects malformed success facts and returns defensive copies", async () => {
    const context = await loadContextModule();
    for (const invalid of [
      { ...VALID_CONTEXT, appointmentNo: "forged" },
      { ...VALID_CONTEXT, preferredVisitDate: "2026-02-30" },
      { ...VALID_CONTEXT, preferredVisitPeriod: "midnight" },
      { ...VALID_CONTEXT, linkedEstimateId: "not-a-uuid" },
    ]) {
      expect(context.writeMeasurementSuccessContext(invalid)).toBe(false);
    }
    expect(context.readMeasurementSuccessContext()).toBeNull();

    expect(context.writeMeasurementSuccessContext(VALID_CONTEXT)).toBe(true);
    const first = context.readMeasurementSuccessContext();
    expect(first).not.toBe(context.readMeasurementSuccessContext());
  });

  test("consumes a matching budget-result return intent exactly once", async () => {
    const context = await loadContextModule();
    expect(context.writeMeasurementSuccessContext(VALID_CONTEXT)).toBe(true);
    expect(context.writeBudgetResultReturnIntent(
      "33333333-3333-4333-8333-333333333333",
    )).toBe(false);
    expect(context.writeBudgetResultReturnIntent(VALID_CONTEXT.linkedEstimateId)).toBe(true);
    expect(context.consumeBudgetResultReturnIntent()).toBe(VALID_CONTEXT.linkedEstimateId);
    expect(context.consumeBudgetResultReturnIntent()).toBeNull();
  });
});
