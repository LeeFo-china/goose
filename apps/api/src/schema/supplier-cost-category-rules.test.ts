import { describe, expect, test } from "bun:test";

import {
  SupplierCostCategoryOptionQuerySchema,
  SupplierCostCategoryRuleListQuerySchema,
  SupplierCostCategoryRuleUpsertSchema,
} from "./supplier-cost-category-rules";

const ID = "10000000-0000-4000-8000-000000000001";

describe("supplier cost category rule schemas", () => {
  test("parses bounded option and rule pages", () => {
    expect(SupplierCostCategoryOptionQuerySchema.parse({
      page: "2",
      pageSize: "50",
      keyword: " 主材 ",
    })).toEqual({ page: 2, pageSize: 50, keyword: "主材" });
    expect(SupplierCostCategoryRuleListQuerySchema.parse({
      scope: "category",
      targetId: ID,
    })).toEqual({
      page: 1,
      pageSize: 20,
      scope: "category",
      targetId: ID,
    });
  });

  test("requires a cost category and nonnegative expected version", () => {
    expect(SupplierCostCategoryRuleUpsertSchema.parse({
      cost_category_id: ID,
      expected_version: 0,
    })).toEqual({ cost_category_id: ID, expected_version: 0 });
    expect(SupplierCostCategoryRuleUpsertSchema.safeParse({
      cost_category_id: ID,
      expected_version: -1,
    }).success).toBe(false);
    expect(SupplierCostCategoryRuleUpsertSchema.safeParse({
      cost_category_id: ID,
      expected_version: 0,
      internal_code: "main_material",
    }).success).toBe(false);
  });
});
