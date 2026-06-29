import Link from "next/link";
import { ProjectStatusConfig } from "@gooes/domain";
import {
  BarChart3,
  CircleDollarSign,
  LineChart,
  ReceiptText,
  WalletCards,
} from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  FinanceFilterSelectField,
} from "@/components/finance/finance-filter-controls";
import { FinanceModuleTabs } from "@/components/finance/finance-module-tabs";
import { FinanceMetricCard } from "@/components/finance/finance-overview-cards";
import {
  fetchFinanceOperatingReport,
  type FinanceOperatingReportGroup,
} from "@/components/finance/finance-operating-report-requests";
import {
  buildFinanceOperatingReportSearchParams,
  financeOperatingGroupByLabel,
} from "@/components/finance/finance-operating-report-utils";
import {
  formatFinanceMoney,
} from "@/components/finance/finance-ledger-utils";
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type FinanceReportsPageSearchParams = {
  date_from?: string;
  date_to?: string;
  group_by?: string;
  project_id?: string;
  project_status?: string;
};

const GROUP_BY_OPTIONS = [
  { value: "month", label: "按月份" },
  { value: "day", label: "按日期" },
  { value: "project", label: "按项目" },
  { value: "payment_type", label: "按收款类型" },
  { value: "cost_category", label: "按成本分类" },
];

const PROJECT_STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  ...Object.entries(ProjectStatusConfig).map(([value, config]) => ({
    value,
    label: config.label,
  })),
];

function clean(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function reportHref(filters: FinanceReportsPageSearchParams) {
  const params = buildFinanceOperatingReportSearchParams(filters);
  return `/finance/reports${params.size ? `?${params}` : ""}`;
}

export default async function FinanceReportsPage({
  searchParams,
}: {
  searchParams: Promise<FinanceReportsPageSearchParams>;
}) {
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

  const params = await searchParams;
  const groupBy = clean(params.group_by) || "month";
  const data = await fetchFinanceOperatingReport({
    date_from: clean(params.date_from),
    date_to: clean(params.date_to),
    group_by: groupBy,
    project_id: clean(params.project_id),
    project_status: clean(params.project_status),
  });
  const summary = data.summary;

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="shrink-0 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <BarChart3 aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal">运营报表</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              按日期、项目、收款类型和成本分类汇总收入、支出、利润与逾期。
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="tabular-nums">
            {data.scope.date_from || "-"} 至 {data.scope.date_to || "-"}
          </Badge>
          {data.scope.truncated ? (
            <Badge variant="warning">已达到源数据上限</Badge>
          ) : null}
        </div>
      </div>

      <FinanceModuleTabs activeTab="reports" />

      <div className="grid shrink-0 gap-2 md:grid-cols-2 xl:grid-cols-4">
        <FinanceMetricCard
          icon={<WalletCards aria-hidden="true" className="size-4" />}
          label="收入"
          value={formatFinanceMoney(summary.received_amount)}
          helper="项目收款入账"
        />
        <FinanceMetricCard
          icon={<ReceiptText aria-hidden="true" className="size-4" />}
          label="支出"
          value={formatFinanceMoney(summary.expense_amount)}
          helper={`未归集 ${formatFinanceMoney(summary.unallocated_expense_amount)}`}
          tone={summary.unallocated_expense_amount > 0 ? "warning" : "normal"}
        />
        <FinanceMetricCard
          icon={<LineChart aria-hidden="true" className="size-4" />}
          label="实际利润"
          value={formatFinanceMoney(summary.actual_profit_amount)}
          helper="收入 - 支出"
          tone={summary.actual_profit_amount < 0 ? "danger" : "normal"}
        />
        <FinanceMetricCard
          icon={<CircleDollarSign aria-hidden="true" className="size-4" />}
          label="待收 / 逾期"
          value={formatFinanceMoney(summary.receivable_remaining_amount)}
          helper={`逾期 ${formatFinanceMoney(summary.overdue_amount)}`}
          tone={summary.overdue_amount > 0 ? "warning" : "normal"}
        />
      </div>

      <Card className="min-h-0 flex-1 overflow-hidden">
        <CardContent className="flex h-full min-h-0 flex-col p-0">
          <form
            action="/finance/reports"
            className="shrink-0 grid gap-3 border-b bg-card p-4 md:grid-cols-2 xl:grid-cols-[minmax(10rem,12rem)_minmax(10rem,12rem)_minmax(11rem,13rem)_minmax(12rem,1fr)_minmax(11rem,13rem)_auto] xl:items-end"
          >
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="report-date-from">
                起始日期
              </label>
              <Input
                id="report-date-from"
                name="date_from"
                type="date"
                defaultValue={params.date_from || ""}
                className="h-9"
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="report-date-to">
                截止日期
              </label>
              <Input
                id="report-date-to"
                name="date_to"
                type="date"
                defaultValue={params.date_to || ""}
                className="h-9"
              />
            </div>
            <FinanceFilterSelectField
              id="report-group-by"
              name="group_by"
              label="分组"
              value={groupBy}
              options={GROUP_BY_OPTIONS}
            />
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="report-project-id">
                项目 ID
              </label>
              <Input
                id="report-project-id"
                name="project_id"
                defaultValue={params.project_id || ""}
                placeholder="按项目 ID 精确筛选"
                className="h-9"
              />
            </div>
            <FinanceFilterSelectField
              id="report-project-status"
              name="project_status"
              label="项目状态"
              value={params.project_status}
              options={PROJECT_STATUS_OPTIONS}
            />
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <Button type="submit" size="sm">筛选</Button>
              <Button asChild type="button" variant="outline" size="sm">
                <Link href="/finance/reports">重置</Link>
              </Button>
            </div>
          </form>
          {data.error ? (
            <div className="shrink-0 border-b p-4">
              <StatusAlert>{data.error}</StatusAlert>
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-auto">
            <OperatingReportTable rows={data.groups} />
          </div>
          <div className="shrink-0 flex flex-col gap-3 border-t bg-card px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{financeOperatingGroupByLabel(data.scope.group_by)}</span>
              <Badge variant="outline" className="tabular-nums">
                {data.groups.length} 组
              </Badge>
              <Badge variant="outline" className="tabular-nums">
                源上限 {data.scope.source_limit} 条
              </Badge>
            </div>
            <Button asChild type="button" variant="outline" size="sm">
              <Link href={reportHref(params)}>刷新</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function OperatingReportTable({ rows }: { rows: FinanceOperatingReportGroup[] }) {
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[920px] border-t">
        <TableHeader className="bg-muted/60">
          <TableRow className="hover:bg-transparent">
            <TableHead>分组</TableHead>
            <TableHead className="text-right">收入</TableHead>
            <TableHead className="text-right">支出</TableHead>
            <TableHead className="text-right">实际利润</TableHead>
            <TableHead className="text-right">待收</TableHead>
            <TableHead className="text-right">逾期</TableHead>
            <TableHead className="text-right">未归集支出</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell>
                  <div className="max-w-[18rem] truncate font-medium">
                    {row.label}
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {row.key}
                  </div>
                </TableCell>
                <MoneyCell value={row.received_amount} />
                <MoneyCell value={row.expense_amount} />
                <MoneyCell
                  value={row.actual_profit_amount}
                  danger={row.actual_profit_amount < 0}
                />
                <MoneyCell value={row.receivable_remaining_amount} />
                <MoneyCell value={row.overdue_amount} danger={row.overdue_amount > 0} />
                <MoneyCell
                  value={row.unallocated_expense_amount}
                  danger={row.unallocated_expense_amount > 0}
                />
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={7} className="h-32 text-center text-sm text-muted-foreground">
                当前筛选条件下暂无运营报表数据
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function MoneyCell({ value, danger = false }: { value: number; danger?: boolean }) {
  return (
    <TableCell
      className={`whitespace-nowrap text-right font-medium tabular-nums ${danger ? "text-red-700" : ""}`}
    >
      {formatFinanceMoney(value)}
    </TableCell>
  );
}
