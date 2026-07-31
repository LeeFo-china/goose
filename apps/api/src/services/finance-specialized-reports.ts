import { Errors } from "@/errors/error-factory";
import {
  financeOperatingReportRepository,
  type FinanceOperatingReportLedgerRow,
  type FinanceOperatingReportReceivableRow,
  type FinanceOperatingReportSupplierCostRow,
} from "@/repositories/finance-operating-report";
import {
  financeReconciliationRepository,
} from "@/repositories/finance-reconciliation";
import type {
  FinanceCostCategorySummaryQuery,
  FinanceMonthlyOverviewExportQuery,
  FinanceProjectRankingQuery,
  FinanceReceivableAgingQuery,
} from "@/schema/finance-reports";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import {
  buildFinanceReconciliationExceptions,
} from "@/services/finance-reconciliation-exceptions";
import {
  financeMonthlyOverviewService,
} from "@/services/finance-monthly-overview";
import {
  agingBucketKey,
  buildMonthlyOverviewCsv,
  compareBy,
  createAgingBuckets,
  daysBetween,
  paginate,
  roundMoney,
  roundRate,
  shiftDate,
  toDateOnly,
  type FinanceReceivableAgingBucket,
} from "@/services/finance-specialized-report-helpers";

const SOURCE_LIMIT = 10_000;
const DEFAULT_RANGE_DAYS = 30;

type FinanceSpecializedReportServiceDependencies = {
  operatingReportRepository: Pick<
    typeof financeOperatingReportRepository,
    "listLedgerRows" | "listReceivableRows" | "listSupplierCostRows"
  >;
  reconciliationRepository: Pick<
    typeof financeReconciliationRepository,
    "listCandidateRows"
  >;
  monthlyOverviewService: Pick<
    typeof financeMonthlyOverviewService,
    "getMonthlyOverview"
  >;
  accessPolicyService: Pick<
    typeof accessPolicyService,
    "assertTenantContext" | "hasPermission"
  >;
  now?: () => Date;
};

export type FinanceProjectRankingItem = {
  project_id: string | null;
  project_name: string;
  project_status: string | null;
  income_amount: number;
  expense_amount: number;
  gross_profit_amount: number;
  gross_profit_rate: number;
  receivable_amount: number;
  received_amount: number;
  receivable_remaining_amount: number;
  overdue_receivable_amount: number;
  reconciliation_exception_count: number;
};

export type FinanceCostCategorySummaryItem = {
  cost_category_id: string | null;
  cost_category_name: string;
  expense_amount: number;
  expense_percent: number;
  ledger_entry_count: number;
  project_count: number;
};

export type FinanceReceivableAgingItem = {
  receivable_id: string;
  project_id: string | null;
  project_name: string;
  due_date: string | null;
  amount: number;
  paid_amount: number;
  remaining_amount: number;
  overdue_days: number;
  bucket_key: FinanceReceivableAgingBucket["key"];
};

export class FinanceSpecializedReportService {
  constructor(
    private readonly dependencies: FinanceSpecializedReportServiceDependencies = {
      operatingReportRepository: financeOperatingReportRepository,
      reconciliationRepository: financeReconciliationRepository,
      monthlyOverviewService: financeMonthlyOverviewService,
      accessPolicyService,
      now: () => new Date(),
    },
  ) {}

  async getProjectRanking(
    authContext: AuthContext,
    query: FinanceProjectRankingQuery,
  ) {
    const tenantId = this.dependencies.accessPolicyService
      .assertTenantContext(authContext);
    this.assertCanReadReports(authContext);

    const range = resolveReportRange(query, this.dependencies.now?.());
    const [ledgerRows, supplierCostRows, receivableRows, reconciliationCandidates] =
      await Promise.all([
        this.dependencies.operatingReportRepository.listLedgerRows({
          tenantId,
          dateFrom: range.dateFrom,
          dateTo: range.dateTo,
          projectStatus: query.project_status,
          sourceLimit: SOURCE_LIMIT,
        }),
        this.dependencies.operatingReportRepository.listSupplierCostRows({
          tenantId,
          dateFrom: range.dateFrom,
          dateTo: range.dateTo,
          projectStatus: query.project_status,
          sourceLimit: SOURCE_LIMIT,
        }),
        this.dependencies.operatingReportRepository.listReceivableRows({
          tenantId,
          dateFrom: range.dateFrom,
          dateTo: range.dateTo,
          projectStatus: query.project_status,
          sourceLimit: SOURCE_LIMIT,
        }),
        this.dependencies.reconciliationRepository.listCandidateRows({
          tenantId,
          dateFrom: range.dateFrom,
          dateTo: range.dateTo,
          sourceLimit: SOURCE_LIMIT,
        }),
      ]);

    const exceptionCountByProject = new Map<string, number>();
    for (const item of buildFinanceReconciliationExceptions(
      reconciliationCandidates,
      range.dateTo,
    )) {
      const key = item.project_id || "unassigned";
      exceptionCountByProject.set(
        key,
        (exceptionCountByProject.get(key) || 0) + 1,
      );
    }

    const groups = new Map<string, FinanceProjectRankingItem>();
    for (const row of ledgerRows) {
      const group = getProjectGroup(groups, row);
      if (row.direction === "in") {
        group.income_amount += row.amount;
        group.received_amount += row.amount;
      } else if (
        row.direction === "out" &&
        row.entry_type !== "supplier_payment"
      ) {
        group.expense_amount += row.amount;
      }
    }
    for (const row of supplierCostRows) {
      getProjectGroup(groups, row).expense_amount += row.amount;
    }

    for (const row of receivableRows) {
      if (row.status === "canceled") continue;
      const group = getProjectGroup(groups, row);
      const remainingAmount = Math.max(row.amount - row.paid_amount, 0);
      group.receivable_amount += row.amount;
      group.receivable_remaining_amount += remainingAmount;
      if (
        row.status !== "paid" &&
        row.due_date &&
        row.due_date < range.dateTo &&
        remainingAmount > 0
      ) {
        group.overdue_receivable_amount += remainingAmount;
      }
    }

    const list = Array.from(groups.values()).map((item) => {
      const grossProfitAmount = item.income_amount - item.expense_amount;
      const projectKey = item.project_id || "unassigned";
      return {
        ...item,
        income_amount: roundMoney(item.income_amount),
        expense_amount: roundMoney(item.expense_amount),
        gross_profit_amount: roundMoney(grossProfitAmount),
        gross_profit_rate: roundRate(
          item.income_amount > 0 ? grossProfitAmount / item.income_amount : 0,
        ),
        receivable_amount: roundMoney(item.receivable_amount),
        received_amount: roundMoney(item.received_amount),
        receivable_remaining_amount: roundMoney(
          item.receivable_remaining_amount,
        ),
        overdue_receivable_amount: roundMoney(item.overdue_receivable_amount),
        reconciliation_exception_count:
          exceptionCountByProject.get(projectKey) || 0,
      };
    }).sort(compareBy(query.sort_by, query.sort_order));
    const paginated = paginate(list, query);

    return {
      list: paginated.items,
      pagination: paginated.pagination,
      scope: buildScope(range),
    };
  }

  async getCostCategorySummary(
    authContext: AuthContext,
    query: FinanceCostCategorySummaryQuery,
  ) {
    const tenantId = this.dependencies.accessPolicyService
      .assertTenantContext(authContext);
    this.assertCanReadReports(authContext);

    const range = resolveReportRange(query, this.dependencies.now?.());
    const [ledgerRows, supplierCostRows] = await Promise.all([
      this.dependencies.operatingReportRepository.listLedgerRows({
        tenantId,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        sourceLimit: SOURCE_LIMIT,
      }),
      this.dependencies.operatingReportRepository.listSupplierCostRows({
        tenantId,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        sourceLimit: SOURCE_LIMIT,
      }),
    ]);

    const groups = new Map<string, FinanceCostCategorySummaryItem & {
      projectIds: Set<string>;
    }>();
    let expenseAmount = 0;
    let unallocatedExpenseAmount = 0;

    for (const row of ledgerRows) {
      if (row.direction !== "out" || row.entry_type === "supplier_payment") {
        continue;
      }
      const key = row.cost_category_id || "unallocated";
      const current = groups.get(key) || {
        cost_category_id: row.cost_category_id,
        cost_category_name: row.cost_category_name || "未归集",
        expense_amount: 0,
        expense_percent: 0,
        ledger_entry_count: 0,
        project_count: 0,
        projectIds: new Set<string>(),
      };
      current.expense_amount += row.amount;
      current.ledger_entry_count += 1;
      if (row.project_id) current.projectIds.add(row.project_id);
      groups.set(key, current);
      expenseAmount += row.amount;
      if (!row.cost_category_id) {
        unallocatedExpenseAmount += row.amount;
      }
    }
    for (const row of supplierCostRows) {
      addCostCategoryRow(groups, row);
      expenseAmount += row.amount;
    }

    const list = Array.from(groups.values()).map((item) => ({
      cost_category_id: item.cost_category_id,
      cost_category_name: item.cost_category_name,
      expense_amount: roundMoney(item.expense_amount),
      expense_percent: roundRate(
        expenseAmount > 0 ? item.expense_amount / expenseAmount : 0,
      ),
      ledger_entry_count: item.ledger_entry_count,
      project_count: item.projectIds.size,
    })).sort(compareBy(query.sort_by, query.sort_order));
    const paginated = paginate(list, query);

    return {
      summary: {
        expense_amount: roundMoney(expenseAmount),
        unallocated_expense_amount: roundMoney(unallocatedExpenseAmount),
      },
      list: paginated.items,
      pagination: paginated.pagination,
      scope: buildScope(range),
    };
  }

  async getReceivableAging(
    authContext: AuthContext,
    query: FinanceReceivableAgingQuery,
  ) {
    const tenantId = this.dependencies.accessPolicyService
      .assertTenantContext(authContext);
    this.assertCanReadReports(authContext);

    const asOf = query.as_of ?? toDateOnly(this.dependencies.now?.() ?? new Date());
    const receivableRows = await this.dependencies.operatingReportRepository
      .listReceivableRows({
        tenantId,
        dateFrom: "1970-01-01",
        dateTo: asOf,
        projectStatus: query.project_status,
        sourceLimit: SOURCE_LIMIT,
      });
    const buckets = createAgingBuckets();
    const items: FinanceReceivableAgingItem[] = [];

    for (const row of receivableRows) {
      if (row.status === "canceled") continue;
      const remainingAmount = Math.max(row.amount - row.paid_amount, 0);
      if (remainingAmount <= 0) continue;
      const overdueDays = row.due_date ? daysBetween(row.due_date, asOf) : 0;
      const bucketKey = agingBucketKey(overdueDays);
      const bucket = buckets.find((item) => item.key === bucketKey)!;
      bucket.amount = roundMoney(bucket.amount + remainingAmount);
      bucket.count += 1;
      items.push({
        receivable_id: row.id,
        project_id: row.project_id,
        project_name: row.project_name || "未关联项目",
        due_date: row.due_date,
        amount: roundMoney(row.amount),
        paid_amount: roundMoney(row.paid_amount),
        remaining_amount: roundMoney(remainingAmount),
        overdue_days: Math.max(overdueDays, 0),
        bucket_key: bucketKey,
      });
    }

    items.sort((left, right) =>
      (left.due_date || "").localeCompare(right.due_date || "")
    );
    const paginated = paginate(items, query);

    return {
      buckets,
      list: paginated.items,
      pagination: paginated.pagination,
      scope: {
        as_of: asOf,
        source_limit: SOURCE_LIMIT,
        truncated: receivableRows.length >= SOURCE_LIMIT,
      },
    };
  }

  async exportMonthlyOverviewCsv(
    authContext: AuthContext,
    query: FinanceMonthlyOverviewExportQuery,
  ) {
    this.dependencies.accessPolicyService.assertTenantContext(authContext);
    this.assertCanExportReports(authContext);

    const overview = await this.dependencies.monthlyOverviewService
      .getMonthlyOverview(authContext, { month: query.month });
    const month = overview.scope.month;
    return {
      filename: `finance-monthly-overview-${month}.csv`,
      content_type: "text/csv; charset=utf-8",
      content: buildMonthlyOverviewCsv(overview),
    };
  }

  private assertCanReadReports(authContext: AuthContext) {
    const allowed = [
      "finance.reports.read",
      "finance.view",
      "finance.ledger.view",
      "finance.dashboard.view",
    ].some((permission) =>
      this.dependencies.accessPolicyService.hasPermission(
        authContext,
        permission,
      )
    );
    if (!allowed) throw Errors.forbidden();
  }

  private assertCanExportReports(authContext: AuthContext) {
    if (
      !this.dependencies.accessPolicyService.hasPermission(
        authContext,
        "finance.reports.export",
      )
    ) {
      throw Errors.forbidden();
    }
  }
}

function getProjectGroup(
  groups: Map<string, FinanceProjectRankingItem>,
  row: Pick<
    FinanceOperatingReportLedgerRow | FinanceOperatingReportReceivableRow,
    "project_id" | "project_name" | "project_status"
  >,
) {
  const key = row.project_id || "unassigned";
  const current = groups.get(key) || {
    project_id: row.project_id,
    project_name: row.project_name || "未关联项目",
    project_status: row.project_status,
    income_amount: 0,
    expense_amount: 0,
    gross_profit_amount: 0,
    gross_profit_rate: 0,
    receivable_amount: 0,
    received_amount: 0,
    receivable_remaining_amount: 0,
    overdue_receivable_amount: 0,
    reconciliation_exception_count: 0,
  };
  groups.set(key, current);
  return current;
}

function addCostCategoryRow(
  groups: Map<string, FinanceCostCategorySummaryItem & {
    projectIds: Set<string>;
  }>,
  row: FinanceOperatingReportSupplierCostRow,
) {
  const current = groups.get(row.cost_category_id) || {
    cost_category_id: row.cost_category_id,
    cost_category_name: row.cost_category_name || "未归集",
    expense_amount: 0,
    expense_percent: 0,
    ledger_entry_count: 0,
    project_count: 0,
    projectIds: new Set<string>(),
  };
  current.expense_amount += row.amount;
  current.ledger_entry_count += 1;
  current.projectIds.add(row.project_id);
  groups.set(row.cost_category_id, current);
}

function resolveReportRange(
  query: { month?: string; date_from?: string; date_to?: string },
  now = new Date(),
) {
  if (query.month) {
    const [yearText, monthText] = query.month.split("-");
    const year = Number(yearText);
    const month = Number(monthText);
    const dateTo = new Date(Date.UTC(year, month, 0)).toISOString()
      .slice(0, 10);
    return { dateFrom: `${query.month}-01`, dateTo };
  }

  const dateTo = query.date_to ?? toDateOnly(now);
  const dateFrom = query.date_from ?? shiftDate(dateTo, -DEFAULT_RANGE_DAYS + 1);
  if (Date.parse(`${dateFrom}T00:00:00.000Z`) >
      Date.parse(`${dateTo}T00:00:00.000Z`)) {
    throw Errors.badRequest("报表日期范围无效");
  }
  return { dateFrom, dateTo };
}

function buildScope(range: { dateFrom: string; dateTo: string }) {
  return {
    date_from: range.dateFrom,
    date_to: range.dateTo,
    source_limit: SOURCE_LIMIT,
  };
}

export const financeSpecializedReportService =
  new FinanceSpecializedReportService();
