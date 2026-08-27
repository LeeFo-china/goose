import { describe, expect, test } from "bun:test";

import {
  SupplierPurchaseBatchCatalogItemSchema,
  SupplierPurchaseBatchOrderSchema,
} from "./supplier-purchase-batch-records";

const CatalogNumbersSchema = SupplierPurchaseBatchCatalogItemSchema.pick({
  base_unit_conversion: true,
  unit_price: true,
  tax_rate: true,
});
const OrderMoneySchema = SupplierPurchaseBatchOrderSchema.pick({
  subtotal_amount: true,
  tax_amount: true,
  total_amount: true,
});

describe("supplier purchase batch record numeric boundaries", () => {
  test("uses the exact batch catalog conversion, price, and tax domains", () => {
    expect(CatalogNumbersSchema.parse({
      base_unit_conversion: "9999999999.99999999",
      unit_price: "999999999999.99",
      tax_rate: "1.000000",
    })).toEqual({
      base_unit_conversion: "9999999999.99999999",
      unit_price: "999999999999.99",
      tax_rate: "1.000000",
    });

    for (const invalid of [
      { base_unit_conversion: "0", unit_price: "1.00", tax_rate: "0" },
      { base_unit_conversion: "1.000000001", unit_price: "1.00", tax_rate: "0" },
      { base_unit_conversion: "1", unit_price: "1.001", tax_rate: "0" },
      { base_unit_conversion: "1", unit_price: "1.00", tax_rate: "1.000001" },
    ]) {
      expect(CatalogNumbersSchema.safeParse(invalid).success).toBe(false);
    }
  });

  test("uses numeric eighteen scale two for batch child order totals", () => {
    expect(OrderMoneySchema.parse({
      subtotal_amount: "9999999999999999.99",
      tax_amount: "0.00",
      total_amount: "9999999999999999.99",
    }).total_amount).toBe("9999999999999999.99");

    for (const field of [
      "subtotal_amount",
      "tax_amount",
      "total_amount",
    ] as const) {
      for (const value of ["1.001", "10000000000000000.00"]) {
        expect(OrderMoneySchema.safeParse({
          subtotal_amount: "1.00",
          tax_amount: "1.00",
          total_amount: "2.00",
          [field]: value,
        }).success).toBe(false);
      }
    }
  });
});
