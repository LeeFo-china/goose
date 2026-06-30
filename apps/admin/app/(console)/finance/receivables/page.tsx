import Link from "next/link";
import { PaymentTypeConfig } from "@gooes/domain";
import { CalendarClock } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { FinanceModuleTabs } from "@/components/finance/finance-module-tabs";
import { FinanceReceivableCreateButton } from "@/components/finance/finance-receivable-actions";
import { FinanceReceivableFilters } from "@/components/finance/finance-receivable-filters";
import { FinanceReceivablesTable } from "@/components/finance/finance-receivables-table";
import { fetchFinanceReceivables } from "@/components/finance/finance-requests";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type FinanceReceivablesPageSearchParams = {
  page?: string;
  status?: string;
  payment_type?: string;
  source_type?: string;
  owner_employee_id?: string;
  receivable_plan_id?: string;
  project_id?: string;
  due_date_from?: string;
  due_date_to?: string;
  overdue_only?: string;
  follow_up_due_only?: string;
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

const SOURCE_TYPE_OPTIONS = [
  { value: "", label: "全部来源" },
  { value: "workflow_node", label: "流程生成" },
  { value: "manual", label: "人工创建" },
  { value: "migration", label: "历史迁移" },
  { value: "add_on", label: "增项" },
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
  append(params, "source_type", input.filters.source_type);
  append(params, "owner_employee_id", input.filters.owner_employee_id);
  append(params, "receivable_plan_id", input.filters.receivable_plan_id);
  append(params, "project_id", input.filters.project_id);
  append(params, "due_date_from", input.filters.due_date_from);
  append(params, "due_date_to", input.filters.due_date_to);
  if (input.filters.overdue_only === "true") params.set("overdue_only", "true");
  if (input.filters.follow_up_due_only === "true") {
    params.set("follow_up_due_only", "true");
  }
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
    source_type: clean(params.source_type),
    owner_employee_id: clean(params.owner_employee_id),
    receivable_plan_id: clean(params.receivable_plan_id),
    project_id: clean(params.project_id),
    due_date_from: clean(params.due_date_from),
    due_date_to: clean(params.due_date_to),
    overdue_only: params.overdue_only === "true",
    follow_up_due_only: params.follow_up_due_only === "true",
  });
  const status = clean(params.status);
  const paymentType = clean(params.payment_type);
  const sourceType = clean(params.source_type);
  const ownerEmployeeId = clean(params.owner_employee_id);
  const receivablePlanId = clean(params.receivable_plan_id);
  const projectId = clean(params.project_id);
  const dueDateFrom = clean(params.due_date_from);
  const dueDateTo = clean(params.due_date_to);
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
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Badge variant="outline" className="w-fit tabular-nums">
            第 {data.pagination.page || 1} / {Math.max(data.pagination.totalPages || 0, 1)} 页
          </Badge>
          <FinanceReceivableCreateButton />
        </div>
      </div>

      <FinanceModuleTabs activeTab="receivables" />

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardHeader className="shrink-0 gap-3 border-b p-3 md:gap-4 md:p-4">
          <div className="hidden flex-col justify-between gap-3 md:flex lg:flex-row lg:items-start">
            <div className="min-w-0">
              <CardTitle>应收计划列表</CardTitle>
              <CardDescription>
                按状态、收款类型、来源、项目、负责人和应收日期筛选应收记录。
              </CardDescription>
            </div>
            <Badge variant="outline" className="w-fit tabular-nums">
              当前显示 {data.list.length} / {data.pagination.total} 条
            </Badge>
          </div>
          <FinanceReceivableFilters
            dueDateFrom={dueDateFrom}
            dueDateTo={dueDateTo}
            followUpDueOnly={params.follow_up_due_only === "true"}
            ownerEmployeeId={ownerEmployeeId}
            paymentType={paymentType}
            paymentTypeOptions={PAYMENT_TYPE_OPTIONS}
            projectId={projectId}
            receivablePlanId={receivablePlanId}
            sourceType={sourceType}
            sourceTypeOptions={SOURCE_TYPE_OPTIONS}
            status={status}
            statusOptions={RECEIVABLE_STATUS_OPTIONS}
            overdueOnly={params.overdue_only === "true"}
          />
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          {data.error ? (
            <div className="shrink-0 border-b p-4">
              <StatusAlert>{data.error}</StatusAlert>
            </div>
          ) : null}
          <div
            data-testid="tenant-receivables-table-viewport"
            className="min-h-0 flex-1 overflow-auto"
          >
            <FinanceReceivablesTable
              rows={data.list}
              highlightReceivablePlanId={receivablePlanId}
            />
          </div>
        </CardContent>
        <CardFooter className="shrink-0 flex-col gap-3 border-t px-4 py-3 md:flex-row md:items-center md:justify-between">
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
        </CardFooter>
      </Card>
    </div>
  );
}
