import { Errors } from "@/errors/error-factory";
import type {
  CreateDepartmentInput,
  UpdateDepartmentInput,
} from "@/schema/departments";
import { SupabaseDB } from "@/utils/supabase/index";

export type DepartmentTemplateRow = {
  id: string;
  code: string;
  default_name: string;
  sort: number | null;
};

export type TenantDepartmentRow = {
  id: string;
  tenant_id: string;
  template_id: string;
  code: string;
  alias_name: string;
  enabled: boolean;
  sort: number | null;
  legacy_department_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  department_templates?: DepartmentTemplateRow | DepartmentTemplateRow[] | null;
};

export type DepartmentListQueryInput = {
  page: number;
  pageSize: number;
  keyword?: string;
  code?: string;
  enabled?: boolean;
};

const TENANT_DEPARTMENT_SELECT = `
  id,
  tenant_id,
  template_id,
  code,
  alias_name,
  enabled,
  sort,
  legacy_department_id,
  created_at,
  updated_at,
  department_templates (
    id,
    code,
    default_name,
    sort
  )
`;

class DepartmentRepository {
  private adminClient = SupabaseDB.getAdminClient();

  async findTemplateByCode(code: string) {
    const { data, error } = await this.adminClient
      .from("department_templates")
      .select("id, code, default_name, sort")
      .eq("code", code)
      .eq("enabled", true)
      .maybeSingle();

    if (error) throw Errors.dbError("查询部门模板失败", error);
    return data as DepartmentTemplateRow | null;
  }

  async listTemplatesByCodes(codes: string[]) {
    const { data, error } = await this.adminClient
      .from("department_templates")
      .select("id, code, default_name, sort")
      .in("code", codes)
      .eq("enabled", true);

    if (error) throw Errors.dbError("查询部门模板失败", error);
    return (data || []) as DepartmentTemplateRow[];
  }

  async upsertTenantDepartment(input: {
    tenantId: string;
    template: DepartmentTemplateRow;
    aliasName?: string;
    enabled?: boolean;
    sort?: number | null;
  }) {
    const payload = {
      tenant_id: input.tenantId,
      template_id: input.template.id,
      code: input.template.code,
      alias_name: input.aliasName ?? input.template.default_name,
      enabled: input.enabled ?? true,
      sort: input.sort ?? input.template.sort ?? 0,
    };

    const { data, error } = await this.adminClient
      .from("tenant_departments")
      .upsert(payload, { onConflict: "tenant_id,code" })
      .select(TENANT_DEPARTMENT_SELECT)
      .maybeSingle();

    if (error) throw Errors.dbError("同步租户部门配置失败", error);
    return data as TenantDepartmentRow | null;
  }

  async upsertTenantDepartments(input: {
    tenantId: string;
    departments: Array<{
      template: DepartmentTemplateRow;
      aliasName: string;
      enabled?: boolean;
      sort?: number | null;
    }>;
  }) {
    const rows = input.departments.map((item) => ({
      tenant_id: input.tenantId,
      template_id: item.template.id,
      code: item.template.code,
      alias_name: item.aliasName,
      enabled: item.enabled ?? true,
      sort: item.sort ?? item.template.sort ?? 0,
    }));

    const { data, error } = await this.adminClient
      .from("tenant_departments")
      .upsert(rows, { onConflict: "tenant_id,code" })
      .select(TENANT_DEPARTMENT_SELECT);

    if (error) throw Errors.dbError("批量同步租户部门配置失败", error);
    return (data || []) as TenantDepartmentRow[];
  }

  async listTenantDepartments(input: DepartmentListQueryInput & {
    tenantId: string;
  }) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;
    let query = this.adminClient
      .from("tenant_departments")
      .select(TENANT_DEPARTMENT_SELECT, { count: "exact" })
      .eq("tenant_id", input.tenantId);

    if (input.keyword) {
      const escaped = input.keyword.replaceAll(",", "\\,");
      query = query.or(`alias_name.ilike.%${escaped}%,code.ilike.%${escaped}%`);
    }

    if (input.code) {
      query = query.eq("code", input.code);
    }

    if (input.enabled !== undefined) {
      query = query.eq("enabled", input.enabled);
    }

    const { data, error, count } = await query
      .order("sort", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .range(from, to);

    if (error) throw Errors.dbError("部门列表查询失败", error);

    return {
      list: (data || []) as TenantDepartmentRow[],
      total: count || 0,
    };
  }

  async findTenantDepartmentById(input: {
    tenantId: string;
    id: string;
  }) {
    const { data, error } = await this.adminClient
      .from("tenant_departments")
      .select(TENANT_DEPARTMENT_SELECT)
      .eq("id", input.id)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();

    if (error) throw Errors.dbError("部门查询失败", error);
    return data as TenantDepartmentRow | null;
  }

  async findTenantDepartmentForUpdate(input: {
    tenantId: string;
    id: string;
  }) {
    const { data, error } = await this.adminClient
      .from("tenant_departments")
      .select("id, code, alias_name, enabled, sort, legacy_department_id")
      .eq("id", input.id)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();

    if (error) throw Errors.dbError("查询部门失败", error);
    return data as {
      id: string;
      code: string;
      alias_name: string;
      enabled: boolean;
      sort: number | null;
      legacy_department_id: string | null;
    } | null;
  }

  async updateTenantDepartment(input: {
    id: string;
    payload: Omit<UpdateDepartmentInput, "code"> & {
      alias_name: string;
    };
  }) {
    const { data, error } = await this.adminClient
      .from("tenant_departments")
      .update(input.payload)
      .eq("id", input.id)
      .select(TENANT_DEPARTMENT_SELECT)
      .maybeSingle();

    if (error) throw Errors.dbError("更新部门失败", error);
    return data as TenantDepartmentRow | null;
  }
}

export const departmentRepository = new DepartmentRepository();
