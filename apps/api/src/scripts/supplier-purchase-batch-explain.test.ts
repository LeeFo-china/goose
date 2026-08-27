import { describe, expect, test } from "bun:test";

import {
  EXPECTED_SUPPLIER_PURCHASE_BATCH_INDEXES,
  SUPPLIER_PURCHASE_BATCH_EXPLAIN_QUERIES,
  assertSupplierPurchaseBatchExplainPlans,
  parseSupplierPurchaseBatchExplainPlan,
} from "./supplier-purchase-batch-explain";

function plan(indexName: string) {
  return [{
    Plan: {
      "Node Type": "Limit",
      Plans: [{ "Node Type": "Index Scan", "Index Name": indexName }],
    },
    "Planning Time": 0.1,
    "Execution Time": 0.2,
  }];
}

describe("supplier purchase batch EXPLAIN manifest", () => {
  test("requires runtime evidence from every intended read index", () => {
    const plans = Object.fromEntries(
      Object.entries(EXPECTED_SUPPLIER_PURCHASE_BATCH_INDEXES).map(
        ([name, indexes]) => [
          name,
          parseSupplierPurchaseBatchExplainPlan([{
            "QUERY PLAN": plan(indexes[0]!),
          }]),
        ],
      ),
    );

    expect(assertSupplierPurchaseBatchExplainPlans(plans)).toBe(true);
  });

  test("keeps plans bounded and avoids per-item query loops", () => {
    for (const query of Object.values(
      SUPPLIER_PURCHASE_BATCH_EXPLAIN_QUERIES,
    )) {
      expect(query.toLowerCase()).toContain("explain (analyze");
      expect(query.toLowerCase()).toContain("limit ");
      expect(query.toLowerCase()).not.toContain("select *");
    }
    expect(SUPPLIER_PURCHASE_BATCH_EXPLAIN_QUERIES.approval)
      .toContain("supplier_purchase_batch_items");
    expect(SUPPLIER_PURCHASE_BATCH_EXPLAIN_QUERIES.approval)
      .not.toContain("PER_ITEM_LOOP");
  });

  test("uses the default planner after representative catalog statistics", async () => {
    const source = await Bun.file(
      new URL("./supplier-purchase-batch-explain.ts", import.meta.url),
    ).text();

    expect(source).not.toContain("enable_seqscan");
    expect(source).toContain("seedCatalogSearchCardinality");
    expect(source).toContain("analyze public.supplier_products");
    expect(source).toContain("analyze public.supplier_skus");
    expect(source).toContain("generate_series(1, 50000)");
  });
});
