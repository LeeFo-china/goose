import { describe, expect, test } from "bun:test";

import {
  SupplierPriceItemDeleteSchema,
  SupplierPriceItemUpsertSchema,
  SupplierPriceListCommandSchema,
  SupplierPriceListCreateSchema,
  SupplierPriceListListQuerySchema,
  SupplierPriceListNewVersionSchema,
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
    }).success).toBe(false);
  });

  test("rejects price and tax scales beyond database precision", () => {
    expect(SupplierPriceItemUpsertSchema.safeParse({
      supplier_sku_id: skuId,
      unit_price: 10.123,
      tax_rate: 0.13,
      tax_inclusive: true,
      expected_version: 1,
    }).success).toBe(false);

    expect(SupplierPriceItemUpsertSchema.safeParse({
      supplier_sku_id: skuId,
      unit_price: 10.12,
      tax_rate: 0.1234567,
      tax_inclusive: true,
      expected_version: 1,
    }).success).toBe(false);
  });

  test("accepts an exact base price item", () => {
    expect(SupplierPriceItemUpsertSchema.parse({
      supplier_sku_id: skuId,
      unit_price: 88,
      tax_rate: 0.13,
      tax_inclusive: true,
      expected_version: 2,
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
    }).success).toBe(false);
    expect(SupplierPriceListCommandSchema.safeParse({
      expected_version: 0,
    }).success).toBe(false);
  });

  test("accepts tenant-managed writes without a proxy reason", () => {
    expect(SupplierPriceListCreateSchema.safeParse({
      price_list_code: "DEFAULT",
      name: "默认供货价",
      effective_from: "2026-08-01T00:00:00+08:00",
    }).success).toBe(true);
    expect(SupplierPriceListUpdateSchema.safeParse({
      expected_version: 1,
      name: "租户采购价",
    }).success).toBe(true);
    expect(SupplierPriceListCommandSchema.safeParse({
      expected_version: 1,
    }).success).toBe(true);
    expect(SupplierPriceListNewVersionSchema.safeParse({
      expected_version: 2,
      new_price_list_id: tenantSupplierId,
    }).success).toBe(true);
    expect(SupplierPriceItemDeleteSchema.safeParse({
      expected_version: 2,
    }).success).toBe(true);
  });

  test("discards an optional legacy proxy reason from every write", () => {
    const reason = "旧版后台代录原因";
    const parsed = [
      SupplierPriceListCreateSchema.parse({
        price_list_code: "DEFAULT",
        name: "默认供货价",
        effective_from: "2026-08-01T00:00:00+08:00",
        proxy_reason: reason,
      }),
      SupplierPriceListUpdateSchema.parse({
        expected_version: 1,
        name: "租户采购价",
        proxy_reason: reason,
      }),
      SupplierPriceListCommandSchema.parse({
        expected_version: 1,
        proxy_reason: reason,
      }),
      SupplierPriceItemUpsertSchema.parse({
        supplier_sku_id: skuId,
        unit_price: 88,
        tax_rate: 0.13,
        tax_inclusive: true,
        expected_version: 2,
        proxy_reason: reason,
      }),
      SupplierPriceItemDeleteSchema.parse({
        expected_version: 2,
        proxy_reason: reason,
      }),
    ];

    for (const value of parsed) {
      expect(value).not.toHaveProperty("proxy_reason");
    }
  });

  test("rejects client supplied tenant and ownership fields", () => {
    const base = {
      price_list_code: "DEFAULT",
      name: "默认供货价",
      effective_from: "2026-08-01T00:00:00+08:00",
    };
    for (const untrusted of [
      { tenant_id: tenantSupplierId },
      { tenant_supplier_id: tenantSupplierId },
      { ownership_scope: "platform" },
      { owner_tenant_id: tenantSupplierId },
    ]) {
      expect(SupplierPriceListCreateSchema.safeParse({
        ...base,
        ...untrusted,
      }).success).toBe(false);
    }
  });
});
