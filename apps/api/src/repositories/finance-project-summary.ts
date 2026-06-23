import { Errors } from "@/errors/error-factory";
import type { FinanceProjectSummaryListQuery } from "@/schema/finance";
import { SupabaseDB } from "@/utils/supabase/index";

export type FinanceProjectSummaryProjectRow = {
  id: string;
  name: string | null;
  status: string | null;
  signed_amount: number | string | null;
  budget: number | string | null;
};

export type FinanceProjectLedgerTotals = {
  income_amount: number;
  expense_amount: number;
  ledger_entry_count: number;
};

export type FinanceProjectReceivableTotals = {
  receivable_amount: number;
  receivable_paid_amount: number;
  receivable_remaining_amount: number;
  overdue_amount: number;
  overdue_count: number;
};

type FinanceProjectReceivableRow = {
  project_id: string | null;
  amount: number | string | null;
  paid_amount: number | string | null;
  due_date: string | null;
  status: string | null;
};

class FinanceProjectSummaryRepository {
  async listProjects(tenantId: string, query: FinanceProjectSummaryListQuery) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let request = SupabaseDB.getAdminClient()
      .from("projects")
      .select("id, name, status, signed_amount, budget", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (query.keyword) {
      const keyword = query.keyword.trim();
      if (isUuid(keyword)) {
        request = request.or(`name.ilike.%${keyword}%,id.eq.${keyword}`);
      } else {
        request = request.ilike("name", `%${keyword}%`);
      }
    }
    if (query.status) {
      request = request.eq("status", query.status);
    }

    const { data, error, count } = await request.range(from, to);
    if (error) {
      throw Errors.dbError("查询项目经营汇总失败", error);
    }

    return {
      list: ((data as FinanceProjectSummaryProjectRow[] | null) || []),
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    };
  }

  async findProject(input: {
    tenantId: string;
    projectId: string;
  }): Promise<(FinanceProjectSummaryProjectRow & { tenant_id: string | null }) | null> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("projects")
      .select("id, tenant_id, name, status, signed_amount, budget")
      .eq("id", input.projectId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询项目经营汇总失败", error);
    }

    const project = data as (FinanceProjectSummaryProjectRow & {
      tenant_id: string | null;
    }) | null;
    if (!project || project.tenant_id !== input.tenantId) {
      return null;
    }

    return project;
  }

  async listLedgerTotals(input: {
    tenantId: string;
    projectIds: string[];
  }): Promise<Map<string, FinanceProjectLedgerTotals>> {
    if (input.projectIds.length === 0) {
      return new Map();
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("finance_ledger_entries")
      .select("project_id, direction, amount")
      .eq("tenant_id", input.tenantId)
      .in("project_id", input.projectIds);

    if (error) {
      throw Errors.dbError("查询项目财务流水汇总失败", error);
    }

    const totals = new Map<string, FinanceProjectLedgerTotals>();
    for (const row of (data || []) as Array<{
      project_id: string | null;
      direction: string | null;
      amount: number | string | null;
    }>) {
      if (!row.project_id) continue;
      const current = totals.get(row.project_id) || {
        income_amount: 0,
        expense_amount: 0,
        ledger_entry_count: 0,
      };
      const amount = normalizeMoney(row.amount);
      if (row.direction === "in") {
        current.income_amount += amount;
      } else if (row.direction === "out") {
        current.expense_amount += amount;
      }
      current.ledger_entry_count += 1;
      totals.set(row.project_id, current);
    }

    return totals;
  }

  async listReceivableTotals(input: {
    tenantId: string;
    projectIds: string[];
    tenantToday: string;
  }): Promise<Map<string, FinanceProjectReceivableTotals>> {
    if (input.projectIds.length === 0) {
      return new Map();
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_receivable_plans")
      .select("project_id, amount, paid_amount, due_date, status")
      .eq("tenant_id", input.tenantId)
      .in("project_id", input.projectIds);

    if (error) {
      throw Errors.dbError("查询项目应收汇总失败", error);
    }

    const totals = new Map<string, FinanceProjectReceivableTotals>();
    for (const row of ((data as FinanceProjectReceivableRow[] | null) || [])) {
      if (!row.project_id || row.status === "canceled") continue;
      const current = totals.get(row.project_id) || {
        receivable_amount: 0,
        receivable_paid_amount: 0,
        receivable_remaining_amount: 0,
        overdue_amount: 0,
        overdue_count: 0,
      };
      const amount = normalizeMoney(row.amount);
      const paidAmount = normalizeMoney(row.paid_amount);
      const remainingAmount = Math.max(amount - paidAmount, 0);
      current.receivable_amount += amount;
      current.receivable_paid_amount += paidAmount;
      current.receivable_remaining_amount += remainingAmount;
      if (isOverdueReceivable(row, input.tenantToday, remainingAmount)) {
        current.overdue_amount += remainingAmount;
        current.overdue_count += 1;
      }
      totals.set(row.project_id, current);
    }

    return totals;
  }
}

function isOverdueReceivable(
  row: FinanceProjectReceivableRow,
  tenantToday: string,
  remainingAmount: number,
) {
  return Boolean(
    row.due_date &&
      row.due_date < tenantToday &&
      remainingAmount > 0 &&
      row.status !== "paid",
  );
}

function normalizeMoney(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);
}

export const financeProjectSummaryRepository =
  new FinanceProjectSummaryRepository();
