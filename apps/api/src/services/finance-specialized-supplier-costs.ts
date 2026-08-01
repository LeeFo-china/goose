import type {
  FinanceOperatingReportSupplierCostRow,
} from "@/repositories/finance-operating-report";
import type {
  FinanceCostCategorySummaryItem,
  FinanceProjectRankingItem,
} from "@/services/finance-specialized-reports";
import {
  aggregateSupplierCostCentsBy,
  sumSupplierCostCents,
  supplierCostCentsToNumber,
} from "@/services/finance-report-supplier-costs";

type CategoryGroup = FinanceCostCategorySummaryItem & {
  projectIds: Set<string>;
};

export function applySupplierCostsToProjectGroups(
  groups: Map<string, FinanceProjectRankingItem>,
  rows: FinanceOperatingReportSupplierCostRow[],
) {
  for (const row of rows) {
    if (!groups.has(row.project_id)) {
      groups.set(row.project_id, {
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
      });
    }
  }
  const centsByProject = aggregateSupplierCostCentsBy(
    rows,
    (row) => row.project_id,
  );
  for (const [projectId, cents] of centsByProject) {
    groups.get(projectId)!.expense_amount += supplierCostCentsToNumber(
      cents,
      rows,
    );
  }
}

export function applySupplierCostsToCategoryGroups(
  groups: Map<string, CategoryGroup>,
  rows: FinanceOperatingReportSupplierCostRow[],
) {
  for (const row of rows) {
    const current = groups.get(row.cost_category_id) || {
      cost_category_id: row.cost_category_id,
      cost_category_name: row.cost_category_name || "未归集",
      expense_amount: 0,
      expense_percent: 0,
      ledger_entry_count: 0,
      project_count: 0,
      projectIds: new Set<string>(),
    };
    current.projectIds.add(row.project_id);
    groups.set(row.cost_category_id, current);
  }
  const centsByCategory = aggregateSupplierCostCentsBy(
    rows,
    (row) => row.cost_category_id,
  );
  for (const [categoryId, cents] of centsByCategory) {
    groups.get(categoryId)!.expense_amount += supplierCostCentsToNumber(
      cents,
      rows,
    );
  }
  return supplierCostCentsToNumber(
    sumSupplierCostCents(centsByCategory),
    rows,
  );
}
