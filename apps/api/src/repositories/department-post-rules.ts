import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";
import type {
  DepartmentCode,
  EmployeePostCode,
} from "@gooes/domain";

export type DepartmentPostRuleRecord = {
  id: string;
  department_code: DepartmentCode;
  post_code: EmployeePostCode;
  enabled: boolean;
  sort: number;
  created_at: string | null;
  updated_at: string | null;
  tenant_id?: string | null;
};

export type DepartmentPostRuleDepartmentRecord = {
  id: string;
  code: DepartmentCode;
  name: string;
};

export type DepartmentPostRulePostOptionRecord = {
  id: string;
  code: EmployeePostCode;
  name: string;
  sort: number | null;
  status: number | null;
};

export type DepartmentPostRuleEmployeePair = {
  department: DepartmentPostRuleDepartmentRecord | null;
  post: DepartmentPostRulePostOptionRecord | null;
};

class DepartmentPostRuleRepository {
  async listRules(tenantId?: string | null) {
    let query = SupabaseDB.getAdminClient()
      .from("department_post_rules")
      .select("id, department_code, post_code, enabled, sort, created_at, updated_at")
      .order("department_code", { ascending: true })
      .order("sort", { ascending: true })
      .order("created_at", { ascending: true });

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query;

    if (error) throw Errors.dbError("查询部门岗位映射失败", error);
    return (data || []) as DepartmentPostRuleRecord[];
  }

  async listDepartments(tenantId?: string | null) {
    let query = SupabaseDB.getAdminClient()
      .from("departments")
      .select("id, code, name")
      .order("code", { ascending: true });

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query;

    if (error) throw Errors.dbError("查询部门列表失败", error);
    return (data || []) as DepartmentPostRuleDepartmentRecord[];
  }

  async listPostOptions(tenantId?: string | null) {
    let query = SupabaseDB.getAdminClient()
      .from("posts")
      .select("id, code, name, sort, status")
      .order("sort", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query;

    if (error) throw Errors.dbError("查询岗位列表失败", error);
    return (data || []) as DepartmentPostRulePostOptionRecord[];
  }

  async replaceDepartmentRules(input: {
    departmentCode: DepartmentCode;
    postCodes: EmployeePostCode[];
    tenantId?: string | null;
  }) {
    let disableQuery = SupabaseDB.getAdminClient()
      .from("department_post_rules")
      .update({
        enabled: false,
        updated_at: new Date().toISOString(),
      })
      .eq("department_code", input.departmentCode);

    if (input.tenantId) {
      disableQuery = disableQuery.eq("tenant_id", input.tenantId);
    }

    const disabledResult = await disableQuery;

    if (disabledResult.error) {
      throw Errors.dbError("停用部门岗位映射失败", disabledResult.error);
    }

    if (input.postCodes.length === 0) return;

    const now = new Date().toISOString();
    const payload = input.postCodes.map((postCode, index) => ({
      department_code: input.departmentCode,
      post_code: postCode,
      tenant_id: input.tenantId ?? null,
      enabled: true,
      sort: (index + 1) * 10,
      updated_at: now,
    }));

    const { error } = await SupabaseDB.getAdminClient()
      .from("department_post_rules")
      .upsert(payload, {
        onConflict: input.tenantId
          ? "tenant_id,department_code,post_code"
          : "department_code,post_code",
      });

    if (error) throw Errors.dbError("保存部门岗位映射失败", error);
  }

  async findDepartmentAndPostByIds(input: {
    departmentId: string;
    postId: string;
    tenantId?: string | null;
  }): Promise<DepartmentPostRuleEmployeePair> {
    const [departmentResult, postResult] = await Promise.all([
      SupabaseDB.getAdminClient()
        .from("departments")
        .select("id, code, name")
        .eq("id", input.departmentId)
        .eq("tenant_id", input.tenantId)
        .maybeSingle(),
      SupabaseDB.getAdminClient()
        .from("posts")
        .select("id, code, name, sort, status")
        .eq("id", input.postId)
        .eq("tenant_id", input.tenantId)
        .maybeSingle(),
    ]);

    if (departmentResult.error) {
      throw Errors.dbError("查询部门失败", departmentResult.error);
    }

    if (postResult.error) {
      throw Errors.dbError("查询岗位失败", postResult.error);
    }

    return {
      department: departmentResult.data as DepartmentPostRuleDepartmentRecord | null,
      post: postResult.data as DepartmentPostRulePostOptionRecord | null,
    };
  }

  async findEnabledRule(input: {
    departmentCode: DepartmentCode;
    postCode: EmployeePostCode;
    tenantId?: string | null;
  }) {
    let query = SupabaseDB.getAdminClient()
      .from("department_post_rules")
      .select("id, enabled")
      .eq("department_code", input.departmentCode)
      .eq("post_code", input.postCode)
      .eq("enabled", true);

    if (input.tenantId) {
      query = query.eq("tenant_id", input.tenantId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) throw Errors.dbError("校验部门岗位映射失败", error);
    return data as { id: string; enabled: boolean } | null;
  }
}

export const departmentPostRuleRepository =
  new DepartmentPostRuleRepository();
