import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase/index";

export type ExpenseSettlementContext = {
  settlement: {
    id: string;
    expense_request_id: string;
    payee_name: string;
    method: string;
    paid_amount: number;
    paid_at: string;
    paid_by: string | null;
    remark: string | null;
  };
  expense_request: {
    id: string;
    title: string | null;
    project_id: string | null;
    project_name: string | null;
    cost_category_id: string | null;
    total_amount: number;
  };
  ledgers: ExpenseLedgerContext["ledger"][];
};

export type ExpenseLedgerContext = {
  ledger: {
    id: string;
    project_id: string | null;
    project_name: string | null;
    cost_category_id: string | null;
    amount: number;
    occurred_at: string | null;
    expense_request_id: string | null;
    expense_settlement_id: string | null;
  };
  expense_request: ExpenseSettlementContext["expense_request"] | null;
  settlement: {
    id: string;
    paid_amount: number;
    paid_at: string | null;
  } | null;
};

type ProjectRelation = {
  id: string;
  name: string | null;
};

type ExpenseRequestRelation = {
  id: string;
  title: string | null;
  project_id: string | null;
  cost_category_id: string | null;
  total_amount: number | string | null;
  project?: ProjectRelation | ProjectRelation[] | null;
};

type ExpenseSettlementDbRow = {
  id: string;
  expense_request_id: string;
  payee_name: string;
  method: string;
  paid_amount: number | string | null;
  paid_at: string;
  paid_by: string | null;
  remark: string | null;
  expense_request?: ExpenseRequestRelation | ExpenseRequestRelation[] | null;
};

type ExpenseLedgerDbRow = {
  id: string;
  project_id: string | null;
  cost_category_id: string | null;
  amount: number | string | null;
  occurred_at: string | null;
  expense_request_id: string | null;
  expense_settlement_id: string | null;
  project?: ProjectRelation | ProjectRelation[] | null;
  expense_request?: ExpenseRequestRelation | ExpenseRequestRelation[] | null;
  settlement?: {
    id: string;
    paid_amount: number | string | null;
    paid_at: string | null;
  } | Array<{
    id: string;
    paid_amount: number | string | null;
    paid_at: string | null;
  }> | null;
};

class FinanceReconciliationCorrectionsRepository {
  async getExpenseSettlementContext(input: {
    tenantId: string;
    settlementId: string;
  }): Promise<ExpenseSettlementContext | null> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("expense_request_settlements")
      .select(`
        id,
        expense_request_id,
        payee_name,
        method,
        paid_amount,
        paid_at,
        paid_by,
        remark,
        expense_request:expense_requests!expense_request_settlements_expense_request_id_fkey!inner(
          id,
          title,
          project_id,
          cost_category_id,
          total_amount,
          project:projects(id, name)
        )
      `)
      .eq("tenant_id", input.tenantId)
      .eq("id", input.settlementId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询费用打款上下文失败", error);
    }
    if (!data) return null;

    const row = data as unknown as ExpenseSettlementDbRow;
    const expenseRequest = relationOne(row.expense_request);
    if (!expenseRequest) return null;

    const ledgers = await this.listExpenseLedgersBySettlement({
      tenantId: input.tenantId,
      settlementId: row.id,
    });

    return {
      settlement: {
        id: row.id,
        expense_request_id: row.expense_request_id,
        payee_name: row.payee_name,
        method: row.method,
        paid_amount: normalizeMoney(row.paid_amount),
        paid_at: row.paid_at,
        paid_by: row.paid_by,
        remark: row.remark,
      },
      expense_request: normalizeExpenseRequest(expenseRequest),
      ledgers: ledgers.map((item) => item.ledger),
    };
  }

  async getExpenseLedgerContext(input: {
    tenantId: string;
    ledgerId: string;
  }): Promise<ExpenseLedgerContext | null> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("finance_ledger_entries")
      .select(`
        id,
        project_id,
        cost_category_id,
        amount,
        occurred_at,
        expense_request_id,
        expense_settlement_id,
        project:projects(id, name),
        expense_request:expense_requests!finance_ledger_entries_expense_request_id_fkey(
          id,
          title,
          project_id,
          cost_category_id,
          total_amount,
          project:projects(id, name)
        ),
        settlement:expense_request_settlements!finance_ledger_entries_expense_settlement_id_fkey(
          id,
          paid_amount,
          paid_at
        )
      `)
      .eq("tenant_id", input.tenantId)
      .eq("id", input.ledgerId)
      .eq("direction", "out")
      .eq("entry_type", "expense_settlement")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询费用支出台账上下文失败", error);
    }
    if (!data) return null;

    return normalizeExpenseLedger(data as unknown as ExpenseLedgerDbRow);
  }

  private async listExpenseLedgersBySettlement(input: {
    tenantId: string;
    settlementId: string;
  }): Promise<ExpenseLedgerContext[]> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("finance_ledger_entries")
      .select(`
        id,
        project_id,
        cost_category_id,
        amount,
        occurred_at,
        expense_request_id,
        expense_settlement_id,
        project:projects(id, name)
      `)
      .eq("tenant_id", input.tenantId)
      .eq("direction", "out")
      .eq("entry_type", "expense_settlement")
      .eq("expense_settlement_id", input.settlementId)
      .order("occurred_at", { ascending: false })
      .limit(20);

    if (error) {
      throw Errors.dbError("查询费用打款支出台账失败", error);
    }

    return ((data || []) as unknown as ExpenseLedgerDbRow[])
      .map(normalizeExpenseLedger);
  }
}

function normalizeExpenseLedger(row: ExpenseLedgerDbRow): ExpenseLedgerContext {
  const project = relationOne(row.project);
  const expenseRequest = relationOne(row.expense_request);
  const settlement = relationOne(row.settlement);
  return {
    ledger: {
      id: row.id,
      project_id: row.project_id,
      project_name: project?.name ?? null,
      cost_category_id: row.cost_category_id,
      amount: normalizeMoney(row.amount),
      occurred_at: row.occurred_at,
      expense_request_id: row.expense_request_id,
      expense_settlement_id: row.expense_settlement_id,
    },
    expense_request: expenseRequest ? normalizeExpenseRequest(expenseRequest) : null,
    settlement: settlement
      ? {
        id: settlement.id,
        paid_amount: normalizeMoney(settlement.paid_amount),
        paid_at: settlement.paid_at,
      }
      : null,
  };
}

function normalizeExpenseRequest(
  row: ExpenseRequestRelation,
): ExpenseSettlementContext["expense_request"] {
  return {
    id: row.id,
    title: row.title,
    project_id: row.project_id,
    project_name: relationOne(row.project)?.name ?? null,
    cost_category_id: row.cost_category_id,
    total_amount: normalizeMoney(row.total_amount),
  };
}

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function normalizeMoney(value: unknown): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

export const financeReconciliationCorrectionsRepository =
  new FinanceReconciliationCorrectionsRepository();
