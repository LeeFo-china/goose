"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CircleDollarSign,
  ReceiptText,
  WalletCards,
} from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import type { FinanceProjectOperatingSummary } from "@/components/finance/finance-requests";
import {
  formatFinanceMoney,
  formatFinancePercent,
} from "@/components/finance/finance-ledger-utils";
import {
  financeRiskActionHref,
  financeRiskLabel,
  financeRiskVariant,
} from "@/components/finance/finance-risk-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requestProject } from "@/components/projects/project-mutation-utils";
import {
  CompactMetric,
  MoneyFlowChart,
  type MoneyFlowItem,
  ProgressTile,
  SectionHeading,
  StatusListItem,
  type StatusItem,
} from "@/components/projects/project-finance-operating-summary-widgets";

export function ProjectFinanceOperatingSummaryPanel({
  projectId,
  refreshVersion = 0,
}: {
  projectId: string;
  refreshVersion?: number;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<FinanceProjectOperatingSummary | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    requestProject<FinanceProjectOperatingSummary>({
      path: `/projects/${projectId}/finance-summary`,
      signal: controller.signal,
    })
      .then((payload) => {
        setData(payload);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "经营财务摘要加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [projectId, refreshVersion]);

  const summary = data || emptySummary(projectId);
  const overdueText = summary.overdue_count > 0
    ? `${formatFinanceMoney(summary.overdue_amount)} / ${summary.overdue_count} 笔`
    : "无逾期";
  const risk = summary.risk_level || "normal";
  const collectionRatio = ratio(
    summary.received_amount,
    summary.contract_amount,
  );
  const budgetUsageRatio = summary.budget_configured
    ? normalizeRatio(summary.budget_usage_ratio)
    : null;
  const flowData = buildMoneyFlowData(summary);
  const statusItems = buildStatusItems(summary, projectId, overdueText);

  return (
    <section
      data-testid="project-finance-operating-summary"
      className="rounded-lg border bg-card p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <ReceiptText className="size-4 text-muted-foreground" />
          <h3 className="text-base font-semibold">经营财务摘要</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="tabular-nums">
            {summary.ledger_entry_count} 条流水
          </Badge>
          <Badge variant={financeRiskVariant(risk)}>
            {loading ? "加载中" : financeRiskLabel(risk)}
          </Badge>
          <Button asChild type="button" variant="outline" size="sm">
            <Link href={`/finance/receivables?project_id=${projectId}`}>
              查看应收
            </Link>
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mt-3">
          <StatusAlert>{error}</StatusAlert>
        </div>
      ) : null}

      <div className="mt-3 grid min-w-0 gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr))]">
        <section className="min-w-0 rounded-md border bg-background p-3">
          <SectionHeading
            icon={<CircleDollarSign className="size-4" />}
            title="核心进度"
            helper="收款与预算执行"
          />
          <div className="mt-3 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr))]">
            <ProgressTile
              title="收款进度"
              progress={collectionRatio}
              loading={loading}
              primaryLabel="已收金额"
              primaryValue={formatFinanceMoney(summary.received_amount)}
              secondaryLabel="待收金额"
              secondaryValue={formatFinanceMoney(summary.receivable_remaining_amount)}
              emptyText={summary.contract_amount > 0 ? "暂无收款" : "未录入合同额"}
              overLimit={false}
            />
            <ProgressTile
              title="预算执行率"
              progress={budgetUsageRatio}
              loading={loading}
              primaryLabel="已付支出"
              primaryValue={formatFinanceMoney(summary.expense_paid_amount)}
              secondaryLabel="预算剩余"
              secondaryValue={budgetText(summary, "budget_remaining_amount")}
              emptyText={summary.budget_configured ? "暂无支出" : "未配置预算"}
              overLimit={Boolean(
                summary.budget_configured
                && budgetUsageRatio !== null
                && budgetUsageRatio > 1,
              )}
            />
          </div>
        </section>

        <section className="min-w-0 rounded-md border bg-background p-3">
          <SectionHeading
            icon={<WalletCards className="size-4" />}
            title="资金流向"
            helper="合同、回款、成本与利润"
          />
          <MoneyFlowChart data={flowData} loading={loading} />
          <div className="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,8.5rem),1fr))]">
            <CompactMetric
              label="合同金额"
              value={formatFinanceMoney(summary.contract_amount)}
              loading={loading}
            />
            <CompactMetric
              label="实际利润"
              value={formatFinanceMoney(summary.actual_profit_amount)}
              loading={loading}
              danger={summary.actual_profit_amount < 0}
            />
            <CompactMetric
              label="预测利润"
              value={formatFinanceMoney(summary.projected_profit_amount)}
              loading={loading}
              danger={summary.projected_profit_amount < 0}
            />
            <CompactMetric
              label="实际毛利率"
              value={formatFinancePercent(summary.actual_gross_margin)}
              loading={loading}
            />
          </div>
        </section>

        <section className="min-w-0 rounded-md border bg-background p-3">
          <SectionHeading
            icon={<AlertTriangle className="size-4" />}
            title="状态预警"
            helper="优先处理影响利润的数据"
          />
          <div className="mt-3 space-y-2">
            {statusItems.map((item) => (
              <StatusListItem key={item.key} item={item} loading={loading} />
            ))}
          </div>
          {!loading && summary.risk_reasons.length ? (
            <div className="mt-3 border-t pt-3">
              <div className="text-xs font-medium text-muted-foreground">
                风险说明
              </div>
              <div className="mt-2 space-y-2">
                {summary.risk_reasons.slice(0, 3).map((reason) => {
                  const href = financeRiskActionHref(reason.action);
                  return (
                    <div key={reason.code} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <Badge variant={financeRiskVariant(reason.level)}>
                            {financeRiskLabel(reason.level)}
                          </Badge>
                          <span className="truncate text-sm font-medium">
                            {reason.title}
                          </span>
                        </div>
                        {href ? (
                          <Button asChild type="button" variant="outline" size="sm">
                            <Link href={href}>
                              {reason.action?.label || "处理"}
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {reason.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </section>
  );
}

function buildMoneyFlowData(
  summary: FinanceProjectOperatingSummary,
): MoneyFlowItem[] {
  return [
    { label: "合同金额", value: toNumber(summary.contract_amount), kind: "base" },
    { label: "已收金额", value: toNumber(summary.received_amount), kind: "income" },
    { label: "已付支出", value: toNumber(summary.expense_paid_amount), kind: "cost" },
    { label: "实际利润", value: toNumber(summary.actual_profit_amount), kind: "profit" },
    { label: "预测利润", value: toNumber(summary.projected_profit_amount), kind: "forecast" },
  ];
}

function buildStatusItems(
  summary: FinanceProjectOperatingSummary,
  projectId: string,
  overdueText: string,
): StatusItem[] {
  const hasOverdue = summary.overdue_count > 0;
  const hasUnallocatedExpense = summary.unallocated_expense_amount > 0;
  const budgetLevel = budgetRiskLevel(summary);

  return [
    {
      key: "overdue",
      title: "逾期应收",
      value: overdueText,
      description: hasOverdue
        ? "存在已逾期回款，需要优先跟进。"
        : "当前没有逾期应收。",
      level: hasOverdue ? "danger" : "normal",
      href: hasOverdue
        ? `/finance/receivables?project_id=${projectId}&overdue_only=true`
        : undefined,
      actionLabel: "查看",
    },
    {
      key: "unallocated",
      title: "未归集成本",
      value: formatFinanceMoney(summary.unallocated_expense_amount),
      description: hasUnallocatedExpense
        ? `${summary.unallocated_expense_items.length || "有"} 条费用需要归集到成本分类。`
        : "项目费用已完成成本归集。",
      level: hasUnallocatedExpense ? "warning" : "normal",
      href: hasUnallocatedExpense
        ? `/finance/ledger?project_id=${projectId}&unallocated_only=true`
        : undefined,
      actionLabel: "归集",
    },
    {
      key: "budget",
      title: "预算状态",
      value: summary.budget_configured
        ? formatFinancePercent(summary.budget_usage_ratio)
        : "未配置",
      description: summary.budget_configured
        ? `预算成本 ${formatFinanceMoney(summary.budget_cost_amount)}，剩余 ${formatFinanceMoney(summary.budget_remaining_amount)}。`
        : "未配置成本预算，利润分析可能不准确。",
      level: budgetLevel,
      href: budgetLevel === "normal" ? undefined : `/projects/${projectId}?tab=overview`,
      actionLabel: summary.budget_configured ? "查看" : "配置",
    },
  ];
}

function budgetRiskLevel(summary: FinanceProjectOperatingSummary) {
  const usageRatio = normalizeRatio(summary.budget_usage_ratio);
  if (!summary.budget_configured) return "warning";
  if (usageRatio !== null && usageRatio > 1) return "danger";
  return "normal";
}

function toNumber(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function ratio(
  numerator: number | string | null | undefined,
  denominator: number | string | null | undefined,
) {
  const top = toNumber(numerator);
  const bottom = toNumber(denominator);
  if (bottom <= 0) return null;
  return top / bottom;
}

function normalizeRatio(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const ratioValue = Number(value);
  return Number.isFinite(ratioValue) ? ratioValue : null;
}

function emptySummary(projectId: string): FinanceProjectOperatingSummary {
  return {
    project_id: projectId,
    project_name: null,
    project_status: null,
    contract_amount: 0,
    receivable_amount: 0,
    received_amount: 0,
    receivable_remaining_amount: 0,
    overdue_amount: 0,
    overdue_count: 0,
    expense_paid_amount: 0,
    actual_profit_amount: 0,
    projected_profit_amount: 0,
    net_cash_flow_amount: 0,
    actual_gross_margin: null,
    projected_gross_margin: null,
    ledger_entry_count: 0,
    budget_configured: false,
    budget_cost_amount: 0,
    budget_remaining_amount: 0,
    budget_usage_ratio: null,
    unallocated_expense_amount: 0,
    projected_budget_profit_amount: 0,
    profit_variance_amount: 0,
    projected_budget_gross_margin: null,
    risk_level: "normal",
    risk_flags: [],
    risk_reasons: [],
    unallocated_expense_items: [],
  };
}

function budgetText(
  summary: FinanceProjectOperatingSummary,
  key: keyof Pick<
    FinanceProjectOperatingSummary,
    | "budget_cost_amount"
    | "budget_remaining_amount"
    | "projected_budget_profit_amount"
  >,
) {
  if (!summary.budget_configured) return "未配置";
  return formatFinanceMoney(summary[key]);
}
