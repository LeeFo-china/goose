import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase/index";

export type FinanceReconciliationExpenseSettlementRow = {
  id: string;
  expense_request_id: string;
  project_id: string | null;
  project_name: string | null;
  title: string | null;
  paid_amount: number;
  paid_at: string | null;
  ledger_amount: number;
};

export type FinanceReconciliationExpenseLedgerRow = {
  id: string;
  expense_request_id: string | null;
  expense_settlement_id: string | null;
  project_id: string | null;
  project_name: string | null;
  amount: number;
  occurred_at: string | null;
  cost_category_id: string | null;
};

type ExpenseCandidateQueryInput = {
  tenantId: string;
  dateFrom: string;
  dateTo: string;
  projectId?: string;
};

type ProjectRelation = {
  id: string;
  name: string | null;
};

type ExpenseRequestRelation = {
  id: string;
  title: string | null;
  project_id: string | null;
  project?: ProjectRelation | null;
};

type ExpenseSettlementDbRow = {
  id: string;
  expense_request_id: string;
  paid_amount: number | string | null;
  paid_at: string | null;
  expense_request?: ExpenseRequestRelation | ExpenseRequestRelation[] | null;
};

type ExpenseLedgerDbRow = {
  id: string;
  project_id: string | null;
  amount: number | string | null;
  occurred_at: string | null;
  expense_request_id: string | null;
  expense_settlement_id: string | null;
  cost_category_id: string | null;
  project?: ProjectRelation | ProjectRelation[] | null;
};

type ExpenseLedgerAmountDbRow = {
  expense_settlement_id: string | null;
  amount: number | string | null;
};

export async function listFinanceReconciliationExpenseRows(
  input: ExpenseCandidateQueryInput,
  sourceLimit: number,
): Promise<{
  expenseSettlements: FinanceReconciliationExpenseSettlementRow[];
  expenseLedgers: FinanceReconciliationExpenseLedgerRow[];
}> {
  const [settlementRows, ledgerRows] = await Promise.all([
    listExpenseSettlementRows(input, sourceLimit),
    listExpenseLedgerRows(input, sourceLimit),
  ]);
  const ledgerBySettlement = await sumLedgersByExpenseSettlement({
    tenantId: input.tenantId,
    settlementIds: settlementRows.map((item) => item.id),
    sourceLimit,
  });

  return {
    expenseSettlements: settlementRows.map((row) => {
      const expenseRequest = relationOne(row.expense_request);
      return {
        id: row.id,
        expense_request_id: row.expense_request_id,
        project_id: expenseRequest?.project_id ?? null,
        project_name: relationOne(expenseRequest?.project)?.name ?? null,
        title: expenseRequest?.title ?? null,
        paid_amount: normalizeMoney(row.paid_amount),
        paid_at: row.paid_at,
        ledger_amount: ledgerBySettlement.get(row.id) ?? 0,
      };
    }),
    expenseLedgers: ledgerRows.map((row) => ({
      id: row.id,
      expense_request_id: row.expense_request_id,
      expense_settlement_id: row.expense_settlement_id,
      project_id: row.project_id,
      project_name: relationOne(row.project)?.name ?? null,
      amount: normalizeMoney(row.amount),
      occurred_at: row.occurred_at,
      cost_category_id: row.cost_category_id,
    })),
  };
}

async function listExpenseSettlementRows(
  input: ExpenseCandidateQueryInput,
  sourceLimit: number,
): Promise<ExpenseSettlementDbRow[]> {
  let query = SupabaseDB.getAdminClient()
    .from("expense_request_settlements")
    .select(`
      id,
      expense_request_id,
      paid_amount,
      paid_at,
      expense_request:expense_requests!expense_request_settlements_expense_request_id_fkey!inner(
        id,
        title,
        project_id,
        tenant_id,
        project:projects(id, name)
      )
    `)
    .eq("tenant_id", input.tenantId)
    .eq("expense_request.tenant_id", input.tenantId)
    .gte("paid_at", `${input.dateFrom}T00:00:00.000Z`)
    .lte("paid_at", `${input.dateTo}T23:59:59.999Z`)
    .order("paid_at", { ascending: false })
    .limit(sourceLimit);

  if (input.projectId) {
    query = query.eq("expense_request.project_id", input.projectId);
  }

  const { data, error } = await query;
  if (error) {
    throw Errors.dbError("查询费用打款对账候选数据失败", error);
  }
  return (data || []) as unknown as ExpenseSettlementDbRow[];
}

async function listExpenseLedgerRows(
  input: ExpenseCandidateQueryInput,
  sourceLimit: number,
): Promise<ExpenseLedgerDbRow[]> {
  let query = SupabaseDB.getAdminClient()
    .from("finance_ledger_entries")
    .select(`
      id,
      project_id,
      amount,
      occurred_at,
      expense_request_id,
      expense_settlement_id,
      cost_category_id,
      project:projects(id, name)
    `)
    .eq("tenant_id", input.tenantId)
    .eq("direction", "out")
    .eq("entry_type", "expense_settlement")
    .gte("occurred_at", `${input.dateFrom}T00:00:00.000Z`)
    .lte("occurred_at", `${input.dateTo}T23:59:59.999Z`)
    .order("occurred_at", { ascending: false })
    .limit(sourceLimit);

  if (input.projectId) {
    query = query.eq("project_id", input.projectId);
  }

  const { data, error } = await query;
  if (error) {
    throw Errors.dbError("查询费用支出台账候选数据失败", error);
  }
  return (data || []) as unknown as ExpenseLedgerDbRow[];
}

async function sumLedgersByExpenseSettlement(input: {
  tenantId: string;
  settlementIds: string[];
  sourceLimit: number;
}): Promise<Map<string, number>> {
  if (input.settlementIds.length === 0) return new Map();
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("finance_ledger_entries")
    .select("expense_settlement_id, amount")
    .eq("tenant_id", input.tenantId)
    .eq("direction", "out")
    .eq("entry_type", "expense_settlement")
    .in("expense_settlement_id", input.settlementIds)
    .limit(input.sourceLimit);

  if (error) {
    throw Errors.dbError("查询费用打款入账金额失败", error);
  }

  return sumByKey(data as ExpenseLedgerAmountDbRow[] | null);
}

function sumByKey(rows: ExpenseLedgerAmountDbRow[] | null): Map<string, number> {
  const result = new Map<string, number>();
  for (const row of rows || []) {
    if (!row.expense_settlement_id) continue;
    result.set(
      row.expense_settlement_id,
      (result.get(row.expense_settlement_id) ?? 0) + normalizeMoney(row.amount),
    );
  }
  return result;
}

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function normalizeMoney(value: unknown): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}
