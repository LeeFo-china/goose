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
  async listRules() {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("department_post_rules")
      .select("id, department_code, post_code, enabled, sort, created_at, updated_at")
      .order("department_code", { ascending: true })
      .order("sort", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw Errors.dbError("查询部门岗位映射失败", error);
    return (data || []) as DepartmentPostRuleRecord[];
  }

  async listDepartments() {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("departments")
      .select("id, code, name")
      .order("code", { ascending: true });

    if (error) throw Errors.dbError("查询部门列表失败", error);
    return (data || []) as DepartmentPostRuleDepartmentRecord[];
  }

  async listPostOptions() {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("posts")
      .select("id, code, name, sort, status")
      .order("sort", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (error) throw Errors.dbError("查询岗位列表失败", error);
    return (data || []) as DepartmentPostRulePostOptionRecord[];
  }

  async replaceDepartmentRules(input: {
    departmentCode: DepartmentCode;
    postCodes: EmployeePostCode[];
  }) {
    const disabledResult = await SupabaseDB.getAdminClient()
      .from("department_post_rules")
      .update({
        enabled: false,
        updated_at: new Date().toISOString(),
      })
      .eq("department_code", input.departmentCode);

    if (disabledResult.error) {
      throw Errors.dbError("停用部门岗位映射失败", disabledResult.error);
    }

    if (input.postCodes.length === 0) return;

    const now = new Date().toISOString();
    const payload = input.postCodes.map((postCode, index) => ({
      department_code: input.departmentCode,
      post_code: postCode,
      enabled: true,
      sort: (index + 1) * 10,
      updated_at: now,
    }));

    const { error } = await SupabaseDB.getAdminClient()
      .from("department_post_rules")
      .upsert(payload, {
        onConflict: "department_code,post_code",
      });

    if (error) throw Errors.dbError("保存部门岗位映射失败", error);
  }

  async findDepartmentAndPostByIds(input: {
    departmentId: string;
    postId: string;
  }): Promise<DepartmentPostRuleEmployeePair> {
    const [departmentResult, postResult] = await Promise.all([
      SupabaseDB.getAdminClient()
        .from("departments")
        .select("id, code, name")
        .eq("id", input.departmentId)
        .maybeSingle(),
      SupabaseDB.getAdminClient()
        .from("posts")
        .select("id, code, name, sort, status")
        .eq("id", input.postId)
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
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("department_post_rules")
      .select("id, enabled")
      .eq("department_code", input.departmentCode)
      .eq("post_code", input.postCode)
      .eq("enabled", true)
      .maybeSingle();

    if (error) throw Errors.dbError("校验部门岗位映射失败", error);
    return data as { id: string; enabled: boolean } | null;
  }
}

export const departmentPostRuleRepository =
  new DepartmentPostRuleRepository();
