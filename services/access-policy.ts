import { Errors } from "@/errors/error-factory";
import type { AuthContext, EffectivePermission } from "@/services/authorization";
import { permissionRepository } from "@/repositories/permissions";
import { isEmployeeOperableStatus } from "@gooes/domain";

class AccessPolicyService {
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

  canAccessEmployee(
    authContext: AuthContext,
    target: { id: string; department_id: string | null },
    permissionCode = "employee.read",
  ) {
    const scope = this.assertPermission(authContext, permissionCode);
    if (!scope || !authContext.employeeId) {
      return false;
    }

    if (scope === "all") {
      return true;
    }

    if (scope === "department") {
      return Boolean(
        authContext.departmentId &&
          target.department_id &&
          authContext.departmentId === target.department_id,
      );
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

    return permissionRepository.listVisibleProjectIds({
      scope,
      employeeId: authContext.employeeId,
      departmentId: authContext.departmentId,
    });
  }

  async getOwnedProjectIds(authContext: AuthContext) {
    if (!authContext.employeeId) {
      return [] as string[];
    }

    return permissionRepository.listVisibleProjectIds({
      scope: "self",
      employeeId: authContext.employeeId,
      departmentId: authContext.departmentId,
    });
  }

  async getVisibleProjectIdsByOwnership(
    authContext: AuthContext,
    permissionCode: string,
    ownership?: "self" | "all",
  ): Promise<string[] | null> {
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
      return true;
    }

    return visibleProjectIds.includes(projectId);
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
      if (!authContext.departmentId) {
        return [];
      }

      return permissionRepository.listEmployeeIdsByDepartmentId(
        authContext.departmentId,
      );
    }

    return [authContext.employeeId];
  }

  async canAccessCustomer(
    authContext: AuthContext,
    customer: { owner_id: string | null },
    permissionCode = "customer.read",
  ) {
    const visibleOwnerIds = await this.getVisibleCustomerOwnerIds(
      authContext,
      permissionCode,
    );

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
    customer: { owner_id: string | null },
    targetEmployee: {
      id: string;
      department_id: string | null;
      status: string | null;
    },
  ) {
    const scope = this.assertPermission(authContext, "customer.assign_owner");
    if (!scope || !authContext.employeeId) {
      return false;
    }

    const canAccessCustomer = await this.canAccessCustomer(
      authContext,
      customer,
      "customer.assign_owner",
    );
    if (!canAccessCustomer) {
      return false;
    }

    if (!isEmployeeOperableStatus(targetEmployee.status)) {
      return false;
    }

    if (scope === "all") {
      return true;
    }

    if (scope === "department") {
      return Boolean(
        authContext.departmentId &&
          targetEmployee.department_id &&
          authContext.departmentId === targetEmployee.department_id,
      );
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
      const employeeIds = authContext.departmentId
        ? await permissionRepository.listEmployeeIdsByDepartmentId(
          authContext.departmentId,
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
