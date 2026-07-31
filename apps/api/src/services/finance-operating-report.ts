import { Errors } from "@/errors/error-factory";
import {
  financeOperatingReportRepository,
  type FinanceOperatingReportLedgerRow,
  type FinanceOperatingReportReceivableRow,
  type FinanceOperatingReportSupplierCostRow,
} from "@/repositories/finance-operating-report";
import type {
  FinanceOperatingReportGroupBy,
  FinanceOperatingReportQuery,
} from "@/schema/finance-reports";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import {
  aggregateSupplierCostCentsBy,
  supplierCostCentsToNumber,
} from "@/services/finance-report-supplier-costs";

const MAX_REPORT_RANGE_DAYS = 366;
const DEFAULT_REPORT_RANGE_DAYS = 30;
const SOURCE_LIMIT = 10_000;

type FinanceOperatingReportServiceDependencies = {
  repository: Pick<
    typeof financeOperatingReportRepository,
    "listLedgerRows" | "listReceivableRows" | "listSupplierCostRows"
  >;
  accessPolicyService: Pick<
    typeof accessPolicyService,
    "assertTenantContext" | "hasPermission"
  >;
  now?: () => Date;
};

export type FinanceOperatingReportGroup = {
  key: string;
  label: string;
  received_amount: number;
  expense_amount: number;
  actual_profit_amount: number;
  overdue_amount: number;
  receivable_remaining_amount: number;
  unallocated_expense_amount: number;
};

export type FinanceOperatingReport = {
  summary: Omit<FinanceOperatingReportGroup, "key" | "label">;
  groups: FinanceOperatingReportGroup[];
  scope: {
    date_from: string;
    date_to: string;
    group_by: FinanceOperatingReportGroupBy;
    source_limit: number;
    truncated: boolean;
  };
};

export class FinanceOperatingReportService {
  constructor(
    private readonly dependencies: FinanceOperatingReportServiceDependencies = {
      repository: financeOperatingReportRepository,
      accessPolicyService,
      now: () => new Date(),
    },
  ) {}

  async getOperatingReport(
    authContext: AuthContext,
    query: FinanceOperatingReportQuery,
  ): Promise<FinanceOperatingReport> {
    const tenantId = this.dependencies.accessPolicyService
      .assertTenantContext(authContext);
    this.assertCanViewReports(authContext);

    const range = this.resolveDateRange(query);
    const groupBy = query.group_by ?? "month";
    const [ledgerRows, supplierCostRows, receivableRows] = await Promise.all([
      this.dependencies.repository.listLedgerRows({
        tenantId,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        projectId: query.project_id,
        projectStatus: query.project_status,
        sourceLimit: SOURCE_LIMIT,
      }),
      this.dependencies.repository.listSupplierCostRows({
        tenantId,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        projectId: query.project_id,
        projectStatus: query.project_status,
        sourceLimit: SOURCE_LIMIT,
      }),
      this.dependencies.repository.listReceivableRows({
        tenantId,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        projectId: query.project_id,
        projectStatus: query.project_status,
        sourceLimit: SOURCE_LIMIT,
      }),
    ]);

    return {
      summary: summarizeGroup(
        this.buildSummaryRows(
          ledgerRows,
          supplierCostRows,
          receivableRows,
          range.dateTo,
        ),
      ),
      groups: this.buildGroups({
        ledgerRows,
        supplierCostRows,
        receivableRows,
        groupBy,
        tenantToday: range.dateTo,
      }),
      scope: {
        date_from: range.dateFrom,
        date_to: range.dateTo,
        group_by: groupBy,
        source_limit: SOURCE_LIMIT,
        truncated: ledgerRows.length >= SOURCE_LIMIT ||
          supplierCostRows.length >= SOURCE_LIMIT ||
          receivableRows.length >= SOURCE_LIMIT,
      },
    };
  }

  private buildGroups(input: {
    ledgerRows: FinanceOperatingReportLedgerRow[];
    supplierCostRows: FinanceOperatingReportSupplierCostRow[];
    receivableRows: FinanceOperatingReportReceivableRow[];
    groupBy: FinanceOperatingReportGroupBy;
    tenantToday: string;
  }) {
    const groups = new Map<string, FinanceOperatingReportGroup>();

    for (const row of input.ledgerRows) {
      const key = ledgerGroupKey(row, input.groupBy);
      const current = groups.get(key.key) || emptyGroup(key.key, key.label);
      applyLedgerToGroup(current, row);
      groups.set(key.key, current);
    }
    for (const row of input.supplierCostRows) {
      const key = supplierCostGroupKey(row, input.groupBy);
      const current = groups.get(key.key) || emptyGroup(key.key, key.label);
      groups.set(key.key, current);
    }
    applySupplierCostCents(
      groups,
      input.supplierCostRows,
      (row) => supplierCostGroupKey(row, input.groupBy).key,
    );

    for (const row of input.receivableRows) {
      const key = receivableGroupKey(row, input.groupBy);
      const current = groups.get(key.key) || emptyGroup(key.key, key.label);
      applyReceivableToGroup(current, row, input.tenantToday);
      groups.set(key.key, current);
    }

    return Array.from(groups.values())
      .map(finalizeGroup)
      .sort(compareGroups);
  }

  private buildSummaryRows(
    ledgerRows: FinanceOperatingReportLedgerRow[],
    supplierCostRows: FinanceOperatingReportSupplierCostRow[],
    receivableRows: FinanceOperatingReportReceivableRow[],
    tenantToday: string,
  ) {
    const group = emptyGroup("summary", "汇总");
    for (const row of ledgerRows) applyLedgerToGroup(group, row);
    applySupplierCostCents(
      new Map([["summary", group]]),
      supplierCostRows,
      () => "summary",
    );
    for (const row of receivableRows) {
      applyReceivableToGroup(group, row, tenantToday);
    }
    return finalizeGroup(group);
  }

  private resolveDateRange(query: FinanceOperatingReportQuery) {
    const dateTo = query.date_to ??
      toDateOnly(this.dependencies.now?.() ?? new Date());
    const dateFrom = query.date_from ??
      shiftDate(dateTo, -DEFAULT_REPORT_RANGE_DAYS + 1);
    const fromTime = Date.parse(`${dateFrom}T00:00:00.000Z`);
    const toTime = Date.parse(`${dateTo}T00:00:00.000Z`);
    if (
      !Number.isFinite(fromTime) ||
      !Number.isFinite(toTime) ||
      fromTime > toTime
    ) {
      throw Errors.badRequest("报表日期范围无效");
    }

    const rangeDays = Math.floor((toTime - fromTime) / 86_400_000) + 1;
    if (rangeDays > MAX_REPORT_RANGE_DAYS) {
      throw Errors.badRequest("报表日期范围不能超过 366 天");
    }

    return { dateFrom, dateTo };
  }

  private assertCanViewReports(authContext: AuthContext) {
    const allowed = [
      "finance.view",
      "finance.ledger.view",
      "finance.receivable.view",
      "finance.receivable.manage",
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

function emptyGroup(key: string, label: string): FinanceOperatingReportGroup {
  return {
    key,
    label,
    received_amount: 0,
    expense_amount: 0,
    actual_profit_amount: 0,
    overdue_amount: 0,
    receivable_remaining_amount: 0,
    unallocated_expense_amount: 0,
  };
}

function applyLedgerToGroup(
  group: FinanceOperatingReportGroup,
  row: FinanceOperatingReportLedgerRow,
) {
  if (row.direction === "in") {
    group.received_amount += row.amount;
  } else if (
    row.direction === "out" &&
    row.entry_type !== "supplier_payment"
  ) {
    group.expense_amount += row.amount;
    if (!row.cost_category_id) {
      group.unallocated_expense_amount += row.amount;
    }
  }
}

function applySupplierCostCents(
  groups: Map<string, FinanceOperatingReportGroup>,
  rows: FinanceOperatingReportSupplierCostRow[],
  getKey: (row: FinanceOperatingReportSupplierCostRow) => string,
) {
  const centsByGroup = aggregateSupplierCostCentsBy(rows, getKey);
  for (const [key, cents] of centsByGroup) {
    groups.get(key)!.expense_amount += supplierCostCentsToNumber(cents, rows);
  }
}

function supplierCostGroupKey(
  row: FinanceOperatingReportSupplierCostRow,
  groupBy: FinanceOperatingReportGroupBy,
) {
  if (groupBy === "day") return dateKey(row.occurred_at, 10);
  if (groupBy === "month") return dateKey(row.occurred_at, 7);
  if (groupBy === "project") {
    return { key: row.project_id, label: row.project_name || "未关联项目" };
  }
  if (groupBy === "cost_category") {
    return {
      key: row.cost_category_id,
      label: row.cost_category_name || "未归集",
    };
  }
  return { key: "unclassified", label: "未分类" };
}

function applyReceivableToGroup(
  group: FinanceOperatingReportGroup,
  row: FinanceOperatingReportReceivableRow,
  tenantToday: string,
) {
  if (row.status === "canceled") return;
  const remainingAmount = Math.max(row.amount - row.paid_amount, 0);
  group.receivable_remaining_amount += remainingAmount;
  if (
    row.status !== "paid" &&
    row.due_date &&
    row.due_date < tenantToday &&
    remainingAmount > 0
  ) {
    group.overdue_amount += remainingAmount;
  }
}

function finalizeGroup(group: FinanceOperatingReportGroup) {
  return {
    ...group,
    received_amount: roundMoney(group.received_amount),
    expense_amount: roundMoney(group.expense_amount),
    actual_profit_amount: roundMoney(
      group.received_amount - group.expense_amount,
    ),
    overdue_amount: roundMoney(group.overdue_amount),
    receivable_remaining_amount: roundMoney(group.receivable_remaining_amount),
    unallocated_expense_amount: roundMoney(group.unallocated_expense_amount),
  };
}

function summarizeGroup(group: FinanceOperatingReportGroup) {
  const { key: _key, label: _label, ...summary } = group;
  return summary;
}

function ledgerGroupKey(
  row: FinanceOperatingReportLedgerRow,
  groupBy: FinanceOperatingReportGroupBy,
) {
  if (groupBy === "day") return dateKey(row.occurred_at, 10);
  if (groupBy === "month") return dateKey(row.occurred_at, 7);
  if (groupBy === "project") {
    return {
      key: row.project_id || "unassigned",
      label: row.project_name || "未关联项目",
    };
  }
  if (groupBy === "payment_type") {
    const paymentType = readMetadataString(row.metadata, "payment_type");
    return { key: paymentType || "unclassified", label: paymentType || "未分类" };
  }
  return {
    key: row.cost_category_id || "unallocated",
    label: row.cost_category_name || "未归集",
  };
}

function receivableGroupKey(
  row: FinanceOperatingReportReceivableRow,
  groupBy: FinanceOperatingReportGroupBy,
) {
  if (groupBy === "day") return dateKey(row.due_date, 10);
  if (groupBy === "month") return dateKey(row.due_date, 7);
  if (groupBy === "project") {
    return {
      key: row.project_id || "unassigned",
      label: row.project_name || "未关联项目",
    };
  }
  if (groupBy === "payment_type") {
    return {
      key: row.payment_type || "unclassified",
      label: row.payment_type || "未分类",
    };
  }
  return { key: "receivable", label: "应收" };
}

function dateKey(value: string | null | undefined, size: 7 | 10) {
  const key = value?.slice(0, size) || "unknown";
  return { key, label: key === "unknown" ? "未知日期" : key };
}

function compareGroups(
  left: FinanceOperatingReportGroup,
  right: FinanceOperatingReportGroup,
) {
  return left.key.localeCompare(right.key);
}

function readMetadataString(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const metadataValue = (value as Record<string, unknown>)[key];
  return typeof metadataValue === "string" && metadataValue.trim()
    ? metadataValue.trim()
    : null;
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return toDateOnly(value);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export const financeOperatingReportService =
  new FinanceOperatingReportService();
