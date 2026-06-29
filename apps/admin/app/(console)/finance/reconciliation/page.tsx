import Link from "next/link";
import { AlertTriangle, BadgeAlert, CircleAlert, ShieldCheck } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  FinanceFilterSelectField,
} from "@/components/finance/finance-filter-controls";
import { FinanceModuleTabs } from "@/components/finance/finance-module-tabs";
import { FinanceMetricCard } from "@/components/finance/finance-overview-cards";
import {
  fetchFinanceReconciliationExceptions,
} from "@/components/finance/finance-reconciliation-requests";
import { FinanceReconciliationTable } from "@/components/finance/finance-reconciliation-table";
import {
  buildFinanceReconciliationSearchParams,
} from "@/components/finance/finance-reconciliation-utils";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type FinanceReconciliationPageSearchParams = {
  page?: string;
  date_from?: string;
  date_to?: string;
  project_id?: string;
  exception_code?: string;
  level?: string;
  direction?: string;
};

const EXCEPTION_OPTIONS = [
  { value: "", label: "全部异常" },
  { value: "receivable_overdue", label: "应收逾期" },
  { value: "payment_without_ledger", label: "收款未入账" },
  { value: "ledger_without_payment", label: "流水缺收款关联" },
  { value: "payment_unallocated", label: "收款未核销" },
  { value: "allocation_amount_mismatch", label: "核销金额不一致" },
  { value: "receivable_paid_amount_mismatch", label: "应收已收不一致" },
];

const LEVEL_OPTIONS = [
  { value: "", label: "全部等级" },
  { value: "danger", label: "高风险" },
  { value: "warning", label: "预警" },
  { value: "info", label: "提示" },
];

const DIRECTION_OPTIONS = [
  { value: "", label: "全部方向" },
  { value: "receivable", label: "应收" },
  { value: "payment", label: "收款" },
  { value: "ledger", label: "台账" },
  { value: "expense", label: "费用" },
];

function normalizePage(value: string | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function clean(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function reconciliationPageHref(
  page: number,
  filters: FinanceReconciliationPageSearchParams,
) {
  const params = buildFinanceReconciliationSearchParams({
    page,
    pageSize: 20,
    date_from: filters.date_from,
    date_to: filters.date_to,
    project_id: filters.project_id,
    exception_code: filters.exception_code,
    level: filters.level,
    direction: filters.direction,
  });
  return `/finance/reconciliation?${params}`;
}

export default async function FinanceReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<FinanceReconciliationPageSearchParams>;
}) {
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

  const params = await searchParams;
  const page = normalizePage(params.page);
  const data = await fetchFinanceReconciliationExceptions({
    page,
    pageSize: 20,
    date_from: clean(params.date_from),
    date_to: clean(params.date_to),
    project_id: clean(params.project_id),
    exception_code: clean(params.exception_code),
    level: clean(params.level),
    direction: clean(params.direction),
  });
  const canGoPrev = data.pagination.page > 1;
  const canGoNext = data.pagination.totalPages > 0 &&
    data.pagination.page < data.pagination.totalPages;

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="shrink-0 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <BadgeAlert aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal">对账异常</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              后端统一计算的应收、收款、核销和台账一致性异常。当前共 {data.pagination.total} 条记录。
            </p>
          </div>
        </div>
        <Badge variant="outline" className="w-fit tabular-nums">
          第 {data.pagination.page || 1} / {Math.max(data.pagination.totalPages || 0, 1)} 页
        </Badge>
      </div>

      <FinanceModuleTabs activeTab="reconciliation" />

      <div className="grid shrink-0 gap-2 md:grid-cols-2 xl:grid-cols-4">
        <FinanceMetricCard
          icon={<BadgeAlert aria-hidden="true" className="size-4" />}
          label="异常总数"
          value={`${data.summary.total} 条`}
          helper="当前筛选范围"
          tone={data.summary.total > 0 ? "warning" : "normal"}
        />
        <FinanceMetricCard
          icon={<AlertTriangle aria-hidden="true" className="size-4" />}
          label="高风险"
          value={`${data.summary.danger} 条`}
          helper="需优先核对"
          tone={data.summary.danger > 0 ? "danger" : "normal"}
        />
        <FinanceMetricCard
          icon={<CircleAlert aria-hidden="true" className="size-4" />}
          label="预警"
          value={`${data.summary.warning} 条`}
          helper="需财务跟进"
          tone={data.summary.warning > 0 ? "warning" : "normal"}
        />
        <FinanceMetricCard
          icon={<ShieldCheck aria-hidden="true" className="size-4" />}
          label="提示"
          value={`${data.summary.info} 条`}
          helper="待归档或补充信息"
        />
      </div>

      <Card className="min-h-0 flex-1 overflow-hidden">
        <CardContent className="flex h-full min-h-0 flex-col p-0">
          <form
            action="/finance/reconciliation"
            className="shrink-0 grid gap-3 border-b bg-card p-4 md:grid-cols-2 xl:grid-cols-[minmax(10rem,12rem)_minmax(10rem,12rem)_minmax(12rem,1fr)_minmax(10rem,12rem)_minmax(10rem,12rem)_minmax(10rem,12rem)_auto] xl:items-end"
          >
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="reconciliation-date-from">
                起始日期
              </label>
              <Input
                id="reconciliation-date-from"
                name="date_from"
                type="date"
                defaultValue={params.date_from || ""}
                className="h-9"
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="reconciliation-date-to">
                截止日期
              </label>
              <Input
                id="reconciliation-date-to"
                name="date_to"
                type="date"
                defaultValue={params.date_to || ""}
                className="h-9"
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="reconciliation-project-id">
                项目 ID
              </label>
              <Input
                id="reconciliation-project-id"
                name="project_id"
                defaultValue={params.project_id || ""}
                placeholder="按项目 ID 精确筛选"
                className="h-9"
              />
            </div>
            <FinanceFilterSelectField
              id="reconciliation-exception-code"
              name="exception_code"
              label="异常类型"
              value={params.exception_code}
              options={EXCEPTION_OPTIONS}
            />
            <FinanceFilterSelectField
              id="reconciliation-level"
              name="level"
              label="等级"
              value={params.level}
              options={LEVEL_OPTIONS}
            />
            <FinanceFilterSelectField
              id="reconciliation-direction"
              name="direction"
              label="方向"
              value={params.direction}
              options={DIRECTION_OPTIONS}
            />
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <Button type="submit" size="sm">筛选</Button>
              <Button asChild type="button" variant="outline" size="sm">
                <Link href="/finance/reconciliation">重置</Link>
              </Button>
            </div>
          </form>
          {data.error ? (
            <div className="shrink-0 border-b p-4">
              <StatusAlert>{data.error}</StatusAlert>
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-auto">
            <FinanceReconciliationTable rows={data.list} />
          </div>
          <div className="shrink-0 flex flex-col gap-3 border-t bg-card px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>当前显示 {data.list.length} 条，共 {data.pagination.total} 条</span>
              <Badge variant="outline" className="tabular-nums">
                每页 {data.pagination.pageSize} 条
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
                  <Link href={reconciliationPageHref(data.pagination.page - 1, params)}>
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
                  <Link href={reconciliationPageHref(data.pagination.page + 1, params)}>
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
