import {
  EMPLOYEE_STATUS_VALUES,
  EmployeeStatusConfig,
  type EmployeeStatus,
  type RoleStatus,
} from "@gooes/domain";
import type { EmployeeDepartmentOption } from "@/components/employees/employee-types";
import {
  buildUploadPreviewUrl,
  uploadDirectToCos,
  validateUploadFile,
} from "@/lib/cos-direct-upload";
import { requestBackendJson } from "@/lib/backend-client";

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
  return buildUploadPreviewUrl(value);
}

export async function requestJson(input: {
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  payload?: unknown;
  fallbackMessage: string;
}) {
  return requestBackendJson(input.path, {
    method: input.method || "GET",
    body: input.payload ? JSON.stringify(input.payload) : undefined,
    fallbackMessage: input.fallbackMessage,
  });
}

export async function uploadEmployeeAvatarDirect(file: File) {
  const uploaded = await uploadDirectToCos(file, {
      scene: "employee_avatar",
    uploadErrorLabel: "上传头像",
    initFallbackMessage: "初始化头像直传失败",
    completeFallbackMessage: "登记头像直传结果失败",
    missingStorageMessage: "头像上传成功但未返回图片地址",
  });

  return {
    value: uploaded.storagePath,
    previewUrl: buildAvatarPreviewUrl(uploaded.storagePath),
  };
}

export async function uploadEmployeeAvatar(file: File) {
  validateUploadFile(file, {
    allowedTypes: ALLOWED_AVATAR_TYPES,
    maxSizeBytes: MAX_AVATAR_SIZE,
    typeMessage: "头像仅支持 JPG、PNG、WebP、HEIC、HEIF",
    sizeMessage: "头像图片不能超过 2MB",
  });

  return uploadEmployeeAvatarDirect(file);
}

export async function mutateEmployee(input: {
  method: "POST" | "PATCH" | "DELETE";
  id?: string;
  payload?: unknown;
}) {
  return requestBackendJson(
    input.id ? `/api/backend/employees/${input.id}` : "/api/backend/employees",
    {
      method: input.method,
      body: input.payload ? JSON.stringify(input.payload) : undefined,
      fallbackMessage: "操作失败",
    },
  );
}

export async function requestBackend<T>(path: string, init?: RequestInit) {
  return requestBackendJson<T>(path, init);
}
