import { Errors } from "@/errors/error-factory";
import type { ProjectMemberRoleCode } from "@gooes/domain";
import { SupabaseDB } from "@/utils/supabase/index";

type ProjectMemberRow = {
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
  employee:
    | {
        id: string;
        name: string | null;
        avatar: string | null;
        phone: string | null;
        tenant_department:
          | { id: string; alias_name: string | null; code: string | null }
          | Array<{ id: string; alias_name: string | null; code: string | null }>
          | null;
        post:
          | { id: string; name: string | null; code: string | null }
          | Array<{ id: string; name: string | null; code: string | null }>
          | null;
      }
    | Array<{
        id: string;
        name: string | null;
        avatar: string | null;
        phone: string | null;
        tenant_department:
          | { id: string; alias_name: string | null; code: string | null }
          | Array<{ id: string; alias_name: string | null; code: string | null }>
          | null;
        post:
          | { id: string; name: string | null; code: string | null }
          | Array<{ id: string; name: string | null; code: string | null }>
          | null;
      }>
    | null;
};

type ProjectPrimaryAssigneeRow = {
  project_id: string;
  employee_id: string;
  role_code: string;
  employee:
    | {
        id: string;
        name: string | null;
        avatar: string | null;
        phone: string | null;
      }
    | Array<{
        id: string;
        name: string | null;
        avatar: string | null;
        phone: string | null;
      }>
    | null;
};

const projectMemberSelect = `
  id,
  project_id,
  employee_id,
  role_code,
  role_name,
  is_primary,
  sort_order,
  created_at,
  updated_at,
  deleted_at,
  employee:employees!project_members_employee_id_fkey(
    id,
    name,
    avatar,
    phone,
    tenant_department:tenant_departments!employees_tenant_department_id_fkey(id, alias_name, code),
    post:posts!employees_post_id_fkey(id, name, code)
  )
`;

class ProjectMemberRepository {
  async listActiveByProjectId(projectId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_members")
      .select(projectMemberSelect)
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });

    if (error) {
      throw Errors.dbError("查询项目成员失败", error);
    }

    return (data || []) as unknown as ProjectMemberRow[];
  }

  async listPrimaryAssigneesByProjectIds(
    projectIds: string[],
    roleCodes: ProjectMemberRoleCode[],
  ) {
    if (projectIds.length === 0 || roleCodes.length === 0) {
      return [] as ProjectPrimaryAssigneeRow[];
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_members")
      .select(`
        project_id,
        employee_id,
        role_code,
        employee:employees!project_members_employee_id_fkey(
          id,
          name,
          avatar,
          phone
        )
      `)
      .in("project_id", Array.from(new Set(projectIds)))
      .in("role_code", roleCodes)
      .eq("is_primary", true)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      throw Errors.dbError("查询项目主责成员失败", error);
    }

    return (data || []) as unknown as ProjectPrimaryAssigneeRow[];
  }

  async create(input: {
    project_id: string;
    employee_id: string;
    role_code: ProjectMemberRoleCode;
    role_name: string | null;
    is_primary: boolean;
    sort_order: number | null;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_members")
      .insert(input)
      .select(projectMemberSelect)
      .single();

    if (error) {
      throw Errors.dbError("创建项目成员失败", error);
    }

    return data as unknown as ProjectMemberRow;
  }

  async getById(projectId: string, memberId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_members")
      .select(projectMemberSelect)
      .eq("project_id", projectId)
      .eq("id", memberId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询项目成员失败", error);
    }

    return (data || null) as ProjectMemberRow | null;
  }

  async update(
    projectId: string,
    memberId: string,
    input: Record<string, unknown>,
  ) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_members")
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq("project_id", projectId)
      .eq("id", memberId)
      .is("deleted_at", null)
      .select(projectMemberSelect)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("更新项目成员失败", error);
    }

    if (!data) {
      throw Errors.badRequest("项目成员不存在");
    }

    return data as unknown as ProjectMemberRow;
  }

  async softDelete(projectId: string, memberId: string) {
    const now = new Date().toISOString();
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_members")
      .update({
        deleted_at: now,
        updated_at: now,
      })
      .eq("project_id", projectId)
      .eq("id", memberId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("删除项目成员失败", error);
    }

    return data;
  }

  async setRoleMembersNonPrimary(projectId: string, roleCode: ProjectMemberRoleCode) {
    const { error } = await SupabaseDB.getAdminClient()
      .from("project_members")
      .update({
        is_primary: false,
        updated_at: new Date().toISOString(),
      })
      .eq("project_id", projectId)
      .eq("role_code", roleCode)
      .is("deleted_at", null)
      .select("id");

    if (error) {
      throw Errors.dbError("更新项目成员主标记失败", error);
    }
  }

  async findActiveByProjectEmployee(projectId: string, employeeId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_members")
      .select("id, role_code")
      .eq("project_id", projectId)
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询项目成员失败", error);
    }

    return (data || null) as { id: string; role_code: string } | null;
  }

  async findActiveByProjectEmployeeRole(
    projectId: string,
    employeeId: string,
    roleCode: ProjectMemberRoleCode,
  ) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_members")
      .select("id, role_code")
      .eq("project_id", projectId)
      .eq("employee_id", employeeId)
      .eq("role_code", roleCode)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询项目成员失败", error);
    }

    return (data || null) as { id: string; role_code: string } | null;
  }

}

export const projectMemberRepository = new ProjectMemberRepository();
