import { Errors } from "@/errors/error-factory";
import type {
  CreateExpenseRequestCategoryInput,
  ExpenseRequestCategoryListQuery,
  ExpenseRequestCategoryStatus,
  UpdateExpenseRequestCategoryInput,
} from "@/schema/expense-request-categories";
import { SupabaseDB } from "@/utils/supabase";

export type ExpenseRequestCategoryRecord = {
  id: string;
  tenant_id: string | null;
  code: string;
  name: string;
  status: ExpenseRequestCategoryStatus;
  sort: number;
  is_builtin: boolean;
  is_default: boolean | null;
  department_codes: unknown;
  mode_codes: unknown;
  description?: string | null;
  remark: string | null;
  created_at: string;
  updated_at: string;
};

class ExpenseRequestCategoryRepository {
  async list(params: ExpenseRequestCategoryListQuery, tenantId?: string | null) {
    const { page, pageSize, status, keyword, include_disabled } = params;
    const hasInMemoryFilters = Boolean(params.mode || params.department_code);
    const from = hasInMemoryFilters ? 0 : (page - 1) * pageSize;
    const to = hasInMemoryFilters ? 999 : from + pageSize - 1;

    let query = SupabaseDB.getAdminClient()
      .from("expense_request_categories")
      .select("*", { count: "exact" })
      .order("sort", { ascending: true })
      .order("created_at", { ascending: true });

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    if (status) {
      query = query.eq("status", status);
    } else if (!include_disabled) {
      query = query.eq("status", "active");
    }

    if (keyword) {
      query = query.or(`code.ilike.%${keyword}%,name.ilike.%${keyword}%`);
    }

    const { data, error, count } = await query.range(from, to);
    if (error) {
      throw Errors.dbError("查询费用分类列表失败", error);
    }

    return {
      list: (data as ExpenseRequestCategoryRecord[] | null) || [],
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    };
  }

  async findById(id: string, tenantId?: string | null) {
    let query = SupabaseDB.getAdminClient()
      .from("expense_request_categories")
      .select("*")
      .eq("id", id);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw Errors.dbError("查询费用分类失败", error);
    }

    return (data as ExpenseRequestCategoryRecord | null) ?? null;
  }

  async findByCode(code: string, tenantId?: string | null) {
    let query = SupabaseDB.getAdminClient()
      .from("expense_request_categories")
      .select("*")
      .eq("code", code);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw Errors.dbError("查询费用分类失败", error);
    }

    return (data as ExpenseRequestCategoryRecord | null) ?? null;
  }

  async findByName(name: string, tenantId?: string | null) {
    let query = SupabaseDB.getAdminClient()
      .from("expense_request_categories")
      .select("*")
      .eq("name", name);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw Errors.dbError("查询费用分类失败", error);
    }

    return (data as ExpenseRequestCategoryRecord | null) ?? null;
  }

  async create(
    input: CreateExpenseRequestCategoryInput & { tenant_id?: string | null },
  ) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("expense_request_categories")
      .insert({
        tenant_id: input.tenant_id ?? null,
        code: input.code,
        name: input.name,
        status: input.status,
        sort: input.sort,
        is_builtin: input.is_builtin,
        is_default: input.is_default ?? false,
        department_codes: input.department_codes ?? [],
        mode_codes: input.mode_codes ?? [],
        description: input.description ?? input.remark ?? null,
        remark: input.remark ?? input.description ?? null,
      })
      .select("*")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("创建费用分类失败", error);
    }

    if (!data) {
      throw Errors.badRequest("创建费用分类失败");
    }

    return data as ExpenseRequestCategoryRecord;
  }

  async update(
    id: string,
    input: UpdateExpenseRequestCategoryInput,
    tenantId?: string | null,
  ) {
    let query = SupabaseDB.getAdminClient()
      .from("expense_request_categories")
      .update({
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.sort !== undefined ? { sort: input.sort } : {}),
        ...(input.is_builtin !== undefined ? { is_builtin: input.is_builtin } : {}),
        ...(input.is_default !== undefined ? { is_default: input.is_default } : {}),
        ...(input.department_codes !== undefined
          ? { department_codes: input.department_codes }
          : {}),
        ...(input.mode_codes !== undefined ? { mode_codes: input.mode_codes } : {}),
        ...(input.description !== undefined
          ? { description: input.description ?? null }
          : {}),
        ...(input.remark !== undefined ? { remark: input.remark ?? null } : {}),
      })
      .eq("id", id);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query.select("*").maybeSingle();

    if (error) {
      throw Errors.dbError("更新费用分类失败", error);
    }

    if (!data) {
      throw Errors.badRequest("费用分类不存在或更新失败");
    }

    return data as ExpenseRequestCategoryRecord;
  }

  async updateStatus(
    id: string,
    status: ExpenseRequestCategoryStatus,
    tenantId?: string | null,
  ) {
    let query = SupabaseDB.getAdminClient()
      .from("expense_request_categories")
      .update({ status })
      .eq("id", id);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query.select("*").maybeSingle();

    if (error) {
      throw Errors.dbError("更新费用分类状态失败", error);
    }

    if (!data) {
      throw Errors.badRequest("费用分类不存在或更新失败");
    }

    return data as ExpenseRequestCategoryRecord;
  }
}

export const expenseRequestCategoryRepository =
  new ExpenseRequestCategoryRepository();
