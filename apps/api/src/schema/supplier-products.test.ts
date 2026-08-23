import { describe, expect, test } from "bun:test";

import {
  PlatformSupplierProductCommandSchema,
  PlatformSupplierProductCreateSchema,
  SupplierProductCommandSchema,
  SupplierProductCreateSchema,
  SupplierProductListQuerySchema,
  SupplierProductUpdateSchema,
  SupplierSkuCreateSchema,
} from "./supplier-products";
import * as supplierProductSchemas from "./supplier-products";

const categoryId = "10000000-0000-4000-8000-000000000001";
const brandId = "10000000-0000-4000-8000-000000000002";
const unitId = "10000000-0000-4000-8000-000000000003";
const tenantSupplierId = "10000000-0000-4000-8000-000000000004";
const baseUnitId = "10000000-0000-4000-8000-000000000005";

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

  test("accepts tenant creates without proxy reason and rejects ownership context", () => {
    expect(SupplierProductCreateSchema.parse({
      product_code: "P-1",
      name: "瓷砖",
      category_id: categoryId,
      brand_id: brandId,
    })).toEqual({
      product_code: "P-1",
      name: "瓷砖",
      category_id: categoryId,
      brand_id: brandId,
    });

    expect(SupplierProductCreateSchema.safeParse({
      product_code: "P-1",
      name: "瓷砖",
      category_id: categoryId,
      brand_id: brandId,
      ownership_scope: "platform",
      owner_tenant_id: tenantSupplierId,
      supplier_id: tenantSupplierId,
      actor_user_id: tenantSupplierId,
    }).success).toBe(false);
  });

  test("accepts tenant creates without product code", () => {
    expect(SupplierProductCreateSchema.parse({
      name: "瓷砖",
      category_id: categoryId,
      brand_id: brandId,
    })).toEqual({
      name: "瓷砖",
      category_id: categoryId,
      brand_id: brandId,
    });
  });

  test("requires product code for platform creates", () => {
    expect(PlatformSupplierProductCreateSchema.safeParse({
      name: "瓷砖",
      category_id: categoryId,
      brand_id: brandId,
    }).success).toBe(false);
  });

  test("accepts and discards legacy tenant proxy reasons", () => {
    expect(SupplierProductCreateSchema.parse({
      product_code: "P-LEGACY",
      name: "旧版商品",
      category_id: categoryId,
      brand_id: brandId,
      proxy_reason: "旧版 Admin 仍会发送此字段",
    })).toEqual({
      product_code: "P-LEGACY",
      name: "旧版商品",
      category_id: categoryId,
      brand_id: brandId,
    });
    expect(SupplierSkuCreateSchema.parse({
      sku_code: "SKU-LEGACY",
      name: "旧版 SKU",
      purchase_unit_id: unitId,
      proxy_reason: "旧版 Admin 仍会发送此字段",
    })).not.toHaveProperty("proxy_reason");
    expect(SupplierProductCommandSchema.parse({
      expected_version: 2,
      proxy_reason: "旧版生命周期操作原因",
    })).toEqual({ expected_version: 2 });
  });

  test("keeps platform lifecycle payloads strict", () => {
    expect(PlatformSupplierProductCommandSchema.safeParse({
      expected_version: 2,
      proxy_reason: "平台接口不接收兼容字段",
    }).success).toBe(false);
  });

  test("accepts a bounded product update and rejects empty updates", () => {
    expect(SupplierProductUpdateSchema.parse({
      expected_version: 2,
      name: "防滑瓷砖",
    })).toEqual({
      expected_version: 2,
      name: "防滑瓷砖",
    });
    expect(SupplierProductUpdateSchema.safeParse({
      expected_version: 2,
    }).success).toBe(false);
  });

  test("accepts structured SKU specs and all management flags", () => {
    expect(SupplierSkuCreateSchema.parse({
      sku_code: "SKU-1",
      name: "600×600 灰色",
      purchase_unit_id: unitId,
      batch_managed: false,
      color_managed: true,
      serial_managed: true,
      spec_values: {
        size: "600×600",
        colors: ["灰色"],
        thickness: 9.5,
        waterproof: true,
      },
    })).toMatchObject({
      color_managed: true,
      serial_managed: true,
      spec_values: {
        size: "600×600",
        colors: ["灰色"],
        thickness: 9.5,
        waterproof: true,
      },
    });

    expect(SupplierSkuCreateSchema.safeParse({
      sku_code: "SKU-1",
      name: "600×600 灰色",
      purchase_unit_id: unitId,
      base_unit_conversion: "100",
    }).success).toBe(false);
  });

  test("validates versioned unit conversion replacement payloads", () => {
    expect("SupplierSkuUnitConversionsReplaceSchema" in supplierProductSchemas)
      .toBe(true);
    const SupplierSkuUnitConversionsReplaceSchema =
      supplierProductSchemas.SupplierSkuUnitConversionsReplaceSchema;
    expect(SupplierSkuUnitConversionsReplaceSchema.parse({
      expected_version: 3,
      purchase_unit_id: unitId,
      base_unit_id: baseUnitId,
      conversions: [{
        from_unit_id: unitId,
        to_unit_id: baseUnitId,
        factor: "8.000",
      }],
    })).toEqual({
      expected_version: 3,
      purchase_unit_id: unitId,
      base_unit_id: baseUnitId,
      conversions: [{
        from_unit_id: unitId,
        to_unit_id: baseUnitId,
        factor: "8.000",
      }],
    });

    expect(SupplierSkuUnitConversionsReplaceSchema.safeParse({
      expected_version: 3,
      purchase_unit_id: unitId,
      base_unit_id: baseUnitId,
      conversions: [{
        from_unit_id: unitId,
        to_unit_id: unitId,
        factor: "0",
      }],
    }).success).toBe(false);

    expect(SupplierSkuUnitConversionsReplaceSchema.safeParse({
      expected_version: 3,
      purchase_unit_id: unitId,
      base_unit_id: baseUnitId,
      conversions: [{
        from_unit_id: unitId,
        to_unit_id: categoryId,
        factor: "1234567890123.1",
      }],
    }).success).toBe(false);
    expect(SupplierSkuUnitConversionsReplaceSchema.safeParse({
      expected_version: 3,
      purchase_unit_id: unitId,
      base_unit_id: baseUnitId,
      conversions: [{
        from_unit_id: unitId,
        to_unit_id: categoryId,
        factor: "8.0000001",
      }],
    }).success).toBe(false);
  });

  test("routes unit identity changes through the atomic conversion command", () => {
    expect(supplierProductSchemas.SupplierSkuUpdateSchema.safeParse({
      expected_version: 2,
      purchase_unit_id: unitId,
    }).success).toBe(false);
  });

  test("requires a positive expected version for lifecycle commands", () => {
    expect(SupplierProductCommandSchema.safeParse({
      expected_version: 0,
    }).success).toBe(false);
  });

  test("defines bounded platform list and ownership-free create schemas", () => {
    expect("PlatformSupplierProductListQuerySchema" in supplierProductSchemas)
      .toBe(true);
    expect("PlatformSupplierProductCreateSchema" in supplierProductSchemas)
      .toBe(true);
    expect("PlatformSupplierSkuCreateSchema" in supplierProductSchemas)
      .toBe(true);
    expect("PlatformSupplierSkuHttpListQuerySchema" in supplierProductSchemas)
      .toBe(true);

    const listSchema = supplierProductSchemas.PlatformSupplierProductListQuerySchema;
    const productSchema = supplierProductSchemas.PlatformSupplierProductCreateSchema;
    const skuSchema = supplierProductSchemas.PlatformSupplierSkuCreateSchema;
    const skuListSchema =
      supplierProductSchemas.PlatformSupplierSkuHttpListQuerySchema;

    expect(listSchema.parse({ supplierId: tenantSupplierId })).toEqual({
      supplierId: tenantSupplierId,
      page: 1,
      pageSize: 20,
    });
    expect(listSchema.safeParse({
      supplierId: tenantSupplierId,
      pageSize: 101,
    }).success).toBe(false);
    expect(productSchema.safeParse({
      product_code: "P-1",
      name: "瓷砖",
      category_id: categoryId,
      brand_id: brandId,
      owner_tenant_id: tenantSupplierId,
    }).success).toBe(false);
    expect(skuSchema.parse({
      sku_code: "SKU-1",
      name: "瓷砖 SKU",
      purchase_unit_id: unitId,
      spec_values: { size: "600×600" },
    })).toMatchObject({
      batch_managed: false,
      color_managed: false,
      serial_managed: false,
      spec_values: { size: "600×600" },
    });
    expect(skuListSchema.parse({ supplierId: tenantSupplierId })).toEqual({
      supplierId: tenantSupplierId,
      page: 1,
      pageSize: 20,
    });
  });
});
