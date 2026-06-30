import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";
import type { FinanceClosingStatus } from "./finance-operating-report-utils";
import type { FinancePagination } from "./finance-specialized-report-requests";
import {
  buildFinanceMonthlyDifferenceSourcesSearchParams,
  type FinanceDifferenceSourcesQuery,
  type FinanceDifferenceResolutionStatus,
  type FinanceDifferenceResolutionWriteStatus,
  type FinanceDifferenceSourceType,
} from "./finance-difference-sources-utils";

export type FinanceDifferenceSourceResolution = {
  status: FinanceDifferenceResolutionStatus;
  note: string | null;
  handled_by: string | null;
  handled_by_name: string | null;
  handled_at: string | null;
};

export type FinanceDifferenceSourceRecord = {
  id: string;
  source_type: FinanceDifferenceSourceType | string;
  source_label: string;
  source_id: string;
  occurred_at: string;
  project_id: string | null;
  project_name: string | null;
  amount: number | null;
  direction: "in" | "out" | string | null;
  description: string;
  target: {
    label: string;
    href: string;
  };
  resolution: FinanceDifferenceSourceResolution;
};

export type FinanceDifferenceSourcesSummary = {
  month: string;
  closing_status: FinanceClosingStatus;
  baseline_at: string | null;
  has_snapshot_difference: boolean;
  total: number;
  by_source_type: Partial<Record<FinanceDifferenceSourceType, number>>;
  resolution: Record<FinanceDifferenceResolutionStatus, number>;
};

export type FinanceDifferenceResolutionUpdateInput = {
  month: string;
  source_type: FinanceDifferenceSourceType | string;
  source_id: string;
  project_id?: string | null;
  status: FinanceDifferenceResolutionWriteStatus;
  note?: string;
};

export type FinanceDifferenceResolutionRecord = {
  id: string;
  tenant_id: string;
  month: string;
  source_type: FinanceDifferenceSourceType | string;
  source_id: string;
  project_id: string | null;
  status: FinanceDifferenceResolutionWriteStatus;
  note: string | null;
  handled_by: string | null;
  handled_by_name: string | null;
  handled_at: string;
  created_at: string;
  updated_at: string;
};

export type FinanceDifferenceSourcesResult = {
  list: FinanceDifferenceSourceRecord[];
  pagination: FinancePagination;
  summary: FinanceDifferenceSourcesSummary;
  error: string | null;
};

export function emptyFinanceDifferenceSources(
  month = "",
): FinanceDifferenceSourcesResult {
  return {
    list: [],
    pagination: {
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    },
    summary: {
      month,
      closing_status: "not_started",
      baseline_at: null,
      has_snapshot_difference: false,
      total: 0,
      by_source_type: {},
      resolution: { pending: 0, confirmed: 0, ignored: 0, resolved: 0 },
    },
    error: null,
  };
}

export async function fetchFinanceMonthlyDifferenceSources(
  query: FinanceDifferenceSourcesQuery,
): Promise<FinanceDifferenceSourcesResult> {
  const token = await getAdminToken();
  if (!token) {
    return {
      ...emptyFinanceDifferenceSources(query.month),
      error: "缺少登录凭证",
    };
  }

  const params = buildFinanceMonthlyDifferenceSourcesSearchParams(query);
  try {
    const response = await fetch(
      buildBackendUrl(
        `/finance/reports/monthly-overview/difference-sources?${params}`,
      ),
      {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    const payload = await parseBackendJson<
      Omit<FinanceDifferenceSourcesResult, "error">
    >(response);
    return {
      ...(payload.data || emptyFinanceDifferenceSources(query.month)),
      error: null,
    };
  } catch (error) {
    return {
      ...emptyFinanceDifferenceSources(query.month),
      error: error instanceof Error ? error.message : "差异来源加载失败",
    };
  }
}
