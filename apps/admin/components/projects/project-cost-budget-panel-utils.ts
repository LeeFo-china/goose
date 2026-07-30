import type {
  FinanceCostCategoryRecord,
  ProjectCostBudgetListData,
  ProjectCostBudgetListItem,
  ProjectCostBudgetRiskLevel,
} from "@/components/finance/finance-cost-budget-requests";
import { formatFinanceMoney } from "@/components/finance/finance-ledger-utils";

export const emptyBudgetData: ProjectCostBudgetListData = {
  list: [],
  summary: {
    budget_configured: false,
    budget_amount: 0,
    expense_amount: 0,
    commitment_amount: 0,
    available_amount: 0,
    remaining_amount: 0,
    usage_ratio: null,
    unallocated_expense_amount: 0,
    risk_level: "normal",
  },
};

export type EditableBudgetRow = {
  cost_category_id: string;
  category_code: string | null;
  category_name: string | null;
  budget_amount: string;
  warning_threshold_percent: string;
  remark: string;
  expense_amount: number;
  commitment_amount: number;
  has_existing_budget: boolean;
};

export function normalizeBudgetData(
  payload: ProjectCostBudgetListData | null | undefined,
): ProjectCostBudgetListData {
  return {
    list: payload?.list || [],
    summary: payload?.summary || emptyBudgetData.summary,
  };
}

export function buildEditableRows(
  budgets: ProjectCostBudgetListItem[],
  categories: FinanceCostCategoryRecord[],
): EditableBudgetRow[] {
  const budgetsByCategory = new Map(
    budgets.map((budget) => [budget.cost_category_id, budget]),
  );
  const categoryIds = new Set(categories.map((category) => category.id));
  const rows = categories.map((category) => buildEditableRow({
    category,
    budget: budgetsByCategory.get(category.id),
  }));

  for (const budget of budgets) {
    if (!categoryIds.has(budget.cost_category_id)) {
      rows.push(buildEditableRow({ budget }));
    }
  }

  return rows;
}

export function validateEditRows(rows: EditableBudgetRow[]) {
  for (const row of rows) {
    const amount = parseOptionalMoney(row.budget_amount);
    if (amount < 0) {
      return `${categoryName(row)} 的预算金额不能小于 0。`;
    }

    const threshold = parseOptionalThreshold(row.warning_threshold_percent);
    if (threshold <= 0) {
      return `${categoryName(row)} 的预警阈值必须大于 0。`;
    }
  }
  return "";
}

export function parseOptionalMoney(value: string) {
  const normalized = value.trim();
  if (!normalized) return 0;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : -1;
}

export function parseOptionalThreshold(value: string) {
  const normalized = value.trim();
  if (!normalized) return 100;
  const threshold = Number(normalized);
  return Number.isFinite(threshold) ? threshold : 0;
}

export function categoryName(row: {
  category_name: string | null;
  category_code: string | null;
}) {
  return row.category_name || row.category_code || "未命名分类";
}

export function riskLabel(level: ProjectCostBudgetRiskLevel) {
  if (level === "danger") return "超预算";
  if (level === "warning") return "预警";
  return "正常";
}

export function riskVariant(level: ProjectCostBudgetRiskLevel) {
  if (level === "danger") return "danger" as const;
  if (level === "warning") return "warning" as const;
  return "success" as const;
}

export function formatBudgetAvailability(input: {
  budget_amount: number;
  expense_amount: number;
  commitment_amount: number;
  available_amount: number;
}) {
  return `已承诺 ${formatFinanceMoney(input.commitment_amount)}，可用预算 ${
    formatFinanceMoney(input.available_amount)
  }`;
}

export function calculateBudgetAvailability(input: {
  budgetAmount: number;
  expenseAmount: number;
  commitmentAmount: number;
}) {
  return Math.round(
    (
      input.budgetAmount -
      input.expenseAmount -
      input.commitmentAmount
    ) * 100,
  ) / 100;
}

export function isNegativeBudgetAvailability(availableAmount: number) {
  return availableAmount < 0;
}

function buildEditableRow(input: {
  category?: FinanceCostCategoryRecord;
  budget?: ProjectCostBudgetListItem;
}): EditableBudgetRow {
  const budget = input.budget;
  return {
    cost_category_id: input.category?.id || budget?.cost_category_id || "",
    category_code: input.category?.code || budget?.category_code || null,
    category_name: input.category?.name || budget?.category_name || null,
    budget_amount: budget ? String(budget.budget_amount) : "",
    warning_threshold_percent: budget
      ? String(budget.warning_threshold_percent)
      : "100",
    remark: budget?.remark || "",
    expense_amount: budget?.expense_amount || 0,
    commitment_amount: budget?.commitment_amount || 0,
    has_existing_budget: budget?.status === "active",
  };
}
