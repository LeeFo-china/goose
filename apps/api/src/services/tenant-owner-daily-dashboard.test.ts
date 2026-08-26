import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const baseAuthContext = {
  authUserId: "auth-1",
  employeeId: "employee-1",
  tenantId: TENANT_ID,
  tenantName: "固始晴天装饰工程有限公司",
  tenantSlug: null,
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "张三",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: [],
  roles: [],
} satisfies Omit<AuthContext, "permissions">;

function authContextWithPermissions(
  permissions: AuthContext["permissions"],
  tenantId: string | null = TENANT_ID,
): AuthContext {
  return { ...baseAuthContext, tenantId, permissions };
}

function createAccessPolicyService() {
  return {
    assertTenantContext: mock((authContext: AuthContext) => {
      if (!authContext.tenantId) {
        throw Object.assign(new Error("缺少租户上下文"), {
          statusCode: 403,
          code: "TENANT_CONTEXT_REQUIRED",
        });
      }
      return authContext.tenantId;
    }),
    assertPermission: mock((authContext: AuthContext, code: string) => {
      const permission = authContext.permissions.find((item) => item.code === code);
      if (!permission) {
        throw Object.assign(new Error("无权限"), {
          statusCode: 403,
          code: "FORBIDDEN",
        });
      }
      return permission.scope;
    }),
  };
}

function createRepository(overrides: Record<string, unknown> = {}) {
  return {
    listOwnerActions: mock(async () =>
      ({
        total: 8,
        items: Array.from({ length: 5 }, (_, index) => ({
          id: `action-${index + 1}`,
          type: "risk" as const,
          title: `待处理 ${index + 1}`,
          project_id: null,
          project_name: null,
          priority: index === 0 ? "high" as const : "medium" as const,
          target: { path: "/packageEmployees/pages/tasks/index" },
        })),
      })
    ),
    getFinanceSnapshot: mock(async () => ({
      today_income_amount: "1200.00",
      today_expense_amount: "200.00",
      today_net_cash_amount: "1000.00",
      receivable_due_today_amount: "5000.00",
      receivable_due_7d_amount: "8000.00",
      overdue_receivable_amount: "300.00",
      pending_supplier_payable_amount: "900.00",
    })),
    getProjectSnapshot: mock(async () => ({
      active_project_count: 3,
      advanced_today_count: 1,
      started_today_count: 1,
      completed_today_count: 0,
      delayed_project_count: 1,
      no_log_today_count: 1,
      pending_acceptance_count: 2,
    })),
    listRiskProjects: mock(async () =>
      ({
        total: 7,
        items: Array.from({ length: 5 }, (_, index) => ({
          project_id: `project-${index + 1}`,
          project_name: `项目 ${index + 1}`,
          customer_name: null,
          current_node_title: index === 0 ? "水电" : null,
          risk_level: index === 0 ? "high" as const : "warning" as const,
          risk_types: ["missing_project_log"],
          reason: "今日应写日志但未填写",
          owner_employee_name: null,
          updated_at: "2026-08-26T08:00:00.000Z",
          target: {
            path: "/packageProjects/pages/detail/index",
            query: { id: `project-${index + 1}` },
          },
        })),
      })
    ),
    getConstructionActivity: mock(async () => ({
      log_count: 2,
      project_coverage_count: 1,
      photo_count: 4,
      latest_logs: [],
      missing_logs: Array.from({ length: 6 }, (_, index) => ({
        project_id: `project-${index + 1}`,
        project_name: `项目 ${index + 1}`,
        current_node_title: "水电",
        assignee_employee_name: null,
      })),
    })),
    listGanttProjects: mock(async () => ({
      list: [{
        id: "project-1",
        name: "湖畔花园",
        customer_name: "李四",
        address_summary: "湖畔花园 1 栋",
        owner_employee_name: "王五",
        status: "constructing",
      }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    })),
    ...overrides,
  };
}

function createWorkflowProgressReader() {
  return {
    listProjectProgress: mock(async () =>
      new Map([[
        "project-1",
        {
          source: "workflow_runtime" as const,
          instance_id: "instance-1",
          instance_status: "running" as const,
          current_node_key: "plumbing",
          current_node_title: "水电",
          timeline_nodes: [
            {
              node_key: "demo",
              node_title: "拆改",
              node_type: "procedure",
              business_kind: "procedure",
              status: "done" as const,
              group: { key: "construction", label: "施工阶段", order: 10 },
              display: {
                label: "拆改",
                status_label: "已完成",
                status_variant: "success" as const,
              },
              attributes: { stage_code: "demolition" },
              actions: [],
            },
            {
              node_key: "plumbing",
              node_title: "水电",
              node_type: "procedure",
              business_kind: "procedure",
              status: "current" as const,
              group: { key: "construction", label: "施工阶段", order: 10 },
              display: {
                label: "水电",
                status_label: "进行中",
                status_variant: "warning" as const,
              },
              attributes: { stage_code: "plumbing" },
              actions: [],
            },
          ],
        },
      ]])
    ),
  };
}

async function createService(overrides: {
  repository?: ReturnType<typeof createRepository>;
  workflowProgressReader?: ReturnType<typeof createWorkflowProgressReader>;
  accessPolicyService?: ReturnType<typeof createAccessPolicyService>;
} = {}) {
  const { TenantOwnerDailyDashboardService } = await import(
    "./tenant-owner-daily-dashboard"
  );
  const repository = overrides.repository ?? createRepository();
  const workflowProgressReader =
    overrides.workflowProgressReader ?? createWorkflowProgressReader();
  const accessPolicyService =
    overrides.accessPolicyService ?? createAccessPolicyService();

  return {
    service: new TenantOwnerDailyDashboardService({
      repository,
      workflowProgressReader,
      accessPolicyService,
    }),
    repository,
    workflowProgressReader,
    accessPolicyService,
  };
}

describe("TenantOwnerDailyDashboardService", () => {
  beforeEach(() => {
    mock.restore();
  });

  test("loads bounded daily dashboard sections for dashboard readers", async () => {
    const { service, repository } = await createService();

    const result = await service.getDailyDashboard(
      authContextWithPermissions([{ code: "dashboard.read", scope: "all" }]),
      { date: "2026-08-26", timezone: "Asia/Shanghai" },
    );

    expect(repository.listOwnerActions).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      businessDate: "2026-08-26",
      endAt: "2026-08-26T16:00:00.000Z",
      limit: 5,
    });
    expect(result.business_date).toBe("2026-08-26");
    expect(result.timezone).toBe("Asia/Shanghai");
    expect(result.owner_actions.total).toBe(8);
    expect(result.owner_actions.items).toHaveLength(5);
    expect(result.risk_projects.total).toBe(7);
    expect(result.risk_projects.items).toHaveLength(5);
    expect(result.construction_activity.missing_logs).toHaveLength(5);
    expect(result.partial_errors).toEqual([]);
  });

  test("rejects missing dashboard permission before repository calls", async () => {
    const { service, repository } = await createService();

    await expect(
      service.getDailyDashboard(
        authContextWithPermissions([]),
        { date: "2026-08-26", timezone: "Asia/Shanghai" },
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(repository.listOwnerActions).not.toHaveBeenCalled();
  });

  test("returns partial dashboard when a non-critical module fails", async () => {
    const repository = createRepository({
      getFinanceSnapshot: mock(async () => {
        throw Object.assign(new Error("finance failed"), {
          statusCode: 500,
          code: "DB_ERROR",
        });
      }),
    });
    const { service } = await createService({ repository });

    const result = await service.getDailyDashboard(
      authContextWithPermissions([{ code: "dashboard.read", scope: "all" }]),
      { date: "2026-08-26", timezone: "Asia/Shanghai" },
    );

    expect(result.finance.today_income_amount).toBe("0.00");
    expect(result.projects.active_project_count).toBe(3);
    expect(result.partial_errors).toEqual([{
      module: "finance",
      code: "DB_ERROR",
      message: "财务数据暂不可用",
    }]);
  });

  test("lists paginated gantt projects using workflow progress timeline nodes", async () => {
    const { service, repository, workflowProgressReader } = await createService();

    const result = await service.listProjectGantt(
      authContextWithPermissions([{ code: "dashboard.read", scope: "all" }]),
      { page: 1, pageSize: 20 },
    );

    expect(repository.listGanttProjects).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      page: 1,
      pageSize: 20,
    });
    expect(workflowProgressReader.listProjectProgress).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      projectIds: ["project-1"],
      businessDate: expect.any(String),
    });
    expect(result.list[0]?.workflow_progress.timeline_nodes.map((node) => ({
      node_key: node.node_key,
      node_title: node.node_title,
      stage_code: node.stage_code,
      status: node.status,
    }))).toEqual([
      {
        node_key: "demo",
        node_title: "拆改",
        stage_code: "demolition",
        status: "done",
      },
      {
        node_key: "plumbing",
        node_title: "水电",
        stage_code: "plumbing",
        status: "current",
      },
    ]);
    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
  });
});
