import Link from "next/link";
import { PaymentTypeConfig } from "@gooes/domain";
import { CalendarClock } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  FinanceCheckboxField,
  FinanceFilterSelectField,
} from "@/components/finance/finance-filter-controls";
import { FinanceModuleTabs } from "@/components/finance/finance-module-tabs";
import { FinanceReceivablesTable } from "@/components/finance/finance-receivables-table";
import { fetchFinanceReceivables } from "@/components/finance/finance-requests";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type FinanceReceivablesPageSearchParams = {
  page?: string;
  status?: string;
  payment_type?: string;
  project_id?: string;
  due_date_from?: string;
  due_date_to?: string;
  overdue_only?: string;
};

const RECEIVABLE_STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "pending", label: "待收" },
  { value: "partially_paid", label: "部分收款" },
  { value: "paid", label: "已收" },
  { value: "overdue", label: "逾期" },
  { value: "canceled", label: "已取消" },
];

const PAYMENT_TYPE_OPTIONS = [
  { value: "", label: "全部类型" },
  ...(["deposit", "stage_1", "stage_2", "stage_3", "add_on"] as const)
    .map((value) => ({ value, label: PaymentTypeConfig[value].label })),
];

function normalizePage(value: string | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function clean(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function buildReceivableHref(input: {
  page: number;
  filters: FinanceReceivablesPageSearchParams;
}) {
  const params = new URLSearchParams();
  params.set("page", String(input.page));
  append(params, "status", input.filters.status);
  append(params, "payment_type", input.filters.payment_type);
  append(params, "project_id", input.filters.project_id);
  append(params, "due_date_from", input.filters.due_date_from);
  append(params, "due_date_to", input.filters.due_date_to);
  if (input.filters.overdue_only === "true") params.set("overdue_only", "true");
  return `/finance/receivables?${params}`;
}

function append(params: URLSearchParams, key: string, value: string | undefined) {
  const normalized = clean(value);
  if (normalized) params.set(key, normalized);
}

export default async function FinanceReceivablesPage({
  searchParams,
}: {
  searchParams: Promise<FinanceReceivablesPageSearchParams>;
}) {
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

  const params = await searchParams;
  const page = normalizePage(params.page);
  const data = await fetchFinanceReceivables({
    page,
    pageSize: 20,
    status: clean(params.status),
    payment_type: clean(params.payment_type),
    project_id: clean(params.project_id),
    due_date_from: clean(params.due_date_from),
    due_date_to: clean(params.due_date_to),
    overdue_only: params.overdue_only === "true",
  });
  const canGoPrev = data.pagination.page > 1;
  const canGoNext = data.pagination.totalPages > 0 &&
    data.pagination.page < data.pagination.totalPages;

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="shrink-0 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <CalendarClock aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal">应收计划</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              项目收款节点生成的应收、已收、未收和逾期状态。当前共 {data.pagination.total} 条记录。
            </p>
          </div>
        </div>
        <Badge variant="outline" className="w-fit tabular-nums">
          第 {data.pagination.page || 1} / {Math.max(data.pagination.totalPages || 0, 1)} 页
        </Badge>
      </div>

      <FinanceModuleTabs activeTab="receivables" />

      <Card className="min-h-0 flex-1 overflow-hidden">
        <CardContent className="flex h-full min-h-0 flex-col p-0">
          <form
            action="/finance/receivables"
            className="shrink-0 grid gap-3 border-b bg-card p-4 md:grid-cols-[minmax(9rem,12rem)_minmax(9rem,12rem)_minmax(12rem,1fr)_minmax(10rem,12rem)_minmax(10rem,12rem)_auto] md:items-end"
          >
            <FinanceFilterSelectField
              id="receivable-status"
              name="status"
              label="状态"
              value={params.status}
              options={RECEIVABLE_STATUS_OPTIONS}
            />
            <FinanceFilterSelectField
              id="receivable-payment-type"
              name="payment_type"
              label="收款类型"
              value={params.payment_type}
              options={PAYMENT_TYPE_OPTIONS}
            />
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="receivable-project-id">
                项目 ID
              </label>
              <Input
                id="receivable-project-id"
                name="project_id"
                defaultValue={params.project_id || ""}
                placeholder="按项目 ID 精确筛选"
                className="h-9"
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="receivable-due-from">
                起始日期
              </label>
              <Input
                id="receivable-due-from"
                name="due_date_from"
                type="date"
                defaultValue={params.due_date_from || ""}
                className="h-9"
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="receivable-due-to">
                截止日期
              </label>
              <Input
                id="receivable-due-to"
                name="due_date_to"
                type="date"
                defaultValue={params.due_date_to || ""}
                className="h-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              <FinanceCheckboxField
                id="receivable-overdue-only"
                name="overdue_only"
                value="true"
                checked={params.overdue_only === "true"}
                label="只看逾期"
              />
              <Button type="submit" size="sm">筛选</Button>
              <Button asChild type="button" variant="outline" size="sm">
                <Link href="/finance/receivables">重置</Link>
              </Button>
            </div>
          </form>
          {data.error ? (
            <div className="shrink-0 border-b p-4">
              <StatusAlert>{data.error}</StatusAlert>
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-auto">
            <FinanceReceivablesTable rows={data.list} />
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
                  <Link
                    href={buildReceivableHref({
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
                    href={buildReceivableHref({
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
