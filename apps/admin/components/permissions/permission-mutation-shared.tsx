import { z } from "zod";
import {
  PERMISSION_CODE_VALUES,
  PERMISSION_STATUS_VALUES,
  PermissionCodeConfig,
  PermissionStatusConfig,
  type PermissionCode,
} from "@gooes/domain";
import { FormSelect } from "@/components/admin/form-select";
import type { SelectOption } from "@/components/admin/form-select";

export type PermissionMode = "create" | "edit";

export function uniq(values: string[]) {
  return Array.from(new Set(values)).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

export function inferPermissionFields(code: PermissionCode) {
  const module = PermissionCodeConfig[code]?.module || code.split(".")[0];
  const rest = code.startsWith(`${module}.`) ? code.slice(module.length + 1) : code;
  const segments = rest.split(".");
  const resource = segments.length > 1 ? `${module}_${segments.slice(0, -1).join("_")}` : module;
  const action = segments.at(-1) || rest;

  return {
    code,
    name: PermissionCodeConfig[code]?.label || code,
    module,
    resource,
    action,
  };
}

export const PERMISSION_FIELD_OPTIONS = PERMISSION_CODE_VALUES.map(inferPermissionFields);
export const PERMISSION_MODULE_OPTIONS = uniq(PERMISSION_FIELD_OPTIONS.map((item) => item.module));
export const PERMISSION_RESOURCE_OPTIONS = uniq(PERMISSION_FIELD_OPTIONS.map((item) => item.resource));
export const PERMISSION_ACTION_OPTIONS = uniq(PERMISSION_FIELD_OPTIONS.map((item) => item.action));
export const PERMISSION_CODE_OPTIONS: SelectOption[] = PERMISSION_CODE_VALUES.map((code) => ({
  value: code,
  label: `${code} - ${PermissionCodeConfig[code]?.label || code}`,
}));
export const PERMISSION_MODULE_SELECT_OPTIONS: SelectOption[] = PERMISSION_MODULE_OPTIONS.map((value) => ({
  value,
  label: value,
}));
export const PERMISSION_RESOURCE_SELECT_OPTIONS: SelectOption[] = PERMISSION_RESOURCE_OPTIONS.map((value) => ({
  value,
  label: value,
}));
export const PERMISSION_ACTION_SELECT_OPTIONS: SelectOption[] = PERMISSION_ACTION_OPTIONS.map((value) => ({
  value,
  label: value,
}));
export const PERMISSION_STATUS_OPTIONS: SelectOption[] = PERMISSION_STATUS_VALUES.map((value) => ({
  value,
  label: PermissionStatusConfig[value].label,
}));

export const PermissionFormSchema = z.object({
  code: z.enum(PERMISSION_CODE_VALUES),
  name: z.string().trim().min(1, "请输入权限名称"),
  module: z.string().trim().min(1, "请选择模块"),
  resource: z.string().trim().min(1, "请选择资源"),
  action: z.string().trim().min(1, "请选择动作"),
  description: z.string(),
  status: z.enum(PERMISSION_STATUS_VALUES),
});

export type PermissionFormValues = z.infer<typeof PermissionFormSchema>;

export function isPermissionCodeValue(value: string): value is PermissionCode {
  return PERMISSION_CODE_VALUES.includes(value as PermissionCode);
}

export function SelectField({
  id,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string;
  value: string;
  options: SelectOption[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <FormSelect
      id={id}
      value={value}
      disabled={disabled}
      options={options}
      onChange={onChange}
    />
  );
}

export function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export async function mutatePermission(input: {
  method: "POST" | "PATCH" | "DELETE";
  id?: string;
  payload?: unknown;
}) {
  const response = await fetch(
    input.id ? `/api/backend/permissions/${input.id}` : "/api/backend/permissions",
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
