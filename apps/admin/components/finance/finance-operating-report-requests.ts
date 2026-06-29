import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";
import {
  buildFinanceOperatingReportSearchParams,
  type FinanceOperatingReportGroupBy,
} from "./finance-operating-report-utils";

export type FinanceOperatingReportSummary = {
  received_amount: number;
  expense_amount: number;
  actual_profit_amount: number;
  overdue_amount: number;
  receivable_remaining_amount: number;
  unallocated_expense_amount: number;
};

export type FinanceOperatingReportGroup = FinanceOperatingReportSummary & {
  key: string;
  label: string;
};

export type FinanceOperatingReportData = {
  summary: FinanceOperatingReportSummary;
  groups: FinanceOperatingReportGroup[];
  scope: {
    date_from: string;
    date_to: string;
    group_by: FinanceOperatingReportGroupBy;
    source_limit: number;
    truncated: boolean;
  };
};

export type FinanceOperatingReportResult = FinanceOperatingReportData & {
  error: string | null;
};

export function emptyFinanceOperatingReport(): FinanceOperatingReportResult {
  return {
    summary: {
      received_amount: 0,
      expense_amount: 0,
      actual_profit_amount: 0,
      overdue_amount: 0,
      receivable_remaining_amount: 0,
      unallocated_expense_amount: 0,
    },
    groups: [],
    scope: {
      date_from: "",
      date_to: "",
      group_by: "month",
      source_limit: 0,
      truncated: false,
    },
    error: null,
  };
}

export async function fetchFinanceOperatingReport(query: {
  date_from?: string;
  date_to?: string;
  group_by?: string;
  project_id?: string;
  project_status?: string;
}): Promise<FinanceOperatingReportResult> {
  const token = await getAdminToken();
  if (!token) {
    return {
      ...emptyFinanceOperatingReport(),
      error: "缺少登录凭证",
    };
  }

  const params = buildFinanceOperatingReportSearchParams(query);
  try {
    const response = await fetch(
      buildBackendUrl(`/finance/reports/operating?${params}`),
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );
    const payload = await parseBackendJson<FinanceOperatingReportData>(response);
    return {
      ...(payload.data || emptyFinanceOperatingReport()),
      error: null,
    };
  } catch (error) {
    return {
      ...emptyFinanceOperatingReport(),
      error: error instanceof Error ? error.message : "财务运营报表加载失败",
    };
  }
}
