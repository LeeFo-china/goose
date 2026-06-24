import { Errors } from "@/errors/error-factory";
import type { FinanceLedgerListQuery } from "@/schema/finance";
import { SupabaseDB } from "@/utils/supabase/index";

export type FinanceLedgerEntryInput = {
  tenant_id: string;
  project_id?: string | null;
  cost_category_id?: string | null;
  direction: "in" | "out";
  entry_type: "project_payment" | "expense_settlement" | "refund" | "adjustment";
  amount: number;
  occurred_at: string;
  source_type: string;
  source_id: string;
  workflow_task_id?: string | null;
  payment_id?: string | null;
  expense_request_id?: string | null;
  expense_settlement_id?: string | null;
  handled_by?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown>;
};

class FinanceLedgerRepository {
  private select = `
    *,
    project:projects(id, name, status),
    cost_category:finance_cost_categories!finance_ledger_entries_cost_category_id_fkey(id, code, name, status),
    handler:employees!finance_ledger_entries_handled_by_fkey(id, name, phone)
  `;

  async list(tenantId: string, query: FinanceLedgerListQuery) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let request = SupabaseDB.getAdminClient()
      .from("finance_ledger_entries")
      .select(this.select, { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("occurred_at", { ascending: false });

    if (query.project_id) {
      request = request.eq("project_id", query.project_id);
    }
    if (query.cost_category_id) {
      request = request.eq("cost_category_id", query.cost_category_id);
    }
    if (query.direction) {
      request = request.eq("direction", query.direction);
    }
    if (query.unallocated_only) {
      request = request
        .eq("direction", "out")
        .is("cost_category_id", null);
    }
    if (query.entry_type) {
      request = request.eq("entry_type", query.entry_type);
    }
    if (query.date_from) {
      request = request.gte("occurred_at", `${query.date_from}T00:00:00.000Z`);
    }
    if (query.date_to) {
      request = request.lte("occurred_at", `${query.date_to}T23:59:59.999Z`);
    }

    const { data, error, count } = await request.range(from, to);
    if (error) {
      throw Errors.dbError("查询财务台账失败", error);
    }

    return {
      list: data || [],
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    };
  }

  async createIdempotent(input: FinanceLedgerEntryInput) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("finance_ledger_entries")
      .upsert(input, {
        onConflict: "tenant_id,source_type,source_id,entry_type",
        ignoreDuplicates: false,
      })
      .select(this.select)
      .single();

    if (error) {
      throw Errors.dbError("写入财务台账失败", error);
    }

    return data;
  }

  async findActiveCostCategory(input: {
    tenantId: string;
    costCategoryId: string;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("finance_cost_categories")
      .select("id, tenant_id, status")
      .eq("tenant_id", input.tenantId)
      .eq("id", input.costCategoryId)
      .eq("status", "active")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询成本分类失败", error);
    }

    return data;
  }

  async updateCostCategory(input: {
    tenantId: string;
    ledgerId: string;
    costCategoryId: string | null;
    employeeId: string;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("finance_ledger_entries")
      .update({
        cost_category_id: input.costCategoryId,
        cost_category_updated_by: input.employeeId,
        cost_category_updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.ledgerId)
      .select(this.select)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("更新财务台账成本分类失败", error);
    }
    if (!data) {
      throw Errors.business(404, "财务台账不存在", "FINANCE_LEDGER_NOT_FOUND");
    }

    return data;
  }
}

export const financeLedgerRepository = new FinanceLedgerRepository();
