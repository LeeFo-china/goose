export type SupplierCostCategoryRuleScope = "category" | "product";

export type SupplierCostCategoryOption = {
  id: string;
  name: string;
};

export type SupplierCostCategoryRule = {
  id: string;
  tenant_id: string;
  rule_scope: SupplierCostCategoryRuleScope;
  catalog_category_id: string | null;
  supplier_product_id: string | null;
  cost_category_id: string;
  version: number;
  created_at: string;
  updated_at: string;
};

export type SupplierCostCategoryPage<T> = {
  list: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};
