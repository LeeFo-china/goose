import { describe, expect, test } from "bun:test";

import {
  SUPPLIER_PURCHASE_BATCH_SMOKE_MANIFEST,
  createSupplierPurchaseBatchSmokeFixture,
} from "./supplier-purchase-batch-smoke";
import {
  SUPPLIER_PURCHASE_BATCH_FIXTURE_TABLE_ORDER,
  createPurchasableCodes,
  parsePgUuidArray,
} from "./supplier-purchase-batch-smoke-fixture";

describe("supplier purchase batch smoke manifest", () => {
  test("parses Bun PostgreSQL uuid arrays without trusting driver coercion", () => {
    expect(parsePgUuidArray(
      "{1173b5b4-af60-4d47-b825-63565edcbb8d,4ccbd0a4-9524-4494-9a9b-5c3e2ac29625}",
    )).toEqual([
      "1173b5b4-af60-4d47-b825-63565edcbb8d",
      "4ccbd0a4-9524-4494-9a9b-5c3e2ac29625",
    ]);
  });

  test("seeds the auth identity before the employee foreign key", () => {
    expect(SUPPLIER_PURCHASE_BATCH_FIXTURE_TABLE_ORDER.slice(0, 2))
      .toEqual(["auth.users", "public.employees"]);
  });

  test("uses the deterministic purchasable command codes", () => {
    expect(createPurchasableCodes(
      "11000000-0000-4000-8000-000000000001",
      "22000000-0000-4000-8000-000000000002",
    )).toEqual({
      productCode: "TP-1100000000004000",
      skuCode: "TS-2200000000004000",
    });
  });

  test("isolates a repeatable fixture with two suppliers and a split cart", () => {
    const fixture = createSupplierPurchaseBatchSmokeFixture("manifest-test");

    expect(fixture.tenantToken).toContain("manifest-test");
    expect(fixture.suppliers).toHaveLength(2);
    expect(fixture.skus).toHaveLength(3);
    expect(fixture.costCategories).toHaveLength(2);
    expect(new Set(fixture.skus.map((sku) => sku.supplierKey)).size).toBe(2);
    expect(fixture.skus.filter((sku) => sku.supplierKey === "supplier-a"))
      .toHaveLength(2);
    expect(fixture.cleanup).toEqual({ strategy: "rollback", scoped: true });
  });

  test("covers atomic split, replay, drift, budget, and rollback evidence", () => {
    expect(SUPPLIER_PURCHASE_BATCH_SMOKE_MANIFEST.happyPath).toEqual({
      supplierCount: 2,
      skuCount: 3,
      costCategoryCount: 2,
      exactSubmittedOrderCount: 2,
      oneOrderPerSupplier: true,
      sameSupplierMultipleSkusStayTogether: true,
      wholeBatchBudgetAggregation: true,
    });
    expect(SUPPLIER_PURCHASE_BATCH_SMOKE_MANIFEST.replay).toEqual({
      sameResult: true,
      duplicateSideEffects: 0,
    });
    expect(SUPPLIER_PURCHASE_BATCH_SMOKE_MANIFEST.blockers).toEqual([
      "price_changed",
      "missing_price",
      "supplier_suspended",
      "product_inactive",
      "sku_inactive",
      "category_inactive",
    ]);
    expect(SUPPLIER_PURCHASE_BATCH_SMOKE_MANIFEST.revision).toEqual({
      persistedAsDraft: true,
      versionIncremented: true,
      fullBlockerList: true,
      zeroOrders: true,
    });
    expect(SUPPLIER_PURCHASE_BATCH_SMOKE_MANIFEST.injectedFailure).toEqual({
      failAtOrder: 2,
      transactionRolledBack: true,
      exactOrderCount: 0,
    });
  });
});
