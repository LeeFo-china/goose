import { Errors } from "@/errors/error-factory";
import {
  projectCostBudgetRepository,
  type ProjectCostBudgetCommitmentTotals,
  type ProjectCostBudgetExpenseTotals,
  type ProjectCostBudgetRecord,
  type ProjectCostBudgetSupplierCostTotals,
} from "@/repositories/project-cost-budgets";
import type { SaveProjectCostBudgetsInput } from "@/schema/finance-costs";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

export type ProjectCostBudgetRiskLevel = "normal" | "warning" | "danger";

export type ProjectCostBudgetListItem = {
  id: string;
  project_id: string;
  cost_category_id: string;
  category_code: string | null;
  category_name: string | null;
  budget_amount: number;
  expense_amount: number;
  supplier_cost_amount: number;
  commitment_amount: number;
  active_commitment_amount: number;
  available_amount: number;
  remaining_amount: number;
  usage_ratio: number | null;
  warning_threshold_percent: number;
  risk_level: ProjectCostBudgetRiskLevel;
  remark: string | null;
  status: string | null;
};

export type ProjectCostBudgetSummary = {
  budget_configured: boolean;
  budget_amount: number;
  expense_amount: number;
  actual_supplier_cost_amount: number;
  commitment_amount: number;
  available_amount: number;
  remaining_amount: number;
  usage_ratio: number | null;
  unallocated_expense_amount: number;
  risk_level: ProjectCostBudgetRiskLevel;
};

type ProjectCostBudgetServiceDependencies = {
  repository: {
    findProject: typeof projectCostBudgetRepository.findProject;
    listActiveBudgets: typeof projectCostBudgetRepository.listActiveBudgets;
    listExpenseTotals: typeof projectCostBudgetRepository.listExpenseTotals;
    listCommitmentTotals:
      typeof projectCostBudgetRepository.listCommitmentTotals;
    listSupplierCostTotals:
      typeof projectCostBudgetRepository.listSupplierCostTotals;
    listActiveCategoriesByIds:
      typeof projectCostBudgetRepository.listActiveCategoriesByIds;
    saveBudgets: typeof projectCostBudgetRepository.saveBudgets;
  };
  accessPolicyService: Pick<
    typeof accessPolicyService,
    "assertTenantContext" | "hasPermission" | "canAccessProject"
  >;
};

export class ProjectCostBudgetService {
  constructor(
    private readonly dependencies: ProjectCostBudgetServiceDependencies = {
      repository: projectCostBudgetRepository,
      accessPolicyService,
    },
  ) {}

  async listProjectBudgets(authContext: AuthContext, projectId: string) {
    const tenantId = this.dependencies.accessPolicyService
      .assertTenantContext(authContext);
    await this.assertProjectInTenant({ tenantId, projectId });
    await this.assertCanView(authContext, projectId);

    const [budgets, expenseTotals, commitmentTotals, supplierCostTotals] =
      await Promise.all([
        this.dependencies.repository.listActiveBudgets({ tenantId, projectId }),
        this.dependencies.repository.listExpenseTotals({ tenantId, projectId }),
        this.dependencies.repository.listCommitmentTotals({
          tenantId,
          projectId,
        }),
        this.dependencies.repository.listSupplierCostTotals({
          tenantId,
          projectId,
        }),
      ]);

    return buildProjectCostBudgetResult({
      projectId,
      budgets,
      expenseTotals,
      commitmentTotals,
      supplierCostTotals,
    });
  }

  async saveProjectBudgets(
    authContext: AuthContext,
    projectId: string,
    input: SaveProjectCostBudgetsInput,
  ) {
    const tenantId = this.dependencies.accessPolicyService
      .assertTenantContext(authContext);
    const employeeId = this.assertCurrentEmployee(authContext);
    this.assertCanManage(authContext);
    await this.assertProjectInTenant({ tenantId, projectId });
    await this.assertCategoriesActive({
      tenantId,
      items: input.items,
    });

    const budgets = await this.dependencies.repository.saveBudgets({
      tenantId,
      projectId,
      employeeId,
      items: input.items,
    });
    const [expenseTotals, commitmentTotals, supplierCostTotals] =
      await Promise.all([
        this.dependencies.repository.listExpenseTotals({ tenantId, projectId }),
        this.dependencies.repository.listCommitmentTotals({
          tenantId,
          projectId,
        }),
        this.dependencies.repository.listSupplierCostTotals({
          tenantId,
          projectId,
        }),
      ]);

    return buildProjectCostBudgetResult({
      projectId,
      budgets,
      expenseTotals,
      commitmentTotals,
      supplierCostTotals,
    });
  }

  private async assertProjectInTenant(input: {
    tenantId: string;
    projectId: string;
  }) {
    const project = await this.dependencies.repository.findProject(input);
    if (!project) {
      throw Errors.forbidden();
    }
  }

  private async assertCanView(authContext: AuthContext, projectId: string) {
    if (
      this.hasPermission(authContext, "finance.view") ||
      this.hasPermission(authContext, "finance.budget.view") ||
      this.hasPermission(authContext, "finance.budget.manage")
    ) {
      return;
    }

    const canAccessProject = await this.dependencies.accessPolicyService
      .canAccessProject(authContext, projectId, "project.read");
    if (!canAccessProject) {
      throw Errors.forbidden();
    }
  }

  private assertCanManage(authContext: AuthContext) {
    if (!this.hasPermission(authContext, "finance.budget.manage")) {
      throw Errors.forbidden();
    }
  }

  private async assertCategoriesActive(input: {
    tenantId: string;
    items: SaveProjectCostBudgetsInput["items"];
  }) {
    const categoryIds = Array.from(
      new Set(input.items.map((item) => item.cost_category_id)),
    );
    if (categoryIds.length !== input.items.length) {
      throw Errors.badRequest("成本分类不能重复");
    }

    const categories = await this.dependencies.repository.listActiveCategoriesByIds({
      tenantId: input.tenantId,
      categoryIds,
    });
    if (categories.length !== categoryIds.length) {
      throw Errors.badRequest("成本分类不存在或已停用");
    }
  }

  private hasPermission(authContext: AuthContext, permissionCode: string) {
    return this.dependencies.accessPolicyService.hasPermission(
      authContext,
      permissionCode,
    );
  }

  private assertCurrentEmployee(authContext: AuthContext) {
    if (!authContext.employeeId) {
      throw Errors.forbidden();
    }
    return authContext.employeeId;
  }
}

function buildProjectCostBudgetResult(input: {
  projectId: string;
  budgets: ProjectCostBudgetRecord[];
  expenseTotals: ProjectCostBudgetExpenseTotals;
  commitmentTotals: ProjectCostBudgetCommitmentTotals;
  supplierCostTotals: ProjectCostBudgetSupplierCostTotals;
}) {
  const list = [...input.budgets]
    .sort(compareBudgetRecords)
    .map((budget) => buildProjectCostBudgetListItem({
      budget,
      expenseAmount: input.expenseTotals.byCategory.get(
        budget.cost_category_id,
      ) ?? 0,
      supplierCostAmount: input.supplierCostTotals.byCategory.get(
        budget.cost_category_id,
      ) ?? 0,
      commitmentAmount: input.commitmentTotals.byCategory.get(
        budget.cost_category_id,
      ) ?? 0,
    }));
  const budgetCategoryIds = new Set(
    input.budgets.map((budget) => budget.cost_category_id),
  );
  const uncoveredCategoryIds = new Set([
    ...input.commitmentTotals.byCategory.keys(),
    ...input.supplierCostTotals.byCategory.keys(),
  ]);
  for (const costCategoryId of uncoveredCategoryIds) {
    if (budgetCategoryIds.has(costCategoryId)) continue;
    list.push(buildUnbudgetedCommitmentListItem({
      projectId: input.projectId,
      costCategoryId,
      category: input.commitmentTotals.categoryDetails.get(costCategoryId) ??
        input.supplierCostTotals.categoryDetails.get(costCategoryId),
      expenseAmount: input.expenseTotals.byCategory.get(costCategoryId) ?? 0,
      supplierCostAmount:
        input.supplierCostTotals.byCategory.get(costCategoryId) ?? 0,
      commitmentAmount:
        input.commitmentTotals.byCategory.get(costCategoryId) ?? 0,
    }));
  }

  const budgetAmount = roundMoney(
    list.reduce((sum, item) => sum + item.budget_amount, 0),
  );
  const budgetConfigured = input.budgets.length > 0;
  const expenseAmount = roundMoney(input.expenseTotals.totalExpenseAmount);
  const supplierCostAmount = roundMoney(
    input.supplierCostTotals.totalSupplierCostAmount,
  );
  const actualCostAmount = roundMoney(expenseAmount + supplierCostAmount);
  const commitmentAmount = roundMoney(
    input.commitmentTotals.totalCommitmentAmount,
  );
  const remainingAmount = budgetConfigured
    ? roundMoney(budgetAmount - actualCostAmount)
    : 0;
  const availableAmount = roundMoney(
    budgetAmount - actualCostAmount - commitmentAmount,
  );
  const usageRatio = budgetConfigured && budgetAmount > 0
    ? roundRatio(actualCostAmount / budgetAmount)
    : null;

  return {
    list,
    summary: {
      budget_configured: budgetConfigured,
      budget_amount: budgetAmount,
      expense_amount: expenseAmount,
      actual_supplier_cost_amount: supplierCostAmount,
      commitment_amount: commitmentAmount,
      available_amount: availableAmount,
      remaining_amount: remainingAmount,
      usage_ratio: usageRatio,
      unallocated_expense_amount: roundMoney(
        input.expenseTotals.unallocatedExpenseAmount,
      ),
      risk_level: resolveProjectRiskLevel({
        budgetConfigured,
        budgetAmount,
        expenseAmount: actualCostAmount,
        availableAmount,
      }),
    } satisfies ProjectCostBudgetSummary,
  };
}

function buildProjectCostBudgetListItem(input: {
  budget: ProjectCostBudgetRecord;
  expenseAmount: number;
  supplierCostAmount: number;
  commitmentAmount: number;
}): ProjectCostBudgetListItem {
  const budgetAmount = roundMoney(input.budget.budget_amount);
  const expenseAmount = roundMoney(input.expenseAmount);
  const supplierCostAmount = roundMoney(input.supplierCostAmount);
  const actualCostAmount = roundMoney(expenseAmount + supplierCostAmount);
  const commitmentAmount = roundMoney(input.commitmentAmount);
  const warningThresholdPercent = normalizeNumber(
    input.budget.warning_threshold_percent,
    100,
  );

  return {
    id: input.budget.id,
    project_id: input.budget.project_id,
    cost_category_id: input.budget.cost_category_id,
    category_code: input.budget.cost_category?.code ?? null,
    category_name: input.budget.cost_category?.name ?? null,
    budget_amount: budgetAmount,
    expense_amount: expenseAmount,
    supplier_cost_amount: supplierCostAmount,
    commitment_amount: commitmentAmount,
    active_commitment_amount: commitmentAmount,
    available_amount: roundMoney(
      budgetAmount - actualCostAmount - commitmentAmount,
    ),
    remaining_amount: roundMoney(budgetAmount - actualCostAmount),
    usage_ratio: budgetAmount > 0
      ? roundRatio(actualCostAmount / budgetAmount)
      : null,
    warning_threshold_percent: warningThresholdPercent,
    risk_level: resolveCategoryRiskLevel({
      budgetAmount,
      expenseAmount: actualCostAmount,
      availableAmount: roundMoney(
        budgetAmount - actualCostAmount - commitmentAmount,
      ),
      warningThresholdPercent,
    }),
    remark: input.budget.remark,
    status: input.budget.status,
  };
}

function buildUnbudgetedCommitmentListItem(input: {
  projectId: string;
  costCategoryId: string;
  category?: { code: string | null; name: string | null };
  expenseAmount: number;
  supplierCostAmount: number;
  commitmentAmount: number;
}): ProjectCostBudgetListItem {
  const expenseAmount = roundMoney(input.expenseAmount);
  const supplierCostAmount = roundMoney(input.supplierCostAmount);
  const actualCostAmount = roundMoney(expenseAmount + supplierCostAmount);
  const commitmentAmount = roundMoney(input.commitmentAmount);
  const remainingAmount = actualCostAmount === 0
    ? 0
    : roundMoney(-actualCostAmount);
  const availableAmount = roundMoney(-actualCostAmount - commitmentAmount);
  return {
    id: `commitment:${input.costCategoryId}`,
    project_id: input.projectId,
    cost_category_id: input.costCategoryId,
    category_code: input.category?.code ?? null,
    category_name: input.category?.name ?? null,
    budget_amount: 0,
    expense_amount: expenseAmount,
    supplier_cost_amount: supplierCostAmount,
    commitment_amount: commitmentAmount,
    active_commitment_amount: commitmentAmount,
    available_amount: availableAmount,
    remaining_amount: remainingAmount,
    usage_ratio: null,
    warning_threshold_percent: 100,
    risk_level: resolveCategoryRiskLevel({
      budgetAmount: 0,
      expenseAmount: actualCostAmount,
      availableAmount,
      warningThresholdPercent: 100,
    }),
    remark: null,
    status: null,
  };
}

function compareBudgetRecords(
  left: ProjectCostBudgetRecord,
  right: ProjectCostBudgetRecord,
) {
  const leftOrder = normalizeNumber(left.cost_category?.sort_order, 9999);
  const rightOrder = normalizeNumber(right.cost_category?.sort_order, 9999);
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  return (left.cost_category?.code ?? "")
    .localeCompare(right.cost_category?.code ?? "");
}

function resolveCategoryRiskLevel(input: {
  budgetAmount: number;
  expenseAmount: number;
  availableAmount: number;
  warningThresholdPercent: number;
}): ProjectCostBudgetRiskLevel {
  if (input.availableAmount < 0) {
    return "danger";
  }
  if (input.budgetAmount <= 0) {
    return input.expenseAmount > 0 ? "warning" : "normal";
  }

  const warningAmount = input.budgetAmount *
    (input.warningThresholdPercent / 100);
  return input.expenseAmount > warningAmount ? "warning" : "normal";
}

function resolveProjectRiskLevel(input: {
  budgetConfigured: boolean;
  budgetAmount: number;
  expenseAmount: number;
  availableAmount: number;
}): ProjectCostBudgetRiskLevel {
  if (input.availableAmount < 0) {
    return "danger";
  }
  if (!input.budgetConfigured) {
    return "normal";
  }

  return input.expenseAmount > input.budgetAmount ? "danger" : "normal";
}

function normalizeNumber(value: unknown, fallback: number) {
  const numberValue = Number(value ?? fallback);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function roundMoney(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function roundRatio(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

export const projectCostBudgetService =
  new ProjectCostBudgetService();
