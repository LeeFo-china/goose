import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const listRisks = mock(async () => ({
  data: {
    generated_at: "2026-07-14T08:00:00.000Z",
    business_date: "2026-07-14",
    summary: {
      total: 0,
      danger: 0,
      warning: 0,
      info: 0,
      affected_projects: 0,
      by_type: {
        workflow_task_overdue: 0,
        procedure_overdue: 0,
        missing_project_log: 0,
        acceptance_rework: 0,
        service_ticket: 0,
      },
    },
    diagnostics: { workflow_tasks_missing_due_at: 0 },
    items: [],
    pagination: { page: 1, page_size: 20, total: 0, total_pages: 0 },
  },
  timing: { rpcMs: 12, serviceMs: 3 },
}));
const generate = mock(async () => ({
  overview: "当前最需要处理的是湖畔花园的工作流逾期。",
  priorities: [],
  cautions: [],
}));

mock.module("@/services/project-operational-risks", () => ({
  projectOperationalRiskService: { listRisks },
}));
mock.module("@/services/project-operational-risk-ai", () => ({
  projectOperationalRiskAiService: { generate },
}));

const authContext = {
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
  permissions: [
    { code: "dashboard.read", scope: "all" },
    { code: "project.read", scope: "all" },
  ],
} satisfies AuthContext;

async function getController() {
  const { default: controller } = await import(".");
  (controller as unknown as {
    getRequiredTenantContext: () => Promise<AuthContext>;
  }).getRequiredTenantContext = mock(async () => authContext);
  return controller;
}

function createRequest(query: unknown) {
  return {
    id: "request-1",
    query,
    log: {
      info: mock(() => undefined),
      warn: mock(() => undefined),
    },
  };
}

describe("ProjectHealthController routes", () => {
  beforeEach(() => {
    listRisks.mockClear();
    generate.mockClear();
  });

  test("registers the project health route contract", async () => {
    const controller = await getController();
    const routes: Array<{ method: string; path: string }> = [];
    const fastify = {
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
    };

    controller.registerExtraRoutes(fastify as never);

    expect(routes).toEqual([
      { method: "GET", path: "/project-health/risks" },
      { method: "POST", path: "/project-health/ai-summary" },
    ]);
  });

  test("passes tenant auth context and parsed query to service", async () => {
    const controller = await getController();
    const request = createRequest({
      page: "2",
      pageSize: "20",
      risk_type: "service_ticket",
      severity: "danger",
      keyword: "湖畔",
    });

    const response = await controller.listRisks(request as never, {} as never);

    expect(listRisks).toHaveBeenCalledWith(authContext, {
      page: 2,
      pageSize: 20,
      risk_type: "service_ticket",
      severity: "danger",
      keyword: "湖畔",
    });
    expect(response).toEqual({
      data: expect.objectContaining({
        items: [],
        summary: expect.objectContaining({ total: 0 }),
      }),
      message: "success",
    });
    expect(JSON.stringify(response)).not.toContain("rpcMs");
  });

  test("logs keyword presence without leaking raw keyword text", async () => {
    const controller = await getController();
    const request = createRequest({
      page: "1",
      pageSize: "20",
      keyword: "湖畔客户手机号 13800138000",
    });

    await controller.listRisks(request as never, {} as never);

    expect(request.log.info).toHaveBeenCalledTimes(1);
    const infoCalls = request.log.info.mock.calls as unknown as Array<
      [Record<string, unknown>, string]
    >;
    const logPayload = infoCalls[0]?.[0];
    if (!logPayload) throw new Error("missing project health log payload");
    expect(logPayload.hasKeyword).toBe(true);
    expect(logPayload).not.toHaveProperty("keyword");
    expect(logPayload).not.toHaveProperty("rawKeyword");
    expect(JSON.stringify(logPayload)).not.toContain("湖畔客户手机号");
    expect(JSON.stringify(logPayload)).not.toContain("13800138000");
  });

  test("rejects pageSize over 100 before service call", async () => {
    const controller = await getController();

    await expect(
      controller.listRisks(
        createRequest({ page: "1", pageSize: "101" }) as never,
        {} as never,
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
    expect(listRisks).not.toHaveBeenCalled();
  });

  test("passes tenant auth context and parsed body to ai summary service", async () => {
    const controller = await getController();
    const request = {
      ...createRequest({}),
      body: {
        risk_type: "workflow_task_overdue",
        severity: "danger",
        keyword: "湖畔",
      },
    };

    const response = await controller.generateAiSummary(
      request as never,
      {} as never,
    );

    expect(generate).toHaveBeenCalledWith(authContext, {
      risk_type: "workflow_task_overdue",
      severity: "danger",
      keyword: "湖畔",
    });
    expect(response).toEqual({
      data: {
        overview: "当前最需要处理的是湖畔花园的工作流逾期。",
        priorities: [],
        cautions: [],
      },
      message: "success",
    });
  });
});
