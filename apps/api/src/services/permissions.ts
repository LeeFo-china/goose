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
import type { AuthContext } from "@/services/authorization";
import { PermissionCodeConfig } from "@gooes/domain";
import { randomUUID } from "node:crypto";

class PermissionService {
  private generateRoleCode() {
    return `role_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  }

  private requireTenantRoleContext(authContext: AuthContext) {
    if (!authContext.tenantId) {
      throw Errors.business(
        403,
        "角色管理必须在租户上下文中操作",
        "TENANT_CONTEXT_REQUIRED",
      );
    }

    return authContext.tenantId;
  }

  private async getRequiredTenantEmployee(
    authContext: AuthContext,
    employeeId: string,
  ) {
    const tenantId = this.requireTenantRoleContext(authContext);
    const employee = await permissionRepository.findEmployeeById(employeeId);
    if (!employee) {
      throw Errors.badRequest("员工不存在");
    }

    if (employee.tenant_id !== tenantId) {
      throw Errors.forbidden();
    }

    return { employee, tenantId };
  }

  async listRoles(params: RoleListQueryType, authContext: AuthContext) {
    const tenantId = this.requireTenantRoleContext(authContext);
    return permissionRepository.listRoles(params, tenantId);
  }

  async getRoleById(id: string, authContext: AuthContext) {
    const tenantId = this.requireTenantRoleContext(authContext);
    const data = await permissionRepository.findRoleById(id, tenantId);
    if (!data) {
      throw Errors.badRequest("角色不存在");
    }

    const permissions = (await permissionRepository
      .listRolePermissionRecords(id)).filter(isTenantAssignablePermission);

    return {
      ...data,
      permissions,
      permission_count: permissions.length,
    };
  }

  async createRole(input: CreateRoleInput, authContext: AuthContext) {
    const tenantId = this.requireTenantRoleContext(authContext);
    const code = input.code?.trim() || this.generateRoleCode();

    return permissionRepository.createRole({
      ...input,
      code,
      tenant_id: tenantId,
    });
  }

  async updateRole(id: string, input: UpdateRoleInput, authContext: AuthContext) {
    const tenantId = this.requireTenantRoleContext(authContext);
    return permissionRepository.updateRole(id, input, tenantId);
  }

  async listPermissions(
    params: PermissionListQueryType,
    authContext?: AuthContext,
  ) {
    return permissionRepository.listPermissions({
      ...params,
      includePlatformPermissions: authContext?.isPlatformAdmin === true,
    });
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

  async assignEmployeeRoles(
    authContext: AuthContext,
    employeeId: string,
    input: AssignEmployeeRolesInput,
  ) {
    const { employee, tenantId } = await this.getRequiredTenantEmployee(
      authContext,
      employeeId,
    );
    const roles = await permissionRepository.listRolesByIds(input.role_ids, tenantId);
    if (roles.length !== Array.from(new Set(input.role_ids)).length) {
      throw Errors.badRequest("存在无效的角色 ID");
    }

    const nextRoles = await permissionRepository.replaceEmployeeRoles(employeeId, input);
    authorizationService.invalidateAuthContext({
      authUserId: employee.user_id,
      employeeId: employee.id,
    });
    const context = await authorizationService.getAuthContextByEmployeeId(employeeId);

    return {
      roles: nextRoles,
      auth_context: context,
    };
  }

  async replaceRolePermissions(
    authContext: AuthContext,
    roleId: string,
    input: RolePermissionAssignInput,
  ) {
    const tenantId = this.requireTenantRoleContext(authContext);
    const role = await permissionRepository.findRoleById(roleId, tenantId);
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
      if (!isTenantAssignablePermission(permission)) {
        throw Errors.badRequest("租户角色不能配置平台运营权限");
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
    authContext: AuthContext,
    employeeId: string,
    input: EmployeePermissionOverrideInput,
  ) {
    const { employee } = await this.getRequiredTenantEmployee(
      authContext,
      employeeId,
    );

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

  async deleteEmployeePermissionOverride(
    authContext: AuthContext,
    employeeId: string,
    permissionId: string,
  ) {
    const { employee } = await this.getRequiredTenantEmployee(
      authContext,
      employeeId,
    );

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

  async getEmployeePermissionContext(authContext: AuthContext, employeeId: string) {
    await this.getRequiredTenantEmployee(authContext, employeeId);
    const employeeAuthContext = await authorizationService.getAuthContextByEmployeeId(
      employeeId,
    );
    const overrides = await permissionRepository.listEmployeePermissionOverrides(
      employeeId,
    );

    return {
      ...employeeAuthContext,
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

function isTenantAssignablePermission(permission: { code: string }) {
  return !permission.code.startsWith("platform.");
}
