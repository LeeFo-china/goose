import { describe, expect, test } from "bun:test";

import {
  SUPPLIER_PURCHASABLE_SKU_EXPLAIN_QUERY_NAMES,
  assertSupplierPurchasableSkuExplainPlan,
  parseSupplierPurchasableSkuExplainPlan,
  runSupplierPurchasableSkuExplain,
  runSupplierPurchasableSkuExplainCli,
  resolveExplainConfig,
} from "./supplier-purchasable-sku-explain";

const DATABASE_URL =
  "postgresql://fixture-user:fixture-password@api-dev.goodcms.cn:5432/postgres";

function explainRows(plan: Record<string, unknown>) {
  return [{
    "QUERY PLAN": [{
      Plan: plan,
      "Planning Time": 0.1,
      "Execution Time": 0.2,
    }],
  }];
}

describe("supplier purchasable SKU EXPLAIN command", () => {
  test("requires its explicit database URL", () => {
    expect(() => resolveExplainConfig({})).toThrowError(
      "缺少 SUPPLIER_PURCHASABLE_SKU_EXPLAIN_DB_URL",
    );
  });

  test("redacts credentials while retaining the database host", () => {
    const config = resolveExplainConfig({
      SUPPLIER_PURCHASABLE_SKU_EXPLAIN_DB_URL: DATABASE_URL,
    });

    expect(config.databaseUrl).toBe(DATABASE_URL);
    expect(config.databaseHost).toBe("api-dev.goodcms.cn");
    expect(config.redactedDatabaseUrl).toBe(
      "postgresql://***:***@api-dev.goodcms.cn:5432/postgres",
    );
  });

  test("recursively rejects scoped price-list sequential scans", () => {
    const parsed = parseSupplierPurchasableSkuExplainPlan(explainRows({
      "Node Type": "Nested Loop",
      Plans: [{
        "Node Type": "Bitmap Heap Scan",
        "Relation Name": "supplier_price_list_items",
        Plans: [{
          "Node Type": "Seq Scan",
          "Relation Name": "supplier_price_lists",
          Alias: "price_list",
          Filter: "tenant_id = fixture_tenant_id",
        }],
      }],
    }));

    expect(() => assertSupplierPurchasableSkuExplainPlan(parsed))
      .toThrowError("supplier_price_lists scoped Seq Scan");
  });

  test("accepts recursive index plans and records buffers", () => {
    const parsed = parseSupplierPurchasableSkuExplainPlan(explainRows({
      "Node Type": "Nested Loop",
      "Shared Hit Blocks": 7,
      "Shared Read Blocks": 2,
      Plans: [
        {
          "Node Type": "Index Scan",
          "Relation Name": "supplier_price_lists",
          "Index Name": "supplier_price_lists_scope_idx",
          "Index Cond": "tenant_id = fixture_tenant_id",
          "Shared Hit Blocks": 3,
        },
        {
          "Node Type": "Index Only Scan",
          "Relation Name": "supplier_price_list_items",
          "Index Name": "supplier_price_list_items_scope_idx",
          "Index Cond": "supplier_sku_id = fixture_sku_id",
          "Shared Hit Blocks": 4,
          "Shared Read Blocks": 2,
        },
      ],
    }));

    expect(assertSupplierPurchasableSkuExplainPlan(parsed)).toBe(true);
    expect(parsed.indexNames).toEqual([
      "supplier_price_lists_scope_idx",
      "supplier_price_list_items_scope_idx",
    ]);
    expect(parsed.buffers).toEqual({ sharedHit: 14, sharedRead: 4 });
    expect(parsed.hasRuntimeEvidence).toBe(true);
  });

  test("is import-safe and exposes the exact package command", async () => {
    const source = await Bun.file(
      new URL("./supplier-purchasable-sku-explain.ts", import.meta.url),
    ).text();
    const packageJson = await Bun.file(
      new URL("../../package.json", import.meta.url),
    ).json() as { scripts?: Record<string, string> };

    expect(source).toContain("if (import.meta.main)");
    expect(packageJson.scripts?.["supplier:purchasable-sku:explain"])
      .toBe("bun src/scripts/supplier-purchasable-sku-explain.ts");
  });

  test("runs exactly four fixed plans and summarizes indexes and buffers", async () => {
    const calls: string[] = [];
    const summary = await runSupplierPurchasableSkuExplain({
      async explain(name) {
        calls.push(name);
        return explainRows({
          "Node Type": "Index Scan",
          "Relation Name": name === "targetCurrentItem"
            ? "supplier_price_list_items"
            : "supplier_price_lists",
          "Index Name": `${name}_idx`,
          "Shared Hit Blocks": 2,
          "Shared Read Blocks": 1,
        });
      },
      async close() {
        calls.push("close");
      },
    });

    expect(calls).toEqual([
      ...SUPPLIER_PURCHASABLE_SKU_EXPLAIN_QUERY_NAMES,
      "close",
    ]);
    expect(summary.query_count).toBe(4);
    expect(summary.n_plus_one).toBe(false);
    expect(summary.indexes.currentDefault).toEqual(["currentDefault_idx"]);
    expect(summary.buffers.setBasedCopy).toEqual({
      sharedHit: 2,
      sharedRead: 1,
    });
  });

  test("CLI output is sanitized and failures expose only a stable code", async () => {
    const output: string[] = [];
    const errors: string[] = [];
    const createGateway = () => ({
      async explain(name: typeof SUPPLIER_PURCHASABLE_SKU_EXPLAIN_QUERY_NAMES[number]) {
        return explainRows({
          "Node Type": "Index Scan",
          "Relation Name": "supplier_price_lists",
          "Index Name": `${name}_idx`,
        });
      },
      async close() {},
    });
    expect(await runSupplierPurchasableSkuExplainCli({
      env: { SUPPLIER_PURCHASABLE_SKU_EXPLAIN_DB_URL: DATABASE_URL },
      createGateway,
      writeOutput: (message) => output.push(message),
      writeError: (message) => errors.push(message),
    })).toBe(0);
    expect(JSON.parse(output[0]!).database_host).toBe("api-dev.goodcms.cn");
    expect(output[0]).not.toContain("fixture-user");
    expect(output[0]).not.toContain("fixture-password");

    expect(await runSupplierPurchasableSkuExplainCli({
      env: { SUPPLIER_PURCHASABLE_SKU_EXPLAIN_DB_URL: DATABASE_URL },
      createGateway: () => ({
        async explain() {
          throw new Error("sensitive-plan-failure");
        },
        async close() {},
      }),
      writeOutput: () => {},
      writeError: (message) => errors.push(message),
    })).toBe(1);
    expect(errors).toEqual(["SUPPLIER_PURCHASABLE_SKU_EXPLAIN_FAILED"]);
  });
});
