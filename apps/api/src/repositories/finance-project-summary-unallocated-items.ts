import { Errors } from "@/errors/error-factory";
import { normalizeMoney } from "@/repositories/finance-project-summary-helpers";
import { SupabaseDB } from "@/utils/supabase/index";

export type FinanceProjectUnallocatedExpenseItem = {
  id: string;
  amount: number;
  occurred_at: string | null;
  summary: string | null;
  request_title: string | null;
  expense_category: string | null;
  applicant_name: string | null;
  applicant_phone: string | null;
  request_time: string | null;
  request_no: string | null;
};

type MaybeArray<T> = T | T[];

type FinanceProjectUnallocatedExpenseItemRow = {
  id: string;
  project_id: string | null;
  amount: number | string | null;
  occurred_at: string | null;
  summary: string | null;
  expense_request: MaybeArray<{
    title: string | null;
    category: string | null;
    request_no: string | null;
    submitted_at: string | null;
    created_at: string | null;
    cost_category: MaybeArray<{ name: string | null }> | null;
    employee: MaybeArray<{
      name: string | null;
      phone: string | null;
    }> | null;
  }> | null;
};

function firstRelation<T>(value: MaybeArray<T> | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function listFinanceProjectUnallocatedExpenseItems(input: {
  tenantId: string;
  projectIds: string[];
  limitPerProject: number;
}): Promise<Map<string, FinanceProjectUnallocatedExpenseItem[]>> {
  if (input.projectIds.length === 0) return new Map();

  const limitPerProject = Math.min(Math.max(input.limitPerProject, 1), 5);
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("finance_ledger_entries")
    .select(`
      id,
      project_id,
      amount,
      occurred_at,
      summary,
      expense_request:expense_requests!finance_ledger_entries_expense_request_id_fkey(
        title,
        category,
        request_no,
        submitted_at,
        created_at,
        cost_category:finance_cost_categories!expense_requests_cost_category_id_fkey(name),
        employee:employees!expense_requests_employee_id_fkey(name, phone)
      )
    `)
    .eq("tenant_id", input.tenantId)
    .eq("direction", "out")
    .neq("entry_type", "supplier_payment")
    .is("cost_category_id", null)
    .in("project_id", input.projectIds)
    .order("occurred_at", { ascending: false })
    .limit(input.projectIds.length * limitPerProject);

  if (error) {
    throw Errors.dbError("查询未归集费用预览失败", error);
  }

  const result = new Map<string, FinanceProjectUnallocatedExpenseItem[]>();
  for (const row of ((data as unknown as FinanceProjectUnallocatedExpenseItemRow[] | null) ||
    [])) {
    if (!row.project_id) continue;
    const current = result.get(row.project_id) || [];
    if (current.length >= limitPerProject) continue;
    const expenseRequest = firstRelation(row.expense_request);
    const costCategory = firstRelation(expenseRequest?.cost_category);
    const employee = firstRelation(expenseRequest?.employee);
    current.push({
      id: row.id,
      amount: normalizeMoney(row.amount),
      occurred_at: row.occurred_at,
      summary: row.summary,
      request_title: expenseRequest?.title ?? null,
      expense_category: expenseRequest?.category || costCategory?.name || null,
      applicant_name: employee?.name ?? null,
      applicant_phone: employee?.phone ?? null,
      request_time: expenseRequest?.submitted_at ||
        expenseRequest?.created_at ||
        row.occurred_at,
      request_no: expenseRequest?.request_no ?? null,
    });
    result.set(row.project_id, current);
  }

  return result;
}
