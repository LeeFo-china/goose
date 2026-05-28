import { Errors } from "@/errors/error-factory";
import {
  employeeCoreRepository,
  type EmployeeCoreAccessRow,
  type EmployeeCoreRow,
  type EmployeeLoginBindingRow,
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
      departmentScopeId: authContext.tenantDepartmentId,
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
    const roleMap = await employeeCoreRepository.listEmployeeRoleMap(
      rows.map((employee) => employee.id),
    );

    return {
      rows: rows.map((employee) => ({
        ...employee,
        roles: roleMap.get(employee.id) || [],
      })),
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
      tenantDepartmentId: input.payload.tenant_department_id,
    });

    await departmentPostRuleService.assertEmployeeDepartmentPostAllowed({
      departmentId: department.tenantDepartmentId,
      postId: input.payload.post_id,
      tenantId,
    });

    return employeeCoreRepository.create({
      ...input.payload,
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
      input.payload.tenant_department_id !== undefined;
    const department = shouldUpdateDepartment
      ? await this.normalizeDepartmentForWrite({
        tenantId,
        tenantDepartmentId: input.payload.tenant_department_id,
      })
      : {
        tenantDepartmentId: existing.tenant_department_id ?? null,
      };
    const postId = input.payload.post_id !== undefined
      ? input.payload.post_id
      : existing.post_id;
    const departmentChanged = shouldUpdateDepartment &&
      department.tenantDepartmentId !== existing.tenant_department_id;
    const postChanged =
      input.payload.post_id !== undefined &&
      input.payload.post_id !== existing.post_id;

    if (departmentChanged || postChanged) {
      await departmentPostRuleService.assertEmployeeDepartmentPostAllowed({
        departmentId: department.tenantDepartmentId,
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

  async listEmployeeLoginBindingMap(employeeIds: string[]) {
    const rows = await employeeCoreRepository.listLoginBindingRows(employeeIds);
    return new Map(rows.map((row) => [row.employee_id, row]));
  }

  async listEmployeesWithDepartment(input: { authContext: AuthContext }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    const scope = accessPolicyService.assertPermission(
      input.authContext,
      "employee.read",
    );

    return employeeCoreRepository.listWithDepartment({
      tenantId,
      visibility: this.buildVisibilityFilter(scope, input.authContext),
    });
  }

  async getEmployeeWithDepartment(input: {
    authContext: AuthContext;
    employeeId: string;
  }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    const employee = await employeeCoreRepository.findWithDepartmentById({
      employeeId: input.employeeId,
      tenantId,
    });

    if (!accessPolicyService.canAccessEmployee(input.authContext, employee, "employee.read")) {
      throw Errors.forbidden();
    }

    return employee;
  }

  async listEmployeesWithPost(input: { authContext: AuthContext }) {
    const tenantId = accessPolicyService.assertTenantContext(input.authContext);
    const scope = accessPolicyService.assertPermission(
      input.authContext,
      "employee.read",
    );

    return employeeCoreRepository.listWithPost({
      tenantId,
      visibility: this.buildVisibilityFilter(scope, input.authContext),
    });
  }

  private async normalizeDepartmentForWrite(input: {
    tenantId: string;
    tenantDepartmentId?: string | null;
  }): Promise<NormalizedEmployeeDepartment> {
    const hasTenantDepartmentId = input.tenantDepartmentId !== undefined;

    if (!hasTenantDepartmentId) {
      return {
        tenantDepartmentId: null,
      };
    }

    if (input.tenantDepartmentId === null) {
      return {
        tenantDepartmentId: null,
      };
    }

    const department = await employeeCoreRepository.findTenantDepartmentForEmployee(
      input,
    );
    if (!department) {
      throw Errors.badRequest("部门不存在或未启用");
    }

    return {
      tenantDepartmentId: department.id,
    };
  }
}

export const employeeCoreService = new EmployeeCoreService();
export type { EmployeeCoreAccessRow, EmployeeCoreRow, EmployeeLoginBindingRow };
