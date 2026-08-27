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

  test("selects only platform catalog references and a tenant without settings", async () => {
    const source = await Bun.file(
      new URL("./supplier-purchase-batch-smoke-fixture.ts", import.meta.url),
    ).text();

    expect(source).toContain("category.ownership_scope = 'platform'");
    expect(source).toContain("category.owner_tenant_id is null");
    expect(source).toContain("brand.ownership_scope = 'platform'");
    expect(source).toContain("brand.owner_tenant_id is null");
    expect(source).toContain("not exists (");
    expect(source).toContain("public.tenant_supplier_settings as existing_settings");
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
    expect(SUPPLIER_PURCHASE_BATCH_SMOKE_MANIFEST.driftMatrix).toEqual([
      ["price_changed", "SUPPLIER_PURCHASE_BATCH_PRICE_CHANGED", [0, 1]],
      ["missing_price", "SUPPLIER_PURCHASE_BATCH_PRICE_CHANGED", [0, 1]],
      ["supplier_suspended", "SUPPLIER_PURCHASE_BATCH_SUPPLIER_INELIGIBLE", [0]],
      ["product_inactive", "SUPPLIER_PURCHASE_BATCH_PRICE_CHANGED", [0]],
      ["sku_inactive", "SUPPLIER_PURCHASE_BATCH_PRICE_CHANGED", [2]],
      ["category_inactive", "SUPPLIER_PURCHASE_BATCH_PRICE_CHANGED", [0, 1, 2]],
      ["budget_changed", "SUPPLIER_PURCHASE_BATCH_BUDGET_CHANGED", [0, 1]],
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
      batchStatusAndVersionUnchanged: true,
      currentRequisitionStatus: "pending_approval",
      purchaseOrderId: null,
      commitmentStatus: "reserved",
      recognizedAmount: "0.00",
      exactReviewEventCount: 0,
    });
  });

  test("uses exact ordered blocker assertions instead of kind or count checks", async () => {
    const source = await Bun.file(
      new URL("./supplier-purchase-batch-drift.ts", import.meta.url),
    ).text();
    expect(source).not.toContain("details.length <");
    expect(source).not.toContain("new Set(details.map");
    expect(source).toContain("assertExactDriftDetails");
    expect(source).toContain("command_supplier_price_item_v2(");
    expect(source).not.toContain("command_supplier_price_list_item_v2(");
  });

  test("asserts every post-failure aggregate at the frozen generation", async () => {
    const source = await Bun.file(
      new URL("./supplier-purchase-batch-atomicity.ts", import.meta.url),
    ).text();
    for (const evidence of [
      "split_generation", "purchase_order_id", "recognized_amount",
      "review_event_count", "BATCH_ATOMICITY_BATCH_CHANGED",
      "BATCH_ATOMICITY_REQUISITIONS_CHANGED",
      "BATCH_ATOMICITY_COMMITMENTS_CHANGED",
    ]) expect(source).toContain(evidence);
  });
});
