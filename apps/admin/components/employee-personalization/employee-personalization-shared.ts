import type { EmployeePersonalizationRule } from "@/components/employee-personalization/employee-personalization-types";

export function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export async function requestJson<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(getPayloadMessage(payload, "操作失败"));
  }
  return payload.data as T;
}

export function stringifyContent(rule?: EmployeePersonalizationRule) {
  return JSON.stringify(rule?.content_json ?? { blocks: [], quick_actions: [] }, null, 2);
}

export function toOptionLabel(name?: string | null, code?: string | null) {
  return [name, code].filter(Boolean).join(" / ") || code || name || "未命名";
}

