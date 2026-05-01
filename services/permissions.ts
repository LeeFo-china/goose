import { Errors } from "@/errors/error-factory";
import { permissionRepository } from "@/repositories/permissions";
import type {
  AssignEmployeeRolesInput,
  CreatePermissionInput,
  CreateRoleInput,
  EmployeePermissionOverrideInput,
  PermissionListQueryType,
  RolePermissionAssignInput,
  RoleListQueryType,
  UpdatePermissionInput,
  UpdateRoleInput,
} from "@/schema/permissions";
import { authorizationService } from "@/services/authorization";
import { PermissionCodeConfig } from "@gooes/domain";

class PermissionService {
  async listRoles(params: RoleListQueryType) {
    return permissionRepository.listRoles(params);
  }

  async getRoleById(id: string) {
    const data = await permissionRepository.findRoleById(id);
    if (!data) {
      throw Errors.badRequest("角色不存在");
    }

    const permissions = await permissionRepository.listRolePermissionRecords(id);

    return {
      ...data,
      permissions,
      permission_count: permissions.length,
    };
  }

  async createRole(input: CreateRoleInput) {
    return permissionRepository.createRole(input);
  }

  async updateRole(id: string, input: UpdateRoleInput) {
    return permissionRepository.updateRole(id, input);
  }

  async listPermissions(params: PermissionListQueryType) {
    return permissionRepository.listPermissions(params);
  }

  async getPermissionById(id: string) {
    const data = await permissionRepository.findPermissionById(id);
    if (!data) {
      throw Errors.badRequest("权限不存在");
    }

    return data;
  }

  async createPermission(input: CreatePermissionInput) {
    const existing = await permissionRepository.findPermissionByCode(input.code);
    if (existing) {
      throw Errors.badRequest("权限编码已存在");
    }

    const name = input.name?.trim()
      || PermissionCodeConfig[input.code]?.label
      || input.description?.trim()
      || input.code;

    return permissionRepository.createPermission({
      ...input,
      name,
    });
  }

  async updatePermission(id: string, input: UpdatePermissionInput) {
    return permissionRepository.updatePermission(id, input);
  }

  async deletePermission(id: string) {
    const permission = await permissionRepository.findPermissionById(id);
    if (!permission) {
      throw Errors.badRequest("权限不存在");
    }

    return permissionRepository.updatePermission(id, {
      status: "inactive",
    });
  }

  async assignEmployeeRoles(employeeId: string, input: AssignEmployeeRolesInput) {
    const employee = await permissionRepository.findEmployeeById(employeeId);
    if (!employee) {
      throw Errors.badRequest("员工不存在");
    }

    for (const roleId of input.role_ids) {
      const role = await permissionRepository.findRoleById(roleId);
      if (!role) {
        throw Errors.badRequest("存在无效的角色 ID");
      }
    }

    const roles = await permissionRepository.replaceEmployeeRoles(employeeId, input);
    authorizationService.invalidateAuthContext({
      authUserId: employee.user_id,
      employeeId: employee.id,
    });
    const context = await authorizationService.getAuthContextByEmployeeId(employeeId);

    return {
      roles,
      auth_context: context,
    };
  }

  async replaceRolePermissions(roleId: string, input: RolePermissionAssignInput) {
    const role = await permissionRepository.findRoleById(roleId);
    if (!role) {
      throw Errors.badRequest("角色不存在");
    }

    const targetPermissions = input.permissions;
    const seenPermissionIds = new Set<string>();
    for (const item of targetPermissions) {
      if (seenPermissionIds.has(item.permission_id)) {
        throw Errors.badRequest("权限列表中存在重复的权限 ID");
      }

      seenPermissionIds.add(item.permission_id);

      const permission = await permissionRepository.findPermissionById(
        item.permission_id,
      );
      if (!permission) {
        throw Errors.badRequest("存在无效的权限 ID");
      }
    }

    const permissions = await permissionRepository.replaceRolePermissions(
      roleId,
      input,
    );

    const employees = await permissionRepository.listEmployeesByRoleId(roleId);
    for (const employee of employees) {
      authorizationService.invalidateAuthContext({
        authUserId: employee.user_id,
        employeeId: employee.id,
      });
    }

    return {
      id: roleId,
      permission_count: permissions.length,
    };
  }

  async upsertEmployeePermissionOverride(
    employeeId: string,
    input: EmployeePermissionOverrideInput,
  ) {
    const employee = await permissionRepository.findEmployeeById(employeeId);
    if (!employee) {
      throw Errors.badRequest("员工不存在");
    }

    const permission = await permissionRepository.findPermissionById(
      input.permission_id,
    );
    if (!permission) {
      throw Errors.badRequest("权限不存在");
    }

    const overrides = await permissionRepository.upsertEmployeePermissionOverride(
      employeeId,
      input,
    );
    authorizationService.invalidateAuthContext({
      authUserId: employee.user_id,
      employeeId: employee.id,
    });
    const context = await authorizationService.getAuthContextByEmployeeId(employeeId);

    return {
      overrides,
      auth_context: context,
    };
  }

  async deleteEmployeePermissionOverride(employeeId: string, permissionId: string) {
    const employee = await permissionRepository.findEmployeeById(employeeId);
    if (!employee) {
      throw Errors.badRequest("员工不存在");
    }

    const overrides = await permissionRepository.deleteEmployeePermissionOverride(
      employeeId,
      permissionId,
    );
    authorizationService.invalidateAuthContext({
      authUserId: employee.user_id,
      employeeId: employee.id,
    });
    const context = await authorizationService.getAuthContextByEmployeeId(employeeId);

    return {
      overrides,
      auth_context: context,
    };
  }

  async getMyPermissionContext(authUserId: string) {
    return authorizationService.getAuthContextByAuthUserId(authUserId);
  }

  async getEmployeePermissionContext(employeeId: string) {
    const authContext = await authorizationService.getAuthContextByEmployeeId(
      employeeId,
    );
    const overrides = await permissionRepository.listEmployeePermissionOverrides(
      employeeId,
    );

    return {
      ...authContext,
      overrides: overrides.map((item) => ({
        permission_id: item.permission_id,
        permission_code: item.permission_code,
        permission_name: item.permission_name,
        effect: item.effect,
        access_scope: item.access_scope,
        reason: item.reason,
        created_at: item.created_at,
        updated_at: item.updated_at,
      })),
    };
  }
}

export const permissionService = new PermissionService();
