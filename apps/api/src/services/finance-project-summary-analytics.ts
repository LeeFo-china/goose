import type {
  FinanceProjectSummaryProjectRow,
} from "@/repositories/finance-project-summary";
import { financeProjectSummaryRepository } from "@/repositories/finance-project-summary";
import type { FinanceProjectSummaryListQuery } from "@/schema/finance";
import type { FinanceProjectRiskLevel } from "@/services/finance-project-risk";
import type { FinanceProjectOperatingSummary } from "@/services/finance-project-summary";

export type FinanceProjectSummaryRankingItem = {
  project_id: string;
  project_name: string | null;
  project_status: string | null;
  value: number;
  helper: string;
  risk_level: FinanceProjectRiskLevel;
  target: string;
};

export type FinanceProjectSummaryTrendPoint = {
  date: string;
  income_amount: number;
  expense_amount: number;
  net_cash_flow_amount: number;
};

export type FinanceProjectSummaryAnalytics = {
  scope: {
    project_count: number;
    project_limit: number;
    truncated: boolean;
    trend_days: number;
  };
  rankings: {
    high_risk: FinanceProjectSummaryRankingItem[];
    unallocated_expense: FinanceProjectSummaryRankingItem[];
    overdue_receivable: FinanceProjectSummaryRankingItem[];
    low_margin: FinanceProjectSummaryRankingItem[];
  };
  trends: FinanceProjectSummaryTrendPoint[];
};

type FinanceProjectSummaryAnalyticsRepository = Pick<
  typeof financeProjectSummaryRepository,
  "listProjectsForAnalytics" | "listLedgerTrend"
>;

type FinanceProjectSummaryBuilder = (input: {
  tenantId: string;
  projects: FinanceProjectSummaryProjectRow[];
}) => Promise<FinanceProjectOperatingSummary[]>;

const FINANCE_ANALYTICS_PROJECT_LIMIT = 100;
const FINANCE_ANALYTICS_TREND_DAYS = 30;
const FINANCE_ANALYTICS_RANKING_LIMIT = 5;

export async function buildFinanceProjectSummaryAnalytics(input: {
  tenantId: string;
  query: FinanceProjectSummaryListQuery;
  repository: FinanceProjectSummaryAnalyticsRepository;
  buildSummaries: FinanceProjectSummaryBuilder;
}): Promise<FinanceProjectSummaryAnalytics> {
  const projects = await input.repository.listProjectsForAnalytics({
    tenantId: input.tenantId,
    query: input.query,
    limit: FINANCE_ANALYTICS_PROJECT_LIMIT,
  });
  const list = await input.buildSummaries({
    tenantId: input.tenantId,
    projects: projects.list,
  });
  const trends = await input.repository.listLedgerTrend({
    tenantId: input.tenantId,
    projectIds: projects.list.map((project) => project.id),
    dateFrom: getDateDaysAgo(FINANCE_ANALYTICS_TREND_DAYS - 1),
  });

  return {
    scope: {
      project_count: projects.total,
      project_limit: projects.limit,
      truncated: projects.total > projects.limit,
      trend_days: FINANCE_ANALYTICS_TREND_DAYS,
    },
    rankings: buildAnalyticsRankings(list),
    trends: trends.map((item) => ({
      date: item.date,
      income_amount: roundMoney(item.income_amount),
      expense_amount: roundMoney(item.expense_amount),
      net_cash_flow_amount: roundMoney(item.income_amount - item.expense_amount),
    })),
  };
}

function buildAnalyticsRankings(
  list: FinanceProjectOperatingSummary[],
): FinanceProjectSummaryAnalytics["rankings"] {
  return {
    high_risk: list
      .filter((item) => item.risk_level === "danger")
      .sort((left, right) => riskScore(right) - riskScore(left))
      .slice(0, FINANCE_ANALYTICS_RANKING_LIMIT)
      .map((item) => rankingItem({
        item,
        value: Math.max(
          item.overdue_amount,
          item.unallocated_expense_amount,
          Math.abs(Math.min(item.actual_profit_amount, 0)),
        ),
        helper: summarizeRankingRisk(item),
        target: `/finance?page=1&risk_level=danger&keyword=${item.project_id}`,
      })),
    unallocated_expense: list
      .filter((item) => item.unallocated_expense_amount > 0)
      .sort((left, right) =>
        right.unallocated_expense_amount - left.unallocated_expense_amount
      )
      .slice(0, FINANCE_ANALYTICS_RANKING_LIMIT)
      .map((item) => rankingItem({
        item,
        value: item.unallocated_expense_amount,
        helper: "未归集成本",
        target:
          `/finance/ledger?project_id=${item.project_id}&direction=out&unallocated_only=true`,
      })),
    overdue_receivable: list
      .filter((item) => item.overdue_amount > 0 || item.overdue_count > 0)
      .sort((left, right) => right.overdue_amount - left.overdue_amount)
      .slice(0, FINANCE_ANALYTICS_RANKING_LIMIT)
      .map((item) => rankingItem({
        item,
        value: item.overdue_amount,
        helper: `${item.overdue_count} 笔逾期`,
        target: `/finance/receivables?project_id=${item.project_id}&overdue_only=true`,
      })),
    low_margin: list
      .filter((item) =>
        item.projected_budget_gross_margin !== null &&
        item.projected_budget_gross_margin < 0.2
      )
      .sort((left, right) =>
        (left.projected_budget_gross_margin ?? 1) -
        (right.projected_budget_gross_margin ?? 1)
      )
      .slice(0, FINANCE_ANALYTICS_RANKING_LIMIT)
      .map((item) => rankingItem({
        item,
        value: item.projected_budget_gross_margin ?? 0,
        helper: "预算毛利偏低",
        target: `/projects/${item.project_id}?tab=overview`,
      })),
  };
}

function rankingItem(input: {
  item: FinanceProjectOperatingSummary;
  value: number;
  helper: string;
  target: string;
}): FinanceProjectSummaryRankingItem {
  return {
    project_id: input.item.project_id,
    project_name: input.item.project_name,
    project_status: input.item.project_status,
    value: roundMoney(input.value),
    helper: input.helper,
    risk_level: input.item.risk_level,
    target: input.target,
  };
}

function summarizeRankingRisk(item: FinanceProjectOperatingSummary) {
  return item.risk_reasons[0]?.title || "高风险项目";
}

function riskScore(item: FinanceProjectOperatingSummary) {
  return item.risk_reasons.length * 10 +
    Math.max(item.overdue_count, item.risk_flags.length);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function getDateDaysAgo(daysAgo: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}
