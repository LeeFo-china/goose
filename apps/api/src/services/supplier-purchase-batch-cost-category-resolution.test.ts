import { describe, expect, mock, test } from "bun:test";

import { enrichCatalogCostCategoryDefaults } from
  "@/repositories/supplier-purchase-cost-category-resolution";
import { resolveSupplierPurchaseBatchDraftCostCategories } from
  "@/services/supplier-purchase-batch-cost-category-resolution";

const TENANT_ID = "a0000000-0000-4000-8000-000000000001";
const PRODUCT_ID = "a0000000-0000-4000-8000-000000000002";
const SKU_ID = "a0000000-0000-4000-8000-000000000003";
const CATEGORY_ID = "a0000000-0000-4000-8000-000000000004";
const BRAND_ID = "a0000000-0000-4000-8000-000000000005";
const RELATIONSHIP_ID = "a0000000-0000-4000-8000-000000000006";
const SUPPLIER_ID = "a0000000-0000-4000-8000-000000000007";
const PRICE_LIST_ID = "a0000000-0000-4000-8000-000000000008";
const PRICE_ITEM_ID = "a0000000-0000-4000-8000-000000000009";
const PURCHASE_UNIT_ID = "a0000000-0000-4000-8000-000000000010";
const BASE_UNIT_ID = "a0000000-0000-4000-8000-000000000011";
const AT = "2026-09-02T08:00:00.000Z";

const defaultRule = {
  supplier_sku_id: SKU_ID,
  cost_category_id: CATEGORY_ID,
  cost_category_name: "主材",
  source: "category",
} as const;

describe("supplier purchase cost category resolution", () => {
  test("enriches catalog items through one tenant-scoped batch RPC", async () => {
    const rpc = mock(async () => ({ data: [defaultRule], error: null }));

    const result = await enrichCatalogCostCategoryDefaults(
      { rpc },
      TENANT_ID,
      [catalogItem],
    );

    expect(rpc).toHaveBeenCalledWith(
      "resolve_tenant_supplier_sku_cost_categories",
      { p_tenant_id: TENANT_ID, p_supplier_sku_ids: [SKU_ID] },
    );
    expect(result[0]).toMatchObject({
      default_cost_category_id: CATEGORY_ID,
      default_cost_category_name: "主材",
      cost_category_source: "category",
    });
  });

  test("fills omitted draft categories and preserves explicit legacy input", async () => {
    const resolveCostCategoryDefaults = mock(async () => [defaultRule]);
    const repository = { resolveCostCategoryDefaults };

    const automatic = await resolveSupplierPurchaseBatchDraftCostCategories(
      repository,
      TENANT_ID,
      [{ supplier_sku_id: SKU_ID, quantity: "2.5000" }],
    );
    const explicit = await resolveSupplierPurchaseBatchDraftCostCategories(
      repository,
      TENANT_ID,
      [{
        supplier_sku_id: SKU_ID,
        cost_category_id: CATEGORY_ID,
        quantity: "1.0000",
      }],
    );

    expect(automatic[0]?.cost_category_id).toBe(CATEGORY_ID);
    expect(explicit[0]?.cost_category_id).toBe(CATEGORY_ID);
    expect(resolveCostCategoryDefaults).toHaveBeenCalledTimes(1);
  });

  test("blocks purchase when neither product nor category has a mapping", async () => {
    const repository = { resolveCostCategoryDefaults: mock(async () => []) };

    await expect(resolveSupplierPurchaseBatchDraftCostCategories(
      repository,
      TENANT_ID,
      [{ supplier_sku_id: SKU_ID, quantity: "1.0000" }],
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_COST_CATEGORY_REQUIRED",
    });
  });
});

const catalogItem = {
  supplier_product_id: PRODUCT_ID,
  product_code: "P-001",
  product_name: "瓷砖",
  supplier_sku_id: SKU_ID,
  sku_code: "SKU-001",
  sku_name: "灰色 600x600",
  specification: "600x600",
  model: null,
  category_id: CATEGORY_ID,
  category_name: "瓷砖",
  brand_id: BRAND_ID,
  brand_name: "示范品牌",
  tenant_supplier_id: RELATIONSHIP_ID,
  supplier_id: SUPPLIER_ID,
  supplier_name: "示范供应商",
  supplier_price_list_id: PRICE_LIST_ID,
  supplier_price_list_item_id: PRICE_ITEM_ID,
  price_list_code: "DEFAULT",
  price_list_version: 1,
  effective_from: AT,
  effective_until: null,
  purchase_unit_id: PURCHASE_UNIT_ID,
  purchase_unit_code: "BOX",
  purchase_unit_name: "箱",
  purchase_unit_symbol: "箱",
  base_unit_id: BASE_UNIT_ID,
  base_unit_code: "PIECE",
  base_unit_name: "片",
  base_unit_symbol: "片",
  base_unit_conversion: "4.00000000",
  unit_price: "40.00",
  tax_rate: "0.130000",
  tax_inclusive: false,
  currency: "CNY",
  purchasable_status: "purchasable",
} as const;
