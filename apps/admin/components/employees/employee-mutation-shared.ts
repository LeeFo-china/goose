import {
  EMPLOYEE_STATUS_VALUES,
  EmployeeStatusConfig,
  type EmployeeStatus,
  type RoleStatus,
} from "@gooes/domain";
import type { EmployeeDepartmentOption } from "@/components/employees/employee-types";

export type MutationMode = "create" | "edit";

export type RoleOption = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: RoleStatus | string;
};

export type EmployeePermissionContext = {
  roles: RoleOption[];
};

export const statusOptions: Array<{ label: string; value: EmployeeStatus }> =
  EMPLOYEE_STATUS_VALUES.map((value) => ({
    value,
    label: EmployeeStatusConfig[value].label,
  }));

export const employeeStatusSelectOptions = statusOptions.map((item) => ({
  value: item.value,
  label: item.label,
}));

export const EMPTY_SELECT_VALUE = "__empty__";
export const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
export const ALLOWED_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
}

export function getDepartmentOptionValue(department: EmployeeDepartmentOption) {
  return department.tenant_department_id || "";
}

export function buildAvatarPreviewUrl(value: string) {
  return `/api/backend/uploads/public-url?path=${encodeURIComponent(value)}`;
}

export async function requestJson(input: {
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  payload?: unknown;
  fallbackMessage: string;
}) {
  const response = await fetch(input.path, {
    method: input.method || "GET",
    headers: input.payload ? { "content-type": "application/json" } : undefined,
    body: input.payload ? JSON.stringify(input.payload) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(getPayloadMessage(payload, input.fallbackMessage));
  }

  return payload.data;
}

export async function uploadEmployeeAvatarDirect(file: File) {
  const init = await requestJson({
    path: "/api/backend/uploads/cos/direct-init",
    method: "POST",
    payload: {
      scene: "employee_avatar",
      filename: file.name,
      mimetype: file.type,
      size_bytes: file.size,
    },
    fallbackMessage: "初始化头像直传失败",
  });

  const uploadResponse = await fetch(init.upload_url, {
    method: init.method || "PUT",
    headers: init.headers || { "content-type": file.type },
    body: file,
  });
  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text().catch(() => "");
    throw new Error(
      `上传头像到 COS 失败(${uploadResponse.status})${
        detail.trim() ? `：${detail.trim().slice(0, 120)}` : ""
      }`,
    );
  }

  const completed = await requestJson({
    path: "/api/backend/uploads/cos/direct-complete",
    method: "POST",
    payload: {
      scene: "employee_avatar",
      filename: file.name,
      mimetype: file.type,
      size_bytes: file.size,
      object_key: init.object_key,
      etag: uploadResponse.headers.get("etag") || undefined,
    },
    fallbackMessage: "登记头像直传结果失败",
  });

  const storageValue = completed.storage_path || completed.object_key || init.storage_path ||
    init.object_key;
  if (typeof storageValue !== "string" || !storageValue) {
    throw new Error("头像上传成功但未返回图片地址");
  }

  return {
    value: storageValue,
    previewUrl: buildAvatarPreviewUrl(storageValue),
  };
}

export async function uploadEmployeeAvatar(file: File) {
  if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
    throw new Error("头像仅支持 JPG、PNG、WebP、HEIC、HEIF");
  }

  if (file.size > MAX_AVATAR_SIZE) {
    throw new Error("头像图片不能超过 2MB");
  }

  return uploadEmployeeAvatarDirect(file);
}

export async function mutateEmployee(input: {
  method: "POST" | "PATCH" | "DELETE";
  id?: string;
  payload?: unknown;
}) {
  const response = await fetch(
    input.id ? `/api/backend/employees/${input.id}` : "/api/backend/employees",
    {
      method: input.method,
      headers: input.payload ? { "content-type": "application/json" } : undefined,
      body: input.payload ? JSON.stringify(input.payload) : undefined,
    },
  );
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(getPayloadMessage(payload, "操作失败"));
  }

  return payload;
}

export async function requestBackend<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(getPayloadMessage(payload, "操作失败"));
  }

  return payload.data as T;
}
