import { Errors } from "@/errors/error-factory";
import {
  permissionRepository,
  type EmployeePermissionContextRecord,
} from "@/repositories/permissions";
import { ErrorCodes } from "@/errors/error-codes";
import { isEmployeeOperableStatus, PERMISSION_CODE_VALUES } from "@gooes/domain";
import { resolveStoredFileUrl } from "@/services/files/file-url-resolver";

export type EffectivePermission = {
  code: string;
  scope: "self" | "department" | "assigned" | "all";
};

export type AuthContextRole = {
  id: string;
  code: string;
  name: string | null;
  description: string | null;
  status: string | null;
};

export type AuthContext = {
  authUserId: string;
  employeeId: string | null;
  tenantId: string | null;
  tenantName: string | null;
  tenantSlug: string | null;
  tenantStatus: string | null;
  isPlatformAdmin: boolean;
  employeeName: string | null;
  employeeStatus: string | null;
  departmentId: string | null;
  tenantDepartmentId: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  postId: string | null;
  postName: string | null;
  avatar: string | null;
  roleCodes: string[];
  roles: AuthContextRole[];
  permissions: EffectivePermission[];
};

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

class AuthorizationService {
  private readonly cacheTtlMs = 30 * 1000;
  private authUserCache = new Map<string, {
    expiresAt: number;
    value: AuthContext;
  }>();
  private employeeCache = new Map<string, {
    expiresAt: number;
    value: AuthContext;
  }>();

  private getCacheValue(
    cache: Map<string, { expiresAt: number; value: AuthContext }>,
    key: string,
  ) {
    const item = cache.get(key);
    if (!item) {
      return null;
    }

    if (item.expiresAt <= Date.now()) {
      cache.delete(key);
      return null;
    }

    return item.value;
  }

  private setCacheValue(key: string, value: AuthContext) {
    const expiresAt = Date.now() + this.cacheTtlMs;
    this.authUserCache.set(key, { expiresAt, value });

    if (value.employeeId) {
      this.employeeCache.set(value.employeeId, { expiresAt, value });
    }
  }

  private mergeScopes(
    existing: EffectivePermission["scope"] | undefined,
    incoming: EffectivePermission["scope"],
  ) {
    if (!existing) {
      return incoming;
    }

    return scopeWeight[incoming] > scopeWeight[existing] ? incoming : existing;
  }

  private getRelationName(
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

  private getTenantDepartmentName(
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

  private getRelationValue<T extends Record<string, unknown>, K extends keyof T>(
    value: T | T[] | null | undefined,
    key: K,
  ): T[K] | null {
    const record = Array.isArray(value) ? value[0] : value;
    return record?.[key] ?? null;
  }

  private buildTenantContext(
    employee: NonNullable<EmployeePermissionContextRecord["employee"]> | null,
    roleCodes: string[],
  ) {
    const tenantId = employee?.tenant_id ?? null;
    return {
      tenantId,
      tenantName: this.getRelationValue(employee?.tenant, "name") as string | null,
      tenantSlug: this.getRelationValue(employee?.tenant, "slug") as string | null,
      tenantStatus: this.getRelationValue(employee?.tenant, "status") as string | null,
      isPlatformAdmin: roleCodes.includes("platform_admin") && !tenantId,
    };
  }

  private buildAuthContext(input: Awaited<
    ReturnType<typeof permissionRepository.getEmployeePermissionContextByAuthUserId>
  >, authUserId: string): AuthContext {
    const employee = input.employee;
    const roles = input.roles.map((item) => ({
      id: item.id,
      code: item.code,
      name: item.name ?? null,
      description: item.description ?? null,
      status: item.status ?? null,
    }));
    const roleCodes = input.roles.map((item) => item.code);

    if (!employee) {
      const tenantContext = this.buildTenantContext(null, roleCodes);
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
    const tenantDepartmentName = this.getTenantDepartmentName(employee.tenant_department);
    const departmentCode =
      this.getRelationValue(employee.tenant_department, "code") as string | null ??
      this.getRelationValue(employee.department, "code") as string | null;
    const departmentName = tenantDepartmentName ?? this.getRelationName(employee.department);
    const postName = this.getRelationName(employee.post);
    const tenantContext = this.buildTenantContext(employee, roleCodes);

    if (!isEmployeeOperableStatus(employee.status)) {
      return {
        authUserId,
        employeeId: employee.id,
        ...tenantContext,
        employeeName: employee.name ?? null,
        employeeStatus: employee.status,
        departmentId: employee.department_id,
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

    if (roleCodes.includes("system_admin")) {
      return {
        authUserId,
        employeeId: employee.id,
        ...tenantContext,
        employeeName: employee.name ?? null,
        employeeStatus: employee.status,
        departmentId: employee.department_id,
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
        this.mergeScopes(permissionMap.get(item.code), normalizedScope),
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
        this.mergeScopes(permissionMap.get(item.code), normalizedScope),
      );
    }

    return {
      authUserId,
      employeeId: employee.id,
      ...tenantContext,
      employeeName: employee.name ?? null,
      employeeStatus: employee.status,
      departmentId: employee.department_id,
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

  async getAuthContextByAuthUserId(authUserId: string): Promise<AuthContext> {
    const cached = this.getCacheValue(this.authUserCache, authUserId);
    if (cached) {
      return cached;
    }

    const raw = await permissionRepository.getEmployeePermissionContextByAuthUserId(
      authUserId,
    );
    const context = this.buildAuthContext(raw, authUserId);
    this.setCacheValue(authUserId, context);
    return context;
  }

  async getAuthContextByEmployeeId(employeeId: string): Promise<AuthContext> {
    const cached = this.getCacheValue(this.employeeCache, employeeId);
    if (cached) {
      return cached;
    }

    const raw = await permissionRepository.getEmployeePermissionContextByEmployeeId(
      employeeId,
    );

    const authUserId = raw.employee?.user_id || "";
    const context = this.buildAuthContext(
      {
        ...raw,
      },
      authUserId,
    );

    if (authUserId) {
      this.setCacheValue(authUserId, context);
    } else if (context.employeeId) {
      this.employeeCache.set(context.employeeId, {
        expiresAt: Date.now() + this.cacheTtlMs,
        value: context,
      });
    }

    return context;
  }

  invalidateAuthContext(input: {
    authUserId?: string | null;
    employeeId?: string | null;
  }) {
    if (input.authUserId) {
      this.authUserCache.delete(input.authUserId);
    }

    if (input.employeeId) {
      this.employeeCache.delete(input.employeeId);
    }
  }

  invalidateTenantContext(tenantId: string | null | undefined) {
    if (!tenantId) return;

    for (const [key, item] of this.authUserCache.entries()) {
      if (item.value.tenantId === tenantId) {
        this.authUserCache.delete(key);
      }
    }

    for (const [key, item] of this.employeeCache.entries()) {
      if (item.value.tenantId === tenantId) {
        this.employeeCache.delete(key);
      }
    }
  }

  assertTenantAvailable(authContext: AuthContext) {
    if (
      authContext.employeeId &&
      !authContext.isPlatformAdmin &&
      !authContext.tenantId
    ) {
      throw Errors.business(403, "员工未绑定装修公司", "EMPLOYEE_TENANT_MISSING");
    }

    if (
      authContext.employeeId &&
      !authContext.isPlatformAdmin &&
      authContext.tenantStatus &&
      authContext.tenantStatus !== "active"
    ) {
      throw Errors.business(403, "租户状态不可用", ErrorCodes.TENANT_NOT_AVAILABLE, {
        tenant_id: authContext.tenantId,
        tenant_status: authContext.tenantStatus,
      });
    }
  }

  async getRequiredAuthContext(authUserId?: string | null) {
    if (!authUserId) {
      throw Errors.unauthorized();
    }

    const authContext = await this.getAuthContextByAuthUserId(authUserId);

    this.assertTenantAvailable(authContext);
    return authContext;
  }
}

export const authorizationService = new AuthorizationService();
