import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type EmployeePersonalizationRuleStatus =
  | "draft"
  | "active"
  | "disabled";

export type EmployeePersonalizationRuleRecord = {
  id: string;
  tenant_id: string;
  scene: string;
  employee_id: string | null;
  tenant_department_id: string | null;
  post_id: string | null;
  role_code: string | null;
  priority: number;
  content_json: unknown;
  status: EmployeePersonalizationRuleStatus;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EmployeePersonalizationRuleListInput = {
  tenantId: string;
  page: number;
  pageSize: number;
  scene?: string;
  status?: EmployeePersonalizationRuleStatus;
  keyword?: string;
};

export type EmployeePersonalizationRuleMutationRecord = {
  scene: string;
  employee_id: string | null;
  tenant_department_id: string | null;
  post_id: string | null;
  role_code: string | null;
  priority: number;
  content_json: Record<string, unknown>;
  status: EmployeePersonalizationRuleStatus;
  starts_at: string | null;
  ends_at: string | null;
};

export type EmployeePersonalizationEmployeeOption = {
  id: string;
  name: string | null;
  tenant_department_id: string | null;
  post_id: string | null;
  status: string | null;
};

export type EmployeePersonalizationDepartmentOption = {
  id: string;
  code: string | null;
  name: string | null;
};

export type EmployeePersonalizationPostOption = {
  id: string;
  code: string | null;
  name: string | null;
};

export type EmployeePersonalizationRoleOption = {
  id: string;
  code: string;
  name: string | null;
};

class EmployeePersonalizationRepository {
  async listActiveRulesForScene(input: {
    tenantId: string;
    scene: string;
  }): Promise<EmployeePersonalizationRuleRecord[]> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("employee_personalization_rules")
      .select(
        "id, tenant_id, scene, employee_id, tenant_department_id, post_id, role_code, priority, content_json, status, starts_at, ends_at, created_at, updated_at",
      )
      .eq("tenant_id", input.tenantId)
      .eq("scene", input.scene)
      .eq("status", "active")
      .order("priority", { ascending: false })
      .order("updated_at", { ascending: false });

    if (error) {
      throw Errors.dbError("查询员工个性化规则失败", error);
    }

    return (data || []) as EmployeePersonalizationRuleRecord[];
  }

  async listRules(input: EmployeePersonalizationRuleListInput) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;
    let query = SupabaseDB.getAdminClient()
      .from("employee_personalization_rules")
      .select(
        "id, tenant_id, scene, employee_id, tenant_department_id, post_id, role_code, priority, content_json, status, starts_at, ends_at, created_at, updated_at",
        { count: "exact" },
      )
      .eq("tenant_id", input.tenantId)
      .order("priority", { ascending: false })
      .order("updated_at", { ascending: false });

    if (input.scene) query = query.eq("scene", input.scene);
    if (input.status) query = query.eq("status", input.status);
    if (input.keyword) {
      query = query.or(
        `scene.ilike.%${input.keyword}%,role_code.ilike.%${input.keyword}%`,
      );
    }

    const { data, error, count } = await query.range(from, to);
    if (error) throw Errors.dbError("查询员工个性化规则列表失败", error);

    return {
      list: (data || []) as EmployeePersonalizationRuleRecord[],
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / input.pageSize),
      },
    };
  }

  async getRuleById(input: { tenantId: string; id: string }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("employee_personalization_rules")
      .select(
        "id, tenant_id, scene, employee_id, tenant_department_id, post_id, role_code, priority, content_json, status, starts_at, ends_at, created_at, updated_at",
      )
      .eq("tenant_id", input.tenantId)
      .eq("id", input.id)
      .maybeSingle();

    if (error) throw Errors.dbError("查询员工个性化规则失败", error);
    return data as EmployeePersonalizationRuleRecord | null;
  }

  async createRule(input: {
    tenantId: string;
    record: EmployeePersonalizationRuleMutationRecord;
    operatorEmployeeId?: string | null;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("employee_personalization_rules")
      .insert({
        ...input.record,
        tenant_id: input.tenantId,
        created_by: input.operatorEmployeeId ?? null,
        updated_by: input.operatorEmployeeId ?? null,
      })
      .select(
        "id, tenant_id, scene, employee_id, tenant_department_id, post_id, role_code, priority, content_json, status, starts_at, ends_at, created_at, updated_at",
      )
      .single();

    if (error) throw Errors.dbError("创建员工个性化规则失败", error);
    return data as EmployeePersonalizationRuleRecord;
  }

  async updateRule(input: {
    tenantId: string;
    id: string;
    record: EmployeePersonalizationRuleMutationRecord;
    operatorEmployeeId?: string | null;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("employee_personalization_rules")
      .update({
        ...input.record,
        updated_by: input.operatorEmployeeId ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.id)
      .select(
        "id, tenant_id, scene, employee_id, tenant_department_id, post_id, role_code, priority, content_json, status, starts_at, ends_at, created_at, updated_at",
      )
      .maybeSingle();

    if (error) throw Errors.dbError("更新员工个性化规则失败", error);
    return data as EmployeePersonalizationRuleRecord | null;
  }

  async updateRuleStatus(input: {
    tenantId: string;
    id: string;
    status: EmployeePersonalizationRuleStatus;
    operatorEmployeeId?: string | null;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("employee_personalization_rules")
      .update({
        status: input.status,
        updated_by: input.operatorEmployeeId ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.id)
      .select(
        "id, tenant_id, scene, employee_id, tenant_department_id, post_id, role_code, priority, content_json, status, starts_at, ends_at, created_at, updated_at",
      )
      .maybeSingle();

    if (error) throw Errors.dbError("更新员工个性化规则状态失败", error);
    return data as EmployeePersonalizationRuleRecord | null;
  }

  async listOptions(tenantId: string) {
    const [employeesResult, departmentsResult, postsResult, rolesResult] =
      await Promise.all([
        SupabaseDB.getAdminClient()
          .from("employees")
          .select("id, name, tenant_department_id, post_id, status")
          .eq("tenant_id", tenantId)
          .order("name", { ascending: true }),
        SupabaseDB.getAdminClient()
          .from("tenant_departments")
          .select("id, code, alias_name")
          .eq("tenant_id", tenantId)
          .eq("enabled", true)
          .order("sort", { ascending: true, nullsFirst: false }),
        SupabaseDB.getAdminClient()
          .from("posts")
          .select("id, code, name")
          .eq("tenant_id", tenantId)
          .order("sort", { ascending: true, nullsFirst: false }),
        SupabaseDB.getAdminClient()
          .from("roles")
          .select("id, code, name")
          .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
          .eq("status", "active")
          .order("name", { ascending: true }),
      ]);

    if (employeesResult.error) {
      throw Errors.dbError("查询员工选项失败", employeesResult.error);
    }
    if (departmentsResult.error) {
      throw Errors.dbError("查询部门选项失败", departmentsResult.error);
    }
    if (postsResult.error) {
      throw Errors.dbError("查询岗位选项失败", postsResult.error);
    }
    if (rolesResult.error) {
      throw Errors.dbError("查询角色选项失败", rolesResult.error);
    }

    return {
      employees: (employeesResult.data || []) as EmployeePersonalizationEmployeeOption[],
      departments: (departmentsResult.data || []).map((item) => ({
        id: item.id,
        code: item.code,
        name: item.alias_name,
      })) as EmployeePersonalizationDepartmentOption[],
      posts: (postsResult.data || []) as EmployeePersonalizationPostOption[],
      roles: (rolesResult.data || []) as EmployeePersonalizationRoleOption[],
    };
  }

  async getEmployeePreviewContext(input: {
    tenantId: string;
    employeeId: string;
  }) {
    const [employeeResult, rolesResult] = await Promise.all([
      SupabaseDB.getAdminClient()
        .from("employees")
        .select("id, name, tenant_id, tenant_department_id, post_id, status")
        .eq("tenant_id", input.tenantId)
        .eq("id", input.employeeId)
        .maybeSingle(),
      SupabaseDB.getAdminClient()
        .from("employee_roles")
        .select("role:roles(id, code, name, description, status, tenant_id, created_at, updated_at)")
        .eq("employee_id", input.employeeId),
    ]);

    if (employeeResult.error) {
      throw Errors.dbError("查询员工预览上下文失败", employeeResult.error);
    }
    if (rolesResult.error) {
      throw Errors.dbError("查询员工角色失败", rolesResult.error);
    }

    const roles = ((rolesResult.data || []) as unknown as Array<{
      role: { code: string } | null;
    }>).map((item) => item.role?.code).filter(Boolean) as string[];

    return {
      employee: employeeResult.data as {
        id: string;
        name: string | null;
        tenant_id: string;
        tenant_department_id: string | null;
        post_id: string | null;
        status: string | null;
      } | null,
      roleCodes: roles,
    };
  }
}

export const employeePersonalizationRepository =
  new EmployeePersonalizationRepository();
