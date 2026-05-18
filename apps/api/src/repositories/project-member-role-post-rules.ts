import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";
import type {
  EmployeePostCode,
  ProjectMemberRoleCode,
} from "@gooes/domain";

export type ProjectMemberRolePostRuleRecord = {
  id: string;
  role_code: ProjectMemberRoleCode;
  post_code: EmployeePostCode;
  enabled: boolean;
  sort: number;
  created_at: string | null;
  updated_at: string | null;
  tenant_id?: string | null;
};

export type ProjectMemberRolePostOptionRecord = {
  id: string;
  code: EmployeePostCode;
  name: string;
  sort: number | null;
};

class ProjectMemberRolePostRuleRepository {
  async listRules(tenantId?: string | null) {
    let query = SupabaseDB.getAdminClient()
      .from("project_member_role_post_rules")
      .select("id, role_code, post_code, enabled, sort, created_at, updated_at")
      .order("role_code", { ascending: true })
      .order("sort", { ascending: true })
      .order("created_at", { ascending: true });

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query;

    if (error) {
      throw Errors.dbError("查询项目角色岗位映射失败", error);
    }

    return (data || []) as ProjectMemberRolePostRuleRecord[];
  }

  async listByRoleCode(roleCode: ProjectMemberRoleCode, tenantId?: string | null) {
    let query = SupabaseDB.getAdminClient()
      .from("project_member_role_post_rules")
      .select("post_code, enabled")
      .eq("role_code", roleCode)
      .order("sort", { ascending: true })
      .order("created_at", { ascending: true });

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query;

    if (error) {
      throw Errors.dbError("查询项目角色岗位映射失败", error);
    }

    return (data || []) as Array<{
      post_code: EmployeePostCode;
      enabled: boolean;
    }>;
  }

  async listActivePostOptions(tenantId?: string | null) {
    let query = SupabaseDB.getAdminClient()
      .from("posts")
      .select("id, code, name, sort")
      .eq("status", 1)
      .order("sort", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query;

    if (error) {
      throw Errors.dbError("查询可选岗位失败", error);
    }

    return (data || []) as ProjectMemberRolePostOptionRecord[];
  }

  async listExistingActivePostCodes(input: {
    tenantId: string;
    postCodes: string[];
  }) {
    if (input.postCodes.length === 0) return [];

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("posts")
      .select("code")
      .eq("tenant_id", input.tenantId)
      .eq("status", 1)
      .in("code", input.postCodes);

    if (error) {
      throw Errors.dbError("查询可选岗位编码失败", error);
    }

    return ((data || []) as Array<{ code: EmployeePostCode }>).map((item) => item.code);
  }

  async replaceRoleRules(input: {
    roleCode: ProjectMemberRoleCode;
    postCodes: EmployeePostCode[];
    tenantId?: string | null;
  }) {
    let disableQuery = SupabaseDB.getAdminClient()
      .from("project_member_role_post_rules")
      .update({
        enabled: false,
        updated_at: new Date().toISOString(),
      })
      .eq("role_code", input.roleCode);

    if (input.tenantId) {
      disableQuery = disableQuery.eq("tenant_id", input.tenantId);
    }

    const disabledResult = await disableQuery.select("id");

    if (disabledResult.error) {
      throw Errors.dbError("停用项目角色岗位映射失败", disabledResult.error);
    }

    const payload = input.postCodes.map((postCode, index) => ({
      role_code: input.roleCode,
      post_code: postCode,
      tenant_id: input.tenantId ?? null,
      enabled: true,
      sort: (index + 1) * 10,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await SupabaseDB.getAdminClient()
      .from("project_member_role_post_rules")
      .upsert(payload, {
        onConflict: input.tenantId
          ? "tenant_id,role_code,post_code"
          : "role_code,post_code",
      })
      .select("id");

    if (error) {
      throw Errors.dbError("保存项目角色岗位映射失败", error);
    }
  }
}

export const projectMemberRolePostRuleRepository =
  new ProjectMemberRolePostRuleRepository();
