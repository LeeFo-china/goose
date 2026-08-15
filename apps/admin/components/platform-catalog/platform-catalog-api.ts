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
