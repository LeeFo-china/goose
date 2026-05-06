import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";
import type {
  EmployeePostCode,
  ProjectMemberRoleCode,
} from "@gooes/domain";

class ProjectMemberRolePostRuleRepository {
  async listByRoleCode(roleCode: ProjectMemberRoleCode) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_member_role_post_rules")
      .select("post_code, enabled")
      .eq("role_code", roleCode)
      .order("sort", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      throw Errors.dbError("查询项目角色岗位映射失败", error);
    }

    return (data || []) as Array<{
      post_code: EmployeePostCode;
      enabled: boolean;
    }>;
  }
}

export const projectMemberRolePostRuleRepository =
  new ProjectMemberRolePostRuleRepository();
