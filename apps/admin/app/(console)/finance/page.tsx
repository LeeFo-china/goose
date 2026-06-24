import Link from "next/link";
import type { ReactNode } from "react";
import { ProjectStatusConfig } from "@gooes/domain";
import {
  AlertTriangle,
  CircleDollarSign,
  LineChart,
  ReceiptText,
  WalletCards,
} from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { FinanceProjectSummaryTable } from "@/components/finance/finance-project-summary-table";
import { fetchFinanceProjectSummaries } from "@/components/finance/finance-requests";
import {
  formatFinanceMoney,
  formatFinancePercent,
} from "@/components/finance/finance-ledger-utils";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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
    pageSize: 20,
    keyword: clean(params.keyword),
    status: clean(params.status),
    risk_level: clean(params.risk_level),
    risk_flag: clean(params.risk_flag),
    budget_configured: clean(params.budget_configured),
    has_unallocated_expense: clean(params.has_unallocated_expense),
    overdue: clean(params.overdue),
  });
  const summary = data.summary;
  const budgetConfiguredCount = Number(summary.budget_configured_count || 0);
  const riskCounts = summary.risk_counts || {
    normal: 0,
    info: 0,
    warning: 0,
    danger: 0,
  };
  const flagCounts = summary.risk_flag_counts || {};
  const canGoPrev = data.pagination.page > 1;
  const canGoNext = data.pagination.totalPages > 0 &&
    data.pagination.page < data.pagination.totalPages;

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="shrink-0 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <LineChart aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal">财务总览</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              项目收入、支出、利润和应收风险。当前筛选共 {data.pagination.total} 个项目。
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/finance/receivables">应收计划</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/finance/ledger">财务台账</Link>
          </Button>
          <Badge variant="outline" className="w-fit tabular-nums">
            第 {data.pagination.page || 1} / {Math.max(data.pagination.totalPages || 0, 1)} 页
          </Badge>
        </div>
      </div>

      <div className="grid shrink-0 gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        <FinanceMetricCard
          icon={<WalletCards aria-hidden="true" className="size-4" />}
          label="当前页合同额"
          value={formatFinanceMoney(summary.contract_amount)}
        />
        <FinanceMetricCard
          icon={<CircleDollarSign aria-hidden="true" className="size-4" />}
          label="当前页已收"
          value={formatFinanceMoney(summary.received_amount)}
        />
        <FinanceMetricCard
          icon={<ReceiptText aria-hidden="true" className="size-4" />}
          label="当前页支出"
          value={formatFinanceMoney(summary.expense_paid_amount)}
        />
        <FinanceMetricCard
          icon={<ReceiptText aria-hidden="true" className="size-4" />}
          label="当前页预算成本"
          value={formatFinanceMoney(summary.budget_cost_amount)}
          helper={`${budgetConfiguredCount} 个项目已配置`}
        />
        <FinanceMetricCard
          icon={<LineChart aria-hidden="true" className="size-4" />}
          label="当前页实际利润"
          value={formatFinanceMoney(summary.actual_profit_amount)}
          helper={`毛利率 ${formatFinancePercent(summary.actual_gross_margin)}`}
        />
        <FinanceMetricCard
          icon={<LineChart aria-hidden="true" className="size-4" />}
          label="当前页预算利润"
          value={formatFinanceMoney(summary.projected_budget_profit_amount)}
          helper={`偏差 ${formatFinanceMoney(summary.profit_variance_amount)}`}
        />
        <FinanceMetricCard
          icon={<AlertTriangle aria-hidden="true" className="size-4" />}
          label="高风险项目"
          value={`${riskCounts.danger || 0} 个`}
          helper={`项目超预算 ${flagCounts.project_over_budget || 0} 个`}
        />
        <FinanceMetricCard
          icon={<AlertTriangle aria-hidden="true" className="size-4" />}
          label="预警项目"
          value={`${riskCounts.warning || 0} 个`}
          helper={`预算毛利偏低 ${flagCounts.low_projected_margin || 0} 个`}
        />
        <FinanceMetricCard
          icon={<AlertTriangle aria-hidden="true" className="size-4" />}
          label="未配置预算"
          value={`${flagCounts.budget_missing || 0} 个`}
          helper={`预算使用 ${formatFinancePercent(summary.budget_usage_ratio)}`}
        />
        <FinanceMetricCard
          icon={<ReceiptText aria-hidden="true" className="size-4" />}
          label="未归集成本"
          value={formatFinanceMoney(summary.unallocated_expense_amount)}
          helper={`${flagCounts.unallocated_expense || 0} 个项目`}
        />
        <FinanceMetricCard
          icon={<AlertTriangle aria-hidden="true" className="size-4" />}
          label="当前页逾期"
          value={formatFinanceMoney(summary.overdue_amount)}
          helper={`${summary.overdue_count} 笔 / ${flagCounts.receivable_overdue || 0} 个项目`}
        />
      </div>

      <Card className="min-h-0 flex-1 overflow-hidden">
        <CardContent className="flex h-full min-h-0 flex-col p-0">
          <form
            action="/finance"
            className="shrink-0 grid gap-3 border-b bg-card p-4 md:grid-cols-2 xl:grid-cols-[minmax(12rem,1fr)_12rem_11rem_12rem_10rem_10rem_10rem_auto] xl:items-end"
          >
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="finance-keyword">
                项目
              </label>
              <Input
                id="finance-keyword"
                name="keyword"
                defaultValue={params.keyword || ""}
                placeholder="按项目名称或 ID 搜索"
                className="h-9"
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="finance-status">
                状态
              </label>
              <select
                id="finance-status"
                name="status"
                defaultValue={params.status || ""}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {PROJECT_STATUS_OPTIONS.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <FinanceFilterSelect
              id="finance-risk-level"
              name="risk_level"
              label="风险"
              value={params.risk_level}
              options={RISK_LEVEL_OPTIONS}
            />
            <FinanceFilterSelect
              id="finance-risk-flag"
              name="risk_flag"
              label="原因"
              value={params.risk_flag}
              options={RISK_FLAG_OPTIONS}
            />
            <FinanceFilterSelect
              id="finance-budget-configured"
              name="budget_configured"
              label="已配预算"
              value={params.budget_configured}
              options={BOOLEAN_FILTER_OPTIONS}
            />
            <FinanceFilterSelect
              id="finance-has-unallocated-expense"
              name="has_unallocated_expense"
              label="未归集"
              value={params.has_unallocated_expense}
              options={BOOLEAN_FILTER_OPTIONS}
            />
            <FinanceFilterSelect
              id="finance-overdue"
              name="overdue"
              label="逾期"
              value={params.overdue}
              options={BOOLEAN_FILTER_OPTIONS}
            />
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <Button type="submit" size="sm">筛选</Button>
              <Button asChild type="button" variant="outline" size="sm">
                <Link href="/finance">重置</Link>
              </Button>
            </div>
          </form>
          {data.error ? (
            <div className="shrink-0 border-b p-4">
              <StatusAlert>{data.error}</StatusAlert>
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-auto">
            <FinanceProjectSummaryTable rows={data.list} />
          </div>
          <div className="shrink-0 flex flex-col gap-3 border-t bg-card px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>当前显示 {data.list.length} 个项目，共 {data.pagination.total} 个</span>
              <Badge variant="outline" className="tabular-nums">
                每页 {data.pagination.pageSize} 个
              </Badge>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!canGoPrev}
                asChild={canGoPrev}
              >
                {canGoPrev ? (
                  <Link
                    href={buildFinanceSummaryHref({
                      page: data.pagination.page - 1,
                      filters: params,
                    })}
                  >
                    上一页
                  </Link>
                ) : (
                  <span>上一页</span>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!canGoNext}
                asChild={canGoNext}
              >
                {canGoNext ? (
                  <Link
                    href={buildFinanceSummaryHref({
                      page: data.pagination.page + 1,
                      filters: params,
                    })}
                  >
                    下一页
                  </Link>
                ) : (
                  <span>下一页</span>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FinanceMetricCard({
  icon,
  label,
  value,
  helper,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <Card>
      <CardContent className="flex h-full flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        <div className="truncate text-lg font-semibold tabular-nums">{value}</div>
        {helper ? (
          <div className="truncate text-xs text-muted-foreground">{helper}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function FinanceFilterSelect({
  id,
  name,
  label,
  value,
  options,
}: {
  id: string;
  name: string;
  label: string;
  value?: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="grid gap-1.5">
      <label className="text-xs font-medium text-muted-foreground" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={value || ""}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        {options.map((option) => (
          <option key={option.value || "all"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
