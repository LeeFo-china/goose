import { Errors } from "@/errors/error-factory";
import type {
  CreateFinanceCostCategoryInput,
  FinanceCostCategoryListQuery,
  FinanceCostCategoryStatus,
  UpdateFinanceCostCategoryInput,
} from "@/schema/finance-costs";
import { SupabaseDB } from "@/utils/supabase/index";

const FINANCE_COST_CATEGORY_SELECT =
  "id, tenant_id, code, name, status, sort_order, is_system, created_at, updated_at";

export type FinanceCostCategoryRecord = {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  status: FinanceCostCategoryStatus;
  sort_order: number;
  is_system: boolean;
  created_at: string;
  updated_at: string;
};

export type FinanceCostCategoryListResult = {
  list: FinanceCostCategoryRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

class FinanceCostCategoryRepository {
  async list(
    tenantId: string,
    query: FinanceCostCategoryListQuery,
  ): Promise<FinanceCostCategoryListResult> {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let request = SupabaseDB.getAdminClient()
      .from("finance_cost_categories")
      .select(FINANCE_COST_CATEGORY_SELECT, { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (query.status) {
      request = request.eq("status", query.status);
    }

    const { data, error, count } = await request.range(from, to);
    if (error) {
      throw Errors.dbError("查询成本分类失败", error);
    }

    return {
      list: ((data as FinanceCostCategoryRecord[] | null) || []),
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    };
  }

  async create(input: {
    tenantId: string;
    employeeId: string;
    input: CreateFinanceCostCategoryInput;
  }): Promise<FinanceCostCategoryRecord> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("finance_cost_categories")
      .insert({
        tenant_id: input.tenantId,
        code: input.input.code,
        name: input.input.name,
        sort_order: input.input.sort_order ?? 100,
        status: "active",
        is_system: false,
        created_by: input.employeeId,
        updated_by: input.employeeId,
      })
      .select(FINANCE_COST_CATEGORY_SELECT)
      .single();

    if (error?.code === "23505") {
      throw Errors.business(
        409,
        "成本分类编码已存在",
        "FINANCE_COST_CATEGORY_CODE_EXISTS",
      );
    }
    if (error) {
      throw Errors.dbError("创建成本分类失败", error);
    }

    return data as FinanceCostCategoryRecord;
  }

  async update(input: {
    tenantId: string;
    employeeId: string;
    id: string;
    input: UpdateFinanceCostCategoryInput;
  }): Promise<FinanceCostCategoryRecord> {
    const patch: {
      name?: string;
      status?: FinanceCostCategoryStatus;
      sort_order?: number;
      updated_by: string;
    } = {
      updated_by: input.employeeId,
    };
    if (input.input.name !== undefined) {
      patch.name = input.input.name;
    }
    if (input.input.status !== undefined) {
      patch.status = input.input.status;
    }
    if (input.input.sort_order !== undefined) {
      patch.sort_order = input.input.sort_order;
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("finance_cost_categories")
      .update(patch)
      .eq("tenant_id", input.tenantId)
      .eq("id", input.id)
      .select(FINANCE_COST_CATEGORY_SELECT)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("更新成本分类失败", error);
    }
    if (!data) {
      throw Errors.business(
        404,
        "成本分类不存在",
        "FINANCE_COST_CATEGORY_NOT_FOUND",
      );
    }

    return data as FinanceCostCategoryRecord;
  }
}

export const financeCostCategoryRepository =
  new FinanceCostCategoryRepository();
