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
      }
    | Array<{
        id: string;
        name: string | null;
        avatar: string | null;
        phone: string | null;
      }>
    | null;
};

class ProjectMemberRepository {
  async listActiveByProjectId(projectId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_members")
      .select(`
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
          phone
        )
      `)
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
      .select(`
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
          phone
        )
      `)
      .single();

    if (error) {
      throw Errors.dbError("创建项目成员失败", error);
    }

    return data as unknown as ProjectMemberRow;
  }

  async getById(projectId: string, memberId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_members")
      .select(`
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
          phone
        )
      `)
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
      .select(`
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
          phone
        )
      `)
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

  async findActiveByProjectRoleEmployee(
    projectId: string,
    roleCode: ProjectMemberRoleCode,
    employeeId: string,
  ) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_members")
      .select("id")
      .eq("project_id", projectId)
      .eq("role_code", roleCode)
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询项目成员失败", error);
    }

    return (data || null) as { id: string } | null;
  }

  async softDeletePrimaryRoleMembers(
    projectId: string,
    roleCode: ProjectMemberRoleCode,
  ) {
    const now = new Date().toISOString();
    const { error } = await SupabaseDB.getAdminClient()
      .from("project_members")
      .update({
        deleted_at: now,
        updated_at: now,
      })
      .eq("project_id", projectId)
      .eq("role_code", roleCode)
      .eq("is_primary", true)
      .is("deleted_at", null)
      .select("id");

    if (error) {
      throw Errors.dbError("删除项目主成员失败", error);
    }
  }
}

export const projectMemberRepository = new ProjectMemberRepository();
