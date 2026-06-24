export type FinanceProjectRiskLevel = "normal" | "info" | "warning" | "danger";

export type FinanceProjectRiskFlag =
  | "budget_missing"
  | "unallocated_expense"
  | "category_over_budget"
  | "project_over_budget"
  | "low_projected_margin"
  | "receivable_overdue"
  | "negative_actual_profit"
  | "negative_projected_profit";

export type FinanceProjectRiskReasonUnit =
  | "money"
  | "ratio"
  | "count"
  | "boolean";

export type FinanceProjectRiskAction = {
  key:
    | "open_cost_budget"
    | "open_unallocated_ledger"
    | "open_receivables"
    | "open_project_finance";
  label: string;
  target: string;
};

export type FinanceProjectRiskReason = {
  code: FinanceProjectRiskFlag;
  level: FinanceProjectRiskLevel;
  title: string;
  description: string;
  current_value: number | null;
  threshold_value: number | null;
  unit: FinanceProjectRiskReasonUnit;
  action: FinanceProjectRiskAction | null;
};

export type FinanceProjectRiskInput = {
  projectId: string;
  contractAmount: number;
  receivedAmount: number;
  expensePaidAmount: number;
  budgetConfigured: boolean;
  budgetCostAmount: number;
  budgetUsageRatio: number | null;
  projectedBudgetGrossMargin: number | null;
  overdueCount: number;
  overdueAmount: number;
  unallocatedExpenseAmount: number;
  hasCategoryOverBudget: boolean;
  projectedMarginWarningRatio?: number;
};

export type FinanceProjectRiskResult = {
  risk_level: FinanceProjectRiskLevel;
  risk_flags: FinanceProjectRiskFlag[];
  risk_reasons: FinanceProjectRiskReason[];
};

const DEFAULT_PROJECTED_MARGIN_WARNING_RATIO = 0.2;

export function buildFinanceProjectRisk(
  input: FinanceProjectRiskInput,
): FinanceProjectRiskResult {
  const threshold = input.projectedMarginWarningRatio ??
    DEFAULT_PROJECTED_MARGIN_WARNING_RATIO;
  const actualProfitAmount = roundMoney(
    input.receivedAmount - input.expensePaidAmount,
  );
  const projectedBudgetProfitAmount = input.budgetConfigured
    ? roundMoney(input.contractAmount - input.budgetCostAmount)
    : 0;
  const reasons: FinanceProjectRiskReason[] = [];

  if (!input.budgetConfigured) {
    reasons.push(reason({
      code: "budget_missing",
      level: "info",
      title: "未配置成本预算",
      description: "项目尚未配置成本预算，预算利润和预算使用率不可判断。",
      current_value: null,
      threshold_value: null,
      unit: "boolean",
      action: {
        key: "open_cost_budget",
        label: "配置成本预算",
        target: `/projects/${input.projectId}?tab=overview`,
      },
    }));
  }

  if (input.unallocatedExpenseAmount > 0) {
    reasons.push(reason({
      code: "unallocated_expense",
      level: "info",
      title: "存在未归集成本",
      description: `项目存在 ${formatMoney(input.unallocatedExpenseAmount)} 未归集成本。`,
      current_value: roundMoney(input.unallocatedExpenseAmount),
      threshold_value: 0,
      unit: "money",
      action: {
        key: "open_unallocated_ledger",
        label: "去归集成本",
        target:
          `/finance/ledger?project_id=${input.projectId}&direction=out&unallocated_only=true`,
      },
    }));
  }

  if (input.hasCategoryOverBudget) {
    reasons.push(reason({
      code: "category_over_budget",
      level: "warning",
      title: "成本分类达到预警",
      description: "至少一个成本分类支出已超过该分类预算预警阈值。",
      current_value: null,
      threshold_value: null,
      unit: "boolean",
      action: {
        key: "open_cost_budget",
        label: "查看成本预算",
        target: `/projects/${input.projectId}?tab=overview`,
      },
    }));
  }

  if (input.budgetConfigured && input.expensePaidAmount > input.budgetCostAmount) {
    reasons.push(reason({
      code: "project_over_budget",
      level: "danger",
      title: "项目已超预算",
      description:
        `项目支出 ${formatMoney(input.expensePaidAmount)} 已超过预算 ${formatMoney(input.budgetCostAmount)}。`,
      current_value: roundMoney(input.expensePaidAmount),
      threshold_value: roundMoney(input.budgetCostAmount),
      unit: "money",
      action: {
        key: "open_cost_budget",
        label: "查看成本预算",
        target: `/projects/${input.projectId}?tab=overview`,
      },
    }));
  }

  if (
    input.projectedBudgetGrossMargin !== null &&
    input.projectedBudgetGrossMargin < threshold
  ) {
    reasons.push(reason({
      code: "low_projected_margin",
      level: "warning",
      title: "预算毛利偏低",
      description:
        `预测预算毛利率 ${formatRatio(input.projectedBudgetGrossMargin)}，低于阈值 ${formatRatio(threshold)}。`,
      current_value: input.projectedBudgetGrossMargin,
      threshold_value: threshold,
      unit: "ratio",
      action: {
        key: "open_cost_budget",
        label: "查看成本预算",
        target: `/projects/${input.projectId}?tab=overview`,
      },
    }));
  }

  if (input.overdueCount > 0) {
    reasons.push(reason({
      code: "receivable_overdue",
      level: "warning",
      title: "存在逾期应收",
      description:
        `项目存在 ${input.overdueCount} 笔逾期应收，逾期金额 ${formatMoney(input.overdueAmount)}。`,
      current_value: input.overdueCount,
      threshold_value: 0,
      unit: "count",
      action: {
        key: "open_receivables",
        label: "查看应收",
        target: `/finance/receivables?project_id=${input.projectId}&overdue_only=true`,
      },
    }));
  }

  if (actualProfitAmount < 0) {
    reasons.push(reason({
      code: "negative_actual_profit",
      level: "danger",
      title: "实际利润为负",
      description: `实际利润 ${formatMoney(actualProfitAmount)}，当前支出已超过已收金额。`,
      current_value: actualProfitAmount,
      threshold_value: 0,
      unit: "money",
      action: {
        key: "open_project_finance",
        label: "查看项目财务",
        target: `/projects/${input.projectId}?tab=overview`,
      },
    }));
  }

  if (input.budgetConfigured && projectedBudgetProfitAmount < 0) {
    reasons.push(reason({
      code: "negative_projected_profit",
      level: "danger",
      title: "预算利润为负",
      description:
        `预算利润 ${formatMoney(projectedBudgetProfitAmount)}，预算成本已超过合同金额。`,
      current_value: projectedBudgetProfitAmount,
      threshold_value: 0,
      unit: "money",
      action: {
        key: "open_cost_budget",
        label: "查看成本预算",
        target: `/projects/${input.projectId}?tab=overview`,
      },
    }));
  }

  return {
    risk_level: resolveRiskLevel(reasons),
    risk_flags: reasons.map((item) => item.code),
    risk_reasons: reasons,
  };
}

function reason(input: FinanceProjectRiskReason): FinanceProjectRiskReason {
  return input;
}

function resolveRiskLevel(
  reasons: FinanceProjectRiskReason[],
): FinanceProjectRiskLevel {
  if (reasons.some((item) => item.level === "danger")) return "danger";
  if (reasons.some((item) => item.level === "warning")) return "warning";
  if (reasons.some((item) => item.level === "info")) return "info";
  return "normal";
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatMoney(value: number): string {
  return `¥${roundMoney(value).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatRatio(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}
