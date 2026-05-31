import { DEPARTMENT_CODE_VALUES, type DepartmentCode } from "@gooes/domain";

export const enabledOptions = [
  { value: "true", label: "启用" },
  { value: "false", label: "停用" },
];

function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export async function mutateDepartment(input: {
  method: "POST" | "PATCH";
  id?: string;
  payload: unknown;
}) {
  return requestDepartmentMutation({
    path: input.id ? `/api/backend/departments/${input.id}` : "/api/backend/departments",
    method: input.method,
    payload: input.payload,
  });
}

export async function enableDepartmentsBatch(payload: unknown) {
  return requestDepartmentMutation({
    path: "/api/backend/departments/enable-batch",
    method: "POST",
    payload,
  });
}

async function requestDepartmentMutation(input: {
  path: string;
  method: "POST" | "PATCH";
  payload: unknown;
}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(input.path, {
      method: input.method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input.payload),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) {
      throw new Error(getPayloadMessage(payload, "操作失败"));
    }
    return payload;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("请求超时，请稍后重试");
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function toDepartmentCode(value: string | null | undefined): DepartmentCode {
  return value && DEPARTMENT_CODE_VALUES.includes(value as DepartmentCode)
    ? value as DepartmentCode
    : DEPARTMENT_CODE_VALUES[0];
}
