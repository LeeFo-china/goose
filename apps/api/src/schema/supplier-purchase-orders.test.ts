import { describe, expect, test } from "bun:test";

import {
  SupplierPurchaseOrderCancelSchema,
  SupplierPurchaseOrderCatalogQuerySchema,
  SupplierPurchaseOrderDraftSchema,
  SupplierPurchaseOrderListQuerySchema,
  SupplierPurchaseOrderOptionQuerySchema,
  SupplierPurchaseOrderSubmitSchema,
} from "./supplier-purchase-orders";

const projectId = "30000000-0000-4000-8000-000000000001";
const tenantSupplierId = "30000000-0000-4000-8000-000000000002";
const skuId = "30000000-0000-4000-8000-000000000003";

function draft(overrides: Record<string, unknown> = {}) {
  return {
    project_id: projectId,
    tenant_supplier_id: tenantSupplierId,
    expected_version: 0,
    expected_delivery_date: "2026-08-15",
    remark: "主材首批采购",
    items: [{ supplier_sku_id: skuId, quantity: 2.5 }],
    ...overrides,
  };
}

describe("supplier purchase order schemas", () => {
  test("defaults and caps order list pagination", () => {
    expect(SupplierPurchaseOrderListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(SupplierPurchaseOrderListQuerySchema.safeParse({
      pageSize: "101",
    }).success).toBe(false);
  });

  test("accepts bounded order filters and rejects unknown filters", () => {
    expect(SupplierPurchaseOrderListQuerySchema.parse({
      keyword: " PO-20260729 ",
      status: "draft",
      projectId,
      tenantSupplierId,
    })).toMatchObject({
      keyword: "PO-20260729",
      status: "draft",
      projectId,
      tenantSupplierId,
    });
    expect(SupplierPurchaseOrderListQuerySchema.safeParse({
      project_id: projectId,
    }).success).toBe(false);
  });

  test("bounds project and supplier option pagination", () => {
    expect(SupplierPurchaseOrderOptionQuerySchema.parse({
      page: "2",
      pageSize: "100",
      keyword: " 建材 ",
    })).toEqual({
      page: 2,
      pageSize: 100,
      keyword: "建材",
    });
    expect(SupplierPurchaseOrderOptionQuerySchema.safeParse({
      page: 1,
      pageSize: 101,
    }).success).toBe(false);
  });

  test("requires a tenant supplier for the paginated purchase catalog", () => {
    expect(SupplierPurchaseOrderCatalogQuerySchema.parse({
      tenantSupplierId,
    })).toEqual({
      tenantSupplierId,
      page: 1,
      pageSize: 20,
    });
    expect(SupplierPurchaseOrderCatalogQuerySchema.safeParse({}).success)
      .toBe(false);
  });

  test("accepts a project-bound draft without client price facts", () => {
    expect(SupplierPurchaseOrderDraftSchema.parse(draft())).toEqual(draft());
    expect(SupplierPurchaseOrderDraftSchema.safeParse(draft({
      items: [{
        supplier_sku_id: skuId,
        quantity: 2,
        unit_price: 1,
      }],
    })).success).toBe(false);
  });

  test("requires one to one hundred unique SKU lines", () => {
    expect(SupplierPurchaseOrderDraftSchema.safeParse(draft({
      items: [],
    })).success).toBe(false);
    expect(SupplierPurchaseOrderDraftSchema.safeParse(draft({
      items: [
        { supplier_sku_id: skuId, quantity: 1 },
        { supplier_sku_id: skuId, quantity: 2 },
      ],
    })).success).toBe(false);
    expect(SupplierPurchaseOrderDraftSchema.safeParse(draft({
      items: Array.from({ length: 101 }, (_, index) => ({
        supplier_sku_id: `30000000-0000-4000-8000-${
          String(index + 10).padStart(12, "0")
        }`,
        quantity: 1,
      })),
    })).success).toBe(false);
  });

  test("rejects invalid quantity precision and nonpositive quantities", () => {
    expect(SupplierPurchaseOrderDraftSchema.safeParse(draft({
      items: [{ supplier_sku_id: skuId, quantity: 0 }],
    })).success).toBe(false);
    expect(SupplierPurchaseOrderDraftSchema.safeParse(draft({
      items: [{ supplier_sku_id: skuId, quantity: 1.00001 }],
    })).success).toBe(false);
  });

  test("uses version zero only for draft creation", () => {
    expect(SupplierPurchaseOrderDraftSchema.safeParse(draft({
      expected_version: -1,
    })).success).toBe(false);
    expect(SupplierPurchaseOrderDraftSchema.safeParse(draft({
      expected_version: 1,
    })).success).toBe(true);
    expect(SupplierPurchaseOrderSubmitSchema.safeParse({
      expected_version: 0,
    }).success).toBe(false);
    expect(SupplierPurchaseOrderSubmitSchema.parse({
      expected_version: 2,
    })).toEqual({ expected_version: 2 });
  });

  test("requires a bounded nonblank cancellation reason", () => {
    expect(SupplierPurchaseOrderCancelSchema.safeParse({
      expected_version: 2,
      reason: " ",
    }).success).toBe(false);
    expect(SupplierPurchaseOrderCancelSchema.parse({
      expected_version: 2,
      reason: " 项目采购计划调整 ",
    })).toEqual({
      expected_version: 2,
      reason: "项目采购计划调整",
    });
  });
});
