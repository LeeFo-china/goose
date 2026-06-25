import Link from "next/link";
import { AlertTriangle, ListChecks } from "lucide-react";
import {
  FinanceTodoCard,
  formatCollectionRate,
  formatCompactMoney,
} from "@/components/finance/finance-overview-cards";
import type {
  FinanceProjectOperatingSummaryTotals,
  FinanceProjectSummaryAnalytics,
  FinanceProjectSummaryRankingItem,
} from "@/components/finance/finance-requests";
import {
  formatFinanceMoney,
  formatFinancePercent,
} from "@/components/finance/finance-ledger-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type FinanceDiagnosticView = "all" | "danger" | "data" | "receivables";

function toNumber(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function FinanceDiagnosticsPanel({
  summary,
  analytics,
  activeView,
}: {
  summary: FinanceProjectOperatingSummaryTotals;
  analytics: FinanceProjectSummaryAnalytics;
  activeView: FinanceDiagnosticView;
}) {
  const riskCounts = summary.risk_counts || {
    normal: 0,
    info: 0,
    warning: 0,
    danger: 0,
  };
  const flagCounts = summary.risk_flag_counts || {};
  const projectCount = Number(summary.project_count || 0);
  const budgetMissingCount = Number(flagCounts.budget_missing || 0);
  const unallocatedProjectCount = Number(flagCounts.unallocated_expense || 0);
  const overdueProjectCount = Number(flagCounts.receivable_overdue || 0);
  const actualGrossMargin = Number(summary.actual_gross_margin);
  const hasAbnormalGrossMargin = Number.isFinite(actualGrossMargin) &&
    actualGrossMargin > 0.6;
  const highRiskCount = Number(riskCounts.danger || 0);
  const warningRiskCount = Number(riskCounts.warning || 0);

  const issues = [
    {
      title: "预算配置完整性",
      value: `${budgetMissingCount} 个项目`,
      description: budgetMissingCount > 0
        ? "未配置成本预算会导致预算利润和预算使用率不可判断。"
        : "当前筛选范围内项目预算配置完整。",
      href: "/finance?page=1&budget_configured=false",
      action: "查看项目",
      active: budgetMissingCount > 0,
      view: "data",
    },
    {
      title: "成本归集完整性",
      value: formatFinanceMoney(summary.unallocated_expense_amount),
      description: unallocatedProjectCount > 0
        ? "未归集成本会拉高实际利润和毛利率。"
        : "当前没有发现未归集成本。",
      href: "/finance/ledger?direction=out&unallocated_only=true",
      action: "去归集",
      active: unallocatedProjectCount > 0,
      view: "data",
    },
    {
      title: "利润异常",
      value: formatFinancePercent(summary.actual_gross_margin),
      description: hasAbnormalGrossMargin
        ? "实际毛利率明显偏高，建议优先核查成本是否完整入账。"
        : "实际毛利率未触发异常偏高提示。",
      href: "/finance?page=1&has_unallocated_expense=true",
      action: "核查成本",
      active: hasAbnormalGrossMargin,
      view: "danger",
    },
    {
      title: "应收逾期",
      value: `${summary.overdue_count} 笔`,
      description: overdueProjectCount > 0
        ? "存在逾期应收，建议跟进收款节点和项目负责人。"
        : "当前没有逾期应收项目。",
      href: "/finance/receivables?overdue_only=true",
      action: "查看应收",
      active: overdueProjectCount > 0,
      view: "receivables",
    },
  ];
  const visibleIssues = activeView === "all"
    ? issues
    : issues.filter((issue) => issue.view === activeView);
  const rankingItems = resolveRankingItems(analytics, activeView);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="shrink-0 overflow-x-auto overflow-y-hidden">
        <div className="flex min-w-max items-center gap-5">
          {[
            { value: "all", label: "全部" },
            { value: "danger", label: "高风险" },
            { value: "data", label: "待补数据" },
            { value: "receivables", label: "应收逾期" },
          ].map((item) => {
            const active = item.value === activeView;
            return (
              <a
                key={item.value}
                href={item.value === "all" ? "/finance/diagnostics" : `/finance/diagnostics?view=${item.value}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center border-b-2 border-transparent text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                  active && "border-primary text-foreground",
                )}
              >
                {item.label}
              </a>
            );
          })}
        </div>
      </div>

      <div className="grid shrink-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <FinanceTodoCard
          title="未配置预算"
          value={`${budgetMissingCount} 个`}
          helper={`预算使用率 ${formatFinancePercent(summary.budget_usage_ratio)}`}
          actionLabel="去配置"
          href="/finance?page=1&budget_configured=false"
          tone={budgetMissingCount > 0 ? "warning" : "normal"}
        />
        <FinanceTodoCard
          title="未归集成本"
          value={`${unallocatedProjectCount} 个`}
          helper={formatFinanceMoney(summary.unallocated_expense_amount)}
          actionLabel="去归集"
          href="/finance/ledger?direction=out&unallocated_only=true"
          tone={unallocatedProjectCount > 0 ? "warning" : "normal"}
        />
        <FinanceTodoCard
          title="预算利润偏差"
          value={formatFinanceMoney(summary.profit_variance_amount)}
          helper={`预算利润 ${formatFinanceMoney(summary.projected_budget_profit_amount)}`}
          actionLabel="看偏差"
          href="/finance?page=1&risk_flag=low_projected_margin"
          tone={toNumber(summary.profit_variance_amount) < 0 ? "danger" : "normal"}
        />
        <FinanceTodoCard
          title="逾期应收"
          value={formatFinanceMoney(summary.overdue_amount)}
          helper={`${summary.overdue_count} 笔 / ${overdueProjectCount} 个项目`}
          actionLabel="看应收"
          href="/finance/receivables?overdue_only=true"
          tone={toNumber(summary.overdue_amount) > 0 ? "danger" : "normal"}
        />
      </div>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 border-b p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700">
                <ListChecks aria-hidden="true" className="size-4" />
              </span>
              <div className="min-w-0">
                <CardTitle>财务诊断</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  筛选 {projectCount} 个项目，合同 {formatCompactMoney(summary.contract_amount)}，
                  已收 {formatCompactMoney(summary.received_amount)}，回款率 {formatCollectionRate(summary.received_amount, summary.contract_amount)}。
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/finance?page=1&risk_level=danger">
                  查看高风险项目
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link href={budgetMissingCount > 0
                  ? "/finance?page=1&budget_configured=false"
                  : "/finance?page=1&has_unallocated_expense=true"}
                >
                  处理财务待办
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-auto p-0">
          <div className="grid border-b bg-muted/30 px-4 py-3 text-sm text-muted-foreground lg:grid-cols-4">
            <span>高风险 {highRiskCount} 个 / 预警 {warningRiskCount} 个</span>
            <span>实际支出 {formatFinanceMoney(summary.expense_paid_amount)}</span>
            <span>实际毛利率 {formatFinancePercent(summary.actual_gross_margin)}</span>
            <span>
              分析 {analytics.scope.project_count} 个项目
              {analytics.scope.truncated ? `（前 ${analytics.scope.project_limit} 个）` : ""}
            </span>
          </div>
          <div className="divide-y">
            {visibleIssues.map((issue) => (
              <div
                key={issue.title}
                className="grid gap-3 px-4 py-3 lg:grid-cols-[10rem_10rem_minmax(0,1fr)_auto] lg:items-center"
              >
                <div className="flex items-center gap-2 font-medium">
                  {issue.active ? (
                    <AlertTriangle className="size-4 text-warning" aria-hidden="true" />
                  ) : null}
                  {issue.title}
                </div>
                <div className={issue.active
                  ? "font-semibold text-foreground tabular-nums"
                  : "text-muted-foreground tabular-nums"}
                >
                  {issue.value}
                </div>
                <p className="text-sm text-muted-foreground">{issue.description}</p>
                <Button asChild variant="outline" size="sm">
                  <Link href={issue.href}>{issue.action}</Link>
                </Button>
              </div>
            ))}
          </div>
          <div className="border-t bg-muted/20 px-4 py-3">
            <h3 className="text-sm font-semibold">重点项目</h3>
            <div className="mt-2 divide-y rounded-md border bg-card">
              {rankingItems.length ? rankingItems.map((item) => (
                <div
                  key={`${item.project_id}-${item.helper}`}
                  className="grid gap-2 px-3 py-2 text-sm lg:grid-cols-[minmax(0,1fr)_8rem_8rem_auto] lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {item.project_name || item.project_id}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {item.helper}
                    </div>
                  </div>
                  <div className="font-medium tabular-nums">
                    {formatRankingValue(item)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {item.risk_level === "danger" ? "高风险" : item.risk_level === "warning" ? "预警" : "待处理"}
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href={item.target}>处理</Link>
                  </Button>
                </div>
              )) : (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  当前视图暂无重点项目。
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function resolveRankingItems(
  analytics: FinanceProjectSummaryAnalytics,
  activeView: FinanceDiagnosticView,
) {
  const rankings = analytics.rankings;
  if (activeView === "danger") return rankings.high_risk;
  if (activeView === "data") {
    return uniqueRankings([
      ...rankings.unallocated_expense,
      ...rankings.low_margin,
    ]);
  }
  if (activeView === "receivables") return rankings.overdue_receivable;
  return uniqueRankings([
    ...rankings.high_risk,
    ...rankings.unallocated_expense,
    ...rankings.overdue_receivable,
    ...rankings.low_margin,
  ]);
}

function uniqueRankings(items: FinanceProjectSummaryRankingItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.project_id}-${item.helper}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

function formatRankingValue(item: FinanceProjectSummaryRankingItem) {
  if (item.value > 0 && item.value <= 1 && item.helper.includes("毛利")) {
    return formatFinancePercent(item.value);
  }
  return formatFinanceMoney(item.value);
}
