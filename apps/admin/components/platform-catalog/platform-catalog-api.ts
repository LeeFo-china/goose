import { requestBackendJson } from "@/lib/backend-client";

export type PlatformUnitSuggestion = {
  id: string;
  tenant_id: string;
  name: string;
  symbol: string;
  dimension: string;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

export type PlatformUnitSuggestionPage = {
  list: PlatformUnitSuggestion[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export function listPlatformUnitSuggestions(status?: string) {
  const query = status ? `?status=${status}` : "";
  return requestBackendJson<PlatformUnitSuggestionPage>(
    `/platform/catalog/unit-suggestions${query}`,
    { fallbackMessage: "加载单位建议失败" },
  );
}

export function processPlatformUnitSuggestion(
  id: string,
  status: "approved" | "rejected",
) {
  return requestBackendJson<unknown>(
    `/platform/catalog/unit-suggestions/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ status }),
      fallbackMessage: "处理单位建议失败",
    },
  );
}

export type PlatformSpecDefinition = {
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
  status: "active" | "inactive";
  version: number;
};

export function loadPlatformSpecDefinitions(
  categoryId: string,
  page = 1,
  pageSize = 100,
) {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  return requestBackendJson<{
    list: PlatformSpecDefinition[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
  }>(
    `/platform/catalog/categories/${categoryId}/spec-definitions?${query}`,
    { fallbackMessage: "加载规格模板失败" },
  );
}

export function createPlatformSpecDefinition(
  categoryId: string,
  input: {
    code: string;
    name: string;
    value_type: string;
    required: boolean;
    enum_options: string[];
    unit_dimension?: string | null;
    participates_in_sku_name: boolean;
    filterable: boolean;
  },
  idempotencyKey: string,
) {
  return requestBackendJson<unknown>(
    `/platform/catalog/categories/${categoryId}/spec-definitions`,
    {
      method: "POST",
      body: JSON.stringify(input),
      headers: { "Idempotency-Key": idempotencyKey },
      fallbackMessage: "新增规格模板失败",
    },
  );
}

export function updatePlatformSpecDefinition(
  categoryId: string,
  specId: string,
  input: {
    expected_version: number;
    name?: string;
    required?: boolean;
    enum_options?: string[];
    unit_dimension?: string | null;
    participates_in_sku_name?: boolean;
    filterable?: boolean;
  },
) {
  return requestBackendJson<unknown>(
    `/platform/catalog/categories/${categoryId}/spec-definitions/${specId}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
      fallbackMessage: "更新规格模板失败",
    },
  );
}
