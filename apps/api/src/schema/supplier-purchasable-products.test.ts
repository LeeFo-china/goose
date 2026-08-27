import { describe, expect, test } from "bun:test";

import { SupplierPurchasableProductCreateSchema } from "./supplier-purchasable-products";

const payload = {
  sku_id: "20000000-0000-4000-8000-000000000002",
  product: {
    name: "耐水腻子粉",
    category_id: "30000000-0000-4000-8000-000000000003",
    brand_id: "40000000-0000-4000-8000-000000000004",
  },
  sku: {
    name: "20kg/袋",
    purchase_unit_id: "50000000-0000-4000-8000-000000000005",
    spec_values: {},
  },
  price: {
    unit_price: "48.00",
    tax_rate: "0.130000",
    tax_inclusive: true,
  },
};

describe("supplier purchasable product schema", () => {
  test("accepts one complete product, sku, and price payload", () => {
    expect(SupplierPurchasableProductCreateSchema.parse(payload))
      .toMatchObject({ product: { name: "耐水腻子粉" } });
  });

  test("rejects unknown and server-generated fields at every input level", () => {
    for (const input of [
      { ...payload, unknown: true },
      { ...payload, product: { ...payload.product, unknown: true } },
      { ...payload, product: { ...payload.product, product_code: "P-1" } },
      { ...payload, sku: { ...payload.sku, unknown: true } },
      { ...payload, sku: { ...payload.sku, sku_code: "SKU-1" } },
      { ...payload, price: { ...payload.price, unknown: true } },
    ]) {
      expect(SupplierPurchasableProductCreateSchema.safeParse(input).success)
        .toBe(false);
    }
  });

  test("requires valid category, brand, purchase unit, and sku UUIDs", () => {
    for (const input of [
      { ...payload, sku_id: "invalid" },
      {
        ...payload,
        product: { ...payload.product, category_id: "invalid" },
      },
      { ...payload, product: { ...payload.product, brand_id: "invalid" } },
      {
        ...payload,
        sku: { ...payload.sku, purchase_unit_id: "invalid" },
      },
    ]) {
      expect(SupplierPurchasableProductCreateSchema.safeParse(input).success)
        .toBe(false);
    }
  });

  test("rejects missing category, brand, purchase unit, and sku UUIDs", () => {
    const { sku_id: _skuId, ...withoutSkuId } = payload;
    const {
      category_id: _categoryId,
      ...productWithoutCategoryId
    } = payload.product;
    const { brand_id: _brandId, ...productWithoutBrandId } = payload.product;
    const {
      purchase_unit_id: _purchaseUnitId,
      ...skuWithoutPurchaseUnitId
    } = payload.sku;

    for (const input of [
      withoutSkuId,
      { ...payload, product: productWithoutCategoryId },
      { ...payload, product: productWithoutBrandId },
      { ...payload, sku: skuWithoutPurchaseUnitId },
    ]) {
      expect(SupplierPurchasableProductCreateSchema.safeParse(input).success)
        .toBe(false);
    }
  });

  test("keeps prices as bounded decimal strings", () => {
    expect(SupplierPurchasableProductCreateSchema.safeParse({
      ...payload,
      price: { ...payload.price, unit_price: "0" },
    }).success).toBe(false);
    expect(SupplierPurchasableProductCreateSchema.safeParse({
      ...payload,
      price: { ...payload.price, unit_price: "-1.00" },
    }).success).toBe(false);
    expect(SupplierPurchasableProductCreateSchema.safeParse({
      ...payload,
      price: { ...payload.price, unit_price: 48 },
    }).success).toBe(false);
    expect(SupplierPurchasableProductCreateSchema.safeParse({
      ...payload,
      price: { ...payload.price, tax_rate: "-0.000001" },
    }).success).toBe(false);
    expect(SupplierPurchasableProductCreateSchema.safeParse({
      ...payload,
      price: { ...payload.price, tax_rate: "1.000001" },
    }).success).toBe(false);
    expect(SupplierPurchasableProductCreateSchema.safeParse({
      ...payload,
      price: { ...payload.price, tax_rate: 0.13 },
    }).success).toBe(false);
    expect(SupplierPurchasableProductCreateSchema.safeParse({
      ...payload,
      price: { ...payload.price, tax_rate: "0" },
    }).success).toBe(true);
    expect(SupplierPurchasableProductCreateSchema.safeParse({
      ...payload,
      price: { ...payload.price, tax_rate: "1.000000" },
    }).success).toBe(true);
  });
});
