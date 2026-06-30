import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";
import {
  buildFinanceMonthlyOverviewSearchParams,
  buildFinanceOperatingReportSearchParams,
  type FinanceClosingStatus,
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

export type FinanceMonthlyOverviewSummary = {
  income_amount: number;
  expense_amount: number;
  gross_profit_amount: number;
  gross_profit_rate: number;
  receivable_amount: number;
  received_amount: number;
  receivable_remaining_amount: number;
  overdue_receivable_amount: number;
  reconciliation_exception_count: number;
  unallocated_expense_amount: number;
};

export type FinanceMonthlyOverviewClosing = {
  id: string | null;
  status: FinanceClosingStatus;
  closed_at: string | null;
  reopened_at: string | null;
  notes: string | null;
  snapshot_summary: Partial<FinanceMonthlyOverviewSummary> | null;
  current_summary: FinanceMonthlyOverviewSummary | null;
  difference_summary: Partial<FinanceMonthlyOverviewSummary> | null;
  has_snapshot_difference: boolean;
};

export type FinanceMonthlyOverviewData = {
  summary: FinanceMonthlyOverviewSummary;
  closing: FinanceMonthlyOverviewClosing;
  scope: {
    month: string;
    date_from: string;
    date_to: string;
    source_limit: number;
    truncated: boolean;
  };
};

export type FinanceMonthlyOverviewResult = FinanceMonthlyOverviewData & {
  error: string | null;
};

export type FinanceClosingPeriodRecord = {
  id: string;
  tenant_id: string;
  period_month: string;
  status: Exclude<FinanceClosingStatus, "not_started">;
  closed_at: string | null;
  closed_by_employee_id: string | null;
  reopened_at: string | null;
  reopened_by_employee_id: string | null;
  reopen_reason: string | null;
  snapshot_json: unknown;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type FinanceClosingPeriodListData = {
  list: FinanceClosingPeriodRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type FinanceClosingPeriodListResult = FinanceClosingPeriodListData & {
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

export function emptyFinanceMonthlyOverview(): FinanceMonthlyOverviewResult {
  return {
    summary: {
      income_amount: 0,
      expense_amount: 0,
      gross_profit_amount: 0,
      gross_profit_rate: 0,
      receivable_amount: 0,
      received_amount: 0,
      receivable_remaining_amount: 0,
      overdue_receivable_amount: 0,
      reconciliation_exception_count: 0,
      unallocated_expense_amount: 0,
    },
    closing: {
      id: null,
      status: "not_started",
      closed_at: null,
      reopened_at: null,
      notes: null,
      snapshot_summary: null,
      current_summary: null,
      difference_summary: null,
      has_snapshot_difference: false,
    },
    scope: {
      month: "",
      date_from: "",
      date_to: "",
      source_limit: 0,
      truncated: false,
    },
    error: null,
  };
}

export function emptyFinanceClosingPeriods(): FinanceClosingPeriodListResult {
  return {
    list: [],
    pagination: {
      page: 1,
      pageSize: 5,
      total: 0,
      totalPages: 0,
    },
    error: null,
  };
}

export async function fetchFinanceMonthlyOverview(query: {
  month?: string;
}): Promise<FinanceMonthlyOverviewResult> {
  const token = await getAdminToken();
  if (!token) {
    return {
      ...emptyFinanceMonthlyOverview(),
      error: "缺少登录凭证",
    };
  }

  const params = buildFinanceMonthlyOverviewSearchParams(query);
  const suffix = params.size ? `?${params}` : "";
  try {
    const response = await fetch(
      buildBackendUrl(`/finance/reports/monthly-overview${suffix}`),
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );
    const payload = await parseBackendJson<FinanceMonthlyOverviewData>(response);
    return {
      ...(payload.data || emptyFinanceMonthlyOverview()),
      error: null,
    };
  } catch (error) {
    return {
      ...emptyFinanceMonthlyOverview(),
      error: error instanceof Error ? error.message : "月度经营总览加载失败",
    };
  }
}

export async function fetchFinanceClosingPeriods(query: {
  month?: string;
  page?: number;
  pageSize?: number;
}): Promise<FinanceClosingPeriodListResult> {
  const token = await getAdminToken();
  if (!token) {
    return {
      ...emptyFinanceClosingPeriods(),
      error: "缺少登录凭证",
    };
  }

  const params = buildFinanceMonthlyOverviewSearchParams({
    month: query.month,
  });
  params.set("page", String(query.page ?? 1));
  params.set("pageSize", String(query.pageSize ?? 5));
  try {
    const response = await fetch(
      buildBackendUrl(`/finance/closing-periods?${params}`),
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );
    const payload = await parseBackendJson<FinanceClosingPeriodListData>(
      response,
    );
    return {
      ...(payload.data || emptyFinanceClosingPeriods()),
      error: null,
    };
  } catch (error) {
    return {
      ...emptyFinanceClosingPeriods(),
      error: error instanceof Error ? error.message : "结账记录加载失败",
    };
  }
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
