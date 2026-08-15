import { requestBackendJson } from "@/lib/backend-client";

import type {
  TenantCatalogPage,
} from "./tenant-supplier-catalog-types";

export type TenantCatalogSpecDefinition = {
  id: string;
  category_id: string;
  code: string;
  name: string;
  value_type: string;
  required: boolean;
  enum_options: string[];
  unit_dimension: string | null;
  participates_in_sku_name: boolean;
  filterable: boolean;
  sort_order: number;
  ownership_scope: "platform" | "tenant";
  owner_tenant_id: string | null;
  status: "active" | "inactive";
  version: number;
};

export function submitUnitSuggestion(
  input: {
    name: string;
    symbol: string;
    dimension: string;
    note?: string | null;
  },
  idempotencyKey: string,
) {
  return requestBackendJson<unknown>("/catalog/unit-suggestions", {
    method: "POST",
    body: JSON.stringify(input),
    headers: { "Idempotency-Key": idempotencyKey },
    fallbackMessage: "提交单位建议失败",
  });
}

export function loadCategorySpecDefinitions(categoryId: string) {
  return requestBackendJson<
    TenantCatalogPage<TenantCatalogSpecDefinition>
  >(`/catalog/categories/${categoryId}/spec-definitions`, {
    fallbackMessage: "加载规格模板失败",
  });
}

export function createTenantCategory(
  input: {
    parent_id: string | null;
    code: string;
    name: string;
    mapped_platform_category_id: string | null;
  },
  idempotencyKey: string,
) {
  return requestBackendJson<unknown>("/catalog/categories", {
    method: "POST",
    body: JSON.stringify(input),
    headers: { "Idempotency-Key": idempotencyKey },
    fallbackMessage: "新增目录分类失败",
  });
}

export function updateTenantCategory(
  id: string,
  input: {
    expected_version: number;
    name?: string;
    mapped_platform_category_id?: string | null;
  },
) {
  return requestBackendJson<unknown>(`/catalog/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
    fallbackMessage: "更新目录分类失败",
  });
}

export function createTenantBrand(
  input: {
    code: string;
    name: string;
    mapped_platform_brand_id: string | null;
  },
  idempotencyKey: string,
) {
  return requestBackendJson<unknown>("/catalog/brands", {
    method: "POST",
    body: JSON.stringify(input),
    headers: { "Idempotency-Key": idempotencyKey },
    fallbackMessage: "新增目录品牌失败",
  });
}

export function updateTenantBrand(
  id: string,
  input: {
    expected_version: number;
    name?: string;
    mapped_platform_brand_id?: string | null;
  },
) {
  return requestBackendJson<unknown>(`/catalog/brands/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
    fallbackMessage: "更新目录品牌失败",
  });
}
