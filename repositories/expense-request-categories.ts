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
  code: string;
  name: string;
  status: ExpenseRequestCategoryStatus;
  sort: number;
  is_builtin: boolean;
  remark: string | null;
  created_at: string;
  updated_at: string;
};

class ExpenseRequestCategoryRepository {
  async list(params: ExpenseRequestCategoryListQuery) {
    const { page, pageSize, status, keyword } = params;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = SupabaseDB.getAdminClient()
      .from("expense_request_categories")
      .select("*", { count: "exact" })
      .order("sort", { ascending: true })
      .order("created_at", { ascending: true });

    if (status) {
      query = query.eq("status", status);
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

  async findById(id: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("expense_request_categories")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询费用分类失败", error);
    }

    return (data as ExpenseRequestCategoryRecord | null) ?? null;
  }

  async findByCode(code: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("expense_request_categories")
      .select("*")
      .eq("code", code)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询费用分类失败", error);
    }

    return (data as ExpenseRequestCategoryRecord | null) ?? null;
  }

  async findByName(name: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("expense_request_categories")
      .select("*")
      .eq("name", name)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询费用分类失败", error);
    }

    return (data as ExpenseRequestCategoryRecord | null) ?? null;
  }

  async create(input: CreateExpenseRequestCategoryInput) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("expense_request_categories")
      .insert({
        code: input.code,
        name: input.name,
        status: input.status,
        sort: input.sort,
        is_builtin: input.is_builtin,
        remark: input.remark ?? null,
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

  async update(id: string, input: UpdateExpenseRequestCategoryInput) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("expense_request_categories")
      .update({
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.sort !== undefined ? { sort: input.sort } : {}),
        ...(input.is_builtin !== undefined ? { is_builtin: input.is_builtin } : {}),
        ...(input.remark !== undefined ? { remark: input.remark ?? null } : {}),
      })
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("更新费用分类失败", error);
    }

    if (!data) {
      throw Errors.badRequest("费用分类不存在或更新失败");
    }

    return data as ExpenseRequestCategoryRecord;
  }

  async updateStatus(id: string, status: ExpenseRequestCategoryStatus) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("expense_request_categories")
      .update({ status })
      .eq("id", id)
      .select("*")
      .maybeSingle();

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
