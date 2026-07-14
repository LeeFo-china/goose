import { beforeEach, describe, expect, mock, test } from "bun:test";

const rpc = mock(async (): Promise<{ data: unknown; error: unknown }> => ({
  data: createRpcPage(),
  error: null,
}));

mock.module("@/utils/supabase/index", () => ({
  SupabaseDB: {
    getAdminClient: () => ({ rpc }),
  },
}));

function createRpcPage() {
  return {
    generated_at: "2026-07-14T08:00:00.000Z",
    business_date: "2026-07-14",
    summary: {
      total: 1,
      danger: 1,
      warning: 0,
      info: 0,
      affected_projects: 1,
      by_type: {
        workflow_task_overdue: 1,
        procedure_overdue: 0,
        missing_project_log: 0,
        acceptance_rework: 0,
        service_ticket: 0,
      },
    },
    diagnostics: { workflow_tasks_missing_due_at: 0 },
    items: [
      {
        risk_key: "workflow_task:22222222-2222-4222-8222-222222222222",
        risk_type: "workflow_task_overdue",
        severity: "danger",
        project_id: "11111111-1111-4111-8111-111111111111",
        project_name: "湖畔花园",
        project_status: "constructing",
        source_type: "workflow_task",
        source_id: "22222222-2222-4222-8222-222222222222",
        assignee_employee_id: "33333333-3333-4333-8333-333333333333",
        assignee_employee_name: "张三",
        occurred_at: "2026-07-12T08:00:00.000Z",
        due_at: "2026-07-12T08:00:00.000Z",
        overdue_days: 2,
        evidence: { task_title: "水电验收" },
      },
    ],
    pagination: { page: 2, page_size: 20, total: 1, total_pages: 1 },
  };
}

describe("projectOperationalRiskRepository", () => {
  beforeEach(() => {
    rpc.mockClear();
    rpc.mockImplementation(async () => ({
      data: createRpcPage(),
      error: null,
    }));
  });

  test("calls project operational risk RPC with normalized parameters", async () => {
    const { projectOperationalRiskRepository } = await import(
      "./project-operational-risks"
    );

    const result = await projectOperationalRiskRepository.listPage({
      tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      query: {
        page: 2,
        pageSize: 101,
        risk_type: "workflow_task_overdue",
        severity: "danger",
        keyword: "湖畔",
      },
    });

    expect(rpc).toHaveBeenCalledWith("get_project_operational_risk_page", {
      p_tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      p_page: 2,
      p_page_size: 100,
      p_risk_type: "workflow_task_overdue",
      p_severity: "danger",
      p_keyword: "湖畔",
      p_timezone_name: "Asia/Shanghai",
    });
    expect(result.page.items).toHaveLength(1);
    expect(result.rpcMs).toBeGreaterThanOrEqual(0);
  });

  test("passes null optional filters to RPC", async () => {
    const { projectOperationalRiskRepository } = await import(
      "./project-operational-risks"
    );

    await projectOperationalRiskRepository.listPage({
      tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      query: { page: 1, pageSize: 20 },
    });

    expect(rpc).toHaveBeenCalledWith("get_project_operational_risk_page", {
      p_tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      p_page: 1,
      p_page_size: 20,
      p_risk_type: null,
      p_severity: null,
      p_keyword: null,
      p_timezone_name: "Asia/Shanghai",
    });
  });

  test("wraps Supabase RPC errors as DB_ERROR", async () => {
    rpc.mockImplementation(async () => ({
      data: null,
      error: { message: "rpc failed" },
    }));
    const { projectOperationalRiskRepository } = await import(
      "./project-operational-risks"
    );

    await expect(
      projectOperationalRiskRepository.listPage({
        tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        query: { page: 1, pageSize: 20 },
      }),
    ).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
    });
  });

  test("rejects malformed RPC data instead of faking an empty page", async () => {
    rpc.mockImplementation(async () => ({
      data: {
        ...createRpcPage(),
        items: [{ ...createRpcPage().items[0], risk_type: "unknown" }],
      },
      error: null,
    }));
    const { projectOperationalRiskRepository } = await import(
      "./project-operational-risks"
    );

    await expect(
      projectOperationalRiskRepository.listPage({
        tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        query: { page: 1, pageSize: 20 },
      }),
    ).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
    });
  });
});
