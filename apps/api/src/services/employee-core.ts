import { Errors } from "@/errors/error-factory";
import {
  employeeCoreRepository,
  type EmployeeCoreAccessRow,
  type EmployeeCoreRow,
  type EmployeeScope,
  type EmployeeVisibilityFilter,
} from "@/repositories/employee-core";
import type {
  CreateEmployeeInput,
  EmployeeListQueryType,
  UpdateEmployeeInput,
} from "@/schema/employee";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { departmentPostRuleService } from "@/services/department-post-rules";

type NormalizedEmployeeDepartment = {
  departmentId: string | null;
  tenantDepartmentId: string | null;
};

class EmployeeCoreService {
  private buildVisibilityFilter(
    scope: EmployeeScope | null,
    authContext: AuthContext,
  ): EmployeeVisibilityFilter {
    if (!scope) {
      throw Errors.forbidden();
    }

    return {
      scope,
      employeeId: authContext.employeeId,
      departmentScopeId: authContext.tenantDepartmentId ||
        authContext.departmentId,
    };
  }

  async listEmployees(input: {
    authContext: AuthContext;
    query: EmployeeListQueryType;
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    const scope = accessPolicyService.assertPermission(
      input.authContext,
      "employee.read",
    );
    const { page, pageSize, status, keyword } = input.query;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const filters = {
      tenantId,
      visibility: this.buildVisibilityFilter(scope, input.authContext),
      status,
      keyword: keyword?.trim(),
    };
    const total = await employeeCoreRepository.count(filters);
    const rows = from >= total
      ? []
      : await employeeCoreRepository.listRows({ filters, from, to });

    return {
      rows,
      total,
      page,
      pageSize,
    };
  }

  async createEmployee(input: {
    authContext: AuthContext;
    payload: CreateEmployeeInput;
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    accessPolicyService.assertPermission(input.authContext, "employee.create");
    const department = await this.normalizeDepartmentForWrite({
      tenantId,
      departmentId: input.payload.department_id,
      tenantDepartmentId: input.payload.tenant_department_id,
    });

    await departmentPostRuleService.assertEmployeeDepartmentPostAllowed({
      departmentId: department.departmentId,
      postId: input.payload.post_id,
      tenantId,
    });

    return employeeCoreRepository.create({
      ...input.payload,
      department_id: department.departmentId,
      tenant_department_id: department.tenantDepartmentId,
      tenant_id: tenantId,
    });
  }

  async updateEmployee(input: {
    authContext: AuthContext;
    employeeId: string;
    payload: UpdateEmployeeInput;
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    accessPolicyService.assertPermission(input.authContext, "employee.update");
    const existing = await employeeCoreRepository.findAccessById({
      employeeId: input.employeeId,
      tenantId,
    });

    if (!existing) {
      throw Errors.badRequest("员工不存在");
    }

    if (!accessPolicyService.canAccessEmployee(input.authContext, existing, "employee.update")) {
      throw Errors.forbidden();
    }

    const shouldUpdateDepartment =
      input.payload.department_id !== undefined ||
      input.payload.tenant_department_id !== undefined;
    const department = shouldUpdateDepartment
      ? await this.normalizeDepartmentForWrite({
        tenantId,
        departmentId: input.payload.department_id,
        tenantDepartmentId: input.payload.tenant_department_id,
      })
      : {
        departmentId: existing.department_id,
        tenantDepartmentId: existing.tenant_department_id ?? null,
      };
    const postId = input.payload.post_id !== undefined
      ? input.payload.post_id
      : existing.post_id;
    const departmentChanged = shouldUpdateDepartment &&
      (
        department.departmentId !== existing.department_id ||
        department.tenantDepartmentId !== existing.tenant_department_id
      );
    const postChanged =
      input.payload.post_id !== undefined &&
      input.payload.post_id !== existing.post_id;

    if (departmentChanged || postChanged) {
      await departmentPostRuleService.assertEmployeeDepartmentPostAllowed({
        departmentId: department.departmentId,
        postId,
        tenantId,
      });
    }

    return employeeCoreRepository.updateById({
      employeeId: input.employeeId,
      tenantId,
      payload: {
        ...input.payload,
        ...(shouldUpdateDepartment
          ? {
            department_id: department.departmentId,
            tenant_department_id: department.tenantDepartmentId,
          }
          : {}),
      },
    });
  }

  async disableEmployee(input: {
    authContext: AuthContext;
    employeeId: string;
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    accessPolicyService.assertPermission(input.authContext, "employee.update");
    const existing = await employeeCoreRepository.findAccessById({
      employeeId: input.employeeId,
      tenantId,
    });

    if (!existing) {
      throw Errors.badRequest("员工不存在");
    }

    if (!accessPolicyService.canAccessEmployee(input.authContext, existing, "employee.update")) {
      throw Errors.forbidden();
    }

    const employee = await employeeCoreRepository.markLeaved({
      employeeId: input.employeeId,
      tenantId,
    });

    return {
      employee,
      invalidatedAuth: {
        authUserId: existing.user_id ?? null,
        employeeId: existing.id,
      },
    };
  }

  async getEmployeeDetail(input: {
    authContext: AuthContext;
    employeeIdOrUserId: string;
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    let employee = await employeeCoreRepository.findById({
      employeeId: input.employeeIdOrUserId,
      tenantId,
    });

    if (!employee) {
      employee = await employeeCoreRepository.findByUserId({
        userId: input.employeeIdOrUserId,
        tenantId,
      });
    }

    if (!employee) {
      throw Errors.dbError("查询记录不存在");
    }

    if (!accessPolicyService.canAccessEmployee(input.authContext, employee, "employee.read")) {
      throw Errors.forbidden();
    }

    return employee;
  }

  private async normalizeDepartmentForWrite(input: {
    tenantId: string;
    departmentId?: string | null;
    tenantDepartmentId?: string | null;
  }): Promise<NormalizedEmployeeDepartment> {
    const hasDepartmentId = input.departmentId !== undefined;
    const hasTenantDepartmentId = input.tenantDepartmentId !== undefined;

    if (!hasDepartmentId && !hasTenantDepartmentId) {
      return {
        departmentId: null,
        tenantDepartmentId: null,
      };
    }

    if (input.departmentId === null || input.tenantDepartmentId === null) {
      if (
        (input.departmentId ?? null) !== null ||
        (input.tenantDepartmentId ?? null) !== null
      ) {
        throw Errors.badRequest("department_id 与 tenant_department_id 不匹配");
      }

      return {
        departmentId: null,
        tenantDepartmentId: null,
      };
    }

    const department = await employeeCoreRepository.findTenantDepartmentForEmployee(
      input,
    );
    if (!department) {
      throw Errors.badRequest("部门不存在或未启用");
    }

    if (!department.legacy_department_id) {
      throw Errors.badRequest("部门缺少旧部门映射，暂不能分配员工");
    }

    if (
      input.departmentId &&
      department.legacy_department_id !== input.departmentId
    ) {
      throw Errors.badRequest("department_id 与 tenant_department_id 不匹配");
    }

    if (
      input.tenantDepartmentId &&
      department.id !== input.tenantDepartmentId
    ) {
      throw Errors.badRequest("department_id 与 tenant_department_id 不匹配");
    }

    return {
      departmentId: department.legacy_department_id,
      tenantDepartmentId: department.id,
    };
  }
}

export const employeeCoreService = new EmployeeCoreService();
export type { EmployeeCoreAccessRow, EmployeeCoreRow };
