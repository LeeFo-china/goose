import { describe, expect, test } from "bun:test";

import {
  SUPPLIER_PRODUCT_SOURCE_VALUES,
  SUPPLIER_PRICE_LIST_STATUS_VALUES,
  SUPPLIER_PRODUCT_STATUS_VALUES,
  SUPPLIER_SKU_STATUS_VALUES,
  isSupplierPriceListAction,
} from "./supplier-product";

describe("supplier product domain", () => {
  test("keeps stable lifecycle values", () => {
    expect(SUPPLIER_PRODUCT_STATUS_VALUES).toEqual([
      "draft",
      "active",
      "inactive",
    ]);
    expect(SUPPLIER_SKU_STATUS_VALUES).toEqual([
      "draft",
      "active",
      "inactive",
    ]);
    expect(SUPPLIER_PRICE_LIST_STATUS_VALUES).toEqual([
      "draft",
      "published",
      "retired",
    ]);
  });

  test("accepts only explicit price list commands", () => {
    expect(isSupplierPriceListAction("publish")).toBe(true);
    expect(isSupplierPriceListAction("new-version")).toBe(true);
    expect(isSupplierPriceListAction("retire")).toBe(true);
    expect(isSupplierPriceListAction("delete")).toBe(false);
  });

  test("keeps stable product source values", () => {
    expect(SUPPLIER_PRODUCT_SOURCE_VALUES).toEqual([
      "platform_shared",
      "tenant_private",
    ]);
  });
});
