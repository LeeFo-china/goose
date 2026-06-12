import {
  EXPENSE_MODE_VALUES,
  EXPENSE_STATUS_VALUES,
  ExpenseModeConfig,
  ExpenseStatusConfig,
} from "@gooes/domain";
import { type ExpenseRecord } from "@/components/expenses/expense-mutations";
import { requestBackendJson } from "@/lib/backend-client";

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ExpenseListData = {
  list: ExpenseRecord[];
  pagination: Pagination;
};

export type InitialExpenseData = ExpenseListData & {
  error: string | null;
};

export type ExpenseFiltersState = {
  status: string;
  mode: string;
  keyword: string;
  createdFrom: string;
  createdTo: string;
};

export const EXPENSE_PAGE_SIZE = 20;

export const statusOptions = [
  ["", "全部状态"],
  ...EXPENSE_STATUS_VALUES.map((value) => [
    value,
    ExpenseStatusConfig[value].label,
  ] as const),
] as const;

export const modeOptions = [
  ["", "全部模式"],
  ...EXPENSE_MODE_VALUES.map((value) => [
    value,
    ExpenseModeConfig[value].label,
  ] as const),
] as const;

export function formatMoney(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  return amount.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function dateStartToIso(value: string) {
  return value ? new Date(`${value}T00:00:00`).toISOString() : "";
}

function dateEndToIso(value: string) {
  return value ? new Date(`${value}T23:59:59.999`).toISOString() : "";
}

export function toDateInputValue(value: string) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export async function fetchExpenses(filters: ExpenseFiltersState, page: number) {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(EXPENSE_PAGE_SIZE),
  });

  if (filters.status) query.set("status", filters.status);
  if (filters.mode) query.set("mode", filters.mode);
  if (filters.keyword.trim()) query.set("keyword", filters.keyword.trim());
  if (filters.createdFrom) query.set("created_from", dateStartToIso(filters.createdFrom));
  if (filters.createdTo) query.set("created_to", dateEndToIso(filters.createdTo));

  return requestBackendJson<ExpenseListData>(`/expense-requests?${query.toString()}`, {
    cache: "no-store",
    fallbackMessage: "费用申请列表加载失败",
  });
}

export function summarizeExpensePage(expenses: ExpenseRecord[]) {
  return {
    pendingCount: expenses.filter((item) => item.status === "pending").length,
    paymentCount: expenses.filter((item) =>
      item.workflow_state?.current_node_key === "payment"
    ).length,
    totalAmount: expenses.reduce((sum, item) => sum + Number(item.total_amount || 0), 0),
  };
}

export function emptyExpenseFilters(): ExpenseFiltersState {
  return {
    status: "",
    mode: "",
    keyword: "",
    createdFrom: "",
    createdTo: "",
  };
}
