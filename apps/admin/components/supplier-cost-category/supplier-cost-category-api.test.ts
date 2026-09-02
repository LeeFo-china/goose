import { describe, expect, test } from "bun:test";

import {
  buildCostCategoryOptionPath,
  buildCostCategoryRuleListPath,
  buildCostCategoryRulePath,
} from "./supplier-cost-category-api";

const ID = "30000000-0000-4000-8000-000000000001";

describe("supplier cost category API paths", () => {
  test("builds bounded option and target-filtered rule paths", () => {
    expect(buildCostCategoryOptionPath(" 主材 ")).toBe(
      "/catalog/cost-category-options?page=1&pageSize=100&keyword=%E4%B8%BB%E6%9D%90",
    );
    expect(buildCostCategoryRuleListPath("category", ID)).toBe(
      `/catalog/cost-category-rules?page=1&pageSize=20&scope=category&targetId=${ID}`,
    );
  });

  test("keeps category defaults and product overrides on explicit routes", () => {
    expect(buildCostCategoryRulePath("category", ID)).toBe(
      `/catalog/cost-category-rules/categories/${ID}`,
    );
    expect(buildCostCategoryRulePath("product", ID)).toBe(
      `/catalog/cost-category-rules/products/${ID}`,
    );
  });
});
