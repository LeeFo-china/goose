import { describe, expect, test } from "bun:test";

import {
  SupplierPurchaseBatchCancelSchema,
  SupplierPurchaseBatchCatalogQuerySchema,
  SupplierPurchaseBatchCostCategoryQuerySchema,
  SupplierPurchaseBatchDraftSchema,
  SupplierPurchaseBatchItemListQuerySchema,
  SupplierPurchaseBatchListQuerySchema,
  SupplierPurchaseBatchOrderListQuerySchema,
  SupplierPurchaseBatchParamSchema,
  SupplierPurchaseBatchProjectOptionQuerySchema,
  SupplierPurchaseBatchRequisitionListQuerySchema,
  SupplierPurchaseBatchReviewSchema,
  SupplierPurchaseBatchSubmitSchema,
  SupplierPurchaseBatchWithdrawSchema,
} from "./supplier-purchase-batches";

const PROJECT_ID = "10000000-0000-4000-8000-000000000001";
const SKU_ID = "10000000-0000-4000-8000-0000000000ab";
const CATEGORY_ID = "10000000-0000-4000-8000-000000000003";
const BRAND_ID = "10000000-0000-4000-8000-000000000004";
const TENANT_SUPPLIER_ID = "10000000-0000-4000-8000-000000000005";
const BATCH_ID = "10000000-0000-4000-8000-000000000006";

function draft(overrides: Record<string, unknown> = {}) {
  return {
    project_id: PROJECT_ID,
    expected_version: 0,
    reason: "项目主材采购",
    expected_delivery_date: "2026-09-10",
    items: [{
      supplier_sku_id: SKU_ID,
      cost_category_id: CATEGORY_ID,
      quantity: "20.0000",
    }],
    ...overrides,
  };
}

describe("supplier purchase batch query schemas", () => {
  test("defaults and bounds strict batch list pagination", () => {
    expect(SupplierPurchaseBatchListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(SupplierPurchaseBatchListQuerySchema.parse({
      page: "2",
      pageSize: "100",
      keyword: " 主材 ",
      status: "pending_approval",
      projectId: PROJECT_ID,
    })).toEqual({
      page: 2,
      pageSize: 100,
      keyword: "主材",
      status: "pending_approval",
      projectId: PROJECT_ID,
    });
    for (const input of [
      { pageSize: 101 },
      { status: "approved" },
      { projectId: "invalid" },
      { project_id: PROJECT_ID },
      { unknown: true },
    ]) {
      expect(SupplierPurchaseBatchListQuerySchema.safeParse(input).success)
        .toBe(false);
    }
  });

  test("strictly parses params and every paginated child collection", () => {
    expect(SupplierPurchaseBatchParamSchema.parse({ id: BATCH_ID })).toEqual({
      id: BATCH_ID,
    });
    expect(SupplierPurchaseBatchParamSchema.safeParse({
      id: BATCH_ID,
      unknown: true,
    }).success).toBe(false);
    for (const schema of [
      SupplierPurchaseBatchItemListQuerySchema,
      SupplierPurchaseBatchRequisitionListQuerySchema,
      SupplierPurchaseBatchOrderListQuerySchema,
    ]) {
      expect(schema.parse({ page: "2", pageSize: "100" })).toEqual({
        page: 2,
        pageSize: 100,
      });
      expect(schema.safeParse({ pageSize: 101 }).success).toBe(false);
      expect(schema.safeParse({ unknown: true }).success).toBe(false);
    }
  });

  test("supports project option update-window and timezone filters", () => {
    expect(SupplierPurchaseBatchProjectOptionQuerySchema.parse({
      keyword: " 水泥 ",
      pageSize: "100",
      updatedWindow: "current_month",
      timezone: "Asia/Shanghai",
    })).toEqual({
      page: 1,
      pageSize: 100,
      keyword: "水泥",
      updatedWindow: "current_month",
      timezone: "Asia/Shanghai",
    });
    expect(SupplierPurchaseBatchProjectOptionQuerySchema.parse({
      updatedWindow: "last_7_days",
    })).toEqual({ page: 1, pageSize: 20, updatedWindow: "last_7_days" });
    expect(SupplierPurchaseBatchProjectOptionQuerySchema.parse({
      timezone: "Asia/Shanghai",
    })).toEqual({ page: 1, pageSize: 20, timezone: "Asia/Shanghai" });
    for (const input of [
      { updatedWindow: "last_month" },
      { timezone: "UTC" },
      { updated_window: "last_7_days" },
    ]) {
      expect(SupplierPurchaseBatchProjectOptionQuerySchema.safeParse(input)
        .success).toBe(false);
    }
  });

  test("keeps cost category options isolated from project filters", () => {
    expect(SupplierPurchaseBatchCostCategoryQuerySchema.parse({
      keyword: " 水泥 ",
      pageSize: "100",
    })).toEqual({ page: 1, pageSize: 100, keyword: "水泥" });
    for (const input of [
      { updatedWindow: "last_7_days" },
      { timezone: "Asia/Shanghai" },
    ]) {
      expect(SupplierPurchaseBatchCostCategoryQuerySchema.safeParse(input)
        .success).toBe(false);
    }
    for (const schema of [
      SupplierPurchaseBatchProjectOptionQuerySchema,
      SupplierPurchaseBatchCostCategoryQuerySchema,
    ]) {
      expect(schema.safeParse({ pageSize: 101 }).success).toBe(false);
      expect(schema.safeParse({ keyword: "a".repeat(81) }).success).toBe(false);
    }
  });

  test("requires project scope for the bounded cross-supplier catalog", () => {
    expect(SupplierPurchaseBatchCatalogQuerySchema.parse({
      projectId: PROJECT_ID,
      keyword: " 钢材 ",
      categoryId: CATEGORY_ID,
      brandId: BRAND_ID,
      tenantSupplierId: TENANT_SUPPLIER_ID,
    })).toEqual({
      page: 1,
      pageSize: 20,
      projectId: PROJECT_ID,
      keyword: "钢材",
      categoryId: CATEGORY_ID,
      brandId: BRAND_ID,
      tenantSupplierId: TENANT_SUPPLIER_ID,
    });
    for (const input of [
      {},
      { projectId: "invalid" },
      { projectId: PROJECT_ID, categoryId: "invalid" },
      { projectId: PROJECT_ID, brandId: "invalid" },
      { projectId: PROJECT_ID, tenantSupplierId: "invalid" },
      { projectId: PROJECT_ID, pageSize: 101 },
      { projectId: PROJECT_ID, unknown: true },
    ]) {
      expect(SupplierPurchaseBatchCatalogQuerySchema.safeParse(input).success)
        .toBe(false);
    }
  });
});

describe("supplier purchase batch draft schema", () => {
  test("accepts a strict draft and preserves decimal strings", () => {
    expect(SupplierPurchaseBatchDraftSchema.parse(draft({
      reason: " 项目主材采购 ",
      remark: " 首批进场 ",
    }))).toEqual({
      ...draft(),
      reason: "项目主材采购",
      remark: "首批进场",
    });
    expect(SupplierPurchaseBatchDraftSchema.parse(draft())
      .items[0]?.quantity).toBe("20.0000");
    expect(SupplierPurchaseBatchDraftSchema.parse(draft({
      items: [{
        supplier_sku_id: SKU_ID,
        quantity: "1",
      }],
    })).items[0]).toEqual({
      supplier_sku_id: SKU_ID,
      quantity: "1",
    });
  });

  test("requires one to one hundred case-insensitively unique SKUs", () => {
    expect(SKU_ID.toUpperCase()).not.toBe(SKU_ID);

    expect(SupplierPurchaseBatchDraftSchema.safeParse(draft({ items: [] }))
      .success).toBe(false);
    expect(SupplierPurchaseBatchDraftSchema.safeParse(draft({
      items: [
        draft().items[0],
        { ...draft().items[0], supplier_sku_id: SKU_ID.toUpperCase() },
      ],
    })).success).toBe(false);
    expect(SupplierPurchaseBatchDraftSchema.safeParse(draft({
      items: Array.from({ length: 101 }, (_, index) => ({
        supplier_sku_id: "10000000-0000-4000-8000-" +
          String(index + 100).padStart(12, "0"),
        cost_category_id: CATEGORY_ID,
        quantity: "1",
      })),
    })).success).toBe(false);
  });

  test("enforces positive numeric eighteen scale four quantities", () => {
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
      expect(SupplierPurchaseBatchDraftSchema.safeParse(draft({
        items: [{ ...draft().items[0], quantity }],
      })).success).toBe(false);
    }
    for (const quantity of [
      "0.0001",
      "12.5",
      "99999999999999.9999",
    ]) {
      expect(SupplierPurchaseBatchDraftSchema.parse(draft({
        items: [{ ...draft().items[0], quantity }],
      })).items[0]?.quantity).toBe(quantity);
    }
  });

  test("rejects unknown, generated, and invalid draft facts", () => {
    for (const input of [
      draft({ unknown: true }),
      draft({ project_id: "invalid" }),
      draft({ expected_version: -1 }),
      draft({ expected_version: "0" }),
      draft({ reason: " " }),
      draft({ reason: "a".repeat(501) }),
      draft({ expected_delivery_date: "2026-02-30" }),
      draft({ remark: "" }),
      draft({
        items: [{ ...draft().items[0], supplier_sku_id: "invalid" }],
      }),
      draft({
        items: [{ ...draft().items[0], cost_category_id: "invalid" }],
      }),
      draft({
        items: [{ ...draft().items[0], unit_price: "100.00" }],
      }),
    ]) {
      expect(SupplierPurchaseBatchDraftSchema.safeParse(input).success)
        .toBe(false);
    }
  });
});

describe("supplier purchase batch command schemas", () => {
  test("submit accepts only a positive integer version", () => {
    expect(SupplierPurchaseBatchSubmitSchema.parse({
      expected_version: 1,
    })).toEqual({ expected_version: 1 });
    for (const input of [
      { expected_version: 0 },
      { expected_version: 1.5 },
      { expected_version: "1" },
      { expected_version: 1, unknown: true },
    ]) {
      expect(SupplierPurchaseBatchSubmitSchema.safeParse(input).success)
        .toBe(false);
    }
  });

  test("requires a bounded remark only when rejecting a review", () => {
    expect(SupplierPurchaseBatchReviewSchema.parse({
      expected_version: 2,
      action: "approve",
      remark: null,
    })).toEqual({ expected_version: 2, action: "approve", remark: null });
    expect(SupplierPurchaseBatchReviewSchema.parse({
      expected_version: 2,
      action: "reject",
      remark: " 价格不合理 ",
    })).toEqual({
      expected_version: 2,
      action: "reject",
      remark: "价格不合理",
    });
    for (const remark of [undefined, null, "", " ", "a".repeat(501)]) {
      expect(SupplierPurchaseBatchReviewSchema.safeParse({
        expected_version: 2,
        action: "reject",
        ...(remark === undefined ? {} : { remark }),
      }).success).toBe(false);
    }
    expect(SupplierPurchaseBatchReviewSchema.safeParse({
      expected_version: 2,
      action: "return",
    }).success).toBe(false);
  });

  test("cancel requires a positive version and bounded reason", () => {
    expect(SupplierPurchaseBatchCancelSchema.parse({
      expected_version: 1,
      reason: " 采购计划取消 ",
    })).toEqual({ expected_version: 1, reason: "采购计划取消" });
    for (const input of [
      { expected_version: 0, reason: "取消" },
      { expected_version: 1, reason: "" },
      { expected_version: 1, reason: "a".repeat(501) },
      { expected_version: 1, reason: "取消", unknown: true },
    ]) {
      expect(SupplierPurchaseBatchCancelSchema.safeParse(input).success)
        .toBe(false);
    }
  });

  test("withdraw requires a positive version and a nonblank optional reason", () => {
    expect(SupplierPurchaseBatchWithdrawSchema.parse({
      expected_version: 1,
    })).toEqual({ expected_version: 1 });
    expect(SupplierPurchaseBatchWithdrawSchema.parse({
      expected_version: 2,
      reason: "  采购负责人撤回  ",
    })).toEqual({ expected_version: 2, reason: "采购负责人撤回" });
    const maxReason = "a".repeat(500);
    expect(SupplierPurchaseBatchWithdrawSchema.parse({
      expected_version: 2,
      reason: `  ${maxReason}  `,
    })).toEqual({ expected_version: 2, reason: maxReason });
    for (const input of [
      { expected_version: 0 },
      { expected_version: -1 },
      { expected_version: 1.5 },
      { expected_version: "1" },
      { expected_version: 1, reason: "" },
      { expected_version: 1, reason: "   " },
      { expected_version: 1, reason: "a".repeat(501) },
      { expected_version: 1, unknown: true },
    ]) {
      expect(SupplierPurchaseBatchWithdrawSchema.safeParse(input).success)
        .toBe(false);
    }
  });
});
