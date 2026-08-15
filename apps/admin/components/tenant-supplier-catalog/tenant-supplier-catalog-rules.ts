import type {
  TenantCatalogCategory,
  TenantCatalogSource,
} from "./tenant-supplier-catalog-types";

export const specValueTypeLabels = {
  text: "文本",
  number: "数值",
  boolean: "布尔",
  single_enum: "单选枚举",
  multi_enum: "多选枚举",
  date: "日期",
} as const;

export function specValueTypeLabel(
  valueType: keyof typeof specValueTypeLabels | string,
): string {
  return (specValueTypeLabels as Record<string, string>)[valueType] ?? valueType;
}

export type UnitSuggestionInput = {
  name: string;
  symbol: string;
  dimension: string;
  note?: string;
};

export function validateUnitSuggestion(input: UnitSuggestionInput): string | null {
  if (!input.name?.trim()) return "单位名称不能为空";
  if (!input.symbol?.trim()) return "单位符号不能为空";
  if (!input.dimension?.trim()) return "计量维度不能为空";
  return null;
}

export function categorySource(category: {
  ownership_scope: TenantCatalogSource;
}): TenantCatalogSource {
  return category.ownership_scope;
}

export function leafCategoryLabel(category: TenantCatalogCategory): string {
  return category.is_leaf ? "可挂商品" : "含子分类";
}
