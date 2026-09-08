import { describe, expect, test } from "bun:test";

import {
  procurementSummary,
  synchronizePurposeCustomState,
  shouldConfirmContextChange,
  shouldRequestPurposeChange,
} from "./procurement-editor-rules";

describe("procurement editor rules", () => {
  test("summarizes decimal quantities without Number precision loss", () => {
    expect(procurementSummary([
      {
        supplierId: "supplier-a",
        quantity: "2.5",
        unitPrice: "88.00",
        costCategoryId: "category-a",
      },
      {
        supplierId: "supplier-b",
        quantity: "1",
        unitPrice: "139.00",
        costCategoryId: "",
      },
    ])).toEqual({
      itemCount: 2,
      supplierCount: 2,
      missingCategoryCount: 1,
      referenceAmount: "359.00",
    });
  });

  test("rounds reference line value to cents and tolerates missing catalog facts", () => {
    expect(procurementSummary([
      {
        supplierId: "supplier-a",
        quantity: "0.3333",
        unitPrice: "10.00",
        costCategoryId: "category-a",
      },
      {
        quantity: "1",
        unitPrice: null,
        costCategoryId: "category-b",
      },
    ]).referenceAmount).toBe("3.33");
  });

  test("only asks before changing context when products are selected", () => {
    expect(shouldConfirmContextChange(0)).toBe(false);
    expect(shouldConfirmContextChange(1)).toBe(true);
  });

  test("does not request a controlled purpose value that is already selected", () => {
    expect(shouldRequestPurposeChange("项目备料", "项目备料")).toBe(false);
    expect(shouldRequestPurposeChange("项目备料", "现场补料")).toBe(true);
  });

  test("preserves custom mode for a matching local echo", () => {
    expect(synchronizePurposeCustomState({
      currentCustom: true,
      value: "",
      isPreset: false,
      requestedValue: "",
    })).toEqual({
      custom: true,
      requestedValue: null,
    });
  });

  test("clears a stale request before synchronizing an external purpose value", () => {
    expect(synchronizePurposeCustomState({
      currentCustom: false,
      value: "临时采购",
      isPreset: false,
      requestedValue: "项目备料",
    })).toEqual({
      custom: true,
      requestedValue: null,
    });
  });
});
