import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { ProjectOperationalRiskRpcPage } from "@gooes/domain";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const listPage = mock(async () => ({
  rpcMs: 12,
  page: {
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
        assignee_employee_id: null,
        assignee_employee_name: null,
        occurred_at: "2026-07-12T08:00:00.000Z",
        due_at: "2026-07-12T08:00:00.000Z",
        overdue_days: 2,
        evidence: { task_title: "水电验收" },
      },
    ],
    pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 },
  } satisfies ProjectOperationalRiskRpcPage,
}));

const baseAuthContext = {
  authUserId: "auth-1",
  employeeId: "employee-1",
  tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  tenantName: null,
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
  tenantId: string | null = baseAuthContext.tenantId,
): AuthContext {
  return { ...baseAuthContext, tenantId, permissions };
}

function createService() {
  const accessPolicyService = {
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
    getScope: mock((authContext: AuthContext, code: string) =>
      authContext.permissions.find((item) => item.code === code)?.scope ?? null
    ),
  };

  return import("./project-operational-risks").then(({ ProjectOperationalRiskService }) => ({
    service: new ProjectOperationalRiskService({
      repository: { listPage },
      accessPolicyService,
    }),
    accessPolicyService,
  }));
}

describe("ProjectOperationalRiskService", () => {
  beforeEach(() => {
    listPage.mockClear();
  });

  test("lists risks only for dashboard readers with all-project scope", async () => {
    const { service } = await createService();
    const result = await service.listRisks(
      authContextWithPermissions([
        { code: "dashboard.read", scope: "all" },
        { code: "project.read", scope: "all" },
      ]),
      { page: 1, pageSize: 20 },
    );

    expect(listPage).toHaveBeenCalledWith({
      tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      query: { page: 1, pageSize: 20 },
    });
    expect(result.data.items[0]).toMatchObject({
      risk_key: "workflow_task:22222222-2222-4222-8222-222222222222",
      title: "工作流任务逾期",
      action: { label: "去处理" },
    });
    expect(result.data.summary.total).toBe(1);
    expect(result.data.pagination.total).toBe(1);
    expect(result.timing.rpcMs).toBe(12);
    expect(result.timing.serviceMs).toBeGreaterThanOrEqual(0);
  });

  test("rejects missing dashboard permission before repository call", async () => {
    const { service } = await createService();

    await expect(
      service.listRisks(
        authContextWithPermissions([{ code: "project.read", scope: "all" }]),
        { page: 1, pageSize: 20 },
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(listPage).not.toHaveBeenCalled();
  });

  test("rejects missing project permission before repository call", async () => {
    const { service } = await createService();

    await expect(
      service.listRisks(
        authContextWithPermissions([{ code: "dashboard.read", scope: "all" }]),
        { page: 1, pageSize: 20 },
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(listPage).not.toHaveBeenCalled();
  });

  test.each(["self", "assigned", "department"] as const)(
    "rejects project.read scope %s before repository call",
    async (scope) => {
      const { service } = await createService();

      await expect(
        service.listRisks(
          authContextWithPermissions([
            { code: "dashboard.read", scope: "all" },
            { code: "project.read", scope },
          ]),
          { page: 1, pageSize: 20 },
        ),
      ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
      expect(listPage).not.toHaveBeenCalled();
    },
  );

  test("rejects missing tenant context", async () => {
    const { service } = await createService();

    await expect(
      service.listRisks(
        authContextWithPermissions([
          { code: "dashboard.read", scope: "all" },
          { code: "project.read", scope: "all" },
        ], null),
        { page: 1, pageSize: 20 },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "TENANT_CONTEXT_REQUIRED",
    });
    expect(listPage).not.toHaveBeenCalled();
  });
});
