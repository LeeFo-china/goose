"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { FinanceProjectSummaryFilterForm } from "@/components/finance/finance-project-summary-filter-form";
import { FinanceProjectSummaryPagination } from "@/components/finance/finance-project-summary-pagination";
import { FinanceProjectSummaryTable } from "@/components/finance/finance-project-summary-table";
import {
  FinanceProjectSummaryViewTabs,
  type FinanceProjectSummaryView,
} from "@/components/finance/finance-project-summary-view-tabs";
import type { FinanceFilterOption } from "@/components/finance/finance-filter-controls";
import type {
  FinancePagination,
  FinanceProjectOperatingSummary,
  FinanceProjectSummaryListData,
  FinanceProjectSummaryResult,
} from "@/components/finance/finance-project-summary-types";
import { cn } from "@/lib/utils";

type FinanceProjectSummaryTableFilters = {
  keyword?: string;
  status?: string;
  risk_level?: string;
  risk_flag?: string;
  budget_configured?: string;
  has_unallocated_expense?: string;
  overdue?: string;
};

type FinanceProjectSummaryTableState = {
  list: FinanceProjectOperatingSummary[];
  pagination: FinancePagination;
  error: string | null;
};

type FinancePaginationTarget = "previous" | "next";

type BackendPayload = {
  success?: boolean;
  message?: string;
  data?: FinanceProjectSummaryListData;
};

type FinanceProjectSummaryTablePanelProps = {
  initialData: FinanceProjectSummaryResult;
  initialFilters: FinanceProjectSummaryTableFilters;
  initialView: FinanceProjectSummaryView;
  projectStatusOptions: readonly FinanceFilterOption[];
  riskLevelOptions: readonly FinanceFilterOption[];
  riskFlagOptions: readonly FinanceFilterOption[];
  booleanFilterOptions: readonly FinanceFilterOption[];
};

const TABLE_PAGE_SIZE = 3;

export function FinanceProjectSummaryTablePanel({
  initialData,
  initialFilters,
  initialView,
  projectStatusOptions,
  riskLevelOptions,
  riskFlagOptions,
  booleanFilterOptions,
}: FinanceProjectSummaryTablePanelProps) {
  const initialTableState: FinanceProjectSummaryTableState = {
    list: initialData.list,
    pagination: initialData.pagination,
    error: initialData.error,
  };
  const requestIdRef = useRef(0);
  const cacheRef = useRef(new Map<string, FinanceProjectSummaryTableState>([
    [
      buildTableCacheKey(initialFilters, initialData.pagination.page),
      initialTableState,
    ],
  ]));
  const [filters, setFilters] =
    useState<FinanceProjectSummaryTableFilters>(initialFilters);
  const [activeView, setActiveView] =
    useState<FinanceProjectSummaryView>(initialView);
  const [tableData, setTableData] = useState<FinanceProjectSummaryTableState>(
    () => initialTableState,
  );
  const [pendingView, setPendingView] =
    useState<FinanceProjectSummaryView | null>(null);
  const [pendingPageTarget, setPendingPageTarget] =
    useState<FinancePaginationTarget | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const tableHrefs = {
    all: buildProjectSummaryViewHref("all", filters),
    danger: buildProjectSummaryViewHref("danger", filters),
    info: buildProjectSummaryViewHref("info", filters),
  };
  const canGoPrev = tableData.pagination.page > 1;
  const canGoNext = tableData.pagination.totalPages > 0 &&
    tableData.pagination.page < tableData.pagination.totalPages;
  const currentAdvancedFilterCount = [
    filters.risk_flag,
    filters.budget_configured,
    filters.has_unallocated_expense,
    filters.overdue,
  ].filter(Boolean).length;
  const previousHref = canGoPrev
    ? buildFinanceSummaryHref({
      page: tableData.pagination.page - 1,
      filters,
    })
    : null;
  const nextHref = canGoNext
    ? buildFinanceSummaryHref({
      page: tableData.pagination.page + 1,
      filters,
    })
    : null;

  async function loadTable(input: {
    filters: FinanceProjectSummaryTableFilters;
    page: number;
    href: string;
  }) {
    const cacheKey = buildTableCacheKey(input.filters, input.page);
    const cached = cacheRef.current.get(cacheKey);
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsLoading(true);

    if (cached) {
      setTableData(cached);
      setFilters(input.filters);
      setActiveView(resolveProjectSummaryView(input.filters));
      window.history.pushState(null, "", input.href);
      setIsLoading(false);
      setPendingView(null);
      setPendingPageTarget(null);
      return;
    }

    try {
      const nextData = await fetchProjectSummaryTable(input.filters, input.page);
      if (requestIdRef.current !== requestId) return;

      cacheRef.current.set(cacheKey, nextData);
      setTableData(nextData);
      setFilters(input.filters);
      setActiveView(resolveProjectSummaryView(input.filters));
      window.history.pushState(null, "", input.href);
    } catch (error) {
      if (requestIdRef.current !== requestId) return;
      setTableData((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "项目经营汇总加载失败",
      }));
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false);
        setPendingView(null);
        setPendingPageTarget(null);
      }
    }
  }

  function handleViewNavigate(view: FinanceProjectSummaryView, href: string) {
    void loadTable({
      filters: filtersForView(view, filters),
      page: 1,
      href,
    });
  }

  function handlePageNavigate(_target: FinancePaginationTarget, href: string) {
    const url = new URL(href, window.location.origin);
    const page = Number(url.searchParams.get("page") || 1);
    void loadTable({
      filters,
      page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
      href,
    });
  }

  return (
    <>
      <FinanceProjectSummaryFilterForm
        key={buildTableCacheKey(filters, tableData.pagination.page)}
        keyword={filters.keyword}
        status={filters.status}
        riskLevel={filters.risk_level}
        riskFlag={filters.risk_flag}
        budgetConfigured={filters.budget_configured}
        hasUnallocatedExpense={filters.has_unallocated_expense}
        overdue={filters.overdue}
        advancedFilterCount={currentAdvancedFilterCount}
        projectStatusOptions={projectStatusOptions}
        riskLevelOptions={riskLevelOptions}
        riskFlagOptions={riskFlagOptions}
        booleanFilterOptions={booleanFilterOptions}
      />
      {tableData.error ? (
        <div className="shrink-0 border-b p-4">
          <StatusAlert>{tableData.error}</StatusAlert>
        </div>
      ) : null}
      <div className="shrink-0 flex flex-col gap-2 border-b bg-card px-4 py-0 md:flex-row md:items-center md:justify-between">
        <div className="py-2">
          <h2 className="text-sm font-semibold">项目财务明细表</h2>
        </div>
        <FinanceProjectSummaryViewTabs
          activeView={activeView}
          hrefs={tableHrefs}
          pendingView={pendingView}
          onPendingView={setPendingView}
          onNavigate={handleViewNavigate}
        />
      </div>
      <div
        aria-busy={isLoading || undefined}
        className="relative min-h-0 flex-1 overflow-auto"
        data-testid="finance-project-summary-table-container"
      >
        {isLoading ? (
          <div className="absolute right-3 top-3 z-20 flex size-8 items-center justify-center rounded-md border bg-card/95 shadow-sm">
            <Loader2
              aria-label="加载项目财务明细"
              className="size-4 animate-spin text-muted-foreground"
            />
          </div>
        ) : null}
        <div className={cn(isLoading && "opacity-60")}>
          <FinanceProjectSummaryTable rows={tableData.list} />
        </div>
      </div>
      <div
        className="shrink-0 flex flex-col gap-3 border-t bg-card px-4 py-3 md:flex-row md:items-center md:justify-between"
        data-testid="finance-project-summary-footer"
      >
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline" className="tabular-nums">
            第 {tableData.pagination.page || 1} / {Math.max(tableData.pagination.totalPages || 0, 1)} 页
          </Badge>
          <span>当前显示 {tableData.list.length} 个项目，共 {tableData.pagination.total} 个</span>
          <Badge variant="outline" className="tabular-nums">
            每页 {tableData.pagination.pageSize} 个
          </Badge>
        </div>
        <FinanceProjectSummaryPagination
          previousHref={previousHref}
          nextHref={nextHref}
          pendingTarget={pendingPageTarget}
          onPendingTarget={setPendingPageTarget}
          onNavigate={handlePageNavigate}
        />
      </div>
    </>
  );
}

async function fetchProjectSummaryTable(
  filters: FinanceProjectSummaryTableFilters,
  page: number,
): Promise<FinanceProjectSummaryTableState> {
  const params = buildFinanceSummarySearchParams({
    page,
    filters,
  });
  params.set("pageSize", String(TABLE_PAGE_SIZE));
  params.set("include_analytics", "false");

  const response = await fetch(`/api/backend/finance/project-summary?${params}`, {
    cache: "no-store",
  });
  const payload = await response.json() as BackendPayload;
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || "项目经营汇总加载失败");
  }
  if (!payload.data) {
    throw new Error("项目经营汇总加载失败");
  }

  return {
    list: payload.data.list || [],
    pagination: payload.data.pagination,
    error: null,
  };
}

function buildProjectSummaryViewHref(
  view: FinanceProjectSummaryView,
  filters: FinanceProjectSummaryTableFilters,
) {
  return buildFinanceSummaryHref({
    page: 1,
    filters: filtersForView(view, filters),
  });
}

function filtersForView(
  view: FinanceProjectSummaryView,
  filters: FinanceProjectSummaryTableFilters,
): FinanceProjectSummaryTableFilters {
  return {
    keyword: filters.keyword,
    status: filters.status,
    risk_level: view === "all" ? undefined : view,
  };
}

function resolveProjectSummaryView(
  filters: FinanceProjectSummaryTableFilters,
): FinanceProjectSummaryView {
  if (filters.risk_level === "danger") return "danger";
  if (filters.risk_level === "info") return "info";
  return "all";
}

function buildFinanceSummaryHref(input: {
  page: number;
  filters: FinanceProjectSummaryTableFilters;
}) {
  const params = buildFinanceSummarySearchParams(input);
  return `/finance?${params}`;
}

function buildFinanceSummarySearchParams(input: {
  page: number;
  filters: FinanceProjectSummaryTableFilters;
}) {
  const params = new URLSearchParams();
  params.set("page", String(input.page));
  append(params, "keyword", input.filters.keyword);
  append(params, "status", input.filters.status);
  append(params, "risk_level", input.filters.risk_level);
  append(params, "risk_flag", input.filters.risk_flag);
  append(params, "budget_configured", input.filters.budget_configured);
  append(
    params,
    "has_unallocated_expense",
    input.filters.has_unallocated_expense,
  );
  append(params, "overdue", input.filters.overdue);
  return params;
}

function buildTableCacheKey(
  filters: FinanceProjectSummaryTableFilters,
  page: number,
) {
  return buildFinanceSummarySearchParams({ page, filters }).toString();
}

function append(params: URLSearchParams, key: string, value: string | undefined) {
  const normalized = value?.trim();
  if (normalized) params.set(key, normalized);
}
