import { Errors } from "@/errors/error-factory";
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

const LEGACY_PROJECT_MEMBER_ROLE_CODES: ProjectMemberRoleCode[] = [
  "designer",
  "supervisor",
];

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

  private async syncLegacyProjectColumn(
    projectId: string,
    roleCode: ProjectMemberRoleCode,
    employeeId: string | null,
    tenantId?: string | null,
  ) {
    if (!LEGACY_PROJECT_MEMBER_ROLE_CODES.includes(roleCode)) {
      return;
    }

    const patch =
      roleCode === "designer"
        ? { designer_id: employeeId }
        : { supervisor_id: employeeId };

    await projectRepository.update(projectId, patch, tenantId);
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

    if (input.is_primary) {
      await this.syncLegacyProjectColumn(
        projectId,
        roleCode,
        input.employee_id,
        tenantId,
      );
    }

    return this.serializeMember(row);
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

    const serialized = this.serializeMember(row);

    if (
      serializedExisting.is_primary &&
      serializedExisting.role_code !== serialized.role_code &&
      (serializedExisting.role_code === "designer" ||
        serializedExisting.role_code === "supervisor")
    ) {
      await this.syncLegacyProjectColumn(
        projectId,
        serializedExisting.role_code,
        null,
        tenantId,
      );
    }

    if (serialized.role_code === "designer" || serialized.role_code === "supervisor") {
      if (serialized.is_primary) {
        await this.syncLegacyProjectColumn(
          projectId,
          serialized.role_code,
          serialized.employee_id,
          tenantId,
        );
      } else if (serializedExisting.is_primary) {
        await this.syncLegacyProjectColumn(
          projectId,
          serialized.role_code,
          null,
          tenantId,
        );
      }
    }

    return serialized;
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

    if (
      (serialized.role_code === "designer" || serialized.role_code === "supervisor") &&
      serialized.is_primary
    ) {
      await this.syncLegacyProjectColumn(
        projectId,
        serialized.role_code,
        null,
        tenantId,
      );
    }
  }

  async syncLegacyProjectMembers(projectId: string, input: {
    designer_id?: string | null;
    supervisor_id?: string | null;
  }, tenantId?: string | null) {
    await this.assertProjectExists(projectId, tenantId);

    if (input.designer_id !== undefined) {
      await this.syncPrimaryMemberByLegacyRole(
        projectId,
        "designer",
        input.designer_id,
        tenantId,
      );
    }

    if (input.supervisor_id !== undefined) {
      await this.syncPrimaryMemberByLegacyRole(
        projectId,
        "supervisor",
        input.supervisor_id,
        tenantId,
      );
    }
  }

  async createInitialLegacyProjectMembers(projectId: string, input: {
    designer_id?: string | null;
    supervisor_id?: string | null;
  }, tenantId?: string | null) {
    await this.assertProjectExists(projectId, tenantId);

    const rows: Array<{
      project_id: string;
      employee_id: string;
      role_code: ProjectMemberRoleCode;
      role_name: string;
      is_primary: boolean;
      sort_order: number;
    }> = [];

    if (input.designer_id) {
      await this.assertEmployeeOperable(input.designer_id, tenantId);
      rows.push({
        project_id: projectId,
        employee_id: input.designer_id,
        role_code: "designer",
        role_name: this.getResolvedRoleName("designer", null),
        is_primary: true,
        sort_order: this.getResolvedSortOrder("designer", null),
      });
    }

    if (input.supervisor_id) {
      await this.assertEmployeeOperable(input.supervisor_id, tenantId);
      rows.push({
        project_id: projectId,
        employee_id: input.supervisor_id,
        role_code: "supervisor",
        role_name: this.getResolvedRoleName("supervisor", null),
        is_primary: true,
        sort_order: this.getResolvedSortOrder("supervisor", null),
      });
    }

    await projectMemberRepository.createMany(rows);
  }

  private async syncPrimaryMemberByLegacyRole(
    projectId: string,
    roleCode: "designer" | "supervisor",
    employeeId: string | null,
    tenantId?: string | null,
  ) {
    if (!employeeId) {
      await projectMemberRepository.softDeletePrimaryRoleMembers(projectId, roleCode);
      return;
    }

    await this.assertEmployeeOperable(employeeId, tenantId);

    const roleName = this.getResolvedRoleName(roleCode, null);
    const sortOrder = this.getResolvedSortOrder(roleCode, null);

    await projectMemberRepository.setRoleMembersNonPrimary(projectId, roleCode);

    const existing = await projectMemberRepository.findActiveByProjectRoleEmployee(
      projectId,
      roleCode,
      employeeId,
    );

    if (existing) {
      await projectMemberRepository.update(projectId, existing.id, {
        role_name: roleName,
        is_primary: true,
        sort_order: sortOrder,
      });
      return;
    }

    await projectMemberRepository.create({
      project_id: projectId,
      employee_id: employeeId,
      role_code: roleCode,
      role_name: roleName,
      is_primary: true,
      sort_order: sortOrder,
    });
  }
}

export const projectMemberService = new ProjectMemberService();
