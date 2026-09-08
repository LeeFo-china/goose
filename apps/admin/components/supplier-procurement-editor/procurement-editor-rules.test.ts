import { describe, expect, test } from "bun:test";

import {
  procurementSummary,
  shouldConfirmContextChange,
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
});
