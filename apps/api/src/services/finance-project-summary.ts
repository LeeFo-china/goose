import { Errors } from "@/errors/error-factory";
import {
  financeProjectSummaryRepository,
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
};

type FinanceProjectSummaryServiceDependencies = {
  repository: {
    listProjects: typeof financeProjectSummaryRepository.listProjects;
    findProject: typeof financeProjectSummaryRepository.findProject;
    listLedgerTotals: typeof financeProjectSummaryRepository.listLedgerTotals;
    listReceivableTotals: typeof financeProjectSummaryRepository.listReceivableTotals;
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
    const [ledgerTotals, receivableTotals] = await Promise.all([
      this.dependencies.repository.listLedgerTotals({
        tenantId: input.tenantId,
        projectIds,
      }),
      this.dependencies.repository.listReceivableTotals({
        tenantId: input.tenantId,
        projectIds,
        tenantToday,
      }),
    ]);

    return input.projects.map((project) => buildProjectOperatingSummary({
      project,
      ledgerTotals: ledgerTotals.get(project.id),
      receivableTotals: receivableTotals.get(project.id),
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
}): FinanceProjectOperatingSummary {
  const contractAmount = resolveContractAmount(input.project);
  const receivedAmount = roundMoney(input.ledgerTotals?.income_amount ?? 0);
  const expensePaidAmount = roundMoney(input.ledgerTotals?.expense_amount ?? 0);
  const actualProfitAmount = roundMoney(receivedAmount - expensePaidAmount);
  const projectedProfitAmount = roundMoney(contractAmount - expensePaidAmount);

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
  totals.actual_gross_margin = totals.received_amount > 0
    ? roundRatio(totals.actual_profit_amount / totals.received_amount)
    : null;
  totals.projected_gross_margin = totals.contract_amount > 0
    ? roundRatio(totals.projected_profit_amount / totals.contract_amount)
    : null;

  return totals;
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
