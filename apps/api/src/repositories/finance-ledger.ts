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

export type FinanceLedgerRecord = FinanceLedgerEntryInput & {
  id: string;
  currency?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  payment_linked_at?: string | null;
  payment_linked_by?: string | null;
  payment_link_reason?: string | null;
  payment_link_previous_payment_id?: string | null;
  legacy_payment_ledger_marked_at?: string | null;
  legacy_payment_ledger_marked_by?: string | null;
  legacy_payment_ledger_reason?: string | null;
  project?: unknown;
  cost_category?: unknown;
  handler?: unknown;
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
    if (query.ledger_id) {
      request = request.eq("id", query.ledger_id);
    }
    if (query.payment_id) {
      request = request.eq("payment_id", query.payment_id);
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

  async findProjectPaymentByPaymentId(input: {
    tenantId: string;
    paymentId: string;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("finance_ledger_entries")
      .select(this.select)
      .eq("tenant_id", input.tenantId)
      .eq("payment_id", input.paymentId)
      .eq("entry_type", "project_payment")
      .limit(1);

    if (error) {
      throw Errors.dbError("查询项目收款台账失败", error);
    }

    return data?.[0] ?? null;
  }

  async findById(input: {
    tenantId: string;
    ledgerId: string;
  }): Promise<FinanceLedgerRecord | null> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("finance_ledger_entries")
      .select(this.select)
      .eq("tenant_id", input.tenantId)
      .eq("id", input.ledgerId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询财务台账失败", error);
    }

    return (data as unknown as FinanceLedgerRecord | null) ?? null;
  }

  async linkProjectPayment(input: {
    tenantId: string;
    ledgerId: string;
    paymentId: string;
    employeeId: string;
    reason: string;
    previousPaymentId: string | null;
    metadata: Record<string, unknown>;
  }) {
    const now = new Date().toISOString();
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("finance_ledger_entries")
      .update({
        payment_id: input.paymentId,
        payment_linked_at: now,
        payment_linked_by: input.employeeId,
        payment_link_reason: input.reason,
        payment_link_previous_payment_id: input.previousPaymentId,
        metadata: input.metadata,
      })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.ledgerId)
      .select(this.select)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("关联收款台账失败", error);
    }
    if (!data) {
      throw Errors.business(404, "财务台账不存在", "FINANCE_LEDGER_NOT_FOUND");
    }

    return data;
  }

  async markLegacyProjectPayment(input: {
    tenantId: string;
    ledgerId: string;
    employeeId: string;
    reason: string;
    metadata: Record<string, unknown>;
  }) {
    const now = new Date().toISOString();
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("finance_ledger_entries")
      .update({
        legacy_payment_ledger_marked_at: now,
        legacy_payment_ledger_marked_by: input.employeeId,
        legacy_payment_ledger_reason: input.reason,
        metadata: input.metadata,
      })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.ledgerId)
      .select(this.select)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("标记历史收款台账失败", error);
    }
    if (!data) {
      throw Errors.business(404, "财务台账不存在", "FINANCE_LEDGER_NOT_FOUND");
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
