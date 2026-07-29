import { describe, expect, test } from "bun:test";

import {
  SupplierProductCommandSchema,
  SupplierProductCreateSchema,
  SupplierProductListQuerySchema,
  SupplierProductUpdateSchema,
  SupplierSkuCreateSchema,
} from "./supplier-products";

const categoryId = "10000000-0000-4000-8000-000000000001";
const brandId = "10000000-0000-4000-8000-000000000002";
const unitId = "10000000-0000-4000-8000-000000000003";
const tenantSupplierId = "10000000-0000-4000-8000-000000000004";

describe("supplier product schemas", () => {
  test("defaults and caps every product list", () => {
    expect(SupplierProductListQuerySchema.parse({
      tenantSupplierId,
    })).toEqual({
      tenantSupplierId,
      page: 1,
      pageSize: 20,
    });
    expect(SupplierProductListQuerySchema.safeParse({
      tenantSupplierId,
      pageSize: "101",
    }).success).toBe(false);
  });

  test("requires a meaningful proxy reason for writes", () => {
    const result = SupplierProductCreateSchema.safeParse({
      product_code: "P-1",
      name: "瓷砖",
      category_id: categoryId,
      brand_id: brandId,
      proxy_reason: " ",
    });

    expect(result.success).toBe(false);
  });

  test("accepts a bounded product update and rejects empty updates", () => {
    expect(SupplierProductUpdateSchema.parse({
      expected_version: 2,
      name: "防滑瓷砖",
      proxy_reason: "供应商书面资料变更",
    })).toEqual({
      expected_version: 2,
      name: "防滑瓷砖",
      proxy_reason: "供应商书面资料变更",
    });
    expect(SupplierProductUpdateSchema.safeParse({
      expected_version: 2,
      proxy_reason: "供应商书面资料变更",
    }).success).toBe(false);
  });

  test("accepts SKU flags but never accepts a client conversion snapshot", () => {
    expect(SupplierSkuCreateSchema.safeParse({
      sku_code: "SKU-1",
      name: "600×600 灰色",
      purchase_unit_id: unitId,
      batch_managed: false,
      color_managed: true,
      serial_managed: false,
      proxy_reason: "供应商产品手册代录",
    }).success).toBe(true);

    expect(SupplierSkuCreateSchema.safeParse({
      sku_code: "SKU-1",
      name: "600×600 灰色",
      purchase_unit_id: unitId,
      base_unit_conversion: "100",
      proxy_reason: "供应商产品手册代录",
    }).success).toBe(false);
  });

  test("requires a positive expected version for lifecycle commands", () => {
    expect(SupplierProductCommandSchema.safeParse({
      expected_version: 0,
      proxy_reason: "供应商通知停用",
    }).success).toBe(false);
  });
});
