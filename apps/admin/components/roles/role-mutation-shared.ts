import {
  ACCESS_SCOPE_VALUES,
  AccessScopeConfig,
  ROLE_STATUS_VALUES,
  RoleStatusConfig,
  type AccessScope,
  type RoleStatus,
} from "@gooes/domain";
import { requestBackendJson } from "@/lib/backend-client";

export type { AccessScope, RoleStatus };

export type RoleRecord = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: RoleStatus | string;
  created_at?: string;
  updated_at?: string;
};

export type PermissionRecord = {
  id: string;
  code: string;
  name: string | null;
  module: string;
  resource: string;
  action: string;
  description: string | null;
  access_scope?: AccessScope | string;
};

export type RoleDetail = RoleRecord & {
  permissions: PermissionRecord[];
  permission_count: number;
};

export type RoleMode = "create" | "edit";

export const roleStatusOptions = ROLE_STATUS_VALUES.map((value) => ({
  value,
  label: RoleStatusConfig[value].label,
}));

export const accessScopeOptions = ACCESS_SCOPE_VALUES.map((value) => ({
  value,
  label: AccessScopeConfig[value].label,
}));

export function normalizeRoleStatus(value: RoleStatus | string | undefined) {
  return ROLE_STATUS_VALUES.includes(value as RoleStatus)
    ? value as RoleStatus
    : "active";
}

export function normalizeAccessScope(value: AccessScope | string | undefined) {
  return ACCESS_SCOPE_VALUES.includes(value as AccessScope)
    ? value as AccessScope
    : "self";
}

export async function requestRoleJson<T>(path: string, init?: RequestInit) {
  return requestBackendJson<T>(path, init);
}
