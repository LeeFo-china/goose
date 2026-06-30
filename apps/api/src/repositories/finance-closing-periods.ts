import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase/index";

export type FinanceClosingPeriodStatus = "draft" | "closed" | "reopened";

export type FinanceClosingPeriodRow = {
  id: string;
  tenant_id: string;
  period_month: string;
  status: FinanceClosingPeriodStatus;
  closed_at: string | null;
  closed_by_employee_id: string | null;
  reopened_at: string | null;
  reopened_by_employee_id: string | null;
  reopen_reason: string | null;
  snapshot_json: unknown;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type FinanceClosingPeriodListResult = {
  list: FinanceClosingPeriodRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type FinanceClosingPeriodDbRow = FinanceClosingPeriodRow;

class FinanceClosingPeriodRepository {
  async list(input: {
    tenantId: string;
    month?: string;
    page: number;
    pageSize: number;
  }): Promise<FinanceClosingPeriodListResult> {
    const page = input.page;
    const pageSize = Math.min(input.pageSize, 100);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = SupabaseDB.getAdminClient()
      .from("finance_closing_periods")
      .select(FINANCE_CLOSING_PERIOD_SELECT, { count: "exact" })
      .eq("tenant_id", input.tenantId)
      .order("period_month", { ascending: false })
      .range(from, to);

    if (input.month) {
      query = query.eq("period_month", input.month);
    }

    const { data, error, count } = await query;
    if (error) {
      throw Errors.dbError("查询财务结账期间列表失败", error);
    }

    const total = count ?? 0;
    return {
      list: ((data as FinanceClosingPeriodDbRow[] | null) || []),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total ? Math.ceil(total / pageSize) : 0,
      },
    };
  }

  async findByMonth(input: {
    tenantId: string;
    periodMonth: string;
  }): Promise<FinanceClosingPeriodRow | null> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("finance_closing_periods")
      .select(FINANCE_CLOSING_PERIOD_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("period_month", input.periodMonth)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询财务结账期间失败", error);
    }

    return (data as FinanceClosingPeriodRow | null) ?? null;
  }

  async findById(input: {
    tenantId: string;
    id: string;
  }): Promise<FinanceClosingPeriodRow | null> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("finance_closing_periods")
      .select(FINANCE_CLOSING_PERIOD_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("id", input.id)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询财务结账期间失败", error);
    }

    return (data as FinanceClosingPeriodRow | null) ?? null;
  }

  async upsertDraft(input: {
    tenantId: string;
    periodMonth: string;
    snapshotJson: unknown;
    notes?: string | null;
  }): Promise<FinanceClosingPeriodRow> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("finance_closing_periods")
      .upsert({
        tenant_id: input.tenantId,
        period_month: input.periodMonth,
        status: "draft",
        closed_at: null,
        closed_by_employee_id: null,
        reopened_at: null,
        reopened_by_employee_id: null,
        reopen_reason: null,
        snapshot_json: input.snapshotJson,
        notes: input.notes ?? null,
      }, { onConflict: "tenant_id,period_month" })
      .select(FINANCE_CLOSING_PERIOD_SELECT)
      .single();

    if (error) {
      throw Errors.dbError("保存财务结账草稿失败", error);
    }

    return data as FinanceClosingPeriodRow;
  }

  async close(input: {
    tenantId: string;
    id: string;
    closedByEmployeeId: string | null;
    snapshotJson: unknown;
    notes?: string | null;
  }): Promise<FinanceClosingPeriodRow> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("finance_closing_periods")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
        closed_by_employee_id: input.closedByEmployeeId,
        reopened_at: null,
        reopened_by_employee_id: null,
        reopen_reason: null,
        snapshot_json: input.snapshotJson,
        notes: input.notes ?? null,
      })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.id)
      .select(FINANCE_CLOSING_PERIOD_SELECT)
      .single();

    if (error) {
      throw Errors.dbError("确认财务月度结账失败", error);
    }

    return data as FinanceClosingPeriodRow;
  }

  async reopen(input: {
    tenantId: string;
    id: string;
    reopenedByEmployeeId: string | null;
    reason: string;
  }): Promise<FinanceClosingPeriodRow> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("finance_closing_periods")
      .update({
        status: "reopened",
        reopened_at: new Date().toISOString(),
        reopened_by_employee_id: input.reopenedByEmployeeId,
        reopen_reason: input.reason,
      })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.id)
      .select(FINANCE_CLOSING_PERIOD_SELECT)
      .single();

    if (error) {
      throw Errors.dbError("反结账失败", error);
    }

    return data as FinanceClosingPeriodRow;
  }
}

const FINANCE_CLOSING_PERIOD_SELECT = `
  id,
  tenant_id,
  period_month,
  status,
  closed_at,
  closed_by_employee_id,
  reopened_at,
  reopened_by_employee_id,
  reopen_reason,
  snapshot_json,
  notes,
  created_at,
  updated_at
`;

export const financeClosingPeriodRepository =
  new FinanceClosingPeriodRepository();
