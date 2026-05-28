import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import { permissionRepository } from "@/repositories/permissions";
import { projectMemberRepository } from "@/repositories/project-members";
import { projectRepository } from "@/repositories/projects";
import type {
  CreateProjectMemberInput,
  UpdateProjectMemberInput,
} from "@/schema/projects";
import {
  PROJECT_MEMBER_ROLE_CONFIG,
  isEmployeeOperableStatus,
  isProjectMemberRoleCode,
  type ProjectMemberRoleCode,
} from "@gooes/domain";

type ProjectMemberEmployee = {
  id: string;
  name: string | null;
  avatar: string | null;
  phone: string | null;
  department_name: string | null;
  post_name: string | null;
};

type ProjectMemberRecord = {
  id: string;
  project_id: string;
  employee_id: string;
  role_code: ProjectMemberRoleCode;
  role_name: string | null;
  is_primary: boolean;
  sort_order: number | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  employee: ProjectMemberEmployee | null;
};

type CustomerOwnerMember = {
  id: string;
  project_id: string;
  employee_id: string;
  role_code: "customer_owner";
  role_name: string;
  is_primary: true;
  sort_order: number;
  created_at: null;
  updated_at: null;
  deleted_at: null;
  employee: ProjectMemberEmployee | null;
  is_virtual: true;
};

type ProjectRoleValidationErrorInput = {
  message?: string;
  code?: string;
};

export type ProjectPrimaryAssignee = {
  project_id: string;
  employee_id: string;
  role_code: "designer" | "supervisor";
  employee: {
    id: string;
    name: string | null;
    avatar: string | null;
    phone: string | null;
  } | null;
};

const DIRECT_PROJECT_MEMBER_FALLBACK_ROLE_CODE: ProjectMemberRoleCode =
  "construction_manager";

class ProjectMemberService {
  private normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) {
      return value[0] ?? null;
    }

    return value ?? null;
  }

  private normalizeEmployee(value: unknown): ProjectMemberEmployee | null {
    if (Array.isArray(value)) {
      return this.normalizeEmployee(value[0]);
    }

    if (!value || typeof value !== "object") {
      return null;
    }

    const row = value as ProjectMemberEmployee & {
      department?:
        | { name?: string | null }
        | Array<{ name?: string | null }>
        | null;
      tenant_department?:
        | { alias_name?: string | null }
        | Array<{ alias_name?: string | null }>
        | null;
      post?:
        | { name?: string | null }
        | Array<{ name?: string | null }>
        | null;
    };
    const department = this.normalizeRelation(row.department);
    const tenantDepartment = this.normalizeRelation(row.tenant_department);
    const post = this.normalizeRelation(row.post);
    return {
      id: row.id,
      name: row.name ?? null,
      avatar: row.avatar ?? null,
      phone: row.phone ?? null,
      department_name: tenantDepartment?.alias_name ?? department?.name ?? null,
      post_name: post?.name ?? null,
    };
  }

  private serializeMember(row: {
    id: string;
    project_id: string;
    employee_id: string;
    role_code: string;
    role_name: string | null;
    is_primary: boolean | null;
    sort_order: number | null;
    created_at: string | null;
    updated_at: string | null;
    deleted_at: string | null;
    employee: unknown;
  }): ProjectMemberRecord {
    const roleCode = isProjectMemberRoleCode(row.role_code)
      ? row.role_code
      : "construction_manager";
    const roleConfig = PROJECT_MEMBER_ROLE_CONFIG[roleCode];

    return {
      id: row.id,
      project_id: row.project_id,
      employee_id: row.employee_id,
      role_code: roleCode,
      role_name: row.role_name ?? roleConfig.label,
      is_primary: Boolean(row.is_primary),
      sort_order: row.sort_order ?? roleConfig.sortOrder,
      created_at: row.created_at ?? null,
      updated_at: row.updated_at ?? null,
      deleted_at: row.deleted_at ?? null,
      employee: this.normalizeEmployee(row.employee),
    };
  }

  private async assertProjectExists(projectId: string, tenantId?: string | null) {
    const project = await projectRepository.findById(projectId, tenantId);
    if (!project) {
      throw Errors.badRequest("项目不存在");
    }

    return project;
  }

  private async assertEmployeeOperable(employeeId: string, tenantId?: string | null) {
    const employee = await permissionRepository.findEmployeeById(employeeId);
    if (!employee) {
      throw Errors.badRequest("员工不存在");
    }

    if (tenantId && employee.tenant_id !== tenantId) {
      throw Errors.badRequest("员工不存在或不属于当前租户");
    }

    if (!isEmployeeOperableStatus(employee.status)) {
      throw Errors.badRequest("目标员工不是在职状态");
    }

    return employee;
  }

  private getResolvedRoleName(roleCode: ProjectMemberRoleCode, roleName?: string | null) {
    const normalized = typeof roleName === "string" ? roleName.trim() : "";
    return normalized || PROJECT_MEMBER_ROLE_CONFIG[roleCode].label;
  }

  private getResolvedSortOrder(
    roleCode: ProjectMemberRoleCode,
    sortOrder?: number | null,
  ) {
    return typeof sortOrder === "number"
      ? sortOrder
      : PROJECT_MEMBER_ROLE_CONFIG[roleCode].sortOrder;
  }

  private createRoleValidationError(input?: ProjectRoleValidationErrorInput) {
    return Errors.business(
      400,
      input?.message ?? "所选员工不能作为该项目角色",
      input?.code ?? ErrorCodes.VALIDATION_ERROR,
    );
  }

  private async assertEmployeeCanServeRoleCandidate(input: {
    employeeId: string;
    roleCode: ProjectMemberRoleCode;
    tenantId: string;
    invalidError?: ProjectRoleValidationErrorInput;
  }) {
    const employee = await permissionRepository.findEmployeeById(input.employeeId);
    if (!employee || employee.tenant_id !== input.tenantId) {
      throw this.createRoleValidationError(input.invalidError);
    }

    if (!isEmployeeOperableStatus(employee.status)) {
      throw this.createRoleValidationError(input.invalidError);
    }

    const postIds = await projectRepository.listProjectMemberRolePostIds({
      tenantId: input.tenantId,
      roleCode: input.roleCode,
    });

    if (
      postIds.length === 0 ||
      !employee.post_id ||
      !postIds.includes(employee.post_id)
    ) {
      throw this.createRoleValidationError(input.invalidError);
    }

    return employee;
  }

  async listProjectMembers(projectId: string) {
    const rows = await projectMemberRepository.listActiveByProjectId(projectId);
    return rows.map((item) => this.serializeMember(item));
  }

  async listPrimaryAssigneesByProjectIds(projectIds: string[]) {
    const rows = await projectMemberRepository.listPrimaryAssigneesByProjectIds(
      projectIds,
      ["designer", "supervisor"],
    );

    return rows
      .map((row): ProjectPrimaryAssignee | null => {
        if (row.role_code !== "designer" && row.role_code !== "supervisor") {
          return null;
        }

        const employee = this.normalizeEmployee(row.employee);
        return {
          project_id: row.project_id,
          employee_id: row.employee_id,
          role_code: row.role_code,
          employee: employee
            ? {
                id: employee.id,
                name: employee.name,
                avatar: employee.avatar,
                phone: employee.phone,
              }
            : null,
        };
      })
      .filter((item): item is ProjectPrimaryAssignee => Boolean(item));
  }

  async listPrimaryAssigneesByProjectId(projectId: string) {
    return this.listPrimaryAssigneesByProjectIds([projectId]);
  }

  buildDerivedCustomerOwnerMember(input: {
    projectId: string;
    employee: ProjectMemberEmployee | null;
  }): CustomerOwnerMember | null {
    if (!input.employee?.id) {
      return null;
    }

    const roleConfig = PROJECT_MEMBER_ROLE_CONFIG.customer_owner;
    return {
      id: `virtual-customer-owner-${input.projectId}-${input.employee.id}`,
      project_id: input.projectId,
      employee_id: input.employee.id,
      role_code: "customer_owner",
      role_name: roleConfig.label,
      is_primary: true,
      sort_order: roleConfig.sortOrder,
      created_at: null,
      updated_at: null,
      deleted_at: null,
      employee: input.employee,
      is_virtual: true,
    };
  }

  async createProjectMember(
    projectId: string,
    input: CreateProjectMemberInput,
    tenantId?: string | null,
  ) {
    await this.assertProjectExists(projectId, tenantId);
    await this.assertEmployeeOperable(input.employee_id, tenantId);

    const roleCode = input.role_code ?? DIRECT_PROJECT_MEMBER_FALLBACK_ROLE_CODE;

    if (roleCode === "customer_owner") {
      throw Errors.badRequest("跟进员工来自客户归属关系，不能直接新增");
    }

    if (!input.role_code) {
      const existing = await projectMemberRepository.findActiveByProjectEmployee(
        projectId,
        input.employee_id,
      );
      if (existing) {
        throw Errors.badRequest("该员工已在项目成员中");
      }
    }

    const roleName = this.getResolvedRoleName(roleCode, input.role_name);
    const sortOrder = this.getResolvedSortOrder(roleCode, input.sort_order);

    if (input.is_primary) {
      await projectMemberRepository.setRoleMembersNonPrimary(
        projectId,
        roleCode,
      );
    }

    const row = await projectMemberRepository.create({
      project_id: projectId,
      employee_id: input.employee_id,
      role_code: roleCode,
      role_name: roleName,
      is_primary: input.is_primary ?? false,
      sort_order: sortOrder,
    });

    return this.serializeMember(row);
  }

  async assertEmployeeCanServeRole(input: {
    projectId: string;
    employeeId: string;
    roleCode: ProjectMemberRoleCode;
    tenantId: string;
    invalidError?: ProjectRoleValidationErrorInput;
  }) {
    await this.assertProjectExists(input.projectId, input.tenantId);
    return this.assertEmployeeCanServeRoleCandidate(input);
  }

  async updateProjectMember(
    projectId: string,
    memberId: string,
    input: UpdateProjectMemberInput,
    tenantId?: string | null,
  ) {
    await this.assertProjectExists(projectId, tenantId);
    const existing = await projectMemberRepository.getById(projectId, memberId);
    if (!existing) {
      throw Errors.badRequest("项目成员不存在");
    }

    const serializedExisting = this.serializeMember(existing);

    if (serializedExisting.role_code === "customer_owner") {
      throw Errors.badRequest("跟进员工来自客户归属关系，不能直接修改");
    }

    const nextRoleCode = input.role_code ?? serializedExisting.role_code;
    const isRoleCodeChanged = nextRoleCode !== serializedExisting.role_code;
    const nextEmployeeId = input.employee_id ?? serializedExisting.employee_id;
    await this.assertEmployeeOperable(nextEmployeeId, tenantId);
    if (nextRoleCode === "customer_owner") {
      throw Errors.badRequest("跟进员工来自客户归属关系，不能直接修改");
    }

    if (input.is_primary) {
      await projectMemberRepository.setRoleMembersNonPrimary(
        projectId,
        nextRoleCode,
      );
    }

    const nextRoleName = input.role_name !== undefined
      ? this.getResolvedRoleName(nextRoleCode, input.role_name)
      : isRoleCodeChanged
      ? this.getResolvedRoleName(nextRoleCode, null)
      : undefined;
    const nextSortOrder = input.sort_order !== undefined
      ? this.getResolvedSortOrder(nextRoleCode, input.sort_order)
      : isRoleCodeChanged
      ? this.getResolvedSortOrder(nextRoleCode, null)
      : undefined;

    const row = await projectMemberRepository.update(projectId, memberId, {
      ...(input.employee_id ? { employee_id: input.employee_id } : {}),
      ...(input.role_code ? { role_code: input.role_code } : {}),
      ...(nextRoleName !== undefined ? { role_name: nextRoleName } : {}),
      ...(input.is_primary !== undefined ? { is_primary: input.is_primary } : {}),
      ...(nextSortOrder !== undefined ? { sort_order: nextSortOrder } : {}),
    });

    return this.serializeMember(row);
  }

  async deleteProjectMember(
    projectId: string,
    memberId: string,
    tenantId?: string | null,
  ) {
    await this.assertProjectExists(projectId, tenantId);
    const existing = await projectMemberRepository.getById(projectId, memberId);
    if (!existing) {
      throw Errors.badRequest("项目成员不存在");
    }

    const serialized = this.serializeMember(existing);

    if (serialized.role_code === "customer_owner") {
      throw Errors.badRequest("跟进员工来自客户归属关系，不能直接删除");
    }

    const deleted = await projectMemberRepository.softDelete(projectId, memberId);
    if (!deleted) {
      throw Errors.badRequest("项目成员不存在");
    }

  }
}

export const projectMemberService = new ProjectMemberService();
