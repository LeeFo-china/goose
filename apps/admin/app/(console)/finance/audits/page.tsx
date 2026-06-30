import Link from "next/link";
import { ClipboardList, History, ReceiptText } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  FinanceFilterSelectField,
} from "@/components/finance/finance-filter-controls";
import {
  fetchFinanceCorrectionAuditEmployeeOptions,
  fetchFinanceCorrectionAudits,
} from "@/components/finance/finance-correction-audit-requests";
import { FinanceCorrectionAuditTable } from "@/components/finance/finance-correction-audit-table";
import {
  buildFinanceCorrectionAuditSearchParams,
} from "@/components/finance/finance-correction-audit-utils";
import { FinanceModuleTabs } from "@/components/finance/finance-module-tabs";
import { FinanceMetricCard } from "@/components/finance/finance-overview-cards";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type FinanceCorrectionAuditPageSearchParams = {
  page?: string;
  date_from?: string;
  date_to?: string;
  project_id?: string;
  operation?: string;
  actor_employee_id?: string;
};

const OPERATION_OPTIONS = [
  { value: "", label: "全部类型" },
  { value: "manual_allocation", label: "人工核销" },
  { value: "adjust_allocation", label: "调整核销" },
  { value: "reverse_allocation", label: "撤销核销" },
  { value: "generate_payment_ledger", label: "补生成收款台账" },
  { value: "generate_expense_ledger", label: "补生成支出台账" },
  { value: "link_ledger_payment", label: "关联收款" },
  { value: "mark_legacy_ledger", label: "标记历史流水" },
  { value: "update_expense_ledger_category", label: "补支出台账成本分类" },
  { value: "record_expense_amount_mismatch_review", label: "记录费用金额复核" },
];

function normalizePage(value: string | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function clean(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function auditPageHref(
  page: number,
  filters: FinanceCorrectionAuditPageSearchParams,
) {
  const params = buildFinanceCorrectionAuditSearchParams({
    page,
    pageSize: 20,
    date_from: filters.date_from,
    date_to: filters.date_to,
    project_id: filters.project_id,
    operation: filters.operation,
    actor_employee_id: filters.actor_employee_id,
  });
  return `/finance/audits?${params}`;
}

export default async function FinanceCorrectionAuditPage({
  searchParams,
}: {
  searchParams: Promise<FinanceCorrectionAuditPageSearchParams>;
}) {
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

  const params = await searchParams;
  const page = normalizePage(params.page);
  const [data, employeeOptions] = await Promise.all([
    fetchFinanceCorrectionAudits({
      page,
      pageSize: 20,
      date_from: clean(params.date_from),
      date_to: clean(params.date_to),
      project_id: clean(params.project_id),
      operation: clean(params.operation),
      actor_employee_id: clean(params.actor_employee_id),
    }),
    fetchFinanceCorrectionAuditEmployeeOptions(clean(params.actor_employee_id)),
  ]);
  const canGoPrev = data.pagination.page > 1;
  const canGoNext = data.pagination.totalPages > 0 &&
    data.pagination.page < data.pagination.totalPages;

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="shrink-0 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <ClipboardList aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal">修正审计</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              追溯财务人工核销和台账修正记录。当前共 {data.pagination.total} 条记录。
            </p>
          </div>
        </div>
        <Badge variant="outline" className="w-fit tabular-nums">
          第 {data.pagination.page || 1} / {Math.max(data.pagination.totalPages || 0, 1)} 页
        </Badge>
      </div>

      <FinanceModuleTabs activeTab="audits" />

      {data.error ? (
        <StatusAlert
          tone="warning"
          title="修正审计加载失败"
        >
          {data.error}
        </StatusAlert>
      ) : null}

      <div className="grid shrink-0 gap-2 md:grid-cols-3">
        <FinanceMetricCard
          icon={<ClipboardList aria-hidden="true" className="size-4" />}
          label="修正总数"
          value={`${data.summary.total} 条`}
          helper="当前筛选范围"
        />
        <FinanceMetricCard
          icon={<ReceiptText aria-hidden="true" className="size-4" />}
          label="台账修正"
          value={`${data.summary.ledger_repair} 条`}
          helper="关联收款和历史流水"
        />
        <FinanceMetricCard
          icon={<History aria-hidden="true" className="size-4" />}
          label="应收核销修正"
          value={`${data.summary.receivable_allocation} 条`}
          helper="人工核销、调整和撤销"
        />
      </div>

      <Card className="min-h-0 flex-1 overflow-hidden">
        <CardContent className="flex h-full min-h-0 flex-col p-0">
          <form
            action="/finance/audits"
            className="shrink-0 grid gap-3 border-b bg-card p-4 md:grid-cols-2 xl:grid-cols-[minmax(9rem,11rem)_minmax(9rem,11rem)_minmax(12rem,1fr)_minmax(11rem,13rem)_minmax(12rem,1fr)_auto] xl:items-end"
          >
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="audit-date-from">
                起始日期
              </label>
              <Input
                id="audit-date-from"
                name="date_from"
                type="date"
                defaultValue={params.date_from || ""}
                className="h-9"
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="audit-date-to">
                截止日期
              </label>
              <Input
                id="audit-date-to"
                name="date_to"
                type="date"
                defaultValue={params.date_to || ""}
                className="h-9"
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="audit-project-id">
                项目 ID
              </label>
              <Input
                id="audit-project-id"
                name="project_id"
                defaultValue={params.project_id || ""}
                className="h-9"
              />
            </div>
            <FinanceFilterSelectField
              id="audit-operation"
              name="operation"
              label="修正类型"
              value={params.operation}
              options={OPERATION_OPTIONS}
            />
            <FinanceFilterSelectField
              id="audit-actor-employee-id"
              name="actor_employee_id"
              label="操作人"
              value={params.actor_employee_id}
              options={employeeOptions}
            />
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <Button type="submit" size="sm">筛选</Button>
              <Button asChild type="button" variant="outline" size="sm">
                <Link href="/finance/audits">重置</Link>
              </Button>
            </div>
          </form>

          <div className="min-h-0 flex-1 overflow-auto">
            <FinanceCorrectionAuditTable rows={data.list} />
          </div>

          <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-t bg-card px-4 py-3">
            <p className="text-sm text-muted-foreground">
              共 {data.pagination.total} 条，每页 {data.pagination.pageSize} 条
            </p>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm" disabled={!canGoPrev}>
                <Link
                  href={canGoPrev ? auditPageHref(data.pagination.page - 1, params) : "#"}
                  aria-disabled={!canGoPrev}
                >
                  上一页
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" disabled={!canGoNext}>
                <Link
                  href={canGoNext ? auditPageHref(data.pagination.page + 1, params) : "#"}
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
