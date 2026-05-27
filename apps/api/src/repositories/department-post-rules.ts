import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";
import type {
  DepartmentCode,
  EmployeePostCode,
} from "@gooes/domain";

export type DepartmentPostRuleRecord = {
  id: string;
  tenant_department_id: string | null;
  department_code: DepartmentCode;
  post_code: EmployeePostCode;
  alias_name: string | null;
  enabled: boolean;
  sort: number;
  created_at: string | null;
  updated_at: string | null;
  tenant_id?: string | null;
};

export type DepartmentPostRuleDepartmentRecord = {
  id: string;
  tenant_department_id: string | null;
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
      .select("id, tenant_department_id, department_code, post_code, alias_name, enabled, sort, created_at, updated_at")
      .eq("enabled", true)
      .order("tenant_department_id", { ascending: true, nullsFirst: false })
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
      .from("tenant_departments")
      .select("id, code, alias_name, sort")
      .eq("enabled", true)
      .order("sort", { ascending: true, nullsFirst: false });

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query;

    if (error) throw Errors.dbError("查询部门列表失败", error);
    return ((data || []) as Array<{
      id: string;
      code: DepartmentCode;
      alias_name: string;
    }>).map((department) => ({
      id: department.id,
      tenant_department_id: department.id,
      code: department.code,
      name: department.alias_name,
    }));
  }

  async findDepartmentById(input: {
    departmentId: string;
    tenantId?: string | null;
  }) {
    let query = SupabaseDB.getAdminClient()
      .from("tenant_departments")
      .select("id, code, alias_name")
      .eq("enabled", true);

    query = query.eq("id", input.departmentId);

    if (input.tenantId) {
      query = query.eq("tenant_id", input.tenantId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) throw Errors.dbError("查询部门失败", error);
    if (!data) return null;

    const row = data as { id: string; code: DepartmentCode; alias_name: string };

    return {
      id: row.id,
      tenant_department_id: row.id,
      code: row.code,
      name: row.alias_name,
    } as DepartmentPostRuleDepartmentRecord;
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

  async findDepartmentByCode(input: {
    tenantId: string;
    departmentCode: DepartmentCode;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("tenant_departments")
      .select("id, code, alias_name")
      .eq("tenant_id", input.tenantId)
      .eq("code", input.departmentCode)
      .eq("enabled", true)
      .maybeSingle();

    if (error) throw Errors.dbError("查询部门失败", error);
    if (!data) return null;

    const row = data as { id: string; code: DepartmentCode; alias_name: string };

    return {
      id: row.id,
      tenant_department_id: row.id,
      code: row.code,
      name: row.alias_name,
    } as DepartmentPostRuleDepartmentRecord;
  }

  async listExistingPostCodes(input: {
    tenantId: string;
    postCodes: string[];
  }) {
    if (input.postCodes.length === 0) return [];

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("posts")
      .select("code")
      .eq("tenant_id", input.tenantId)
      .in("code", input.postCodes);

    if (error) throw Errors.dbError("查询岗位编码失败", error);
    return ((data || []) as Array<{ code: EmployeePostCode }>).map((item) => item.code);
  }

  async updateDepartmentPostRuleAlias(input: {
    tenantDepartmentId: string;
    departmentCode: DepartmentCode;
    postCode: EmployeePostCode;
    aliasName: string | null;
    tenantId?: string | null;
  }) {
    let query = SupabaseDB.getAdminClient()
      .from("department_post_rules")
      .update({
        alias_name: input.aliasName,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_department_id", input.tenantDepartmentId)
      .eq("post_code", input.postCode)
      .eq("enabled", true);

    if (input.tenantId) {
      query = query.eq("tenant_id", input.tenantId);
    }

    const { data, error } = await query.select("id");

    if (error) throw Errors.dbError("保存部门岗位别名失败", error);
    return ((data || []) as Array<{ id: string }>)[0] || null;
  }

  async replaceDepartmentRules(input: {
    tenantDepartmentId: string;
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
      .eq("tenant_department_id", input.tenantDepartmentId);

    if (input.tenantId) {
      disableQuery = disableQuery.eq("tenant_id", input.tenantId);
    }

    const disabledResult = await disableQuery.select("id");

    if (disabledResult.error) {
      throw Errors.dbError("停用部门岗位映射失败", disabledResult.error);
    }

    if (input.postCodes.length === 0) return;

    const now = new Date().toISOString();
    const payload = input.postCodes.map((postCode, index) => ({
      tenant_department_id: input.tenantDepartmentId,
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
        onConflict: "tenant_id,department_code,post_code",
      })
      .select("id");

    if (error) throw Errors.dbError("保存部门岗位映射失败", error);
  }

  async enableDepartmentPostRule(input: {
    tenantDepartmentId: string;
    departmentCode: DepartmentCode;
    postCode: EmployeePostCode;
    tenantId?: string | null;
  }) {
    const now = new Date().toISOString();
    const { error } = await SupabaseDB.getAdminClient()
      .from("department_post_rules")
      .upsert({
        tenant_department_id: input.tenantDepartmentId,
        department_code: input.departmentCode,
        post_code: input.postCode,
        tenant_id: input.tenantId ?? null,
        enabled: true,
        updated_at: now,
      }, {
        onConflict: "tenant_id,department_code,post_code",
      })
      .select("id");

    if (error) throw Errors.dbError("保存部门岗位映射失败", error);
  }

  async findDepartmentAndPostByIds(input: {
    departmentId: string;
    postId: string;
    tenantId?: string | null;
  }): Promise<DepartmentPostRuleEmployeePair> {
    const [departmentResult, postResult] = await Promise.all([
      SupabaseDB.getAdminClient()
        .from("tenant_departments")
        .select("id, code, alias_name")
        .eq("id", input.departmentId)
        .eq("tenant_id", input.tenantId)
        .eq("enabled", true)
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
      department: departmentResult.data
        ? {
          id: (departmentResult.data as { id: string }).id,
          tenant_department_id: (departmentResult.data as {
            id: string;
          }).id,
          code: (departmentResult.data as { code: DepartmentCode }).code,
          name: (departmentResult.data as { alias_name: string }).alias_name,
        }
        : null,
      post: postResult.data as DepartmentPostRulePostOptionRecord | null,
    };
  }

  async findEnabledRule(input: {
    tenantDepartmentId: string;
    departmentCode: DepartmentCode;
    postCode: EmployeePostCode;
    tenantId?: string | null;
  }) {
    let query = SupabaseDB.getAdminClient()
      .from("department_post_rules")
      .select("id, enabled")
      .eq("tenant_department_id", input.tenantDepartmentId)
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
