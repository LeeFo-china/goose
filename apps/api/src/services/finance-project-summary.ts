import { Errors } from "@/errors/error-factory";
import {
  financeProjectSummaryRepository,
  type FinanceProjectBudgetTotals,
  type FinanceProjectLedgerTotals,
  type FinanceProjectReceivableTotals,
  type FinanceProjectSummaryProjectRow,
} from "@/repositories/finance-project-summary";
import type { FinanceProjectSummaryListQuery } from "@/schema/finance";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

export type FinanceProjectOperatingSummary = {
  project_id: string;
  project_name: string | null;
  project_status: string | null;
  contract_amount: number;
  receivable_amount: number;
  received_amount: number;
  receivable_remaining_amount: number;
  overdue_amount: number;
  overdue_count: number;
  expense_paid_amount: number;
  actual_profit_amount: number;
  projected_profit_amount: number;
  net_cash_flow_amount: number;
  actual_gross_margin: number | null;
  projected_gross_margin: number | null;
  ledger_entry_count: number;
  budget_configured: boolean;
  budget_cost_amount: number;
  budget_remaining_amount: number;
  budget_usage_ratio: number | null;
  projected_budget_profit_amount: number;
  profit_variance_amount: number;
  projected_budget_gross_margin: number | null;
  risk_level: FinanceProjectRiskLevel;
  risk_flags: FinanceProjectRiskFlag[];
};

export type FinanceProjectRiskLevel = "normal" | "info" | "warning" | "danger";

export type FinanceProjectRiskFlag =
  | "budget_missing"
  | "category_over_budget"
  | "project_over_budget"
  | "low_projected_margin"
  | "receivable_overdue";

export type FinanceProjectOperatingSummaryTotals = {
  project_count: number;
  contract_amount: number;
  receivable_amount: number;
  received_amount: number;
  receivable_remaining_amount: number;
  overdue_amount: number;
  overdue_count: number;
  expense_paid_amount: number;
  actual_profit_amount: number;
  projected_profit_amount: number;
  net_cash_flow_amount: number;
  actual_gross_margin: number | null;
  projected_gross_margin: number | null;
  budget_configured_count: number;
  budget_cost_amount: number;
  budget_remaining_amount: number;
  budget_usage_ratio: number | null;
  projected_budget_profit_amount: number;
  profit_variance_amount: number;
  projected_budget_gross_margin: number | null;
  risk_count: number;
  risk_level: FinanceProjectRiskLevel;
};

type FinanceProjectSummaryServiceDependencies = {
  repository: {
    listProjects: typeof financeProjectSummaryRepository.listProjects;
    findProject: typeof financeProjectSummaryRepository.findProject;
    listLedgerTotals: typeof financeProjectSummaryRepository.listLedgerTotals;
    listReceivableTotals: typeof financeProjectSummaryRepository.listReceivableTotals;
    listBudgetTotals: typeof financeProjectSummaryRepository.listBudgetTotals;
  };
  accessPolicyService: Pick<
    typeof accessPolicyService,
    "assertTenantContext" | "hasPermission" | "canAccessProject"
  >;
};

export class FinanceProjectSummaryService {
  constructor(
    private readonly dependencies: FinanceProjectSummaryServiceDependencies = {
      repository: financeProjectSummaryRepository,
      accessPolicyService,
    },
  ) {}

  async listProjectSummaries(
    authContext: AuthContext,
    query: FinanceProjectSummaryListQuery,
  ) {
    const tenantId = this.dependencies.accessPolicyService
      .assertTenantContext(authContext);
    this.assertCanViewFinanceProjectSummary(authContext);

    const projects = await this.dependencies.repository.listProjects(
      tenantId,
      query,
    );
    const list = await this.buildSummaries({
      tenantId,
      projects: projects.list,
    });

    return {
      ...projects,
      list,
      summary: summarizeList(list),
    };
  }

  async getProjectSummary(authContext: AuthContext, projectId: string) {
    const tenantId = this.dependencies.accessPolicyService
      .assertTenantContext(authContext);
    const project = await this.dependencies.repository.findProject({
      tenantId,
      projectId,
    });
    if (!project) {
      throw Errors.forbidden();
    }

    if (!this.hasFinanceProjectSummaryView(authContext)) {
      const canAccessProject = await this.dependencies.accessPolicyService
        .canAccessProject(authContext, projectId, "project.read");
      if (!canAccessProject) {
        throw Errors.forbidden();
      }
    }

    const [summary] = await this.buildSummaries({
      tenantId,
      projects: [project],
    });
    return summary;
  }

  private async buildSummaries(input: {
    tenantId: string;
    projects: FinanceProjectSummaryProjectRow[];
  }) {
    const projectIds = input.projects.map((project) => project.id);
    const tenantToday = getTenantToday();
    const [ledgerTotals, receivableTotals, budgetTotals] = await Promise.all([
      this.dependencies.repository.listLedgerTotals({
        tenantId: input.tenantId,
        projectIds,
      }),
      this.dependencies.repository.listReceivableTotals({
        tenantId: input.tenantId,
        projectIds,
        tenantToday,
      }),
      this.dependencies.repository.listBudgetTotals({
        tenantId: input.tenantId,
        projectIds,
      }),
    ]);

    return input.projects.map((project) => buildProjectOperatingSummary({
      project,
      ledgerTotals: ledgerTotals.get(project.id),
      receivableTotals: receivableTotals.get(project.id),
      budgetTotals: budgetTotals.get(project.id),
    }));
  }

  private assertCanViewFinanceProjectSummary(authContext: AuthContext) {
    if (!this.hasFinanceProjectSummaryView(authContext)) {
      throw Errors.forbidden();
    }
  }

  private hasFinanceProjectSummaryView(authContext: AuthContext) {
    return this.dependencies.accessPolicyService.hasPermission(
      authContext,
      "finance.view",
    ) ||
      this.dependencies.accessPolicyService.hasPermission(
        authContext,
        "finance.ledger.view",
      ) ||
      this.dependencies.accessPolicyService.hasPermission(
        authContext,
        "finance.receivable.view",
      ) ||
      this.dependencies.accessPolicyService.hasPermission(
        authContext,
        "finance.receivable.manage",
      );
  }
}

function buildProjectOperatingSummary(input: {
  project: FinanceProjectSummaryProjectRow;
  ledgerTotals?: FinanceProjectLedgerTotals;
  receivableTotals?: FinanceProjectReceivableTotals;
  budgetTotals?: FinanceProjectBudgetTotals;
}): FinanceProjectOperatingSummary {
  const contractAmount = resolveContractAmount(input.project);
  const receivedAmount = roundMoney(input.ledgerTotals?.income_amount ?? 0);
  const expensePaidAmount = roundMoney(input.ledgerTotals?.expense_amount ?? 0);
  const actualProfitAmount = roundMoney(receivedAmount - expensePaidAmount);
  const projectedProfitAmount = roundMoney(contractAmount - expensePaidAmount);
  const budgetConfigured = Boolean(input.budgetTotals);
  const budgetCostAmount = budgetConfigured
    ? roundMoney(input.budgetTotals?.budget_amount ?? 0)
    : 0;
  const budgetRemainingAmount = budgetConfigured
    ? roundMoney(budgetCostAmount - expensePaidAmount)
    : 0;
  const budgetUsageRatio = budgetConfigured && budgetCostAmount > 0
    ? roundRatio(expensePaidAmount / budgetCostAmount)
    : null;
  const projectedBudgetProfitAmount = budgetConfigured
    ? roundMoney(contractAmount - budgetCostAmount)
    : 0;
  const profitVarianceAmount = budgetConfigured
    ? roundMoney(actualProfitAmount - projectedBudgetProfitAmount)
    : 0;
  const projectedBudgetGrossMargin = budgetConfigured && contractAmount > 0
    ? roundRatio(projectedBudgetProfitAmount / contractAmount)
    : null;
  const riskFlags = resolveRiskFlags({
    budgetConfigured,
    budgetCostAmount,
    expensePaidAmount,
    projectedBudgetGrossMargin,
    overdueCount: input.receivableTotals?.overdue_count ?? 0,
    budgetTotals: input.budgetTotals,
    expenseByCategory: input.ledgerTotals?.expense_by_category,
  });

  return {
    project_id: input.project.id,
    project_name: input.project.name,
    project_status: input.project.status,
    contract_amount: contractAmount,
    receivable_amount: roundMoney(input.receivableTotals?.receivable_amount ?? 0),
    received_amount: receivedAmount,
    receivable_remaining_amount: roundMoney(
      input.receivableTotals?.receivable_remaining_amount ?? 0,
    ),
    overdue_amount: roundMoney(input.receivableTotals?.overdue_amount ?? 0),
    overdue_count: input.receivableTotals?.overdue_count ?? 0,
    expense_paid_amount: expensePaidAmount,
    actual_profit_amount: actualProfitAmount,
    projected_profit_amount: projectedProfitAmount,
    net_cash_flow_amount: actualProfitAmount,
    actual_gross_margin: receivedAmount > 0
      ? roundRatio(actualProfitAmount / receivedAmount)
      : null,
    projected_gross_margin: contractAmount > 0
      ? roundRatio(projectedProfitAmount / contractAmount)
      : null,
    ledger_entry_count: input.ledgerTotals?.ledger_entry_count ?? 0,
    budget_configured: budgetConfigured,
    budget_cost_amount: budgetCostAmount,
    budget_remaining_amount: budgetRemainingAmount,
    budget_usage_ratio: budgetUsageRatio,
    projected_budget_profit_amount: projectedBudgetProfitAmount,
    profit_variance_amount: profitVarianceAmount,
    projected_budget_gross_margin: projectedBudgetGrossMargin,
    risk_level: resolveRiskLevel(riskFlags),
    risk_flags: riskFlags,
  };
}

function summarizeList(
  list: FinanceProjectOperatingSummary[],
): FinanceProjectOperatingSummaryTotals {
  const totals = list.reduce<FinanceProjectOperatingSummaryTotals>((acc, item) => {
    acc.project_count += 1;
    acc.contract_amount += item.contract_amount;
    acc.receivable_amount += item.receivable_amount;
    acc.received_amount += item.received_amount;
    acc.receivable_remaining_amount += item.receivable_remaining_amount;
    acc.overdue_amount += item.overdue_amount;
    acc.overdue_count += item.overdue_count;
    acc.expense_paid_amount += item.expense_paid_amount;
    acc.actual_profit_amount += item.actual_profit_amount;
    acc.projected_profit_amount += item.projected_profit_amount;
    acc.net_cash_flow_amount += item.net_cash_flow_amount;
    if (item.budget_configured) {
      acc.budget_configured_count += 1;
    }
    acc.budget_cost_amount += item.budget_cost_amount;
    acc.budget_remaining_amount += item.budget_remaining_amount;
    acc.projected_budget_profit_amount += item.projected_budget_profit_amount;
    acc.profit_variance_amount += item.profit_variance_amount;
    if (item.risk_level !== "normal") {
      acc.risk_count += 1;
      acc.risk_level = maxRiskLevel(acc.risk_level, item.risk_level);
    }
    return acc;
  }, {
    project_count: 0,
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
    budget_configured_count: 0,
    budget_cost_amount: 0,
    budget_remaining_amount: 0,
    budget_usage_ratio: null,
    projected_budget_profit_amount: 0,
    profit_variance_amount: 0,
    projected_budget_gross_margin: null,
    risk_count: 0,
    risk_level: "normal",
  });

  totals.contract_amount = roundMoney(totals.contract_amount);
  totals.receivable_amount = roundMoney(totals.receivable_amount);
  totals.received_amount = roundMoney(totals.received_amount);
  totals.receivable_remaining_amount = roundMoney(
    totals.receivable_remaining_amount,
  );
  totals.overdue_amount = roundMoney(totals.overdue_amount);
  totals.expense_paid_amount = roundMoney(totals.expense_paid_amount);
  totals.actual_profit_amount = roundMoney(totals.actual_profit_amount);
  totals.projected_profit_amount = roundMoney(totals.projected_profit_amount);
  totals.net_cash_flow_amount = roundMoney(totals.net_cash_flow_amount);
  totals.budget_cost_amount = roundMoney(totals.budget_cost_amount);
  totals.budget_remaining_amount = roundMoney(totals.budget_remaining_amount);
  totals.projected_budget_profit_amount = roundMoney(
    totals.projected_budget_profit_amount,
  );
  totals.profit_variance_amount = roundMoney(totals.profit_variance_amount);
  totals.actual_gross_margin = totals.received_amount > 0
    ? roundRatio(totals.actual_profit_amount / totals.received_amount)
    : null;
  totals.projected_gross_margin = totals.contract_amount > 0
    ? roundRatio(totals.projected_profit_amount / totals.contract_amount)
    : null;
  totals.budget_usage_ratio = totals.budget_cost_amount > 0
    ? roundRatio(totals.expense_paid_amount / totals.budget_cost_amount)
    : null;
  totals.projected_budget_gross_margin = totals.contract_amount > 0 &&
      totals.budget_configured_count > 0
    ? roundRatio(totals.projected_budget_profit_amount / totals.contract_amount)
    : null;

  return totals;
}

function resolveRiskFlags(input: {
  budgetConfigured: boolean;
  budgetCostAmount: number;
  expensePaidAmount: number;
  projectedBudgetGrossMargin: number | null;
  overdueCount: number;
  budgetTotals?: FinanceProjectBudgetTotals;
  expenseByCategory?: Map<string, number>;
}): FinanceProjectRiskFlag[] {
  const flags: FinanceProjectRiskFlag[] = [];
  if (!input.budgetConfigured) {
    flags.push("budget_missing");
  }
  if (
    input.budgetConfigured &&
    input.expensePaidAmount > input.budgetCostAmount
  ) {
    flags.push("project_over_budget");
  }
  if (hasCategoryOverBudget({
    budgetTotals: input.budgetTotals,
    expenseByCategory: input.expenseByCategory,
  })) {
    flags.push("category_over_budget");
  }
  if (
    input.projectedBudgetGrossMargin !== null &&
    input.projectedBudgetGrossMargin < 0.2
  ) {
    flags.push("low_projected_margin");
  }
  if (input.overdueCount > 0) {
    flags.push("receivable_overdue");
  }

  return flags;
}

function hasCategoryOverBudget(input: {
  budgetTotals?: FinanceProjectBudgetTotals;
  expenseByCategory?: Map<string, number>;
}) {
  if (!input.budgetTotals || !input.expenseByCategory) {
    return false;
  }

  for (const [categoryId, budget] of input.budgetTotals.category_budgets) {
    const expenseAmount = input.expenseByCategory.get(categoryId) ?? 0;
    const warningAmount = budget.budget_amount *
      (budget.warning_threshold_percent / 100);
    if (expenseAmount > warningAmount) {
      return true;
    }
  }

  return false;
}

function resolveRiskLevel(flags: FinanceProjectRiskFlag[]): FinanceProjectRiskLevel {
  if (flags.includes("project_over_budget")) {
    return "danger";
  }
  if (
    flags.includes("category_over_budget") ||
    flags.includes("low_projected_margin") ||
    flags.includes("receivable_overdue")
  ) {
    return "warning";
  }
  if (flags.includes("budget_missing")) {
    return "info";
  }
  return "normal";
}

function maxRiskLevel(
  left: FinanceProjectRiskLevel,
  right: FinanceProjectRiskLevel,
) {
  const order: Record<FinanceProjectRiskLevel, number> = {
    normal: 0,
    info: 1,
    warning: 2,
    danger: 3,
  };
  return order[right] > order[left] ? right : left;
}

function resolveContractAmount(project: FinanceProjectSummaryProjectRow) {
  const signedAmount = normalizeMoney(project.signed_amount);
  if (signedAmount > 0) {
    return signedAmount;
  }
  return normalizeMoney(project.budget);
}

function normalizeMoney(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? roundMoney(amount) : 0;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundRatio(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function getTenantToday() {
  return new Date().toISOString().slice(0, 10);
}

export const financeProjectSummaryService =
  new FinanceProjectSummaryService();
