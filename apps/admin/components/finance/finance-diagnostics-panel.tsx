import Link from "next/link";
import { AlertTriangle, ListChecks } from "lucide-react";
import {
  FinanceTodoCard,
  formatCollectionRate,
  formatCompactMoney,
} from "@/components/finance/finance-overview-cards";
import type { FinanceProjectOperatingSummaryTotals } from "@/components/finance/finance-requests";
import {
  formatFinanceMoney,
  formatFinancePercent,
} from "@/components/finance/finance-ledger-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function toNumber(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function FinanceDiagnosticsPanel({
  summary,
}: {
  summary: FinanceProjectOperatingSummaryTotals;
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
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
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

      <Card className="min-h-0 flex-1 overflow-hidden shadow-none">
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
        <CardContent className="min-h-0 overflow-auto p-0">
          <div className="grid border-b bg-muted/30 px-4 py-3 text-sm text-muted-foreground lg:grid-cols-3">
            <span>高风险 {highRiskCount} 个 / 预警 {warningRiskCount} 个</span>
            <span>实际支出 {formatFinanceMoney(summary.expense_paid_amount)}</span>
            <span>实际毛利率 {formatFinancePercent(summary.actual_gross_margin)}</span>
          </div>
          <div className="divide-y">
            {issues.map((issue) => (
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
        </CardContent>
      </Card>
    </div>
  );
}
