import { describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";
import { FinanceProjectSummaryService } from "@/services/finance-project-summary";

const listProjectsForAnalytics = mock(async () => ({
  list: [],
  total: 0,
  limit: 100,
}));
const listLedgerTrend = mock(async () => []);

const service = new FinanceProjectSummaryService({
  repository: {
    listProjects: mock(async () => ({
      list: [{
        id: "project-1",
        name: "轻量项目",
        status: "constructing",
        signed_amount: 100000,
        budget: 90000,
      }],
      pagination: {
        page: 1,
        pageSize: 3,
        total: 1,
        totalPages: 1,
      },
    })),
    findProject: mock(async () => null),
    searchProjectIdsByRisk: mock(async () => ({
      projectIds: [],
      pagination: {
        page: 1,
        pageSize: 3,
        total: 0,
        totalPages: 0,
      },
    })),
    listProjectsByIds: mock(async () => []),
    listProjectsForAnalytics,
    listLedgerTotals: mock(async () => new Map([
      ["project-1", {
        income_amount: 50000,
        expense_amount: 12000,
        unallocated_expense_amount: 0,
        ledger_entry_count: 2,
        expense_by_category: new Map(),
      }],
    ])),
    listUnallocatedExpenseItems: mock(async () => new Map()),
    listLedgerTrend,
    listReceivableTotals: mock(async () => new Map()),
    listBudgetTotals: mock(async () => new Map()),
  },
  accessPolicyService: {
    assertTenantContext: () => "tenant-1",
    hasPermission: (_authContext: AuthContext, permissionCode: string) =>
      permissionCode === "finance.view",
    canAccessProject: mock(async () => true),
  },
});

const authContext = {
  tenantId: "tenant-1",
  permissions: [{ code: "finance.view", scope: "all" }],
} as AuthContext;

describe("financeProjectSummaryService lightweight list", () => {
  test("skips finance analytics when requested", async () => {
    const result = await service.listProjectSummaries(authContext, {
      page: 1,
      pageSize: 3,
      include_analytics: false,
    });

    expect(result.list).toHaveLength(1);
    expect(result.analytics).toBeUndefined();
    expect(listProjectsForAnalytics).not.toHaveBeenCalled();
    expect(listLedgerTrend).not.toHaveBeenCalled();
  });
});
