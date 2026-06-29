import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase/index";

export type FinanceReconciliationProjectTotals = {
  project_id: string;
  receivable_amount: number;
  received_amount: number;
  allocated_amount: number;
  ledger_income_amount: number;
  expense_paid_amount: number;
  ledger_expense_amount: number;
};

type AmountDbRow = {
  amount: number | string | null;
};

export async function getFinanceReconciliationProjectTotals(input: {
  tenantId: string;
  projectId: string;
}): Promise<FinanceReconciliationProjectTotals | null> {
  const project = await findTenantProject(input);
  if (!project) {
    return null;
  }

  const [
    receivableAmount,
    receivedAmount,
    allocatedAmount,
    ledgerIncomeAmount,
    expensePaidAmount,
    ledgerExpenseAmount,
  ] = await Promise.all([
    sumProjectReceivables(input),
    sumProjectPayments(input),
    sumProjectAllocations(input),
    sumProjectLedger(input, "in"),
    sumProjectExpenseSettlements(input),
    sumProjectLedger(input, "out"),
  ]);

  return {
    project_id: input.projectId,
    receivable_amount: receivableAmount,
    received_amount: receivedAmount,
    allocated_amount: allocatedAmount,
    ledger_income_amount: ledgerIncomeAmount,
    expense_paid_amount: expensePaidAmount,
    ledger_expense_amount: ledgerExpenseAmount,
  };
}

async function findTenantProject(input: {
  tenantId: string;
  projectId: string;
}): Promise<{ id: string } | null> {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("projects")
    .select("id")
    .eq("tenant_id", input.tenantId)
    .eq("id", input.projectId)
    .maybeSingle();

  if (error) {
    throw Errors.dbError("查询项目对账归属失败", error);
  }
  return (data as { id: string } | null) ?? null;
}

async function sumProjectReceivables(input: {
  tenantId: string;
  projectId: string;
}): Promise<number> {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("project_receivable_plans")
    .select("amount")
    .eq("tenant_id", input.tenantId)
    .eq("project_id", input.projectId)
    .neq("status", "canceled");

  if (error) {
    throw Errors.dbError("查询项目应收金额失败", error);
  }
  return sumAmounts(data as AmountDbRow[] | null);
}

async function sumProjectPayments(input: {
  tenantId: string;
  projectId: string;
}): Promise<number> {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("payments")
    .select(`
      amount,
      project:projects!inner(tenant_id)
    `)
    .eq("status", "confirmed")
    .eq("project_id", input.projectId)
    .eq("project.tenant_id", input.tenantId);

  if (error) {
    throw Errors.dbError("查询项目确认收款金额失败", error);
  }
  return sumAmounts(data as AmountDbRow[] | null);
}

async function sumProjectAllocations(input: {
  tenantId: string;
  projectId: string;
}): Promise<number> {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("project_receivable_allocations")
    .select("amount")
    .eq("tenant_id", input.tenantId)
    .eq("project_id", input.projectId);

  if (error) {
    throw Errors.dbError("查询项目核销金额失败", error);
  }
  return sumAmounts(data as AmountDbRow[] | null);
}

async function sumProjectLedger(
  input: {
    tenantId: string;
    projectId: string;
  },
  direction: "in" | "out",
): Promise<number> {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("finance_ledger_entries")
    .select("amount")
    .eq("tenant_id", input.tenantId)
    .eq("project_id", input.projectId)
    .eq("direction", direction);

  if (error) {
    throw Errors.dbError("查询项目台账金额失败", error);
  }
  return sumAmounts(data as AmountDbRow[] | null);
}

async function sumProjectExpenseSettlements(input: {
  tenantId: string;
  projectId: string;
}): Promise<number> {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("expense_request_settlements")
    .select(`
      paid_amount,
      expense_request:expense_requests!expense_request_settlements_expense_request_id_fkey!inner(
        project_id,
        tenant_id
      )
    `)
    .eq("tenant_id", input.tenantId)
    .eq("expense_request.tenant_id", input.tenantId)
    .eq("expense_request.project_id", input.projectId);

  if (error) {
    throw Errors.dbError("查询项目费用打款金额失败", error);
  }
  return sumAmounts(
    data as Array<{ paid_amount: number | string | null }> | null,
    "paid_amount",
  );
}

function sumAmounts<T extends Record<K, unknown>, K extends string = "amount">(
  rows: T[] | null,
  key: K = "amount" as K,
) {
  return roundMoney((rows || []).reduce((sum, row) =>
    sum + normalizeMoney(row[key]), 0
  ));
}

function normalizeMoney(value: unknown): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
