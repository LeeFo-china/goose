import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import { permissionRepository } from "@/repositories/permissions";
import {
  buildAuthContext,
  type EmployeePermissionContextRecord,
} from "./legacy/context-builder";
import { AuthContextCache } from "./legacy/context-cache";
import type { AuthContext } from "./legacy/types";

class AuthorizationService {
  private cache = new AuthContextCache();

  async getAuthContextByAuthUserId(authUserId: string): Promise<AuthContext> {
    const cached = this.cache.getByAuthUserId(authUserId);
    if (cached) {
      return cached;
    }

    const inFlight = this.cache.getAuthUserInFlight(authUserId);
    if (inFlight) {
      return inFlight;
    }

    const promise = permissionRepository.getEmployeePermissionContextByAuthUserId(
      authUserId,
    ).then((raw) => {
      const context = buildAuthContext(raw, authUserId);
      this.cache.setCacheValue(authUserId, context);
      return context;
    });
    this.cache.setAuthUserInFlight(authUserId, promise);
    return promise;
  }

  async getAuthContextByEmployeeId(employeeId: string): Promise<AuthContext> {
    const cached = this.cache.getByEmployeeId(employeeId);
    if (cached) {
      return cached;
    }

    const inFlight = this.cache.getEmployeeInFlight(employeeId);
    if (inFlight) {
      return inFlight;
    }

    const promise = permissionRepository.getEmployeePermissionContextByEmployeeId(
      employeeId,
    ).then((raw) => {
      const authUserId = raw.employee?.user_id || "";
      const context = buildAuthContext(
        {
          ...raw,
        },
        authUserId,
      );

      this.cache.setCacheContext(context);
      return context;
    });
    this.cache.setEmployeeInFlight(employeeId, promise);
    return promise;
  }

  prewarmEmployeeAuthContext(input: {
    authUserId: string;
    employeeId: string;
  }) {
    const cachedByAuthUser = this.cache.getByAuthUserId(input.authUserId);
    const cachedByEmployee = this.cache.getByEmployeeId(input.employeeId);
    if (
      cachedByAuthUser?.roles.length ||
      cachedByAuthUser?.permissions.length ||
      cachedByEmployee?.roles.length ||
      cachedByEmployee?.permissions.length
    ) {
      return Promise.resolve(cachedByAuthUser ?? cachedByEmployee!);
    }

    const existingAuthUserPromise = this.cache.getAuthUserInFlight(input.authUserId);
    if (existingAuthUserPromise) {
      return existingAuthUserPromise;
    }

    const existingEmployeePromise = this.cache.getEmployeeInFlight(input.employeeId);
    if (existingEmployeePromise) {
      this.cache.setAuthUserInFlight(input.authUserId, existingEmployeePromise);
      return existingEmployeePromise;
    }

    const promise = this.getAuthContextByEmployeeId(input.employeeId);
    this.cache.setAuthUserInFlight(input.authUserId, promise);
    return promise;
  }

  async getEmployeeLoginContextByAuthUserId(authUserId: string): Promise<AuthContext> {
    const cached = this.cache.getByAuthUserId(authUserId);
    if (cached?.employeeId) {
      return cached;
    }

    const employee = await permissionRepository.findEmployeeByAuthUserId(authUserId);
    return buildAuthContext({
      employee: employee as EmployeePermissionContextRecord["employee"] || null,
      roles: [],
      rolePermissions: [],
      overrides: [],
    }, authUserId);
  }

  async getEmployeeLoginContextByEmployeeId(employeeId: string): Promise<AuthContext> {
    const cached = this.cache.getByEmployeeId(employeeId);
    if (cached?.employeeId) {
      return cached;
    }

    const employee = await permissionRepository.findEmployeeById(employeeId);
    return buildAuthContext({
      employee: employee as EmployeePermissionContextRecord["employee"] || null,
      roles: [],
      rolePermissions: [],
      overrides: [],
    }, employee?.user_id || "");
  }

  async isEmployeeBoundToAuthUser(input: {
    authUserId: string;
    employeeId: string;
    tenantId?: string | null;
  }) {
    const employee = await permissionRepository.findEmployeeById(input.employeeId);
    return Boolean(
      employee &&
        employee.user_id === input.authUserId &&
        (!input.tenantId || employee.tenant_id === input.tenantId),
    );
  }

  async assertEmployeeBoundToAuthUser(input: {
    authUserId: string;
    employeeId: string;
    tenantId?: string | null;
  }) {
    const isBound = await this.isEmployeeBoundToAuthUser(input);
    if (!isBound) {
      throw Errors.unauthorized(
        "当前员工身份已失效，请重新登录",
        ErrorCodes.EMPLOYEE_CONTEXT_MISSING,
      );
    }
  }

  invalidateAuthContext(input: {
    authUserId?: string | null;
    employeeId?: string | null;
  }) {
    this.cache.invalidateAuthContext(input);
  }

  invalidateTenantContext(tenantId: string | null | undefined) {
    this.cache.invalidateTenantContext(tenantId);
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
export type {
  AuthContext,
  AuthContextRole,
  EffectivePermission,
} from "./legacy/types";
