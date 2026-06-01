import type { EmployeePersonalizationRule } from "@/components/employee-personalization/employee-personalization-types";
import { requestBackendJson } from "@/lib/backend-client";

export async function requestJson<T>(path: string, init?: RequestInit) {
  return requestBackendJson<T>(path, init);
}

export function stringifyContent(rule?: EmployeePersonalizationRule) {
  return JSON.stringify(rule?.content_json ?? { blocks: [], quick_actions: [] }, null, 2);
}

export function toOptionLabel(name?: string | null, code?: string | null) {
  return [name, code].filter(Boolean).join(" / ") || code || name || "未命名";
}
