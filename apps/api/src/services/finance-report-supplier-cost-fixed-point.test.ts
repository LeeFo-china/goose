import { describe, expect, test } from "bun:test";
import type {
  FinanceOperatingReportSupplierCostRow,
} from "@/repositories/finance-operating-report";
import type { AuthContext } from "@/services/authorization";
import { FinanceMonthlyOverviewService } from "@/services/finance-monthly-overview";
import { FinanceOperatingReportService } from "@/services/finance-operating-report";
import { FinanceSpecializedReportService } from "@/services/finance-specialized-reports";

const authContext = {
  tenantId: "tenant-1",
  employeeId: "employee-1",
  permissions: [{ code: "finance.reports.read", scope: "all" }],
} as AuthContext;
const accessPolicyService = {
  assertTenantContext: () => "tenant-1",
  hasPermission: () => true,
};
const emptyCandidates = {
  receivables: [],
  payments: [],
  ledgers: [],
  expenseSettlements: [],
  expenseLedgers: [],
};

describe("finance report supplier cost fixed point aggregation", () => {
  test("keeps repeated cents exact and excludes cost events from ledger count", async () => {
    const rows = [
      supplierCostRow("cost-1", "0.01"),
      supplierCostRow("cost-2", "0.01"),
      supplierCostRow("cost-3", "0.01"),
    ];
    const services = createServices(rows);

    const monthly = await services.monthly.getMonthlyOverview(
      authContext,
      { month: "2026-06" },
    );
    const operating = await services.operating.getOperatingReport(
      authContext,
      {
        date_from: "2026-06-01",
        date_to: "2026-06-30",
        group_by: "project",
      },
    );
    const ranking = await services.specialized.getProjectRanking(
      authContext,
      rankingQuery(),
    );
    const categories = await services.specialized.getCostCategorySummary(
      authContext,
      categoryQuery(),
    );

    expect(monthly.summary.expense_amount).toBe(0.03);
    expect(operating.summary.expense_amount).toBe(0.03);
    expect(ranking.list[0]?.expense_amount).toBe(0.03);
    expect(categories.summary.expense_amount).toBe(0.03);
    expect(categories.list[0]?.ledger_entry_count).toBe(0);
  });

  test("rejects cumulative report cost beyond the safe cents boundary", async () => {
    const rows = [
      supplierCostRow("cost-1", "45035996273704.96"),
      supplierCostRow("cost-2", "45035996273704.96"),
    ];
    const services = createServices(rows);
    const expected = {
      statusCode: 422,
      code: "FINANCE_MONEY_EXCEEDS_SAFE_RANGE",
    };

    await expect(services.monthly.getMonthlyOverview(
      authContext,
      { month: "2026-06" },
    )).rejects.toMatchObject(expected);
    await expect(services.operating.getOperatingReport(
      authContext,
      {
        date_from: "2026-06-01",
        date_to: "2026-06-30",
        group_by: "project",
      },
    )).rejects.toMatchObject(expected);
    await expect(services.specialized.getProjectRanking(
      authContext,
      rankingQuery(),
    )).rejects.toMatchObject(expected);
    await expect(services.specialized.getCostCategorySummary(
      authContext,
      categoryQuery(),
    )).rejects.toMatchObject(expected);
  });
});

function createServices(rows: FinanceOperatingReportSupplierCostRow[]) {
  const operatingReportRepository = {
    listLedgerRows: async () => [],
    listSupplierCostRows: async () => rows,
    listReceivableRows: async () => [],
  };
  return {
    monthly: new FinanceMonthlyOverviewService({
      operatingReportRepository,
      reconciliationRepository: {
        listCandidateRows: async () => emptyCandidates,
      },
      closingPeriodRepository: { findByMonth: async () => null },
      accessPolicyService,
    }),
    operating: new FinanceOperatingReportService({
      repository: operatingReportRepository,
      accessPolicyService,
    }),
    specialized: new FinanceSpecializedReportService({
      operatingReportRepository,
      reconciliationRepository: {
        listCandidateRows: async () => emptyCandidates,
      },
      monthlyOverviewService: {
        getMonthlyOverview: async () => {
          throw new Error("not used");
        },
      },
      accessPolicyService,
    }),
  };
}

function supplierCostRow(
  id: string,
  amount: string,
): FinanceOperatingReportSupplierCostRow {
  return {
    id,
    project_id: "project-1",
    project_name: "A 项目",
    project_status: "constructing",
    cost_category_id: "category-1",
    cost_category_name: "材料",
    amount,
    occurred_at: "2026-06-10T10:00:00.000Z",
  };
}

function rankingQuery() {
  return {
    month: "2026-06",
    page: 1,
    pageSize: 20,
    sort_by: "expense_amount" as const,
    sort_order: "desc" as const,
  };
}

function categoryQuery() {
  return {
    month: "2026-06",
    page: 1,
    pageSize: 20,
    sort_by: "expense_amount" as const,
    sort_order: "desc" as const,
  };
}
