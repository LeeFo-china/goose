import { Errors } from "@/errors/error-factory";
import {
  projectCostBudgetRepository,
  type ProjectCostBudgetExpenseTotals,
  type ProjectCostBudgetRecord,
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

    const [budgets, expenseTotals] = await Promise.all([
      this.dependencies.repository.listActiveBudgets({ tenantId, projectId }),
      this.dependencies.repository.listExpenseTotals({ tenantId, projectId }),
    ]);

    return buildProjectCostBudgetResult({ budgets, expenseTotals });
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
    const expenseTotals = await this.dependencies.repository.listExpenseTotals({
      tenantId,
      projectId,
    });

    return buildProjectCostBudgetResult({ budgets, expenseTotals });
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
  budgets: ProjectCostBudgetRecord[];
  expenseTotals: ProjectCostBudgetExpenseTotals;
}) {
  const list = [...input.budgets]
    .sort(compareBudgetRecords)
    .map((budget) => buildProjectCostBudgetListItem({
      budget,
      expenseAmount: input.expenseTotals.byCategory.get(
        budget.cost_category_id,
      ) ?? 0,
    }));

  const budgetAmount = roundMoney(
    list.reduce((sum, item) => sum + item.budget_amount, 0),
  );
  const budgetConfigured = list.length > 0;
  const expenseAmount = roundMoney(input.expenseTotals.totalExpenseAmount);
  const remainingAmount = budgetConfigured
    ? roundMoney(budgetAmount - expenseAmount)
    : 0;
  const usageRatio = budgetConfigured && budgetAmount > 0
    ? roundRatio(expenseAmount / budgetAmount)
    : null;

  return {
    list,
    summary: {
      budget_configured: budgetConfigured,
      budget_amount: budgetAmount,
      expense_amount: expenseAmount,
      remaining_amount: remainingAmount,
      usage_ratio: usageRatio,
      unallocated_expense_amount: roundMoney(
        input.expenseTotals.unallocatedExpenseAmount,
      ),
      risk_level: resolveProjectRiskLevel({
        budgetConfigured,
        budgetAmount,
        expenseAmount,
      }),
    } satisfies ProjectCostBudgetSummary,
  };
}

function buildProjectCostBudgetListItem(input: {
  budget: ProjectCostBudgetRecord;
  expenseAmount: number;
}): ProjectCostBudgetListItem {
  const budgetAmount = roundMoney(input.budget.budget_amount);
  const expenseAmount = roundMoney(input.expenseAmount);
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
    remaining_amount: roundMoney(budgetAmount - expenseAmount),
    usage_ratio: budgetAmount > 0
      ? roundRatio(expenseAmount / budgetAmount)
      : null,
    warning_threshold_percent: warningThresholdPercent,
    risk_level: resolveCategoryRiskLevel({
      budgetAmount,
      expenseAmount,
      warningThresholdPercent,
    }),
    remark: input.budget.remark,
    status: input.budget.status,
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
  warningThresholdPercent: number;
}): ProjectCostBudgetRiskLevel {
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
}): ProjectCostBudgetRiskLevel {
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
