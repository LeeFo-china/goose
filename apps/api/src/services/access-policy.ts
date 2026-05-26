import { Errors } from "@/errors/error-factory";
import type { AuthContext, EffectivePermission } from "@/services/authorization";
import { permissionRepository } from "@/repositories/permissions";
import { isEmployeeOperableStatus } from "@gooes/domain";

const PROJECT_SCOPE_CACHE_TTL_MS = 10_000;

class AccessPolicyService {
  private visibleProjectIdsCache = new Map<string, {
    expiresAt: number;
    value: string[] | null;
  }>();
  private visibleProjectIdsInFlight = new Map<string, Promise<string[] | null>>();

  private buildProjectScopeCacheKey(input: {
    scope: EffectivePermission["scope"];
    employeeId: string;
    tenantDepartmentId?: string | null;
    tenantId?: string | null;
  }) {
    return JSON.stringify({
      scope: input.scope,
      employeeId: input.employeeId,
      tenantDepartmentId: input.tenantDepartmentId ?? null,
      tenantId: input.tenantId ?? null,
    });
  }

  private getVisibleProjectIdsCache(cacheKey: string) {
    const cached = this.visibleProjectIdsCache.get(cacheKey);
    if (!cached) {
      return null;
    }

    if (cached.expiresAt <= Date.now()) {
      this.visibleProjectIdsCache.delete(cacheKey);
      this.visibleProjectIdsInFlight.delete(cacheKey);
      return null;
    }

    return cached.value;
  }

  private setVisibleProjectIdsCache(cacheKey: string, value: string[] | null) {
    const now = Date.now();
    if (this.visibleProjectIdsCache.size >= 500) {
      for (const [key, item] of this.visibleProjectIdsCache.entries()) {
        if (item.expiresAt <= now) {
          this.visibleProjectIdsCache.delete(key);
        }
      }

      if (this.visibleProjectIdsCache.size >= 500) {
        this.visibleProjectIdsCache.clear();
      }
    }

    this.visibleProjectIdsCache.set(cacheKey, {
      expiresAt: now + PROJECT_SCOPE_CACHE_TTL_MS,
      value,
    });
  }

  private async listVisibleProjectIdsCached(input: {
    scope: EffectivePermission["scope"];
    employeeId: string;
    tenantDepartmentId?: string | null;
    tenantId?: string | null;
  }) {
    const cacheKey = this.buildProjectScopeCacheKey(input);
    const cached = this.getVisibleProjectIdsCache(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const cachedEntry = this.visibleProjectIdsCache.get(cacheKey);
    if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
      return cachedEntry.value;
    }

    const inFlight = this.visibleProjectIdsInFlight.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const request = permissionRepository.listVisibleProjectIds(input)
      .then((value) => {
        this.setVisibleProjectIdsCache(cacheKey, value);
        return value;
      })
      .finally(() => {
        if (this.visibleProjectIdsInFlight.get(cacheKey) === request) {
          this.visibleProjectIdsInFlight.delete(cacheKey);
        }
      });
    this.visibleProjectIdsInFlight.set(cacheKey, request);
    return request;
  }

  assertTenantId(authContext: AuthContext) {
    if (!authContext.tenantId && !authContext.isPlatformAdmin) {
      throw Errors.business(403, "缺少租户上下文", "FORBIDDEN");
    }

    return authContext.tenantId;
  }

  assertTenantContext(
    authContext: AuthContext,
    message = "当前操作必须在租户上下文中执行",
  ) {
    if (!authContext.tenantId) {
      throw Errors.business(403, message, "TENANT_CONTEXT_REQUIRED");
    }

    return authContext.tenantId;
  }

  matchesTenant(
    authContext: AuthContext,
    target: { tenant_id?: string | null },
  ) {
    if (authContext.isPlatformAdmin) {
      return true;
    }

    return Boolean(authContext.tenantId && target.tenant_id === authContext.tenantId);
  }

  hasPermission(authContext: AuthContext, permissionCode: string) {
    return authContext.permissions.some((item) => item.code === permissionCode);
  }

  getScope(
    authContext: AuthContext,
    permissionCode: string,
  ): EffectivePermission["scope"] | null {
    return authContext.permissions.find((item) => item.code === permissionCode)
      ?.scope || null;
  }

  assertPermission(authContext: AuthContext, permissionCode: string) {
    if (!this.hasPermission(authContext, permissionCode)) {
      throw Errors.forbidden();
    }

    return this.getScope(authContext, permissionCode);
  }

  private matchesDepartmentScope(
    authContext: AuthContext,
    target: { tenant_department_id?: string | null },
  ) {
    return Boolean(
      authContext.tenantDepartmentId &&
        target.tenant_department_id &&
        authContext.tenantDepartmentId === target.tenant_department_id,
    );
  }

  canAccessEmployee(
    authContext: AuthContext,
    target: {
      id: string;
      tenant_department_id?: string | null;
      tenant_id?: string | null;
    },
    permissionCode = "employee.read",
  ) {
    const scope = this.assertPermission(authContext, permissionCode);
    if (!scope || !authContext.employeeId) {
      return false;
    }

    if (!this.matchesTenant(authContext, target)) {
      return false;
    }

    if (scope === "all") {
      return true;
    }

    if (scope === "department") {
      return this.matchesDepartmentScope(authContext, target);
    }

    return target.id === authContext.employeeId;
  }

  async getVisibleProjectIds(
    authContext: AuthContext,
    permissionCode: string,
  ): Promise<string[] | null> {
    const scope = this.assertPermission(authContext, permissionCode);
    if (!scope || !authContext.employeeId) {
      return [];
    }

    if (scope === "all") {
      return null;
    }

    return this.listVisibleProjectIdsCached({
      scope,
      employeeId: authContext.employeeId,
      tenantDepartmentId: authContext.tenantDepartmentId,
      tenantId: authContext.tenantId,
    });
  }

  async getOwnedProjectIds(authContext: AuthContext) {
    if (!authContext.employeeId) {
      return [] as string[];
    }

    return (await this.listVisibleProjectIdsCached({
      scope: "self",
      employeeId: authContext.employeeId,
      tenantDepartmentId: authContext.tenantDepartmentId,
      tenantId: authContext.tenantId,
    })) ?? [];
  }

  async getVisibleProjectIdsByOwnership(
    authContext: AuthContext,
    permissionCode: string,
    ownership?: "self" | "all",
  ): Promise<string[] | null> {
    const scope = this.assertPermission(authContext, permissionCode);
    if (!scope || !authContext.employeeId) {
      return [];
    }

    if (ownership === "self") {
      if (scope === "self" || scope === "all") {
        return this.getOwnedProjectIds(authContext);
      }
    }

    const visibleProjectIds = await this.getVisibleProjectIds(
      authContext,
      permissionCode,
    );

    if (ownership !== "self") {
      return visibleProjectIds;
    }

    const ownedProjectIds = await this.getOwnedProjectIds(authContext);
    if (visibleProjectIds === null) {
      return ownedProjectIds;
    }

    const visibleSet = new Set(visibleProjectIds);
    return ownedProjectIds.filter((id) => visibleSet.has(id));
  }

  async canAccessProject(
    authContext: AuthContext,
    projectId: string,
    permissionCode = "project.read",
  ) {
    const visibleProjectIds = await this.getVisibleProjectIds(
      authContext,
      permissionCode,
    );

    if (visibleProjectIds === null) {
      const project = await permissionRepository.findProjectTenantById(projectId);
      return Boolean(project && this.matchesTenant(authContext, project));
    }

    return visibleProjectIds.includes(projectId);
  }

  async canWriteProjectLog(authContext: AuthContext, projectId: string) {
    const scope = this.assertPermission(authContext, "project_log.create");
    if (!scope || !authContext.employeeId) {
      return false;
    }

    const project = await permissionRepository.findProjectTenantById(projectId);
    if (!project || !this.matchesTenant(authContext, project)) {
      return false;
    }

    if (scope === "all") {
      return true;
    }

    if (scope === "department") {
      const employeeIds = authContext.tenantDepartmentId
        ? await permissionRepository.listEmployeeIdsByDepartmentId(
          authContext.tenantDepartmentId,
          authContext.tenantId,
        )
        : [];

      return permissionRepository.hasActiveProjectMember({
        projectId,
        employeeIds,
      });
    }

    return permissionRepository.hasActiveProjectMember({
      projectId,
      employeeIds: [authContext.employeeId],
    });
  }

  async getVisibleCustomerOwnerIds(
    authContext: AuthContext,
    permissionCode: string,
  ): Promise<string[] | null> {
    const scope = this.assertPermission(authContext, permissionCode);
    if (!scope || !authContext.employeeId) {
      return [];
    }

    if (scope === "all") {
      return null;
    }

    if (scope === "department") {
      if (!authContext.tenantDepartmentId) {
        return [];
      }

      return permissionRepository.listEmployeeIdsByDepartmentId(
        authContext.tenantDepartmentId,
        authContext.tenantId,
      );
    }

    return [authContext.employeeId];
  }

  async canAccessCustomer(
    authContext: AuthContext,
    customer: { owner_id: string | null; tenant_id?: string | null },
    permissionCode = "customer.read",
  ) {
    const visibleOwnerIds = await this.getVisibleCustomerOwnerIds(
      authContext,
      permissionCode,
    );

    if (!this.matchesTenant(authContext, customer)) {
      return false;
    }

    if (visibleOwnerIds === null) {
      return true;
    }

    if (!customer.owner_id) {
      return false;
    }

    return visibleOwnerIds.includes(customer.owner_id);
  }

  async canAssignCustomerOwner(
    authContext: AuthContext,
    customer: { owner_id: string | null; tenant_id?: string | null },
    targetEmployee: {
      id: string;
      tenant_department_id?: string | null;
      status: string | null;
      tenant_id?: string | null;
    },
  ) {
    const canAccessCustomer = customer.owner_id
      ? await this.canAccessCustomer(
        authContext,
        customer,
        "customer.assign_owner",
      )
      : true;
    if (!canAccessCustomer) {
      return false;
    }

    return this.canAssignCustomerOwnerTarget(authContext, targetEmployee);
  }

  canAssignCustomerOwnerTarget(
    authContext: AuthContext,
    targetEmployee: {
      id: string;
      tenant_department_id?: string | null;
      status: string | null;
      tenant_id?: string | null;
    },
  ) {
    const scope = this.assertPermission(authContext, "customer.assign_owner");
    if (!scope || !authContext.employeeId) {
      return false;
    }

    if (!isEmployeeOperableStatus(targetEmployee.status)) {
      return false;
    }

    if (!this.matchesTenant(authContext, targetEmployee)) {
      return false;
    }

    if (scope === "all") {
      return true;
    }

    if (scope === "department") {
      return this.matchesDepartmentScope(authContext, targetEmployee);
    }

    return targetEmployee.id === authContext.employeeId;
  }

  async getVisibleExpenseFilters(
    authContext: AuthContext,
    permissionCode = "expense_request.read",
  ) {
    const scope = this.assertPermission(authContext, permissionCode);
    if (!scope || !authContext.employeeId) {
      return {
        type: "none" as const,
        employeeIds: [] as string[],
      };
    }

    if (scope === "all") {
      return {
        type: "all" as const,
        employeeIds: [] as string[],
      };
    }

    if (scope === "department") {
      const employeeIds = authContext.tenantDepartmentId
        ? await permissionRepository.listEmployeeIdsByDepartmentId(
          authContext.tenantDepartmentId,
          authContext.tenantId,
        )
        : [];

      return {
        type: "department" as const,
        employeeIds,
      };
    }

    if (scope === "assigned") {
      return {
        type: "assigned" as const,
        employeeIds: [authContext.employeeId],
      };
    }

    return {
      type: "self" as const,
      employeeIds: [authContext.employeeId],
    };
  }
}

export const accessPolicyService = new AccessPolicyService();
