import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase/index";
import {
  addMoneyCents,
  moneyCentsToSafeNumber,
} from "@/utils/fixed-point-money";

const MAX_TREND_PROJECTS = 100;
const MAX_TREND_ROWS = 10_000;

export type FinanceProjectLedgerTrendPoint = {
  date: string;
  income_amount: number;
  expense_amount: number;
  supplier_cash_paid_amount: number;
};

type TrendDbRow = {
  id: string;
  project_id: string | null;
  direction: string | null;
  entry_type: string | null;
  amount: number | string | null;
  occurred_at: string | null;
  created_at: string;
};

type TrendCentsPoint = {
  date: string;
  incomeCents: bigint;
  expenseCents: bigint;
  supplierCashCents: bigint;
};

export async function listFinanceProjectLedgerTrend(input: {
  tenantId: string;
  projectIds: string[];
  dateFrom: string;
}): Promise<FinanceProjectLedgerTrendPoint[]> {
  const projectIds = [...new Set(input.projectIds)];
  if (projectIds.length === 0) return [];
  if (projectIds.length > MAX_TREND_PROJECTS) {
    throw Errors.badRequest("项目财务趋势批量范围不能超过 100 个项目");
  }

  const rows = await listTrendRows({ ...input, projectIds });
  const byDate = new Map<string, TrendCentsPoint>();
  const context = {
    parseErrorMessage: "解析项目财务趋势失败",
    overflowMessage: "项目财务趋势金额超过安全汇总边界",
    details: rows,
  };
  for (const row of rows) {
    if (!row.project_id || !row.occurred_at) continue;
    const date = row.occurred_at.slice(0, 10);
    const current = byDate.get(date) ?? {
      date,
      incomeCents: BigInt(0),
      expenseCents: BigInt(0),
      supplierCashCents: BigInt(0),
    };
    if (row.direction === "in") {
      current.incomeCents = addMoneyCents(
        current.incomeCents,
        row.amount,
        context,
      );
    } else if (
      row.direction === "out" &&
      row.entry_type === "supplier_payment"
    ) {
      current.supplierCashCents = addMoneyCents(
        current.supplierCashCents,
        row.amount,
        context,
      );
    } else if (row.direction === "out") {
      current.expenseCents = addMoneyCents(
        current.expenseCents,
        row.amount,
        context,
      );
    }
    byDate.set(date, current);
  }

  return [...byDate.values()].map((item) => ({
    date: item.date,
    income_amount: moneyCentsToSafeNumber(item.incomeCents, context),
    expense_amount: moneyCentsToSafeNumber(item.expenseCents, context),
    supplier_cash_paid_amount: moneyCentsToSafeNumber(
      item.supplierCashCents,
      context,
    ),
  })).sort((left, right) => left.date.localeCompare(right.date));
}

async function listTrendRows(input: {
  tenantId: string;
  projectIds: string[];
  dateFrom: string;
}): Promise<TrendDbRow[]> {
  const rows: TrendDbRow[] = [];
  for (let from = 0; from <= MAX_TREND_ROWS; from += 1_000) {
    const to = Math.min(from + 999, MAX_TREND_ROWS);
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("finance_ledger_entries")
      .select("id,project_id,direction,entry_type,amount::text,occurred_at,created_at")
      .eq("tenant_id", input.tenantId)
      .in("project_id", input.projectIds)
      .gte("occurred_at", `${input.dateFrom}T00:00:00`)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw Errors.dbError("查询项目财务趋势失败", error);
    if (!Array.isArray(data)) {
      throw Errors.dbError("解析项目财务趋势失败", data);
    }
    rows.push(...data as unknown as TrendDbRow[]);
    if (rows.length > MAX_TREND_ROWS) {
      throw Errors.business(
        422,
        "项目财务趋势超过单次汇总边界",
        "FINANCE_PROJECT_TREND_TOO_MANY_ROWS",
      );
    }
    if (data.length < to - from + 1) break;
  }
  return rows;
}
