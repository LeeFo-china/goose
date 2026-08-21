import { beforeAll, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Controller: typeof import(".").TenantDouyinLeadsController;

beforeAll(async () => {
  ({ TenantDouyinLeadsController: Controller } = await import("."));
});

const LEAD_ID = "22222222-2222-4222-8222-222222222222";
const APPOINTMENT_ID = "33333333-3333-4333-8333-333333333333";
const EMPLOYEE_ID = "55555555-5555-4555-8555-555555555555";
const IDEMPOTENCY_KEY = "66666666-6666-4666-8666-666666666666";
const authContext = { tenantId: "11111111-1111-4111-8111-111111111111",
  employeeId: EMPLOYEE_ID, permissions: [] };

function createController() {
  const service = {
    list: mock(async () => ({ list: [], pagination: { page: 1, pageSize: 20,
      total: 0, totalPages: 0 } })),
    listAssigneeCandidates: mock(async () => ({ list: [], pagination: { page: 1,
      pageSize: 100, total: 0, totalPages: 0 } })),
    getDetail: mock(async () => ({ id: LEAD_ID })),
    listFollowUps: mock(async () => ({ list: [], pagination: { page: 1,
      pageSize: 20, total: 0, totalPages: 0 } })),
    assign: mock(async () => ({ lead_id: LEAD_ID })),
    appendFollowUp: mock(async () => ({ lead_id: LEAD_ID })),
    convert: mock(async () => ({ lead_id: LEAD_ID })),
    markInvalid: mock(async () => ({ lead_id: LEAD_ID })),
  };
  const controller = new Controller(service as never);
  const getRequiredTenantContext = mock(async () => authContext);
  (controller as unknown as Record<string, unknown>).getRequiredTenantContext =
    getRequiredTenantContext;
  return { controller, service, getRequiredTenantContext };
}

describe("TenantDouyinLeadsController", () => {
  test("registers exactly eight routes and the root registry", async () => {
    const { controller } = createController();
    const routes: Array<{ method: string; path: string }> = [];
    const fastify = {
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
    };
    controller.registerExtraRoutes(fastify as never);
    expect(routes).toEqual([
      { method: "GET", path: "/tenant/douyin-miniapp/leads" },
      { method: "GET", path: "/tenant/douyin-miniapp/leads/assignee-candidates" },
      { method: "GET", path: "/tenant/douyin-miniapp/leads/:id" },
      { method: "GET", path: "/tenant/douyin-miniapp/leads/:id/follow-ups" },
      { method: "POST", path: "/tenant/douyin-miniapp/leads/:id/assign" },
      { method: "POST", path: "/tenant/douyin-miniapp/leads/:id/follow-ups" },
      { method: "POST", path: "/tenant/douyin-miniapp/leads/:id/convert-customer" },
      { method: "POST", path: "/tenant/douyin-miniapp/leads/:id/mark-invalid" },
    ]);
    const source = await Bun.file(new URL("../../routes/index.ts", import.meta.url)).text();
    expect(source).toContain('import TenantDouyinLeadsController from "@/controllers/tenant-douyin-leads";');
    expect(source).toContain("TenantDouyinLeadsController.registerExtraRoutes(app);");
  });

  test("validates list filters and pagination before auth, then echoes defaults", async () => {
    const invalid = createController();
    await expect(invalid.controller.listLeads({ query: { pageSize: 101 } } as never))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(invalid.controller.listLeads({ query: { keyword: "a,b" } } as never))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(invalid.getRequiredTenantContext).not.toHaveBeenCalled();

    const valid = createController();
    await valid.controller.listLeads({ query: {} } as never);
    expect(valid.service.list).toHaveBeenCalledWith(authContext, {
      page: 1, pageSize: 20,
    });
  });

  test("validates and trims assignee candidate search before auth", async () => {
    const invalid = createController();
    await expect(invalid.controller.listAssigneeCandidates({
      query: { pageSize: 101 },
    } as never)).rejects.toMatchObject({ statusCode: 400 });
    await expect(invalid.controller.listAssigneeCandidates({
      query: { keyword: "x".repeat(101) },
    } as never)).rejects.toMatchObject({ statusCode: 400 });
    expect(invalid.getRequiredTenantContext).not.toHaveBeenCalled();

    const valid = createController();
    await expect(valid.controller.listAssigneeCandidates({ query: {
      page: "1", pageSize: "100", keyword: "  王顾问  ",
    } } as never)).resolves.toMatchObject({
      data: { list: [], pagination: { page: 1, pageSize: 100 } },
    });
    expect(valid.service.listAssigneeCandidates).toHaveBeenCalledWith(
      authContext,
      { page: 1, pageSize: 100, keyword: "王顾问" },
    );

    const blank = createController();
    await blank.controller.listAssigneeCandidates({ query: {
      keyword: "   ",
    } } as never);
    expect(blank.service.listAssigneeCandidates).toHaveBeenCalledWith(
      authContext, { page: 1, pageSize: 20 },
    );
  });

  test("validates strict params and all command bodies before auth", async () => {
    const context = createController();
    const command = { expected_lead_version: 1, idempotency_key: IDEMPOTENCY_KEY };
    await expect(context.controller.getDetail({ params: { id: "bad" } } as never))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(context.controller.assign({ params: { id: LEAD_ID }, body: {
      ...command, assigned_employee_id: EMPLOYEE_ID, tenant_id: authContext.tenantId,
    } } as never)).rejects.toMatchObject({ statusCode: 400 });
    await expect(context.controller.appendFollowUp({ params: { id: LEAD_ID }, body: {
      ...command, appointment_id: APPOINTMENT_ID, follow_up_type: "phone",
      summary: "已联系", result: "等待上门", appointment_status: "confirmed",
      confirmed_visit_at: null,
    } } as never)).rejects.toMatchObject({ statusCode: 400 });
    await expect(context.controller.convert({ params: { id: LEAD_ID }, body: {
      ...command, force: true,
    } } as never)).rejects.toMatchObject({ statusCode: 400 });
    await expect(context.controller.markInvalid({ params: { id: LEAD_ID }, body: {
      ...command, reason: "",
    } } as never)).rejects.toMatchObject({ statusCode: 400 });
    expect(context.getRequiredTenantContext).not.toHaveBeenCalled();
  });

  test("delegates the seven validated requests and wraps responses", async () => {
    const context = createController();
    const command = { expected_lead_version: 1, idempotency_key: IDEMPOTENCY_KEY };
    await context.controller.getDetail({ params: { id: LEAD_ID } } as never);
    await context.controller.listFollowUps({ params: { id: LEAD_ID }, query: {} } as never);
    await context.controller.assign({ params: { id: LEAD_ID }, body: {
      ...command, assigned_employee_id: EMPLOYEE_ID,
    } } as never);
    await context.controller.appendFollowUp({ params: { id: LEAD_ID }, body: {
      ...command, appointment_id: APPOINTMENT_ID, follow_up_type: "phone",
      summary: "已联系", result: "等待上门", next_follow_up_at: null,
      appointment_status: null, confirmed_visit_at: null,
    } } as never);
    await context.controller.convert({ params: { id: LEAD_ID }, body: command } as never);
    await expect(context.controller.markInvalid({ params: { id: LEAD_ID }, body: {
      ...command, reason: "超出服务范围",
    } } as never)).resolves.toMatchObject({ data: { lead_id: LEAD_ID }, message: "success" });
    expect(context.service.getDetail).toHaveBeenCalledWith(authContext, LEAD_ID);
    expect(context.service.listFollowUps).toHaveBeenCalledWith(authContext, LEAD_ID, {
      page: 1, pageSize: 20,
    });
  });
});
