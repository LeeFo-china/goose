import { SupabaseDB } from "@/utils/supabase";
import {
  listRoles,
  findRoleById,
  listRolePermissionRecords,
  createRole,
  updateRole,
  listRolesByIds,
  listEmployeesByRoleId,
  replaceRolePermissions,
} from "./legacy/roles";
import {
  listPermissions,
  findPermissionById,
  findPermissionByCode,
  createPermission,
  updatePermission,
} from "./legacy/permissions";
import {
  findEmployeeById,
  findEmployeeByAuthUserId,
  listEmployeeRoles,
  listEmployeeRoleIds,
  listEmployeeIdsByDepartmentId,
  listVisibleProjectIds,
  findProjectTenantById,
  canAccessProjectByScope,
  hasActiveProjectMember,
  replaceEmployeeRoles,
} from "./legacy/employees";
import {
  listRolePermissions,
  listEmployeePermissionOverrides,
  upsertEmployeePermissionOverride,
  deleteEmployeePermissionOverride,
} from "./legacy/overrides";
import {
  listEmployeeRolesWithPermissions,
  getEmployeePermissionContextByEmployeeId,
  getEmployeePermissionContextForEmployee,
  getEmployeePermissionContextByAuthUserId,
} from "./legacy/context";

export type {
  RoleRecord,
  PermissionRecord,
  RolePermissionRecord,
  EmployeePermissionContextRecord,
} from "./legacy/shared";

class PermissionRepository {
  private adminClient = SupabaseDB.getAdminClient();

  private rpc(name: string, params: Record<string, unknown>) {
    return (this.adminClient as unknown as {
      rpc: (functionName: string, parameters: Record<string, unknown>) => Promise<{
        data: unknown;
        error: unknown;
      }>;
    }).rpc(name, params);
  }

  private isRetryableError(error: unknown) {
    if (!error || typeof error !== "object") {
      return false;
    }

    const message = "message" in error && typeof error.message === "string"
      ? error.message
      : "";

    return (
      message.includes("TimeoutError") ||
      message.includes("timed out") ||
      message.includes("network") ||
      message.includes("fetch failed")
    );
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    retries = 2,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt >= retries || !this.isRetryableError(error)) {
          throw error;
        }
      }
    }

    throw lastError;
  }

  private async withRetryResult<T extends { error: unknown | null; data?: unknown }>(
    operation: () => Promise<T>,
    retries = 2,
  ): Promise<T> {
    let lastResult: T | null = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const result = await operation();
      lastResult = result;

      if (!result.error) {
        return result;
      }

      if (attempt >= retries || !this.isRetryableError(result.error)) {
        return result;
      }
    }

    if (!lastResult) {
      throw new Error("重试失败");
    }

    return lastResult;
  }

  listRoles = listRoles;
  findRoleById = findRoleById;
  listRolePermissionRecords = listRolePermissionRecords;
  createRole = createRole;
  updateRole = updateRole;
  listRolesByIds = listRolesByIds;
  listEmployeesByRoleId = listEmployeesByRoleId;
  replaceRolePermissions = replaceRolePermissions;
  listPermissions = listPermissions;
  findPermissionById = findPermissionById;
  findPermissionByCode = findPermissionByCode;
  createPermission = createPermission;
  updatePermission = updatePermission;
  findEmployeeById = findEmployeeById;
  findEmployeeByAuthUserId = findEmployeeByAuthUserId;
  listEmployeeRoles = listEmployeeRoles;
  private listEmployeeRoleIds = listEmployeeRoleIds;
  listEmployeeIdsByDepartmentId = listEmployeeIdsByDepartmentId;
  listVisibleProjectIds = listVisibleProjectIds;
  findProjectTenantById = findProjectTenantById;
  canAccessProjectByScope = canAccessProjectByScope;
  hasActiveProjectMember = hasActiveProjectMember;
  replaceEmployeeRoles = replaceEmployeeRoles;
  listRolePermissions = listRolePermissions;
  listEmployeePermissionOverrides = listEmployeePermissionOverrides;
  upsertEmployeePermissionOverride = upsertEmployeePermissionOverride;
  deleteEmployeePermissionOverride = deleteEmployeePermissionOverride;
  private listEmployeeRolesWithPermissions = listEmployeeRolesWithPermissions;
  getEmployeePermissionContextByEmployeeId = getEmployeePermissionContextByEmployeeId;
  private getEmployeePermissionContextForEmployee = getEmployeePermissionContextForEmployee;
  getEmployeePermissionContextByAuthUserId = getEmployeePermissionContextByAuthUserId;
}

export const permissionRepository = new PermissionRepository();
