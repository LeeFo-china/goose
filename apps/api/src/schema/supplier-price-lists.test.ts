import { describe, expect, test } from "bun:test";

import {
  SupplierPriceItemUpsertSchema,
  SupplierPriceListCommandSchema,
  SupplierPriceListCreateSchema,
  SupplierPriceListListQuerySchema,
  SupplierPriceListUpdateSchema,
} from "./supplier-price-lists";

const tenantSupplierId = "20000000-0000-4000-8000-000000000001";
const skuId = "20000000-0000-4000-8000-000000000002";

describe("supplier price list schemas", () => {
  test("defaults and caps price list pagination", () => {
    expect(SupplierPriceListListQuerySchema.parse({
      tenantSupplierId,
    })).toEqual({
      tenantSupplierId,
      page: 1,
      pageSize: 20,
    });
    expect(SupplierPriceListListQuerySchema.safeParse({
      tenantSupplierId,
      pageSize: "101",
    }).success).toBe(false);
  });

  test("requires a valid half-open effective period", () => {
    expect(SupplierPriceListCreateSchema.safeParse({
      price_list_code: "DEFAULT",
      name: "默认供货价",
      effective_from: "2026-08-01T00:00:00+08:00",
      effective_until: "2026-07-31T00:00:00+08:00",
      proxy_reason: "供应商盖章报价单代录",
    }).success).toBe(false);
  });

  test("rejects price and tax scales beyond database precision", () => {
    expect(SupplierPriceItemUpsertSchema.safeParse({
      supplier_sku_id: skuId,
      unit_price: 10.123,
      tax_rate: 0.13,
      tax_inclusive: true,
      expected_version: 1,
      proxy_reason: "供应商盖章报价单代录",
    }).success).toBe(false);

    expect(SupplierPriceItemUpsertSchema.safeParse({
      supplier_sku_id: skuId,
      unit_price: 10.12,
      tax_rate: 0.1234567,
      tax_inclusive: true,
      expected_version: 1,
      proxy_reason: "供应商盖章报价单代录",
    }).success).toBe(false);
  });

  test("accepts an exact base price item", () => {
    expect(SupplierPriceItemUpsertSchema.parse({
      supplier_sku_id: skuId,
      unit_price: 88,
      tax_rate: 0.13,
      tax_inclusive: true,
      expected_version: 2,
      proxy_reason: "供应商盖章报价单代录",
    })).toMatchObject({
      supplier_sku_id: skuId,
      minimum_quantity: 1,
      maximum_quantity: null,
      unit_price: 88,
      tax_rate: 0.13,
    });
  });

  test("requires business fields for draft updates and versions for commands", () => {
    expect(SupplierPriceListUpdateSchema.safeParse({
      expected_version: 1,
      proxy_reason: "供应商报价调整",
    }).success).toBe(false);
    expect(SupplierPriceListCommandSchema.safeParse({
      expected_version: 0,
      proxy_reason: "供应商确认发布",
    }).success).toBe(false);
  });
});
