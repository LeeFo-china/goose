import { describe, expect, test } from "bun:test";

import {
  SupplierPurchasableSkuCreateSchema,
  SupplierPurchasableSkuPriceParamSchema,
  SupplierPurchasableSkuScopeQuerySchema,
  SupplierPurchasableSkuUpdateSchema,
} from "./supplier-purchasable-skus";

const UUID = "10000000-0000-4000-8000-000000000001";
const SECOND_UUID = "20000000-0000-4000-8000-000000000002";

const createPayload = {
  sku: {
    name: "净味乳胶漆 18L",
    purchase_unit_id: UUID,
    specification: "18L",
    model: null,
    batch_managed: false,
    color_managed: false,
    serial_managed: false,
    spec_values: {},
  },
  price: {
    unit_price: "328.00",
    tax_rate: "0.13",
  },
};

describe("supplier purchasable SKU schemas", () => {
  test("keeps decimal strings and defaults creates to untaxed", () => {
    const parsed = SupplierPurchasableSkuCreateSchema.parse({
      sku: {
        name: "  净味乳胶漆 18L  ",
        purchase_unit_id: UUID,
      },
      price: {
        unit_price: " 328.00 ",
        tax_rate: " 0.130000 ",
      },
    });

    expect(parsed).toEqual({
      sku: {
        name: "净味乳胶漆 18L",
        purchase_unit_id: UUID,
        batch_managed: false,
        color_managed: false,
        serial_managed: false,
        spec_values: {},
      },
      price: {
        unit_price: "328.00",
        tax_rate: "0.130000",
        tax_inclusive: false,
      },
    });
    expect(typeof parsed.price.unit_price).toBe("string");
    expect(typeof parsed.price.tax_rate).toBe("string");
  });

  test("accepts only bounded plain decimal price strings", () => {
    for (const unit_price of [
      "1e2",
      "-1.00",
      "0",
      "0.00",
      "10.001",
      "1000000000000",
      328,
    ]) {
      expect(SupplierPurchasableSkuCreateSchema.safeParse({
        ...createPayload,
        price: { ...createPayload.price, unit_price },
      }).success).toBe(false);
    }

    expect(SupplierPurchasableSkuCreateSchema.parse({
      ...createPayload,
      price: {
        ...createPayload.price,
        unit_price: "999999999999.99",
      },
    }).price.unit_price).toBe("999999999999.99");
  });

  test("accepts tax rates from zero to one without numeric coercion", () => {
    for (const tax_rate of ["1.000001", "0.1234567", "-0.1", "1e-1", 0.13]) {
      expect(SupplierPurchasableSkuCreateSchema.safeParse({
        ...createPayload,
        price: { ...createPayload.price, tax_rate },
      }).success).toBe(false);
    }

    for (const tax_rate of ["0", "0.000001", "1", "1.000000"]) {
      expect(SupplierPurchasableSkuCreateSchema.safeParse({
        ...createPayload,
        price: { ...createPayload.price, tax_rate },
      }).success).toBe(true);
    }
  });

  test("requires a complete concurrency snapshot on update", () => {
    expect(SupplierPurchasableSkuUpdateSchema.parse({
      sku: {
        expected_version: 3,
        name: "净味乳胶漆 18L 新包装",
        purchase_unit_id: SECOND_UUID,
        specification: null,
        model: "A-18",
        batch_managed: true,
        color_managed: true,
        serial_managed: true,
        spec_values: { color: "白色" },
      },
      price: {
        unit_price: "318.00",
        tax_rate: "0.13",
        tax_inclusive: false,
        expected_price_list_id: UUID,
        expected_price_list_version: 5,
      },
    })).toEqual({
      sku: {
        expected_version: 3,
        name: "净味乳胶漆 18L 新包装",
        purchase_unit_id: SECOND_UUID,
        specification: null,
        model: "A-18",
        batch_managed: true,
        color_managed: true,
        serial_managed: true,
        spec_values: { color: "白色" },
      },
      price: {
        unit_price: "318.00",
        tax_rate: "0.13",
        tax_inclusive: false,
        expected_price_list_id: UUID,
        expected_price_list_version: 5,
      },
    });

    for (const expected_version of [undefined, 0, -1, 1.5, "3"]) {
      expect(SupplierPurchasableSkuUpdateSchema.safeParse({
        sku: { expected_version },
        price: {
          unit_price: "318.00",
          tax_rate: "0.13",
          tax_inclusive: false,
          expected_price_list_id: null,
          expected_price_list_version: null,
        },
      }).success).toBe(false);
    }
  });

  test("allows every SKU field to be updated optionally", () => {
    const price = {
      unit_price: "318.00",
      tax_rate: "0.13",
      tax_inclusive: true,
      expected_price_list_id: null,
      expected_price_list_version: null,
    };

    for (const patch of [
      { name: "新名称" },
      { purchase_unit_id: SECOND_UUID },
      { specification: null },
      { model: null },
      { batch_managed: true },
      { color_managed: true },
      { serial_managed: true },
      { spec_values: { thickness: 9.5 } },
    ]) {
      expect(SupplierPurchasableSkuUpdateSchema.safeParse({
        sku: { expected_version: 3, ...patch },
        price,
      }).success).toBe(true);
    }
  });

  test("pairs nullable expected price identity fields", () => {
    const basePrice = {
      unit_price: "318.00",
      tax_rate: "0.13",
      tax_inclusive: false,
    };

    for (const expectedPriceIdentity of [
      {
        expected_price_list_id: null,
        expected_price_list_version: null,
      },
      {
        expected_price_list_id: UUID,
        expected_price_list_version: 5,
      },
    ]) {
      expect(SupplierPurchasableSkuUpdateSchema.safeParse({
        sku: { expected_version: 3 },
        price: { ...basePrice, ...expectedPriceIdentity },
      }).success).toBe(true);
    }

    for (const expectedPriceIdentity of [
      {},
      {
        expected_price_list_id: UUID,
        expected_price_list_version: null,
      },
      {
        expected_price_list_id: null,
        expected_price_list_version: 5,
      },
    ]) {
      expect(SupplierPurchasableSkuUpdateSchema.safeParse({
        sku: { expected_version: 3 },
        price: { ...basePrice, ...expectedPriceIdentity },
      }).success).toBe(false);
    }

    for (const expected_price_list_version of [0, -1, 1.5, "5"]) {
      expect(SupplierPurchasableSkuUpdateSchema.safeParse({
        sku: { expected_version: 3 },
        price: {
          ...basePrice,
          expected_price_list_id: UUID,
          expected_price_list_version,
        },
      }).success).toBe(false);
    }
  });

  test("limits spec values to supported scalar and string-array types", () => {
    expect(SupplierPurchasableSkuCreateSchema.parse({
      ...createPayload,
      sku: {
        ...createPayload.sku,
        spec_values: {
          size: "18L",
          thickness: 9.5,
          waterproof: true,
          colors: ["白色", "灰色"],
        },
      },
    }).sku.spec_values).toEqual({
      size: "18L",
      thickness: 9.5,
      waterproof: true,
      colors: ["白色", "灰色"],
    });

    for (const spec_values of [
      { nested: { value: "18L" } },
      { nestedArray: [["18L"]] },
      { numberArray: [1, 2] },
      { mixedArray: ["18L", 2] },
      ["18L"],
    ]) {
      expect(SupplierPurchasableSkuCreateSchema.safeParse({
        ...createPayload,
        sku: { ...createPayload.sku, spec_values },
      }).success).toBe(false);
    }
  });

  test("rejects invalid UUIDs in bodies, paths, and scope queries", () => {
    expect(SupplierPurchasableSkuCreateSchema.safeParse({
      ...createPayload,
      sku: { ...createPayload.sku, purchase_unit_id: "invalid" },
    }).success).toBe(false);
    expect(SupplierPurchasableSkuUpdateSchema.safeParse({
      sku: { expected_version: 3 },
      price: {
        unit_price: "318.00",
        tax_rate: "0.13",
        tax_inclusive: false,
        expected_price_list_id: "invalid",
        expected_price_list_version: 5,
      },
    }).success).toBe(false);
    expect(SupplierPurchasableSkuPriceParamSchema.safeParse({
      productId: "invalid",
      skuId: UUID,
    }).success).toBe(false);
    expect(SupplierPurchasableSkuScopeQuerySchema.safeParse({
      tenantSupplierId: "invalid",
    }).success).toBe(false);
  });

  test("enforces existing SKU text length and nullable rules", () => {
    for (const sku of [
      { ...createPayload.sku, name: "名".repeat(161) },
      { ...createPayload.sku, specification: "规".repeat(241) },
      { ...createPayload.sku, model: "型".repeat(161) },
      { ...createPayload.sku, specification: "   " },
      { ...createPayload.sku, model: "   " },
    ]) {
      expect(SupplierPurchasableSkuCreateSchema.safeParse({
        ...createPayload,
        sku,
      }).success).toBe(false);
    }

    expect(SupplierPurchasableSkuCreateSchema.safeParse({
      ...createPayload,
      sku: { ...createPayload.sku, specification: null, model: null },
    }).success).toBe(true);
  });

  test("parses only documented path and scope names", () => {
    expect(SupplierPurchasableSkuPriceParamSchema.parse({
      productId: UUID,
      skuId: SECOND_UUID,
    })).toEqual({ productId: UUID, skuId: SECOND_UUID });
    expect(SupplierPurchasableSkuScopeQuerySchema.parse({
      tenantSupplierId: UUID,
    })).toEqual({ tenantSupplierId: UUID });

    for (const input of [
      { id: UUID, skuId: SECOND_UUID },
      { productId: UUID, id: SECOND_UUID },
      { productId: UUID, skuId: SECOND_UUID, unknown: true },
    ]) {
      expect(SupplierPurchasableSkuPriceParamSchema.safeParse(input).success)
        .toBe(false);
    }
    for (const input of [
      { tenant_id: UUID },
      { tenantSupplierId: UUID, supplier_id: SECOND_UUID },
    ]) {
      expect(SupplierPurchasableSkuScopeQuerySchema.safeParse(input).success)
        .toBe(false);
    }
  });

  test("rejects unknown, ownership, generated, and price-list fields", () => {
    for (const input of [
      { ...createPayload, unknown: true },
      { ...createPayload, tenant_id: UUID },
      { ...createPayload, supplier_id: UUID },
      { ...createPayload, sku: { ...createPayload.sku, unknown: true } },
      { ...createPayload, sku: { ...createPayload.sku, sku_code: "SKU-1" } },
      { ...createPayload, price: { ...createPayload.price, unknown: true } },
      { ...createPayload, price: { ...createPayload.price, currency: "CNY" } },
      {
        ...createPayload,
        price: { ...createPayload.price, effective_from: "2026-09-01" },
      },
      {
        ...createPayload,
        price: { ...createPayload.price, price_list_name: "默认价格簿" },
      },
      {
        ...createPayload,
        price: { ...createPayload.price, price_list_code: "DEFAULT" },
      },
    ]) {
      expect(SupplierPurchasableSkuCreateSchema.safeParse(input).success)
        .toBe(false);
    }
  });
});
