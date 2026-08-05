import {
  type EmployeePermissionContextRecord,
  permissionRepository,
} from "@/repositories/permissions";
import { isEmployeeOperableStatus, PERMISSION_CODE_VALUES } from "@gooes/domain";
import { resolveStoredFileUrl } from "@/services/files/file-url-resolver";
import type { AuthContext, EffectivePermission } from "./types";

const scopeWeight: Record<EffectivePermission["scope"], number> = {
  self: 1,
  assigned: 2,
  department: 3,
  all: 4,
};

function normalizeScope(
  value: string | null | undefined,
): EffectivePermission["scope"] {
  if (value === "assigned" || value === "department" || value === "all") {
    return value;
  }

  return "self";
}

function mergeScopes(
  existing: EffectivePermission["scope"] | undefined,
  incoming: EffectivePermission["scope"],
) {
  if (!existing) {
    return incoming;
  }

  return scopeWeight[incoming] > scopeWeight[existing] ? incoming : existing;
}

function getRelationName(
  value:
    | { name: string | null }
    | Array<{ name: string | null }>
    | null
    | undefined,
) {
  if (Array.isArray(value)) {
    return value[0]?.name ?? null;
  }

  return value?.name ?? null;
}

function getTenantDepartmentName(
  value:
    | { alias_name: string | null }
    | Array<{ alias_name: string | null }>
    | null
    | undefined,
) {
  if (Array.isArray(value)) {
    return value[0]?.alias_name ?? null;
  }

  return value?.alias_name ?? null;
}

function getRelationValue<T extends Record<string, unknown>, K extends keyof T>(
  value: T | T[] | null | undefined,
  key: K,
): T[K] | null {
  const record = Array.isArray(value) ? value[0] : value;
  return record?.[key] ?? null;
}

function buildTenantContext(
  employee: NonNullable<EmployeePermissionContextRecord["employee"]> | null,
  roleCodes: string[],
) {
  const tenantId = employee?.tenant_id ?? null;
  const isGlobalEmployee = Boolean(employee) && !tenantId;
  const isPlatformSuperAdmin = isGlobalEmployee
    && roleCodes.includes("platform_admin");
  const isPlatformStaff = isPlatformSuperAdmin || (
    isGlobalEmployee && roleCodes.includes("platform_staff")
  );

  return {
    tenantId,
    tenantName: getRelationValue(employee?.tenant, "name") as string | null,
    tenantSlug: getRelationValue(employee?.tenant, "slug") as string | null,
    tenantStatus: getRelationValue(employee?.tenant, "status") as string | null,
    isPlatformAdmin: isPlatformSuperAdmin,
    isPlatformStaff,
    isPlatformSuperAdmin,
    adminAuthVersion: employee?.admin_auth_version ?? 1,
  };
}

export function buildAuthContext(input: Awaited<
  ReturnType<typeof permissionRepository.getEmployeePermissionContextByAuthUserId>
>, authUserId: string): AuthContext {
  const employee = input.employee;
  const activeRoles = input.roles.filter((item) => item.status === "active");
  const roles = activeRoles.map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name ?? null,
    description: item.description ?? null,
    status: item.status ?? null,
  }));
  const roleCodes = activeRoles.map((item) => item.code);

  if (!employee) {
    const tenantContext = buildTenantContext(null, roleCodes);
    return {
      authUserId,
      employeeId: null,
      ...tenantContext,
      employeeName: null,
      employeeStatus: null,
      departmentId: null,
      tenantDepartmentId: null,
      departmentCode: null,
      departmentName: null,
      postId: null,
      postName: null,
      avatar: null,
      roleCodes,
      roles,
      permissions: [],
    };
  }

  const tenantDepartmentId = employee.tenant_department_id ?? null;
  const tenantDepartmentName = getTenantDepartmentName(employee.tenant_department);
  const departmentCode = getRelationValue(employee.tenant_department, "code") as string | null;
  const departmentName = tenantDepartmentName;
  const postName = getRelationName(employee.post);
  const tenantContext = buildTenantContext(employee, roleCodes);

  if (!isEmployeeOperableStatus(employee.status)) {
    return {
      authUserId,
      employeeId: employee.id,
      ...tenantContext,
      employeeName: employee.name ?? null,
      employeeStatus: employee.status,
      departmentId: null,
      tenantDepartmentId,
      departmentCode,
      departmentName,
      postId: employee.post_id,
      postName,
      avatar: resolveStoredFileUrl(employee.avatar ?? null),
      roleCodes,
      roles,
      permissions: [],
    };
  }

  if (tenantContext.tenantId !== null && roleCodes.includes("system_admin")) {
    return {
      authUserId,
      employeeId: employee.id,
      ...tenantContext,
      employeeName: employee.name ?? null,
      employeeStatus: employee.status,
      departmentId: null,
      tenantDepartmentId,
      departmentCode,
      departmentName,
      postId: employee.post_id,
      postName,
      avatar: resolveStoredFileUrl(employee.avatar ?? null),
      roleCodes,
      roles,
      permissions: PERMISSION_CODE_VALUES.map((code) => ({
        code,
        scope: "all" as const,
      })),
    };
  }

  const permissionMap = new Map<string, EffectivePermission["scope"]>();

  for (const item of input.rolePermissions) {
    const normalizedScope = normalizeScope(item.scope);
    permissionMap.set(
      item.code,
      mergeScopes(permissionMap.get(item.code), normalizedScope),
    );
  }

  for (const item of input.overrides) {
    if (item.effect === "deny") {
      permissionMap.delete(item.code);
      continue;
    }

    const normalizedScope = normalizeScope(item.scope);
    permissionMap.set(
      item.code,
      mergeScopes(permissionMap.get(item.code), normalizedScope),
    );
  }

  return {
    authUserId,
    employeeId: employee.id,
    ...tenantContext,
    employeeName: employee.name ?? null,
    employeeStatus: employee.status,
    departmentId: null,
    tenantDepartmentId,
    departmentCode,
    departmentName,
    postId: employee.post_id,
    postName,
    avatar: resolveStoredFileUrl(employee.avatar ?? null),
    roleCodes,
    roles,
    permissions: Array.from(permissionMap.entries()).map(([code, scope]) => ({
      code,
      scope,
    })),
  };
}

export type { EmployeePermissionContextRecord };
