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
