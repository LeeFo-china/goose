import { Errors } from "@/errors/error-factory";
import { permissionRepository } from "@/repositories/permissions";
import type { EmployeeRole } from "@gooes/domain";
import { PERMISSION_CODE_VALUES } from "@gooes/domain";

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
  systemRole: EmployeeRole | null;
  employeeStatus: string | null;
  departmentId: string | null;
  postId: string | null;
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
      return {
        authUserId,
        employeeId: null,
        systemRole: null,
        employeeStatus: null,
        departmentId: null,
        postId: null,
        roleCodes,
        roles,
        permissions: [],
      };
    }

    if (employee.role === "admin") {
      return {
        authUserId,
        employeeId: employee.id,
        systemRole: employee.role,
        employeeStatus: employee.status,
        departmentId: employee.department_id,
        postId: employee.post_id,
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
      systemRole: employee.role as EmployeeRole | null,
      employeeStatus: employee.status,
      departmentId: employee.department_id,
      postId: employee.post_id,
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

  async getRequiredAuthContext(authUserId?: string | null) {
    if (!authUserId) {
      throw Errors.unauthorized();
    }

    return this.getAuthContextByAuthUserId(authUserId);
  }
}

export const authorizationService = new AuthorizationService();
