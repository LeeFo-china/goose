import { Errors } from "@/errors/error-factory";
import type {
  FinanceMonthlyOverviewDifferenceSourceType,
} from "@/schema/finance-reports";
import { SupabaseDB } from "@/utils/supabase/index";

export type FinanceMonthlyDifferenceSourceDirection = "in" | "out";

export type FinanceMonthlyDifferenceSourceRecord = {
  id: string;
  source_type: FinanceMonthlyOverviewDifferenceSourceType;
  source_label: string;
  source_id: string;
  occurred_at: string;
  project_id: string | null;
  project_name: string | null;
  amount: number | null;
  direction: FinanceMonthlyDifferenceSourceDirection | null;
  description: string;
  target: {
    label: string;
    href: string;
  };
};

export type FinanceMonthlyDifferenceSourceListInput = {
  tenantId: string;
  month: string;
  dateFrom: string;
  dateTo: string;
  baselineAt: string;
  projectId?: string;
  candidateLimit: number;
};

type MaybeArray<T> = T | T[] | null;

type ProjectRelation = {
  id: string;
  name: string | null;
};

type LedgerDbRow = {
  id: string;
  project_id: string | null;
  direction: string | null;
  entry_type: string | null;
  amount: number | string | null;
  occurred_at: string | null;
  updated_at: string | null;
  summary: string | null;
  project?: MaybeArray<ProjectRelation>;
};

type ReceivableDbRow = {
  id: string;
  project_id: string;
  title: string | null;
  amount: number | string | null;
  paid_amount: number | string | null;
  due_date: string | null;
  status: string | null;
  updated_at: string | null;
  project?: MaybeArray<ProjectRelation>;
};

type ExpenseRequestDbRow = {
  id: string;
  project_id: string | null;
  title: string | null;
  total_amount: number | string | null;
  amount: number | string | null;
  status: string | null;
  updated_at: string | null;
  completed_at: string | null;
  approved_at: string | null;
  project?: MaybeArray<ProjectRelation>;
};

type CorrectionAuditDbRow = {
  id: string;
  project_id: string | null;
  title?: string | null;
  note?: string | null;
  event_type?: string | null;
  amount?: number | string | null;
  created_at?: string | null;
  occurred_at?: string | null;
  project?: MaybeArray<ProjectRelation>;
};

class FinanceMonthlyDifferenceSourcesRepository {
  async listCorrectionAuditSources(
    input: FinanceMonthlyDifferenceSourceListInput,
  ): Promise<{ list: FinanceMonthlyDifferenceSourceRecord[]; total: number }> {
    const [receivableEvents, reconciliationActions] = await Promise.all([
      this.listReceivableCorrectionEventSources(input),
      this.listReconciliationActionSources(input),
    ]);
    const list = [...receivableEvents.list, ...reconciliationActions.list]
      .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))
      .slice(0, input.candidateLimit);

    return {
      list,
      total: receivableEvents.total + reconciliationActions.total,
    };
  }

  async listLedgerEntrySources(
    input: FinanceMonthlyDifferenceSourceListInput,
  ): Promise<{ list: FinanceMonthlyDifferenceSourceRecord[]; total: number }> {
    let request = SupabaseDB.getAdminClient()
      .from("finance_ledger_entries")
      .select(`
        id,
        project_id,
        direction,
        entry_type,
        amount,
        occurred_at,
        updated_at,
        summary,
        project:projects(id, name)
      `, { count: "exact" })
      .eq("tenant_id", input.tenantId)
      .gte("occurred_at", `${input.dateFrom}T00:00:00.000Z`)
      .lte("occurred_at", `${input.dateTo}T23:59:59.999Z`)
      .gte("updated_at", input.baselineAt)
      .order("updated_at", { ascending: false });

    if (input.projectId) {
      request = request.eq("project_id", input.projectId);
    }

    const { data, error, count } = await request.range(
      0,
      Math.max(input.candidateLimit, 1) - 1,
    );
    if (error) throw Errors.dbError("查询月度差异财务台账来源失败", error);

    return {
      list: ((data as unknown as LedgerDbRow[] | null) || []).map((row) => {
        const project = firstRelation(row.project);
        return {
          id: `ledger_entry:${row.id}`,
          source_type: "ledger_entry",
          source_label: "财务台账",
          source_id: row.id,
          occurred_at: row.updated_at ?? row.occurred_at ?? input.baselineAt,
          project_id: row.project_id,
          project_name: project?.name ?? null,
          amount: normalizeMoney(row.amount),
          direction: normalizeDirection(row.direction),
          description: row.summary || ledgerDescription(row.entry_type),
          target: {
            label: "查看财务台账",
            href: `/finance/ledger?ledger_id=${row.id}`,
          },
        };
      }),
      total: count || 0,
    };
  }

  async listReceivablePlanSources(
    input: FinanceMonthlyDifferenceSourceListInput,
  ): Promise<{ list: FinanceMonthlyDifferenceSourceRecord[]; total: number }> {
    let request = SupabaseDB.getAdminClient()
      .from("project_receivable_plans")
      .select(`
        id,
        project_id,
        title,
        amount,
        paid_amount,
        due_date,
        status,
        updated_at,
        project:projects(id, name)
      `, { count: "exact" })
      .eq("tenant_id", input.tenantId)
      .gte("due_date", input.dateFrom)
      .lte("due_date", input.dateTo)
      .gte("updated_at", input.baselineAt)
      .order("updated_at", { ascending: false });

    if (input.projectId) {
      request = request.eq("project_id", input.projectId);
    }

    const { data, error, count } = await request.range(
      0,
      Math.max(input.candidateLimit, 1) - 1,
    );
    if (error) throw Errors.dbError("查询月度差异应收计划来源失败", error);

    return {
      list: ((data as unknown as ReceivableDbRow[] | null) || []).map((row) => {
        const project = firstRelation(row.project);
        const href = new URLSearchParams();
        href.set("project_id", row.project_id);
        href.set("receivable_plan_id", row.id);

        return {
          id: `receivable_plan:${row.id}`,
          source_type: "receivable_plan",
          source_label: "应收计划",
          source_id: row.id,
          occurred_at: row.updated_at ?? input.baselineAt,
          project_id: row.project_id,
          project_name: project?.name ?? null,
          amount: normalizeMoney(row.amount),
          direction: null,
          description: `应收计划：${row.title || "未命名计划"}`,
          target: {
            label: "查看应收计划",
            href: `/finance/receivables?${href}`,
          },
        };
      }),
      total: count || 0,
    };
  }

  async listExpenseRequestSources(
    input: FinanceMonthlyDifferenceSourceListInput,
  ): Promise<{ list: FinanceMonthlyDifferenceSourceRecord[]; total: number }> {
    let request = SupabaseDB.getAdminClient()
      .from("expense_requests")
      .select(`
        id,
        project_id,
        title,
        total_amount,
        amount,
        status,
        updated_at,
        completed_at,
        approved_at,
        project:projects(id, name)
      `, { count: "exact" })
      .eq("tenant_id", input.tenantId)
      .gte("updated_at", input.baselineAt)
      .order("updated_at", { ascending: false });

    if (input.projectId) {
      request = request.eq("project_id", input.projectId);
    }

    const { data, error, count } = await request.range(
      0,
      Math.max(input.candidateLimit, 1) - 1,
    );
    if (error) throw Errors.dbError("查询月度差异费用申请来源失败", error);

    return {
      list: ((data as unknown as ExpenseRequestDbRow[] | null) || [])
        .filter((row) => isExpenseInMonth(row, input))
        .map((row) => {
          const project = firstRelation(row.project);
          return {
            id: `expense_request:${row.id}`,
            source_type: "expense_request",
            source_label: "费用申请",
            source_id: row.id,
            occurred_at: row.updated_at ??
              row.completed_at ??
              row.approved_at ??
              input.baselineAt,
            project_id: row.project_id,
            project_name: project?.name ?? null,
            amount: normalizeMoney(row.total_amount ?? row.amount),
            direction: "out",
            description: `费用申请：${row.title || "未命名费用"}`,
            target: {
              label: "查看费用申请",
              href: `/expenses?expense_request_id=${row.id}`,
            },
          };
        }),
      total: count || 0,
    };
  }

  private async listReceivableCorrectionEventSources(
    input: FinanceMonthlyDifferenceSourceListInput,
  ) {
    let request = SupabaseDB.getAdminClient()
      .from("project_receivable_events")
      .select(`
        id,
        project_id,
        event_type,
        title,
        note,
        created_at,
        project:projects(id, name)
      `, { count: "exact" })
      .eq("tenant_id", input.tenantId)
      .in("event_type", [
        "allocate_payment",
        "adjust_allocation",
        "reverse_allocation",
      ])
      .gte("created_at", input.baselineAt)
      .order("created_at", { ascending: false });

    if (input.projectId) {
      request = request.eq("project_id", input.projectId);
    }

    const { data, error, count } = await request.range(
      0,
      Math.max(input.candidateLimit, 1) - 1,
    );
    if (error) throw Errors.dbError("查询月度差异应收修正审计失败", error);

    return {
      list: ((data as unknown as CorrectionAuditDbRow[] | null) || []).map(
        (row) => mapCorrectionAuditRow(row, input.month, input.baselineAt),
      ),
      total: count || 0,
    };
  }

  private async listReconciliationActionSources(
    input: FinanceMonthlyDifferenceSourceListInput,
  ) {
    let request = SupabaseDB.getAdminClient()
      .from("finance_reconciliation_exception_actions")
      .select(`
        id,
        project_id,
        action,
        remark,
        created_at
      `, { count: "exact" })
      .eq("tenant_id", input.tenantId)
      .gte("created_at", input.baselineAt)
      .order("created_at", { ascending: false });

    if (input.projectId) {
      request = request.eq("project_id", input.projectId);
    }

    const { data, error, count } = await request.range(
      0,
      Math.max(input.candidateLimit, 1) - 1,
    );
    if (error) throw Errors.dbError("查询月度差异对账修正审计失败", error);

    return {
      list: ((data as unknown as CorrectionAuditDbRow[] | null) || []).map(
        (row) => mapCorrectionAuditRow(row, input.month, input.baselineAt),
      ),
      total: count || 0,
    };
  }
}

function mapCorrectionAuditRow(
  row: CorrectionAuditDbRow,
  month: string,
  baselineAt: string,
): FinanceMonthlyDifferenceSourceRecord {
  const project = firstRelation(row.project);
  const href = new URLSearchParams();
  href.set("month", month);
  if (row.project_id) href.set("project_id", row.project_id);

  return {
    id: `correction_audit:${row.id}`,
    source_type: "correction_audit",
    source_label: "修正审计",
    source_id: row.id,
    occurred_at: row.created_at ?? row.occurred_at ?? baselineAt,
    project_id: row.project_id,
    project_name: project?.name ?? null,
    amount: normalizeMoney(row.amount),
    direction: null,
    description: row.title || row.note || "财务修正审计",
    target: {
      label: "查看修正审计",
      href: `/finance/audits?${href}`,
    },
  };
}

function firstRelation<T>(value: MaybeArray<T> | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function normalizeMoney(value: unknown): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function normalizeDirection(
  value: unknown,
): FinanceMonthlyDifferenceSourceDirection | null {
  return value === "in" || value === "out" ? value : null;
}

function ledgerDescription(entryType: string | null) {
  if (entryType === "project_payment") return "项目收款入账";
  if (entryType === "expense_settlement") return "费用支出入账";
  return "财务台账变更";
}

function isExpenseInMonth(
  row: ExpenseRequestDbRow,
  input: FinanceMonthlyDifferenceSourceListInput,
) {
  const completedAt = row.completed_at?.slice(0, 10);
  const approvedAt = row.approved_at?.slice(0, 10);
  if (!completedAt && !approvedAt) return true;
  return [completedAt, approvedAt].some((date) =>
    Boolean(date && date >= input.dateFrom && date <= input.dateTo)
  );
}

export const financeMonthlyDifferenceSourcesRepository =
  new FinanceMonthlyDifferenceSourcesRepository();
