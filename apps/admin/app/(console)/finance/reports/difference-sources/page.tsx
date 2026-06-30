import Link from "next/link";
import {
  ArrowLeft,
  CalendarClock,
  FileSearch,
  GitCompareArrows,
  History,
} from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  fetchFinanceMonthlyDifferenceSources,
} from "@/components/finance/finance-difference-sources-requests";
import { FinanceDifferenceSourcesTable } from "@/components/finance/finance-difference-sources-table";
import {
  buildFinanceMonthlyDifferenceSourcesSearchParams,
  financeDifferenceSourceTypeMeta,
} from "@/components/finance/finance-difference-sources-utils";
import {
  FinanceFilterSelectField,
} from "@/components/finance/finance-filter-controls";
import { FinanceModuleTabs } from "@/components/finance/finance-module-tabs";
import { FinanceMetricCard } from "@/components/finance/finance-overview-cards";
import {
  financeClosingStatusLabel,
  financeClosingStatusVariant,
  financeSnapshotDifferenceLabel,
  financeSnapshotDifferenceVariant,
} from "@/components/finance/finance-operating-report-utils";
import {
  formatFinanceDateTime,
} from "@/components/finance/finance-ledger-utils";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type DifferenceSourcesPageSearchParams = {
  month?: string;
  source_type?: string;
  resolution_status?: string;
  project_id?: string;
  page?: string;
};

const SOURCE_TYPE_OPTIONS = [
  { value: "", label: "全部来源" },
  { value: "correction_audit", label: "修正审计" },
  { value: "ledger_entry", label: "财务台账" },
  { value: "receivable_plan", label: "应收计划" },
  { value: "expense_request", label: "费用申请" },
];

const RESOLUTION_STATUS_OPTIONS = [
  { value: "", label: "全部处理状态" },
  { value: "pending", label: "待处理" },
  { value: "confirmed", label: "已确认" },
  { value: "ignored", label: "已忽略" },
  { value: "resolved", label: "已修复" },
];

function clean(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function normalizePage(value: string | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function differenceSourcesHref(
  page: number,
  filters: DifferenceSourcesPageSearchParams,
) {
  const params = buildFinanceMonthlyDifferenceSourcesSearchParams({
    month: clean(filters.month) || currentMonth(),
    source_type: clean(filters.source_type),
    resolution_status: clean(filters.resolution_status),
    project_id: clean(filters.project_id),
    page,
    pageSize: 20,
  });
  return `/finance/reports/difference-sources?${params}`;
}

export default async function FinanceDifferenceSourcesPage({
  searchParams,
}: {
  searchParams: Promise<DifferenceSourcesPageSearchParams>;
}) {
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

  const params = await searchParams;
  const month = clean(params.month) || currentMonth();
  const page = normalizePage(params.page);
  const data = await fetchFinanceMonthlyDifferenceSources({
    month,
    page,
    pageSize: 20,
    source_type: clean(params.source_type),
    resolution_status: clean(params.resolution_status),
    project_id: clean(params.project_id),
  });
  const pendingResolutionCount = data.summary.resolution?.pending ?? 0;
  const handledResolutionCount =
    (data.summary.resolution?.confirmed ?? 0) +
    (data.summary.resolution?.ignored ?? 0) +
    (data.summary.resolution?.resolved ?? 0);
  const canGoPrev = data.pagination.page > 1;
  const canGoNext = data.pagination.totalPages > 0 &&
    data.pagination.page < data.pagination.totalPages;

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="shrink-0 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <GitCompareArrows aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal">差异来源</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              追溯月结快照后产生的台账、应收、费用和修正审计记录。
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/finance/reports?month=${month}`}>
              <ArrowLeft data-icon="inline-start" />
              返回报表
            </Link>
          </Button>
          <Badge variant="outline" className="tabular-nums">
            第 {data.pagination.page || 1} / {Math.max(data.pagination.totalPages || 0, 1)} 页
          </Badge>
        </div>
      </div>

      <FinanceModuleTabs activeTab="reports" />

      {data.error ? (
        <StatusAlert tone="warning" title="差异来源加载失败">
          {data.error}
        </StatusAlert>
      ) : null}

      <div className="grid shrink-0 gap-2 md:grid-cols-2 xl:grid-cols-5">
        <FinanceMetricCard
          icon={<FileSearch aria-hidden="true" className="size-4" />}
          label="差异来源"
          value={`${data.summary.total} 条`}
          helper="当前筛选范围"
          tone={data.summary.total > 0 ? "warning" : "normal"}
        />
        <FinanceMetricCard
          icon={<GitCompareArrows aria-hidden="true" className="size-4" />}
          label="待处理"
          value={`${pendingResolutionCount} 条`}
          helper="未写入处理记录"
          tone={pendingResolutionCount > 0 ? "warning" : "normal"}
        />
        <FinanceMetricCard
          icon={<History aria-hidden="true" className="size-4" />}
          label="已处理"
          value={`${handledResolutionCount} 条`}
          helper="已确认 / 忽略 / 修复"
        />
        <FinanceMetricCard
          icon={<History aria-hidden="true" className="size-4" />}
          label="快照状态"
          value={financeSnapshotDifferenceLabel(
            data.summary.has_snapshot_difference,
          )}
          helper={financeClosingStatusLabel(data.summary.closing_status)}
          tone={data.summary.has_snapshot_difference ? "warning" : "normal"}
        />
        <FinanceMetricCard
          icon={<CalendarClock aria-hidden="true" className="size-4" />}
          label="结账基线"
          value={data.summary.baseline_at
            ? formatFinanceDateTime(data.summary.baseline_at)
            : "-"}
          helper={month}
        />
      </div>

      <Card className="min-h-0 flex-1 overflow-hidden">
        <CardContent className="flex h-full min-h-0 flex-col p-0">
          <form
            action="/finance/reports/difference-sources"
            className="shrink-0 grid gap-3 border-b bg-card p-4 md:grid-cols-2 xl:grid-cols-[minmax(9rem,10rem)_minmax(11rem,13rem)_minmax(11rem,13rem)_minmax(16rem,1fr)_auto] xl:items-end"
          >
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="difference-month">
                月份
              </label>
              <Input
                id="difference-month"
                name="month"
                type="month"
                defaultValue={month}
                className="h-9"
              />
            </div>
            <FinanceFilterSelectField
              id="difference-source-type"
              name="source_type"
              label="来源类型"
              value={params.source_type}
              options={SOURCE_TYPE_OPTIONS}
            />
            <FinanceFilterSelectField
              id="difference-resolution-status"
              name="resolution_status"
              label="处理状态"
              value={params.resolution_status}
              options={RESOLUTION_STATUS_OPTIONS}
            />
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="difference-project-id">
                项目 ID
              </label>
              <Input
                id="difference-project-id"
                name="project_id"
                defaultValue={params.project_id || ""}
                placeholder="按项目 ID 精确筛选"
                className="h-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <Button type="submit" size="sm">筛选</Button>
              <Button asChild type="button" variant="outline" size="sm">
                <Link href={`/finance/reports/difference-sources?month=${month}`}>
                  重置
                </Link>
              </Button>
            </div>
          </form>

          <div className="min-h-0 flex-1 overflow-auto">
            <FinanceDifferenceSourcesTable month={month} rows={data.list} />
          </div>

          <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-t bg-card px-4 py-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge
                variant={financeClosingStatusVariant(data.summary.closing_status)}
              >
                {financeClosingStatusLabel(data.summary.closing_status)}
              </Badge>
              <Badge
                variant={financeSnapshotDifferenceVariant(
                  data.summary.has_snapshot_difference,
                )}
              >
                {financeSnapshotDifferenceLabel(
                  data.summary.has_snapshot_difference,
                )}
              </Badge>
              <span>
                共 {data.pagination.total} 条，每页 {data.pagination.pageSize} 条
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm" disabled={!canGoPrev}>
                <Link
                  href={canGoPrev ? differenceSourcesHref(data.pagination.page - 1, params) : "#"}
                  aria-disabled={!canGoPrev}
                >
                  上一页
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" disabled={!canGoNext}>
                <Link
                  href={canGoNext ? differenceSourcesHref(data.pagination.page + 1, params) : "#"}
                  aria-disabled={!canGoNext}
                >
                  下一页
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
