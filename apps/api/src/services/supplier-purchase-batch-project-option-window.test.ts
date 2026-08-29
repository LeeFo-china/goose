import { describe, expect, test } from "bun:test";

import { resolveSupplierPurchaseBatchProjectOptionWindow } from "./supplier-purchase-batch-project-option-window";

const NOW = new Date("2026-08-29T03:04:05.000Z");

describe("resolveSupplierPurchaseBatchProjectOptionWindow", () => {
  test("returns a closed UTC interval for the last seven days", () => {
    expect(resolveSupplierPurchaseBatchProjectOptionWindow("last_7_days", NOW))
      .toEqual({
        updated_at_from: "2026-08-22T03:04:05.000Z",
        updated_at_to: "2026-08-29T03:04:05.000Z",
      });
  });

  test("returns the current Shanghai month as a half-open UTC interval", () => {
    expect(resolveSupplierPurchaseBatchProjectOptionWindow("current_month", NOW))
      .toEqual({
        updated_at_from: "2026-07-31T16:00:00.000Z",
        updated_at_before: "2026-08-31T16:00:00.000Z",
      });
  });

  test("rolls the Shanghai month boundary across the year", () => {
    expect(resolveSupplierPurchaseBatchProjectOptionWindow(
      "current_month",
      new Date("2025-12-31T16:00:00.000Z"),
    )).toEqual({
      updated_at_from: "2025-12-31T16:00:00.000Z",
      updated_at_before: "2026-01-31T16:00:00.000Z",
    });
  });
});
