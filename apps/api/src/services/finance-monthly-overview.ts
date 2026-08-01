import { Errors } from "@/errors/error-factory";
import {
  financeClosingPeriodRepository,
  type FinanceClosingPeriodRow,
} from "@/repositories/finance-closing-periods";
import {
  financeOperatingReportRepository,
  type FinanceOperatingReportLedgerRow,
  type FinanceOperatingReportReceivableRow,
  type FinanceOperatingReportSupplierCostRow,
} from "@/repositories/finance-operating-report";
import {
  financeReconciliationRepository,
} from "@/repositories/finance-reconciliation";
import type { FinanceMonthlyOverviewQuery } from "@/schema/finance-reports";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import {
  buildFinanceReconciliationExceptions,
} from "@/services/finance-reconciliation-exceptions";
import {
  aggregateSupplierCostCentsBy,
  supplierCostCentsToNumber,
} from "@/services/finance-report-supplier-costs";

const SOURCE_LIMIT = 10_000;

type FinanceMonthlyOverviewServiceDependencies = {
  operatingReportRepository: Pick<
    typeof financeOperatingReportRepository,
    "listLedgerRows" | "listReceivableRows" | "listSupplierCostRows"
  >;
  reconciliationRepository: Pick<
    typeof financeReconciliationRepository,
    "listCandidateRows"
  >;
  closingPeriodRepository: Pick<
    typeof financeClosingPeriodRepository,
    "findByMonth"
  >;
  accessPolicyService: Pick<
    typeof accessPolicyService,
    "assertTenantContext" | "hasPermission"
  >;
  now?: () => Date;
};

export type FinanceMonthlyOverviewSummary = {
  income_amount: number;
  expense_amount: number;
  gross_profit_amount: number;
  gross_profit_rate: number;
  receivable_amount: number;
  received_amount: number;
  receivable_remaining_amount: number;
  overdue_receivable_amount: number;
  reconciliation_exception_count: number;
  unallocated_expense_amount: number;
};

export type FinanceMonthlyOverviewClosing = {
  id: string | null;
  status: "not_started" | FinanceClosingPeriodRow["status"];
  closed_at: string | null;
  reopened_at: string | null;
  notes: string | null;
  snapshot_summary: Partial<FinanceMonthlyOverviewSummary> | null;
  current_summary: FinanceMonthlyOverviewSummary | null;
  difference_summary: Partial<FinanceMonthlyOverviewSummary> | null;
  has_snapshot_difference: boolean;
};

export type FinanceMonthlyOverview = {
  summary: FinanceMonthlyOverviewSummary;
  closing: FinanceMonthlyOverviewClosing;
  scope: {
    month: string;
    date_from: string;
    date_to: string;
    source_limit: number;
    truncated: boolean;
  };
};

export class FinanceMonthlyOverviewService {
  constructor(
    private readonly dependencies: FinanceMonthlyOverviewServiceDependencies = {
      operatingReportRepository: financeOperatingReportRepository,
      reconciliationRepository: financeReconciliationRepository,
      closingPeriodRepository: financeClosingPeriodRepository,
      accessPolicyService,
      now: () => new Date(),
    },
  ) {}

  async getMonthlyOverview(
    authContext: AuthContext,
    query: FinanceMonthlyOverviewQuery,
  ): Promise<FinanceMonthlyOverview> {
    const tenantId = this.dependencies.accessPolicyService
      .assertTenantContext(authContext);
    this.assertCanReadReports(authContext);

    const range = resolveMonthRange(
      query.month ?? toMonthOnly(this.dependencies.now?.() ?? new Date()),
    );
    const [ledgerRows, supplierCostRows, receivableRows, reconciliationCandidates, closingPeriod] =
      await Promise.all([
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
        this.dependencies.operatingReportRepository.listReceivableRows({
          tenantId,
          dateFrom: range.dateFrom,
          dateTo: range.dateTo,
          sourceLimit: SOURCE_LIMIT,
        }),
        this.dependencies.reconciliationRepository.listCandidateRows({
          tenantId,
          dateFrom: range.dateFrom,
          dateTo: range.dateTo,
          sourceLimit: SOURCE_LIMIT,
        }),
        this.dependencies.closingPeriodRepository.findByMonth({
          tenantId,
          periodMonth: range.month,
        }),
      ]);

    const summary = buildSummary({
      ledgerRows,
      supplierCostRows,
      receivableRows,
      reconciliationExceptionCount: buildFinanceReconciliationExceptions(
        reconciliationCandidates,
        range.dateTo,
      ).length,
      tenantToday: range.dateTo,
    });

    return {
      summary,
      closing: serializeClosing(closingPeriod, summary),
      scope: {
        month: range.month,
        date_from: range.dateFrom,
        date_to: range.dateTo,
        source_limit: SOURCE_LIMIT,
        truncated: ledgerRows.length >= SOURCE_LIMIT ||
          supplierCostRows.length >= SOURCE_LIMIT ||
          receivableRows.length >= SOURCE_LIMIT,
      },
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

    if (!allowed) {
      throw Errors.forbidden();
    }
  }
}

function buildSummary(input: {
  ledgerRows: FinanceOperatingReportLedgerRow[];
  supplierCostRows: FinanceOperatingReportSupplierCostRow[];
  receivableRows: FinanceOperatingReportReceivableRow[];
  reconciliationExceptionCount: number;
  tenantToday: string;
}): FinanceMonthlyOverviewSummary {
  const ledger = input.ledgerRows.reduce(
    (summary, row) => {
      if (row.direction === "in") {
        summary.incomeAmount += row.amount;
      } else if (
        row.direction === "out" &&
        row.entry_type !== "supplier_payment"
      ) {
        summary.expenseAmount += row.amount;
        if (!row.cost_category_id) {
          summary.unallocatedExpenseAmount += row.amount;
        }
      }
      return summary;
    },
    {
      incomeAmount: 0,
      expenseAmount: 0,
      unallocatedExpenseAmount: 0,
    },
  );
  const supplierCostCents = aggregateSupplierCostCentsBy(
    input.supplierCostRows,
    () => "total",
  ).get("total") ?? BigInt(0);
  ledger.expenseAmount += supplierCostCentsToNumber(
    supplierCostCents,
    input.supplierCostRows,
  );
  const receivable = input.receivableRows.reduce(
    (summary, row) => {
      if (row.status === "canceled") return summary;
      const remainingAmount = Math.max(row.amount - row.paid_amount, 0);
      summary.receivableAmount += row.amount;
      summary.receivableRemainingAmount += remainingAmount;
      if (
        row.status !== "paid" &&
        row.due_date &&
        row.due_date < input.tenantToday &&
        remainingAmount > 0
      ) {
        summary.overdueReceivableAmount += remainingAmount;
      }
      return summary;
    },
    {
      receivableAmount: 0,
      receivableRemainingAmount: 0,
      overdueReceivableAmount: 0,
    },
  );
  const grossProfitAmount = ledger.incomeAmount - ledger.expenseAmount;

  return {
    income_amount: roundMoney(ledger.incomeAmount),
    expense_amount: roundMoney(ledger.expenseAmount),
    gross_profit_amount: roundMoney(grossProfitAmount),
    gross_profit_rate: roundRate(
      ledger.incomeAmount > 0 ? grossProfitAmount / ledger.incomeAmount : 0,
    ),
    receivable_amount: roundMoney(receivable.receivableAmount),
    received_amount: roundMoney(ledger.incomeAmount),
    receivable_remaining_amount: roundMoney(
      receivable.receivableRemainingAmount,
    ),
    overdue_receivable_amount: roundMoney(
      receivable.overdueReceivableAmount,
    ),
    reconciliation_exception_count: input.reconciliationExceptionCount,
    unallocated_expense_amount: roundMoney(
      ledger.unallocatedExpenseAmount,
    ),
  };
}

function serializeClosing(
  closingPeriod: FinanceClosingPeriodRow | null,
  currentSummary: FinanceMonthlyOverviewSummary,
): FinanceMonthlyOverviewClosing {
  if (!closingPeriod) {
    return {
      id: null,
      status: "not_started",
      closed_at: null,
      reopened_at: null,
      notes: null,
      snapshot_summary: null,
      current_summary: null,
      difference_summary: null,
      has_snapshot_difference: false,
    };
  }

  const snapshotSummary = readSnapshotSummary(closingPeriod.snapshot_json);
  const differenceSummary = buildDifferenceSummary(
    currentSummary,
    snapshotSummary,
  );

  return {
    id: closingPeriod.id,
    status: closingPeriod.status,
    closed_at: closingPeriod.closed_at,
    reopened_at: closingPeriod.reopened_at,
    notes: closingPeriod.notes,
    snapshot_summary: snapshotSummary,
    current_summary: snapshotSummary ? currentSummary : null,
    difference_summary: differenceSummary,
    has_snapshot_difference: hasSnapshotDifference(differenceSummary),
  };
}

function buildDifferenceSummary(
  currentSummary: FinanceMonthlyOverviewSummary,
  snapshotSummary: Partial<FinanceMonthlyOverviewSummary> | null,
): Partial<FinanceMonthlyOverviewSummary> | null {
  if (!snapshotSummary) return null;

  const result: Partial<FinanceMonthlyOverviewSummary> = {};
  for (const key of SUMMARY_KEYS) {
    const snapshotValue = snapshotSummary[key];
    if (typeof snapshotValue !== "number" || !Number.isFinite(snapshotValue)) {
      continue;
    }
    const difference = currentSummary[key] - snapshotValue;
    result[key] = key === "gross_profit_rate"
      ? roundRate(difference)
      : key === "reconciliation_exception_count"
        ? difference
        : roundMoney(difference);
  }

  return Object.keys(result).length ? result : null;
}

function hasSnapshotDifference(
  differenceSummary: Partial<FinanceMonthlyOverviewSummary> | null,
) {
  if (!differenceSummary) return false;
  return Object.values(differenceSummary).some((value) =>
    typeof value === "number" && Number.isFinite(value) && value !== 0
  );
}

function readSnapshotSummary(
  snapshotJson: unknown,
): Partial<FinanceMonthlyOverviewSummary> | null {
  if (!snapshotJson || typeof snapshotJson !== "object") return null;
  const summary = (snapshotJson as Record<string, unknown>).summary;
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return null;
  }

  const result: Partial<FinanceMonthlyOverviewSummary> = {};
  for (const key of SUMMARY_KEYS) {
    const value = (summary as Record<string, unknown>)[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      result[key] = value;
    }
  }
  return Object.keys(result).length ? result : null;
}

function resolveMonthRange(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) {
    throw Errors.badRequest("月份格式必须为 YYYY-MM");
  }

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) {
    throw Errors.badRequest("月份格式必须为 YYYY-MM");
  }

  const dateFrom = `${month}-01`;
  const lastDay = new Date(Date.UTC(year, monthNumber, 0))
    .toISOString()
    .slice(0, 10);
  return { month, dateFrom, dateTo: lastDay };
}

function toMonthOnly(date: Date) {
  return date.toISOString().slice(0, 7);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundRate(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

const SUMMARY_KEYS = [
  "income_amount",
  "expense_amount",
  "gross_profit_amount",
  "gross_profit_rate",
  "receivable_amount",
  "received_amount",
  "receivable_remaining_amount",
  "overdue_receivable_amount",
  "reconciliation_exception_count",
  "unallocated_expense_amount",
] as const;

export const financeMonthlyOverviewService =
  new FinanceMonthlyOverviewService();
