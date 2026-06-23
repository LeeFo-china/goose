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
};

const PROJECT_STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  ...Object.entries(ProjectStatusConfig).map(([value, config]) => ({
    value,
    label: config.label,
  })),
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
  });
  const summary = data.summary;
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

      <div className="grid shrink-0 gap-3 md:grid-cols-2 xl:grid-cols-5">
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
          icon={<LineChart aria-hidden="true" className="size-4" />}
          label="当前页实际利润"
          value={formatFinanceMoney(summary.actual_profit_amount)}
          helper={`毛利率 ${formatFinancePercent(summary.actual_gross_margin)}`}
        />
        <FinanceMetricCard
          icon={<AlertTriangle aria-hidden="true" className="size-4" />}
          label="当前页逾期"
          value={formatFinanceMoney(summary.overdue_amount)}
          helper={`${summary.overdue_count} 笔`}
        />
      </div>

      <Card className="min-h-0 flex-1 overflow-hidden">
        <CardContent className="flex h-full min-h-0 flex-col p-0">
          <form
            action="/finance"
            className="shrink-0 grid gap-3 border-b bg-card p-4 md:grid-cols-[minmax(12rem,1fr)_minmax(9rem,12rem)_auto] md:items-end"
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
            <div className="flex flex-wrap items-center gap-2 md:justify-end">
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
