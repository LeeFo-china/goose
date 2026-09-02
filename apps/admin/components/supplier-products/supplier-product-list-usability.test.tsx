import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { buildProductListPath } from "./supplier-product-api";

describe("供应商品列表可用性", () => {
  test("商品列表默认按已启用筛选并保留草稿筛选入口", () => {
    const tenantScope = {
      kind: "tenant",
      tenantSupplierId: "relationship-1",
    } as const;
    const workspaceSource = readFileSync(
      new URL("./supplier-product-workspace.tsx", import.meta.url),
      "utf8",
    );
    const listSource = readFileSync(
      new URL("./supplier-product-list.tsx", import.meta.url),
      "utf8",
    );

    expect(buildProductListPath(tenantScope, 1, "")).toBe(
      "/supplier-products?tenantSupplierId=relationship-1&page=1&pageSize=20&status=active",
    );
    expect(buildProductListPath(tenantScope, 2, "瓷砖", "draft")).toBe(
      "/supplier-products?tenantSupplierId=relationship-1&page=2&pageSize=20&keyword=%E7%93%B7%E7%A0%96&status=draft",
    );
    expect(buildProductListPath(tenantScope, 1, "", "all")).toBe(
      "/supplier-products?tenantSupplierId=relationship-1&page=1&pageSize=20",
    );
    expect(workspaceSource).toContain("productStatusFilter");
    expect(workspaceSource).toContain('SelectItem value="draft"');
    expect(listSource).toContain('header: "成本归类"');
    expect(listSource).toContain("default_cost_category_name");
    expect(listSource.indexOf("CostCategoryRuleDialog")).toBeLessThan(
      listSource.indexOf("{row.original.status === \"active\" ? \"停用商品\" : \"启用商品\"}"),
    );
  });

  test("SKU 列表展示当前供货价摘要", () => {
    const tableSource = readFileSync(
      new URL("./supplier-sku-table.tsx", import.meta.url),
      "utf8",
    );
    const typeSource = readFileSync(
      new URL("./supplier-product-types.ts", import.meta.url),
      "utf8",
    );

    expect(typeSource).toContain("current_price");
    expect(tableSource).toContain('header: "价格"');
    expect(tableSource).toContain("formatSkuPrice");
    expect(tableSource).toContain("sku.current_price");
  });
});
