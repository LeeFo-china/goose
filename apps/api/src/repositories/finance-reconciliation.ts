import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase/index";

const DEFAULT_SOURCE_LIMIT = 5_000;

export type FinanceReconciliationReceivableRow = {
  id: string;
  project_id: string;
  project_name: string | null;
  title: string | null;
  amount: number;
  paid_amount: number;
  due_date: string | null;
  status: string | null;
  allocation_amount: number;
};

export type FinanceReconciliationPaymentRow = {
  id: string;
  project_id: string | null;
  project_name: string | null;
  amount: number;
  status: string | null;
  pay_date: string | null;
  created_at: string | null;
  allocation_amount: number;
  ledger_amount: number;
};

export type FinanceReconciliationLedgerRow = {
  id: string;
  project_id: string | null;
  project_name: string | null;
  amount: number;
  occurred_at: string | null;
  payment_id: string | null;
};

export type FinanceReconciliationCandidateRows = {
  receivables: FinanceReconciliationReceivableRow[];
  payments: FinanceReconciliationPaymentRow[];
  ledgers: FinanceReconciliationLedgerRow[];
};

type CandidateQueryInput = {
  tenantId: string;
  dateFrom: string;
  dateTo: string;
  projectId?: string;
  sourceLimit?: number;
};

type ProjectRelation = {
  id: string;
  name: string | null;
  tenant_id?: string | null;
};

type ReceivableDbRow = {
  id: string;
  project_id: string;
  title: string | null;
  amount: number | string | null;
  paid_amount: number | string | null;
  due_date: string | null;
  status: string | null;
  project?: ProjectRelation | null;
};

type PaymentDbRow = {
  id: string;
  project_id: string | null;
  amount: number | string | null;
  status: string | null;
  pay_date: string | null;
  created_at: string | null;
  project?: ProjectRelation | null;
};

type LedgerDbRow = {
  id: string;
  project_id: string | null;
  amount: number | string | null;
  occurred_at: string | null;
  payment_id: string | null;
  project?: ProjectRelation | null;
};

type AllocationDbRow = {
  receivable_plan_id: string | null;
  payment_id: string | null;
  amount: number | string | null;
};

type PaymentAmountDbRow = {
  payment_id: string | null;
  amount: number | string | null;
};

class FinanceReconciliationRepository {
  async listCandidateRows(
    input: CandidateQueryInput,
  ): Promise<FinanceReconciliationCandidateRows> {
    const sourceLimit = input.sourceLimit ?? DEFAULT_SOURCE_LIMIT;
    const [receivableRows, paymentRows, ledgerRows] = await Promise.all([
      this.listReceivableRows(input, sourceLimit),
      this.listPaymentRows(input, sourceLimit),
      this.listLedgerRows(input, sourceLimit),
    ]);
    const [allocationsByPayment, allocationsByReceivable, ledgerByPayment] =
      await Promise.all([
        this.sumAllocationsByPayment({
          tenantId: input.tenantId,
          paymentIds: paymentRows.map((item) => item.id),
          sourceLimit,
        }),
        this.sumAllocationsByReceivable({
          tenantId: input.tenantId,
          receivableIds: receivableRows.map((item) => item.id),
          sourceLimit,
        }),
        this.sumLedgersByPayment({
          tenantId: input.tenantId,
          paymentIds: paymentRows.map((item) => item.id),
          sourceLimit,
        }),
      ]);

    return {
      receivables: receivableRows.map((row) => ({
        id: row.id,
        project_id: row.project_id,
        project_name: row.project?.name ?? null,
        title: row.title,
        amount: normalizeMoney(row.amount),
        paid_amount: normalizeMoney(row.paid_amount),
        due_date: row.due_date,
        status: row.status,
        allocation_amount: allocationsByReceivable.get(row.id) ?? 0,
      })),
      payments: paymentRows.map((row) => ({
        id: row.id,
        project_id: row.project_id,
        project_name: row.project?.name ?? null,
        amount: normalizeMoney(row.amount),
        status: row.status,
        pay_date: row.pay_date,
        created_at: row.created_at,
        allocation_amount: allocationsByPayment.get(row.id) ?? 0,
        ledger_amount: ledgerByPayment.get(row.id) ?? 0,
      })),
      ledgers: ledgerRows.map((row) => ({
        id: row.id,
        project_id: row.project_id,
        project_name: row.project?.name ?? null,
        amount: normalizeMoney(row.amount),
        occurred_at: row.occurred_at,
        payment_id: row.payment_id,
      })),
    };
  }

  private async listReceivableRows(
    input: CandidateQueryInput,
    sourceLimit: number,
  ): Promise<ReceivableDbRow[]> {
    let query = SupabaseDB.getAdminClient()
      .from("project_receivable_plans")
      .select(`
        id,
        project_id,
        title,
        amount,
        paid_amount,
        due_date,
        status,
        project:projects(id, name)
      `)
      .eq("tenant_id", input.tenantId)
      .gte("due_date", input.dateFrom)
      .lte("due_date", input.dateTo)
      .order("due_date", { ascending: false })
      .limit(sourceLimit);

    if (input.projectId) {
      query = query.eq("project_id", input.projectId);
    }

    const { data, error } = await query;
    if (error) {
      throw Errors.dbError("查询应收对账候选数据失败", error);
    }
    return (data || []) as unknown as ReceivableDbRow[];
  }

  private async listPaymentRows(
    input: CandidateQueryInput,
    sourceLimit: number,
  ): Promise<PaymentDbRow[]> {
    let query = SupabaseDB.getAdminClient()
      .from("payments")
      .select(`
        id,
        project_id,
        amount,
        status,
        pay_date,
        created_at,
        project:projects!inner(id, name, tenant_id)
      `)
      .eq("status", "confirmed")
      .eq("project.tenant_id", input.tenantId)
      .gte("pay_date", `${input.dateFrom}T00:00:00.000Z`)
      .lte("pay_date", `${input.dateTo}T23:59:59.999Z`)
      .order("pay_date", { ascending: false })
      .limit(sourceLimit);

    if (input.projectId) {
      query = query.eq("project_id", input.projectId);
    }

    const { data, error } = await query;
    if (error) {
      throw Errors.dbError("查询收款对账候选数据失败", error);
    }
    return (data || []) as unknown as PaymentDbRow[];
  }

  private async listLedgerRows(
    input: CandidateQueryInput,
    sourceLimit: number,
  ): Promise<LedgerDbRow[]> {
    let query = SupabaseDB.getAdminClient()
      .from("finance_ledger_entries")
      .select(`
        id,
        project_id,
        amount,
        occurred_at,
        payment_id,
        project:projects(id, name)
      `)
      .eq("tenant_id", input.tenantId)
      .eq("direction", "in")
      .eq("entry_type", "project_payment")
      .gte("occurred_at", `${input.dateFrom}T00:00:00.000Z`)
      .lte("occurred_at", `${input.dateTo}T23:59:59.999Z`)
      .order("occurred_at", { ascending: false })
      .limit(sourceLimit);

    if (input.projectId) {
      query = query.eq("project_id", input.projectId);
    }

    const { data, error } = await query;
    if (error) {
      throw Errors.dbError("查询台账对账候选数据失败", error);
    }
    return (data || []) as unknown as LedgerDbRow[];
  }

  private async sumAllocationsByPayment(input: {
    tenantId: string;
    paymentIds: string[];
    sourceLimit: number;
  }): Promise<Map<string, number>> {
    if (input.paymentIds.length === 0) return new Map();
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_receivable_allocations")
      .select("payment_id, receivable_plan_id, amount")
      .eq("tenant_id", input.tenantId)
      .in("payment_id", input.paymentIds)
      .limit(input.sourceLimit);

    if (error) {
      throw Errors.dbError("查询收款核销金额失败", error);
    }

    return sumByKey(data as AllocationDbRow[] | null, "payment_id");
  }

  private async sumAllocationsByReceivable(input: {
    tenantId: string;
    receivableIds: string[];
    sourceLimit: number;
  }): Promise<Map<string, number>> {
    if (input.receivableIds.length === 0) return new Map();
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_receivable_allocations")
      .select("payment_id, receivable_plan_id, amount")
      .eq("tenant_id", input.tenantId)
      .in("receivable_plan_id", input.receivableIds)
      .limit(input.sourceLimit);

    if (error) {
      throw Errors.dbError("查询应收核销金额失败", error);
    }

    return sumByKey(data as AllocationDbRow[] | null, "receivable_plan_id");
  }

  private async sumLedgersByPayment(input: {
    tenantId: string;
    paymentIds: string[];
    sourceLimit: number;
  }): Promise<Map<string, number>> {
    if (input.paymentIds.length === 0) return new Map();
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("finance_ledger_entries")
      .select("payment_id, amount")
      .eq("tenant_id", input.tenantId)
      .eq("direction", "in")
      .eq("entry_type", "project_payment")
      .in("payment_id", input.paymentIds)
      .limit(input.sourceLimit);

    if (error) {
      throw Errors.dbError("查询收款入账金额失败", error);
    }

    return sumByKey(data as PaymentAmountDbRow[] | null, "payment_id");
  }
}

function sumByKey<T extends {
  amount: number | string | null;
} & Record<K, string | null>, K extends "payment_id" | "receivable_plan_id">(
  rows: T[] | null,
  key: K,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const row of rows || []) {
    const id = row[key];
    if (!id) continue;
    result.set(id, (result.get(id) ?? 0) + normalizeMoney(row.amount));
  }
  return result;
}

function normalizeMoney(value: unknown): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

export const financeReconciliationRepository =
  new FinanceReconciliationRepository();
