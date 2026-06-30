import Link from "next/link";
import { ProjectStatusConfig } from "@gooes/domain";
import {
  BarChart3,
  CircleDollarSign,
  Download,
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
  FinanceMonthlyClosingSummaryCard,
} from "@/components/finance/finance-monthly-closing-summary-card";
import {
  fetchFinanceClosingPeriods,
  fetchFinanceMonthlyOverview,
  fetchFinanceOperatingReport,
  type FinanceOperatingReportGroup,
} from "@/components/finance/finance-operating-report-requests";
import {
  fetchFinanceCostCategorySummary,
  fetchFinanceProjectRanking,
  fetchFinanceReceivableAging,
} from "@/components/finance/finance-specialized-report-requests";
import {
  buildFinanceMonthlyOverviewSearchParams,
  buildFinanceOperatingReportSearchParams,
  financeClosingStatusLabel,
  financeClosingStatusVariant,
  financeOperatingGroupByLabel,
} from "@/components/finance/finance-operating-report-utils";
import {
  CostCategorySummaryTable,
  ProjectRankingTable,
  ReceivableAgingTable,
} from "@/components/finance/finance-specialized-report-tables";
import {
  formatFinanceMoney,
  formatFinancePercent,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type FinanceReportsPageSearchParams = {
  month?: string;
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
  const month = clean(filters.month);
  if (month) params.set("month", month);
  return `/finance/reports${params.size ? `?${params}` : ""}`;
}

function monthlyOverviewExportHref(month: string) {
  const params = buildFinanceMonthlyOverviewSearchParams({ month });
  params.set("format", "csv");
  return `/api/backend/finance/reports/monthly-overview/export?${params}`;
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
  const monthlyOverview = await fetchFinanceMonthlyOverview({
    month: clean(params.month),
  });
  const reportMonth = monthlyOverview.scope.month || clean(params.month) || "";
  const dateFrom = clean(params.date_from) || monthlyOverview.scope.date_from;
  const dateTo = clean(params.date_to) || monthlyOverview.scope.date_to;
  const [
    data,
    closingPeriods,
    projectRanking,
    costCategorySummary,
    receivableAging,
  ] = await Promise.all([
    fetchFinanceOperatingReport({
      date_from: dateFrom,
      date_to: dateTo,
      group_by: groupBy,
      project_id: clean(params.project_id),
      project_status: clean(params.project_status),
    }),
    fetchFinanceClosingPeriods({
      month: reportMonth,
      page: 1,
      pageSize: 5,
    }),
    fetchFinanceProjectRanking({
      month: reportMonth,
      project_status: clean(params.project_status),
      page: 1,
      pageSize: 10,
      sort_by: "gross_profit_amount",
      sort_order: "desc",
    }),
    fetchFinanceCostCategorySummary({
      month: reportMonth,
      page: 1,
      pageSize: 10,
      sort_by: "expense_amount",
      sort_order: "desc",
    }),
    fetchFinanceReceivableAging({
      as_of: dateTo,
      project_status: clean(params.project_status),
      page: 1,
      pageSize: 10,
    }),
  ]);
  const summary = monthlyOverview.summary;
  const closing = monthlyOverview.closing;

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="shrink-0 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <BarChart3 aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal">财务报表</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              按月份查看收入、支出、毛利、应收、对账异常和结账快照。
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="tabular-nums">
            {reportMonth || "-"}
          </Badge>
          <Badge
            variant={financeClosingStatusVariant(closing.status)}
            className="tabular-nums"
          >
            {financeClosingStatusLabel(closing.status)}
          </Badge>
          {monthlyOverview.scope.truncated || data.scope.truncated ? (
            <Badge variant="warning">已达到源数据上限</Badge>
          ) : null}
          <Button asChild variant="outline" size="sm">
            <Link href={monthlyOverviewExportHref(reportMonth)} download>
              <Download data-icon="inline-start" />
              导出 CSV
            </Link>
          </Button>
        </div>
      </div>

      <FinanceModuleTabs activeTab="reports" />

      {monthlyOverview.error || closingPeriods.error ||
          projectRanking.error || costCategorySummary.error ||
          receivableAging.error ? (
        <div className="shrink-0 grid gap-2">
          {monthlyOverview.error ? <StatusAlert>{monthlyOverview.error}</StatusAlert> : null}
          {closingPeriods.error ? <StatusAlert>{closingPeriods.error}</StatusAlert> : null}
          {projectRanking.error ? <StatusAlert>{projectRanking.error}</StatusAlert> : null}
          {costCategorySummary.error ? <StatusAlert>{costCategorySummary.error}</StatusAlert> : null}
          {receivableAging.error ? <StatusAlert>{receivableAging.error}</StatusAlert> : null}
        </div>
      ) : null}

      <div className="grid shrink-0 gap-2 md:grid-cols-2 xl:grid-cols-4">
        <FinanceMetricCard
          icon={<WalletCards aria-hidden="true" className="size-4" />}
          label="本月收入"
          value={formatFinanceMoney(summary.income_amount)}
          helper="项目收款入账"
        />
        <FinanceMetricCard
          icon={<ReceiptText aria-hidden="true" className="size-4" />}
          label="本月支出"
          value={formatFinanceMoney(summary.expense_amount)}
          helper={`未归集 ${formatFinanceMoney(summary.unallocated_expense_amount)}`}
          tone={summary.unallocated_expense_amount > 0 ? "warning" : "normal"}
        />
        <FinanceMetricCard
          icon={<LineChart aria-hidden="true" className="size-4" />}
          label="毛利 / 毛利率"
          value={formatFinanceMoney(summary.gross_profit_amount)}
          helper={formatFinancePercent(summary.gross_profit_rate)}
          tone={summary.gross_profit_amount < 0 ? "danger" : "normal"}
        />
        <FinanceMetricCard
          icon={<CircleDollarSign aria-hidden="true" className="size-4" />}
          label="未收 / 异常"
          value={formatFinanceMoney(summary.receivable_remaining_amount)}
          helper={`逾期 ${formatFinanceMoney(summary.overdue_receivable_amount)} · 异常 ${summary.reconciliation_exception_count}`}
          tone={summary.overdue_receivable_amount > 0 || summary.reconciliation_exception_count > 0 ? "warning" : "normal"}
        />
      </div>

      <FinanceMonthlyClosingSummaryCard
        month={reportMonth}
        closing={closing}
        currentSummary={summary}
        latestClosingPeriod={closingPeriods.list[0]}
      />

      <Card className="min-h-0 flex-1 overflow-hidden">
        <CardContent className="flex h-full min-h-0 flex-col p-0">
          <form
            action="/finance/reports"
            className="shrink-0 grid gap-3 border-b bg-card p-4 md:grid-cols-2 xl:grid-cols-[minmax(9rem,10rem)_minmax(10rem,12rem)_minmax(10rem,12rem)_minmax(11rem,13rem)_minmax(12rem,1fr)_minmax(11rem,13rem)_auto] xl:items-end"
          >
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="report-month">
                月份
              </label>
              <Input
                id="report-month"
                name="month"
                type="month"
                defaultValue={reportMonth}
                className="h-9"
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="report-date-from">
                起始日期
              </label>
              <Input
                id="report-date-from"
                name="date_from"
                type="date"
                defaultValue={dateFrom || ""}
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
                defaultValue={dateTo || ""}
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
            <Tabs defaultValue="operating" className="flex min-h-full flex-col">
              <div className="shrink-0 overflow-x-auto border-b bg-muted/20 px-4 py-3">
                <TabsList className="w-max">
                  <TabsTrigger value="operating">运营报表</TabsTrigger>
                  <TabsTrigger value="project-ranking">项目排行</TabsTrigger>
                  <TabsTrigger value="cost-category">成本分类</TabsTrigger>
                  <TabsTrigger value="receivable-aging">应收账龄</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="operating" className="m-0 min-h-0 flex-1 overflow-auto">
                <OperatingReportTable rows={data.groups} />
              </TabsContent>
              <TabsContent value="project-ranking" className="m-0 min-h-0 flex-1 overflow-auto">
                <ProjectRankingTable data={projectRanking} />
              </TabsContent>
              <TabsContent value="cost-category" className="m-0 min-h-0 flex-1 overflow-auto p-0">
                <CostCategorySummaryTable data={costCategorySummary} />
              </TabsContent>
              <TabsContent value="receivable-aging" className="m-0 min-h-0 flex-1 overflow-auto p-4">
                <ReceivableAgingTable data={receivableAging} />
              </TabsContent>
            </Tabs>
          </div>
          <div className="shrink-0 flex flex-col gap-3 border-t bg-card px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{financeOperatingGroupByLabel(data.scope.group_by)}</span>
              <Badge variant="outline" className="tabular-nums">
                {data.scope.date_from || "-"} 至 {data.scope.date_to || "-"}
              </Badge>
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
