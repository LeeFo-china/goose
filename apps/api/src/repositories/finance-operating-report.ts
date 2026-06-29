import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase/index";

export type FinanceOperatingReportLedgerRow = {
  id: string;
  project_id: string | null;
  project_name: string | null;
  project_status: string | null;
  cost_category_id: string | null;
  cost_category_name: string | null;
  direction: string | null;
  entry_type: string | null;
  amount: number;
  occurred_at: string | null;
  metadata: unknown;
};

export type FinanceOperatingReportReceivableRow = {
  id: string;
  project_id: string | null;
  project_name: string | null;
  project_status: string | null;
  amount: number;
  paid_amount: number;
  due_date: string | null;
  status: string | null;
  payment_type: string | null;
};

type QueryInput = {
  tenantId: string;
  dateFrom: string;
  dateTo: string;
  projectId?: string;
  projectStatus?: string;
  sourceLimit: number;
};

type MaybeArray<T> = T | T[] | null;

type ProjectRelation = {
  id: string;
  name: string | null;
  status: string | null;
};

type CostCategoryRelation = {
  id: string;
  code: string | null;
  name: string | null;
};

type LedgerDbRow = {
  id: string;
  project_id: string | null;
  cost_category_id: string | null;
  direction: string | null;
  entry_type: string | null;
  amount: number | string | null;
  occurred_at: string | null;
  metadata: unknown;
  project?: MaybeArray<ProjectRelation>;
  cost_category?: MaybeArray<CostCategoryRelation>;
};

type ReceivableDbRow = {
  id: string;
  project_id: string | null;
  amount: number | string | null;
  paid_amount: number | string | null;
  due_date: string | null;
  status: string | null;
  payment_type: string | null;
  project?: MaybeArray<ProjectRelation>;
};

class FinanceOperatingReportRepository {
  async listLedgerRows(input: QueryInput): Promise<FinanceOperatingReportLedgerRow[]> {
    const projectRelation = input.projectStatus
      ? "project:projects!inner(id, name, status)"
      : "project:projects(id, name, status)";
    let query = SupabaseDB.getAdminClient()
      .from("finance_ledger_entries")
      .select(`
        id,
        project_id,
        cost_category_id,
        direction,
        entry_type,
        amount,
        occurred_at,
        metadata,
        ${projectRelation},
        cost_category:finance_cost_categories!finance_ledger_entries_cost_category_id_fkey(id, code, name)
      `)
      .eq("tenant_id", input.tenantId)
      .gte("occurred_at", `${input.dateFrom}T00:00:00.000Z`)
      .lte("occurred_at", `${input.dateTo}T23:59:59.999Z`)
      .order("occurred_at", { ascending: true })
      .limit(input.sourceLimit);

    if (input.projectId) {
      query = query.eq("project_id", input.projectId);
    }
    if (input.projectStatus) {
      query = query.eq("project.status", input.projectStatus);
    }

    const { data, error } = await query;
    if (error) {
      throw Errors.dbError("查询财务运营报表流水失败", error);
    }

    return ((data as unknown as LedgerDbRow[] | null) || []).map((row) => {
      const project = firstRelation(row.project);
      const costCategory = firstRelation(row.cost_category);
      return {
        id: row.id,
        project_id: row.project_id,
        project_name: project?.name ?? null,
        project_status: project?.status ?? null,
        cost_category_id: row.cost_category_id,
        cost_category_name: costCategory?.name || costCategory?.code || null,
        direction: row.direction,
        entry_type: row.entry_type,
        amount: normalizeMoney(row.amount),
        occurred_at: row.occurred_at,
        metadata: row.metadata,
      };
    });
  }

  async listReceivableRows(
    input: QueryInput,
  ): Promise<FinanceOperatingReportReceivableRow[]> {
    const projectRelation = input.projectStatus
      ? "project:projects!inner(id, name, status)"
      : "project:projects(id, name, status)";
    let query = SupabaseDB.getAdminClient()
      .from("project_receivable_plans")
      .select(`
        id,
        project_id,
        amount,
        paid_amount,
        due_date,
        status,
        payment_type,
        ${projectRelation}
      `)
      .eq("tenant_id", input.tenantId)
      .gte("due_date", input.dateFrom)
      .lte("due_date", input.dateTo)
      .order("due_date", { ascending: true })
      .limit(input.sourceLimit);

    if (input.projectId) {
      query = query.eq("project_id", input.projectId);
    }
    if (input.projectStatus) {
      query = query.eq("project.status", input.projectStatus);
    }

    const { data, error } = await query;
    if (error) {
      throw Errors.dbError("查询财务运营报表应收失败", error);
    }

    return ((data as unknown as ReceivableDbRow[] | null) || []).map((row) => {
      const project = firstRelation(row.project);
      return {
        id: row.id,
        project_id: row.project_id,
        project_name: project?.name ?? null,
        project_status: project?.status ?? null,
        amount: normalizeMoney(row.amount),
        paid_amount: normalizeMoney(row.paid_amount),
        due_date: row.due_date,
        status: row.status,
        payment_type: row.payment_type,
      };
    });
  }
}

function firstRelation<T>(value: MaybeArray<T> | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function normalizeMoney(value: unknown): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

export const financeOperatingReportRepository =
  new FinanceOperatingReportRepository();
