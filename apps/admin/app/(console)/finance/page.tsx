import { ProjectStatusConfig } from "@gooes/domain";
import {
  AlertTriangle,
  CircleDollarSign,
  LineChart,
  WalletCards,
} from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  FinanceMetricCard,
  formatCollectionRate,
} from "@/components/finance/finance-overview-cards";
import { FinanceOverviewCharts } from "@/components/finance/finance-overview-charts";
import { FinanceModuleTabs } from "@/components/finance/finance-module-tabs";
import { FinanceProjectSummaryFilterForm } from "@/components/finance/finance-project-summary-filter-form";
import { FinanceProjectSummaryPagination } from "@/components/finance/finance-project-summary-pagination";
import { FinanceProjectSummaryTable } from "@/components/finance/finance-project-summary-table";
import {
  FinanceProjectSummaryViewTabs,
  type FinanceProjectSummaryView,
} from "@/components/finance/finance-project-summary-view-tabs";
import { fetchFinanceProjectSummaries } from "@/components/finance/finance-requests";
import {
  formatFinanceMoney,
  formatFinancePercent,
} from "@/components/finance/finance-ledger-utils";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

type FinancePageSearchParams = {
  page?: string;
  keyword?: string;
  status?: string;
  risk_level?: string;
  risk_flag?: string;
  budget_configured?: string;
  has_unallocated_expense?: string;
  overdue?: string;
};

const PROJECT_STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  ...Object.entries(ProjectStatusConfig).map(([value, config]) => ({
    value,
    label: config.label,
  })),
];

const RISK_LEVEL_OPTIONS = [
  { value: "", label: "全部风险" },
  { value: "normal", label: "正常" },
  { value: "info", label: "待处理" },
  { value: "warning", label: "预警" },
  { value: "danger", label: "高风险" },
];

const RISK_FLAG_OPTIONS = [
  { value: "", label: "全部原因" },
  { value: "budget_missing", label: "未配置预算" },
  { value: "unallocated_expense", label: "未归集成本" },
  { value: "category_over_budget", label: "分类超预算" },
  { value: "project_over_budget", label: "项目超预算" },
  { value: "low_projected_margin", label: "预算毛利偏低" },
  { value: "receivable_overdue", label: "应收逾期" },
  { value: "negative_actual_profit", label: "实际利润为负" },
  { value: "negative_projected_profit", label: "预算利润为负" },
];

const BOOLEAN_FILTER_OPTIONS = [
  { value: "", label: "全部" },
  { value: "true", label: "是" },
  { value: "false", label: "否" },
];

function normalizePage(value: string | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function clean(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function buildFinanceSummaryHref(input: {
  page: number;
  filters: FinancePageSearchParams;
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
  return `/finance?${params}`;
}

function resolveProjectSummaryView(
  filters: FinancePageSearchParams,
): FinanceProjectSummaryView {
  if (filters.risk_level === "danger") return "danger";
  if (filters.risk_level === "info") return "info";
  return "all";
}

function buildProjectSummaryViewHref(
  view: FinanceProjectSummaryView,
  filters: FinancePageSearchParams,
) {
  const baseFilters: FinancePageSearchParams = {
    keyword: filters.keyword,
    status: filters.status,
    risk_level: view === "all" ? undefined : view,
  };

  return buildFinanceSummaryHref({
    page: 1,
    filters: baseFilters,
  });
}

function append(params: URLSearchParams, key: string, value: string | undefined) {
  const normalized = clean(value);
  if (normalized) params.set(key, normalized);
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<FinancePageSearchParams>;
}) {
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

  const params = await searchParams;
  const page = normalizePage(params.page);
  const data = await fetchFinanceProjectSummaries({
    page,
    pageSize: 3,
    keyword: clean(params.keyword),
    status: clean(params.status),
    risk_level: clean(params.risk_level),
    risk_flag: clean(params.risk_flag),
    budget_configured: clean(params.budget_configured),
    has_unallocated_expense: clean(params.has_unallocated_expense),
    overdue: clean(params.overdue),
  });
  const summary = data.summary;
  const riskCounts = summary.risk_counts || {
    normal: 0,
    info: 0,
    warning: 0,
    danger: 0,
  };
  const projectCount = Number(summary.project_count || data.pagination.total || 0);
  const highRiskCount = Number(riskCounts.danger || 0);
  const warningRiskCount = Number(riskCounts.warning || 0);
  const actualGrossMargin = Number(summary.actual_gross_margin);
  const hasAbnormalGrossMargin = Number.isFinite(actualGrossMargin) && actualGrossMargin > 0.6;
  const advancedFilterCount = [
    params.risk_flag,
    params.budget_configured,
    params.has_unallocated_expense,
    params.overdue,
  ].filter(Boolean).length;
  const summaryView = resolveProjectSummaryView(params);
  const canGoPrev = data.pagination.page > 1;
  const canGoNext = data.pagination.totalPages > 0 && data.pagination.page < data.pagination.totalPages;

  return (
    <div className="flex min-h-0 flex-col gap-2 overflow-visible lg:h-[calc(100vh-6.5625rem)] lg:overflow-hidden">
      <div className="shrink-0 flex flex-col justify-between gap-2 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <LineChart aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal">财务总览</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              项目收入、回款、成本、利润与财务风险总览
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="w-fit tabular-nums">
            第 {data.pagination.page || 1} / {Math.max(data.pagination.totalPages || 0, 1)} 页
          </Badge>
        </div>
      </div>

      <FinanceModuleTabs activeTab="overview" />

      <div className="grid shrink-0 gap-2 md:grid-cols-2 xl:grid-cols-4">
        <FinanceMetricCard
          icon={<WalletCards aria-hidden="true" className="size-4" />}
          label="合同总额"
          value={formatFinanceMoney(summary.contract_amount)}
          helper={`当前筛选 ${projectCount} 个项目`}
        />
        <FinanceMetricCard
          icon={<CircleDollarSign aria-hidden="true" className="size-4" />}
          label="已收金额"
          value={formatFinanceMoney(summary.received_amount)}
          helper={`回款率 ${formatCollectionRate(summary.received_amount, summary.contract_amount)}`}
        />
        <FinanceMetricCard
          icon={<LineChart aria-hidden="true" className="size-4" />}
          label="实际利润"
          value={formatFinanceMoney(summary.actual_profit_amount)}
          helper={`毛利率 ${formatFinancePercent(summary.actual_gross_margin)}`}
          alert={hasAbnormalGrossMargin ? "毛利率异常偏高，可能存在成本未完整归集" : undefined}
        />
        <FinanceMetricCard
          icon={<AlertTriangle aria-hidden="true" className="size-4" />}
          label="风险项目"
          value={`${highRiskCount + warningRiskCount} 个`}
          helper={`高风险 ${highRiskCount} 个 / 预警 ${warningRiskCount} 个`}
          tone={highRiskCount > 0 ? "danger" : warningRiskCount > 0 ? "warning" : "normal"}
        />
      </div>

      <FinanceOverviewCharts summary={summary} analytics={data.analytics} />

      <Card className="min-h-0 flex-1 overflow-hidden">
        <CardContent className="flex h-full min-h-0 flex-col p-0">
          <FinanceProjectSummaryFilterForm
            keyword={params.keyword}
            status={params.status}
            riskLevel={params.risk_level}
            riskFlag={params.risk_flag}
            budgetConfigured={params.budget_configured}
            hasUnallocatedExpense={params.has_unallocated_expense}
            overdue={params.overdue}
            advancedFilterCount={advancedFilterCount}
            projectStatusOptions={PROJECT_STATUS_OPTIONS}
            riskLevelOptions={RISK_LEVEL_OPTIONS}
            riskFlagOptions={RISK_FLAG_OPTIONS}
            booleanFilterOptions={BOOLEAN_FILTER_OPTIONS}
          />
          {data.error ? (
            <div className="shrink-0 border-b p-4">
              <StatusAlert>{data.error}</StatusAlert>
            </div>
          ) : null}
          <div className="shrink-0 flex flex-col gap-2 border-b bg-card px-4 py-0 md:flex-row md:items-center md:justify-between">
            <div className="py-2">
              <h2 className="text-sm font-semibold">项目财务明细表</h2>
            </div>
            <FinanceProjectSummaryViewTabs
              activeView={summaryView}
              hrefs={{
                all: buildProjectSummaryViewHref("all", params),
                danger: buildProjectSummaryViewHref("danger", params),
                info: buildProjectSummaryViewHref("info", params),
              }}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <FinanceProjectSummaryTable rows={data.list} />
          </div>
          <div
            className="shrink-0 flex flex-col gap-3 border-t bg-card px-4 py-3 md:flex-row md:items-center md:justify-between"
            data-testid="finance-project-summary-footer"
          >
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline" className="tabular-nums">
                第 {data.pagination.page || 1} / {Math.max(data.pagination.totalPages || 0, 1)} 页
              </Badge>
              <span>当前显示 {data.list.length} 个项目，共 {data.pagination.total} 个</span>
              <Badge variant="outline" className="tabular-nums">
                每页 {data.pagination.pageSize} 个
              </Badge>
            </div>
            <FinanceProjectSummaryPagination
              previousHref={canGoPrev
                ? buildFinanceSummaryHref({
                  page: data.pagination.page - 1,
                  filters: params,
                })
                : null}
              nextHref={canGoNext
                ? buildFinanceSummaryHref({
                  page: data.pagination.page + 1,
                  filters: params,
                })
                : null}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
