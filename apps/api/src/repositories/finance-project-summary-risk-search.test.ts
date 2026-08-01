import { describe, expect, mock, test } from "bun:test";

const rpc = mock(async () => ({
  data: [
    { project_id: "project-2", total_count: 2 },
    { project_id: "project-1", total_count: 2 },
  ],
  error: null,
}));

mock.module("@/utils/supabase/index", () => ({
  SupabaseDB: {
    getAdminClient: () => ({
      rpc,
    }),
  },
}));

describe("financeProjectSummaryRepository risk search", () => {
  test("passes risk filters to RPC and preserves returned project order", async () => {
    const { financeProjectSummaryRepository } =
      await import("./finance-project-summary");

    const result = await financeProjectSummaryRepository.searchProjectIdsByRisk({
      tenantId: "tenant-1",
      query: {
        page: 2,
        pageSize: 20,
        keyword: "张三",
        status: "constructing",
        risk_level: "warning",
        risk_flag: "unallocated_expense",
        budget_configured: false,
        has_unallocated_expense: true,
        overdue: true,
        min_budget_usage_ratio: 0.8,
        max_projected_budget_gross_margin: 0.2,
      },
    });

    expect(rpc).toHaveBeenCalledWith("search_finance_project_risk_ids", {
      p_tenant_id: "tenant-1",
      p_page: 2,
      p_page_size: 20,
      p_keyword: "张三",
      p_status: "constructing",
      p_risk_level: "warning",
      p_risk_flag: "unallocated_expense",
      p_budget_configured: false,
      p_has_unallocated_expense: true,
      p_overdue: true,
      p_min_budget_usage_ratio: 0.8,
      p_max_projected_budget_gross_margin: 0.2,
    });
    expect(result.projectIds).toEqual(["project-2", "project-1"]);
    expect(result.pagination.total).toBe(2);
  });

  test("preserves danger supplier-cost filter results and database total", async () => {
    rpc.mockImplementationOnce(async () => ({
      data: [{ project_id: "supplier-cost-project", total_count: 3 }],
      error: null,
    }));
    const { financeProjectSummaryRepository } =
      await import("./finance-project-summary");

    const result = await financeProjectSummaryRepository.searchProjectIdsByRisk({
      tenantId: "tenant-1",
      query: {
        page: 2,
        pageSize: 1,
        risk_level: "danger",
        risk_flag: "project_over_budget",
        min_budget_usage_ratio: 1,
      },
    });

    expect(rpc).toHaveBeenLastCalledWith(
      "search_finance_project_risk_ids",
      expect.objectContaining({
        p_risk_level: "danger",
        p_risk_flag: "project_over_budget",
        p_min_budget_usage_ratio: 1,
        p_page: 2,
        p_page_size: 1,
      }),
    );
    expect(result).toEqual({
      projectIds: ["supplier-cost-project"],
      pagination: {
        page: 2,
        pageSize: 1,
        total: 3,
        totalPages: 3,
      },
    });
  });
});
