import { describe, expect, test } from "bun:test";

import {
  SupplierPurchaseRequisitionBudgetStatusSchema,
  SupplierPurchaseRequisitionCancelSchema,
  SupplierPurchaseRequisitionConvertSchema,
  SupplierPurchaseRequisitionDraftSchema,
  SupplierPurchaseRequisitionItemListQuerySchema,
  SupplierPurchaseRequisitionListQuerySchema,
  SupplierPurchaseRequisitionParamSchema,
  SupplierPurchaseRequisitionReviewSchema,
  SupplierPurchaseRequisitionStatusSchema,
  SupplierPurchaseRequisitionSubmitSchema,
} from "./supplier-purchase-requisitions";

const PROJECT_ID = "10000000-0000-4000-8000-000000000001";
const TENANT_SUPPLIER_ID = "10000000-0000-4000-8000-000000000002";
const SKU_ID = "10000000-0000-4000-8000-000000000003";
const COST_CATEGORY_ID = "10000000-0000-4000-8000-000000000004";
const REQUISITION_ID = "10000000-0000-4000-8000-000000000005";
const PURCHASE_ORDER_ID = "10000000-0000-4000-8000-000000000006";

function draft(overrides: Record<string, unknown> = {}) {
  return {
    project_id: PROJECT_ID,
    tenant_supplier_id: TENANT_SUPPLIER_ID,
    expected_version: 0,
    reason: " 项目现场需要首批主材 ",
    expected_delivery_date: "2026-08-15",
    remark: " 分批到货 ",
    items: [{
      supplier_sku_id: SKU_ID,
      cost_category_id: COST_CATEGORY_ID,
      quantity: "2.5000",
    }],
    ...overrides,
  };
}

describe("supplier purchase requisition query schemas", () => {
  test("defaults list pagination and caps page size at one hundred", () => {
    expect(SupplierPurchaseRequisitionListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(SupplierPurchaseRequisitionListQuerySchema.parse({
      page: "2",
      pageSize: "100",
    })).toMatchObject({ page: 2, pageSize: 100 });
    expect(SupplierPurchaseRequisitionListQuerySchema.safeParse({
      pageSize: "101",
    }).success).toBe(false);
  });

  test("strictly accepts supported list filters", () => {
    expect(SupplierPurchaseRequisitionListQuerySchema.parse({
      status: "pending_approval",
      budget_status: "over_budget",
      project_id: PROJECT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
    })).toMatchObject({
      status: "pending_approval",
      budget_status: "over_budget",
      project_id: PROJECT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
    });
    for (const input of [
      { status: "submitted" },
      { budget_status: "unknown" },
      { project_id: "not-a-uuid" },
      { tenant_supplier_id: "not-a-uuid" },
      { budgetStatus: "over_budget" },
      { projectId: PROJECT_ID },
      { tenantSupplierId: TENANT_SUPPLIER_ID },
      { unknown: true },
    ]) {
      expect(SupplierPurchaseRequisitionListQuerySchema.safeParse(input).success)
        .toBe(false);
    }
  });

  test("exports exact status and budget status domains", () => {
    for (const status of [
      "draft",
      "pending_approval",
      "approved",
      "rejected",
      "cancelled",
      "converted",
    ] as const) {
      expect(SupplierPurchaseRequisitionStatusSchema.parse(status)).toBe(status);
    }
    for (const status of [
      "unchecked",
      "within_budget",
      "over_budget",
    ] as const) {
      expect(SupplierPurchaseRequisitionBudgetStatusSchema.parse(status))
        .toBe(status);
    }
  });

  test("strictly parses params and paginated item queries", () => {
    expect(SupplierPurchaseRequisitionParamSchema.parse({
      id: REQUISITION_ID,
    })).toEqual({ id: REQUISITION_ID });
    expect(SupplierPurchaseRequisitionParamSchema.safeParse({
      id: REQUISITION_ID,
      extra: true,
    }).success).toBe(false);
    expect(SupplierPurchaseRequisitionItemListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(SupplierPurchaseRequisitionItemListQuerySchema.safeParse({
      pageSize: 101,
    }).success).toBe(false);
  });
});

describe("supplier purchase requisition draft schema", () => {
  test("accepts and trims a strict draft without client price facts", () => {
    expect(SupplierPurchaseRequisitionDraftSchema.parse(draft())).toEqual({
      ...draft(),
      reason: "项目现场需要首批主材",
      remark: "分批到货",
    });
    for (const forbiddenField of [
      "unit_price",
      "tax_rate",
      "subtotal_amount",
      "tax_amount",
      "total_amount",
      "amount",
    ]) {
      expect(SupplierPurchaseRequisitionDraftSchema.safeParse(draft({
        items: [{
          supplier_sku_id: SKU_ID,
          cost_category_id: COST_CATEGORY_ID,
          quantity: "2",
          [forbiddenField]: 1,
        }],
      })).success).toBe(false);
    }
  });

  test("requires bounded reason and validates optional draft fields", () => {
    for (const reason of ["", " ", "a".repeat(501)]) {
      expect(SupplierPurchaseRequisitionDraftSchema.safeParse(draft({ reason }))
        .success).toBe(false);
    }
    expect(SupplierPurchaseRequisitionDraftSchema.parse(draft({
      expected_delivery_date: null,
      remark: null,
    }))).toMatchObject({
      expected_delivery_date: null,
      remark: null,
    });
    expect(SupplierPurchaseRequisitionDraftSchema.safeParse(draft({
      expected_delivery_date: "2026-02-30",
    })).success).toBe(false);
    expect(SupplierPurchaseRequisitionDraftSchema.safeParse(draft({
      remark: "a".repeat(501),
    })).success).toBe(false);
  });

  test("requires valid project, supplier, SKU and cost category ids", () => {
    expect(SupplierPurchaseRequisitionDraftSchema.safeParse(draft({
      project_id: "invalid",
    })).success).toBe(false);
    expect(SupplierPurchaseRequisitionDraftSchema.safeParse(draft({
      tenant_supplier_id: "invalid",
    })).success).toBe(false);
    expect(SupplierPurchaseRequisitionDraftSchema.safeParse(draft({
      items: [{
        supplier_sku_id: "invalid",
        cost_category_id: COST_CATEGORY_ID,
        quantity: "1",
      }],
    })).success).toBe(false);
    expect(SupplierPurchaseRequisitionDraftSchema.safeParse(draft({
      items: [{
        supplier_sku_id: SKU_ID,
        cost_category_id: "invalid",
        quantity: "1",
      }],
    })).success).toBe(false);
  });

  test("requires one to one hundred case-insensitively unique SKU lines", () => {
    expect(SupplierPurchaseRequisitionDraftSchema.safeParse(draft({
      items: [],
    })).success).toBe(false);
    expect(SupplierPurchaseRequisitionDraftSchema.safeParse(draft({
      items: [
        {
          supplier_sku_id: SKU_ID,
          cost_category_id: COST_CATEGORY_ID,
          quantity: "1",
        },
        {
          supplier_sku_id: SKU_ID.toUpperCase(),
          cost_category_id: COST_CATEGORY_ID,
          quantity: "2",
        },
      ],
    })).success).toBe(false);
    expect(SupplierPurchaseRequisitionDraftSchema.safeParse(draft({
      items: Array.from({ length: 101 }, (_, index) => ({
        supplier_sku_id: `10000000-0000-4000-8000-${
          String(index + 100).padStart(12, "0")
        }`,
        cost_category_id: COST_CATEGORY_ID,
        quantity: "1",
      })),
    })).success).toBe(false);
  });

  test("enforces numeric eighteen scale four quantity boundaries", () => {
    for (const quantity of [
      "0",
      "0.0000",
      "-1",
      "1.00001",
      "100000000000000",
      "1e2",
      " 1.0 ",
      1,
    ]) {
      expect(SupplierPurchaseRequisitionDraftSchema.safeParse(draft({
        items: [{
          supplier_sku_id: SKU_ID,
          cost_category_id: COST_CATEGORY_ID,
          quantity,
        }],
      })).success).toBe(false);
    }
    for (const quantity of [
      "0.0001",
      "12.5",
      "99999999999999.9999",
    ]) {
      expect(SupplierPurchaseRequisitionDraftSchema.parse(draft({
        items: [{
          supplier_sku_id: SKU_ID,
          cost_category_id: COST_CATEGORY_ID,
          quantity,
        }],
      })).items[0]?.quantity).toBe(quantity);
    }
  });

  test("allows version zero only while saving a draft", () => {
    expect(SupplierPurchaseRequisitionDraftSchema.safeParse(draft({
      expected_version: -1,
    })).success).toBe(false);
    expect(SupplierPurchaseRequisitionDraftSchema.safeParse(draft({
      expected_version: 1.5,
    })).success).toBe(false);
    for (const expectedVersion of [null, "", false, "1"]) {
      expect(SupplierPurchaseRequisitionDraftSchema.safeParse(draft({
        expected_version: expectedVersion,
      })).success).toBe(false);
    }
    expect(SupplierPurchaseRequisitionDraftSchema.safeParse(draft({
      unknown: true,
    })).success).toBe(false);
  });
});

describe("supplier purchase requisition command schemas", () => {
  test("submit accepts only a positive expected version", () => {
    expect(SupplierPurchaseRequisitionSubmitSchema.parse({
      expected_version: 2,
    })).toEqual({ expected_version: 2 });
    for (const input of [
      { expected_version: 0 },
      { expected_version: 1.5 },
      { expected_version: "1" },
      { expected_version: true },
      { expected_version: 1, unknown: true },
    ]) {
      expect(SupplierPurchaseRequisitionSubmitSchema.safeParse(input).success)
        .toBe(false);
    }
  });

  test("review accepts approve or reject with a bounded nullable remark", () => {
    expect(SupplierPurchaseRequisitionReviewSchema.parse({
      expected_version: 2,
      action: "approve",
      remark: " 同意 ",
    })).toEqual({
      expected_version: 2,
      action: "approve",
      remark: "同意",
    });
    expect(SupplierPurchaseRequisitionReviewSchema.parse({
      expected_version: 2,
      action: "reject",
      remark: null,
    }).remark).toBeNull();
    for (const input of [
      { expected_version: 0, action: "approve" },
      { expected_version: 2, action: "return" },
      { expected_version: 2, action: "reject", remark: "a".repeat(501) },
      { expected_version: 2, action: "approve", unknown: true },
    ]) {
      expect(SupplierPurchaseRequisitionReviewSchema.safeParse(input).success)
        .toBe(false);
    }
  });

  test("cancel requires a trimmed bounded reason", () => {
    expect(SupplierPurchaseRequisitionCancelSchema.parse({
      expected_version: 2,
      reason: " 项目计划调整 ",
    })).toEqual({
      expected_version: 2,
      reason: "项目计划调整",
    });
    for (const reason of ["", " ", "a".repeat(501)]) {
      expect(SupplierPurchaseRequisitionCancelSchema.safeParse({
        expected_version: 2,
        reason,
      }).success).toBe(false);
    }
  });

  test("convert requires a positive version and purchase order id", () => {
    expect(SupplierPurchaseRequisitionConvertSchema.parse({
      expected_version: 3,
      purchase_order_id: PURCHASE_ORDER_ID,
    })).toEqual({
      expected_version: 3,
      purchase_order_id: PURCHASE_ORDER_ID,
    });
    expect(SupplierPurchaseRequisitionConvertSchema.safeParse({
      expected_version: 0,
      purchase_order_id: PURCHASE_ORDER_ID,
    }).success).toBe(false);
    expect(SupplierPurchaseRequisitionConvertSchema.safeParse({
      expected_version: 3,
      purchase_order_id: "invalid",
    }).success).toBe(false);
    expect(SupplierPurchaseRequisitionConvertSchema.safeParse({
      expected_version: 3,
      purchase_order_id: PURCHASE_ORDER_ID,
      unknown: true,
    }).success).toBe(false);
  });
});
