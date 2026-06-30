import type { FinanceMonthlyOverview } from "@/services/finance-monthly-overview";

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type FinanceReceivableAgingBucket = {
  key: "not_due" | "overdue_1_7" | "overdue_8_30" | "overdue_31_60" | "overdue_60_plus";
  label: string;
  amount: number;
  count: number;
};

export function createAgingBuckets(): FinanceReceivableAgingBucket[] {
  return [
    { key: "not_due", label: "未到期", amount: 0, count: 0 },
    { key: "overdue_1_7", label: "逾期 1-7 天", amount: 0, count: 0 },
    { key: "overdue_8_30", label: "逾期 8-30 天", amount: 0, count: 0 },
    { key: "overdue_31_60", label: "逾期 31-60 天", amount: 0, count: 0 },
    { key: "overdue_60_plus", label: "逾期 60 天以上", amount: 0, count: 0 },
  ];
}

export function agingBucketKey(days: number): FinanceReceivableAgingBucket["key"] {
  if (days <= 0) return "not_due";
  if (days <= 7) return "overdue_1_7";
  if (days <= 30) return "overdue_8_30";
  if (days <= 60) return "overdue_31_60";
  return "overdue_60_plus";
}

export function buildMonthlyOverviewCsv(overview: FinanceMonthlyOverview) {
  const rows = [
    [
      "月份",
      "结账状态",
      "本月收入",
      "本月支出",
      "毛利",
      "毛利率",
      "应收总额",
      "已收总额",
      "未收总额",
      "逾期应收",
      "对账异常数",
      "未归集支出",
    ],
    [
      overview.scope.month,
      closingStatusLabel(overview.closing.status),
      overview.summary.income_amount,
      overview.summary.expense_amount,
      overview.summary.gross_profit_amount,
      overview.summary.gross_profit_rate,
      overview.summary.receivable_amount,
      overview.summary.received_amount,
      overview.summary.receivable_remaining_amount,
      overview.summary.overdue_receivable_amount,
      overview.summary.reconciliation_exception_count,
      overview.summary.unallocated_expense_amount,
    ],
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

export function compareBy<T extends Record<string, unknown>>(
  key: keyof T | string,
  order: "asc" | "desc",
) {
  return (left: T, right: T) => {
    const leftValue = Number(left[key as keyof T] ?? 0);
    const rightValue = Number(right[key as keyof T] ?? 0);
    const result = leftValue === rightValue
      ? String(left[Object.keys(left)[0] as keyof T] ?? "").localeCompare(
        String(right[Object.keys(right)[0] as keyof T] ?? ""),
      )
      : leftValue - rightValue;
    return order === "asc" ? result : -result;
  };
}

export function paginate<T>(items: T[], query: { page: number; pageSize: number }) {
  const total = items.length;
  const from = (query.page - 1) * query.pageSize;
  return {
    items: items.slice(from, from + query.pageSize),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total ? Math.ceil(total / query.pageSize) : 0,
    } satisfies Pagination,
  };
}

export function daysBetween(dateFrom: string, dateTo: string) {
  const from = Date.parse(`${dateFrom}T00:00:00.000Z`);
  const to = Date.parse(`${dateTo}T00:00:00.000Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.floor((to - from) / 86_400_000);
}

export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return toDateOnly(value);
}

export function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function roundRate(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function closingStatusLabel(status: FinanceMonthlyOverview["closing"]["status"]) {
  const labels: Record<string, string> = {
    not_started: "未结账",
    draft: "草稿",
    closed: "已结账",
    reopened: "已反结账",
  };
  return labels[status] || status;
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}
