import { requestBackendJson } from "@/lib/backend-client";

import type {
  SupplierCostCategoryOption,
  SupplierCostCategoryPage,
  SupplierCostCategoryRule,
  SupplierCostCategoryRuleScope,
} from "./supplier-cost-category-types";

export function buildCostCategoryOptionPath(keyword = "") {
  const query = new URLSearchParams({ page: "1", pageSize: "100" });
  if (keyword.trim()) query.set("keyword", keyword.trim());
  return `/catalog/cost-category-options?${query}`;
}

export function buildCostCategoryRuleListPath(
  scope: SupplierCostCategoryRuleScope,
  targetId: string,
) {
  const query = new URLSearchParams({
    page: "1",
    pageSize: "20",
    scope,
    targetId,
  });
  return `/catalog/cost-category-rules?${query}`;
}

export function buildCostCategoryRulePath(
  scope: SupplierCostCategoryRuleScope,
  targetId: string,
) {
  const resource = scope === "category" ? "categories" : "products";
  return `/catalog/cost-category-rules/${resource}/${targetId}`;
}

export function loadCostCategoryOptions() {
  return requestBackendJson<SupplierCostCategoryPage<SupplierCostCategoryOption>>(
    buildCostCategoryOptionPath(),
    { fallbackMessage: "成本分类加载失败" },
  );
}

export function loadCostCategoryRule(
  scope: SupplierCostCategoryRuleScope,
  targetId: string,
) {
  return requestBackendJson<SupplierCostCategoryPage<SupplierCostCategoryRule>>(
    buildCostCategoryRuleListPath(scope, targetId),
    { fallbackMessage: "成本归类加载失败" },
  ).then((page) => page.list[0] ?? null);
}

export function saveCostCategoryRule(input: {
  scope: SupplierCostCategoryRuleScope;
  targetId: string;
  costCategoryId: string;
  expectedVersion: number;
}) {
  return requestBackendJson<SupplierCostCategoryRule>(
    buildCostCategoryRulePath(input.scope, input.targetId),
    {
      method: "PUT",
      body: JSON.stringify({
        cost_category_id: input.costCategoryId,
        expected_version: input.expectedVersion,
      }),
      fallbackMessage: "成本归类保存失败",
    },
  );
}

export function deleteCostCategoryRule(input: {
  scope: SupplierCostCategoryRuleScope;
  targetId: string;
  expectedVersion: number;
}) {
  return requestBackendJson<{ deleted: true }>(
    buildCostCategoryRulePath(input.scope, input.targetId),
    {
      method: "DELETE",
      body: JSON.stringify({ expected_version: input.expectedVersion }),
      fallbackMessage: "成本归类恢复继承失败",
    },
  );
}
