import { beforeEach, describe, expect, mock, test } from "bun:test";

const acceptanceQuery = {
  select: mock(() => acceptanceQuery),
  eq: mock(() => acceptanceQuery),
  in: mock(() => acceptanceQuery),
  order: mock(() => acceptanceQuery),
  limit: mock(async () => ({
    data: [{
      id: "acceptance-1",
      project_id: "11111111-1111-4111-8111-111111111111",
      stage_code: "plumbing_electrical",
      status: "leader_approved",
      updated_at: "2026-09-01T09:00:00.000Z",
    }],
    error: null,
  })),
};
const from = mock(() => acceptanceQuery);

mock.module("@/utils/supabase/index", () => ({
  SupabaseDB: {
    getAdminClient: () => ({ from }),
  },
}));

describe("TenantOwnerDashboardWorkflowRepository acceptances", () => {
  beforeEach(() => {
    from.mockClear();
    for (const method of Object.values(acceptanceQuery)) method.mockClear();
  });

  test("loads acceptance evidence only for current-page projects", async () => {
    const { tenantOwnerDashboardWorkflowRepository } = await import(
      "./tenant-owner-dashboard-workflow"
    );

    const result = await tenantOwnerDashboardWorkflowRepository
      .listLatestAcceptancesForProjects({
        tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        projectIds: [
          "11111111-1111-4111-8111-111111111111",
          "11111111-1111-4111-8111-111111111111",
        ],
      });

    expect(from).toHaveBeenCalledWith("project_acceptances");
    expect(acceptanceQuery.eq).toHaveBeenCalledWith(
      "tenant_id",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(acceptanceQuery.in).toHaveBeenCalledWith("project_id", [
      "11111111-1111-4111-8111-111111111111",
    ]);
    expect(acceptanceQuery.limit).toHaveBeenCalledWith(100);
    expect(result).toEqual([{
      id: "acceptance-1",
      project_id: "11111111-1111-4111-8111-111111111111",
      stage_code: "plumbing_electrical",
      status: "leader_approved",
      updated_at: "2026-09-01T09:00:00.000Z",
    }]);
  });
});
