import { Errors } from "@/errors/error-factory";
import {
  financeProjectSummaryRepository,
  type FinanceProjectSummaryProjectRow,
  type FinanceProjectUnallocatedExpenseItem,
} from "@/repositories/finance-project-summary";
import type { FinanceProjectSummaryListQuery } from "@/schema/finance";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import {
  buildProjectOperatingSummary,
  getTenantToday,
  summarizeFinanceProjectSummaryList,
} from "@/services/finance-project-summary-calculations";
import {
  buildFinanceProjectSummaryAnalytics,
  type FinanceProjectSummaryAnalytics,
} from "@/services/finance-project-summary-analytics";
import type {
  FinanceProjectRiskFlag,
  FinanceProjectRiskLevel,
  FinanceProjectRiskReason,
} from "@/services/finance-project-risk";

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
  unallocated_expense_amount: number;
  projected_budget_profit_amount: number;
  profit_variance_amount: number;
  projected_budget_gross_margin: number | null;
  risk_level: FinanceProjectRiskLevel;
  risk_flags: FinanceProjectRiskFlag[];
  risk_reasons: FinanceProjectRiskReason[];
  unallocated_expense_items: FinanceProjectUnallocatedExpenseItem[];
};

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
  unallocated_expense_amount: number;
  projected_budget_profit_amount: number;
  profit_variance_amount: number;
  projected_budget_gross_margin: number | null;
  risk_count: number;
  risk_level: FinanceProjectRiskLevel;
  risk_counts: Record<FinanceProjectRiskLevel, number>;
  risk_flag_counts: Record<FinanceProjectRiskFlag, number>;
};

type FinanceProjectSummaryServiceDependencies = {
  repository: {
    listProjects: typeof financeProjectSummaryRepository.listProjects;
    findProject: typeof financeProjectSummaryRepository.findProject;
    searchProjectIdsByRisk: typeof financeProjectSummaryRepository.searchProjectIdsByRisk;
    listProjectsByIds: typeof financeProjectSummaryRepository.listProjectsByIds;
    listProjectsForAnalytics: typeof financeProjectSummaryRepository.listProjectsForAnalytics;
    listLedgerTotals: typeof financeProjectSummaryRepository.listLedgerTotals;
    listUnallocatedExpenseItems: typeof financeProjectSummaryRepository.listUnallocatedExpenseItems;
    listLedgerTrend: typeof financeProjectSummaryRepository.listLedgerTrend;
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

    const projects = hasRiskFilters(query)
      ? await this.listRiskFilteredProjects({ tenantId, query })
      : await this.dependencies.repository.listProjects(tenantId, query);
    const shouldIncludeAnalytics = query.include_analytics !== false;
    const [list, analytics] = await Promise.all([
      this.buildSummaries({
        tenantId,
        projects: projects.list,
      }),
      shouldIncludeAnalytics
        ? this.buildAnalytics({
          tenantId,
          query,
        })
        : Promise.resolve(undefined),
    ]);

    return {
      ...projects,
      list,
      summary: summarizeFinanceProjectSummaryList(list),
      ...(analytics ? { analytics } : {}),
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

  private async listRiskFilteredProjects(input: {
    tenantId: string;
    query: FinanceProjectSummaryListQuery;
  }) {
    const search = await this.dependencies.repository.searchProjectIdsByRisk(input);
    const projects = await this.dependencies.repository.listProjectsByIds({
      tenantId: input.tenantId,
      projectIds: search.projectIds,
    });
    return {
      list: projects,
      pagination: search.pagination,
    };
  }

  private async buildSummaries(input: {
    tenantId: string;
    projects: FinanceProjectSummaryProjectRow[];
  }) {
    const projectIds = input.projects.map((project) => project.id);
    const tenantToday = getTenantToday();
    const [
      ledgerTotals,
      unallocatedExpenseItems,
      receivableTotals,
      budgetTotals,
    ] = await Promise.all([
      this.dependencies.repository.listLedgerTotals({
        tenantId: input.tenantId,
        projectIds,
      }),
      this.dependencies.repository.listUnallocatedExpenseItems({
        tenantId: input.tenantId,
        projectIds,
        limitPerProject: 3,
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
      unallocatedExpenseItems: unallocatedExpenseItems.get(project.id),
      receivableTotals: receivableTotals.get(project.id),
      budgetTotals: budgetTotals.get(project.id),
    }));
  }

  private async buildAnalytics(input: {
    tenantId: string;
    query: FinanceProjectSummaryListQuery;
  }): Promise<FinanceProjectSummaryAnalytics> {
    return buildFinanceProjectSummaryAnalytics({
      tenantId: input.tenantId,
      query: input.query,
      repository: this.dependencies.repository,
      buildSummaries: (buildInput) => this.buildSummaries(buildInput),
    });
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

function hasRiskFilters(query: FinanceProjectSummaryListQuery) {
  return Boolean(
    query.risk_level ||
      query.risk_flag ||
      query.budget_configured !== undefined ||
      query.has_unallocated_expense !== undefined ||
      query.overdue !== undefined ||
      query.min_budget_usage_ratio !== undefined ||
      query.max_projected_budget_gross_margin !== undefined
  );
}

export const financeProjectSummaryService =
  new FinanceProjectSummaryService();
