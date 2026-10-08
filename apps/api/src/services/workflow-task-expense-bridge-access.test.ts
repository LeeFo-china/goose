import { afterEach, beforeAll, describe, expect, mock, spyOn, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";
import type { TenantServiceAccessMode, PlatformServiceTrialCapability } from "@gooes/domain";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let bridge: typeof import("./workflow-task-expense-bridge").workflowTaskExpenseBridge;
let access: typeof import("./tenant-service-access");
let expenses: typeof import("./expense-requests").expenseRequestService;
let subjects: typeof import("./workflow-subjects").workflowSubjectsService;
let repository: typeof import("@/repositories/expense-requests").expenseRequestRepository;

beforeAll(async () => {
  bridge = (await import("./workflow-task-expense-bridge")).workflowTaskExpenseBridge;
  access = await import("./tenant-service-access");
  expenses = (await import("./expense-requests")).expenseRequestService;
  subjects = (await import("./workflow-subjects")).workflowSubjectsService;
  repository = (await import("@/repositories/expense-requests")).expenseRequestRepository;
});
afterEach(() => mock.restore());

const tenantId = "10000000-0000-4000-8000-000000000001";
const employeeId = "10000000-0000-4000-8000-000000000002";
const expenseId = "10000000-0000-4000-8000-000000000003";
const authContext: AuthContext = {
  authUserId: "auth-1", employeeId, tenantId,
  tenantName: "租户", tenantSlug: "tenant", tenantStatus: "active",
  isPlatformAdmin: false, employeeName: "财务", employeeStatus: "active",
  departmentId: null, tenantDepartmentId: null, departmentCode: null,
  departmentName: null, postId: null, postName: null, avatar: null,
  roleCodes: [], roles: [], permissions: [
    { code: "expense_request.read", scope: "all" },
    { code: "expense_request.pay", scope: "all" },
  ],
};

function input(nodeKey = "payment", action = "pay") {
  return {
    authContext, task: { node_key: nodeKey, instance: { subject_id: expenseId } },
    action, reason: "票据不完整",
    output: { payee_name: "供应商", method: "cash", paid_amount: 100,
      evidence_images: ["expense-request/evidence.jpg"] },
  };
}

function serviceAccess(mode: TenantServiceAccessMode,
  capabilities: PlatformServiceTrialCapability[] = ["core.workflows", "business.finance"]) {
  return spyOn(access.tenantServiceAccessService, "resolveForRoute")
    .mockImplementation(async (request) => access.resolveTenantServiceRouteDecision({
      ...request, mode, capabilities, startsAt: null, endsAt: null,
    }));
}

function expenseEffects() {
  return {
    pay: spyOn(expenses, "payExpenseRequest").mockResolvedValue({ id: expenseId }),
    approve: spyOn(expenses, "approveExpenseRequest").mockResolvedValue({ id: expenseId }),
    reject: spyOn(expenses, "rejectExpenseRequest").mockResolvedValue({ id: expenseId }),
    state: spyOn(subjects, "getState").mockResolvedValue({ workflow_state: null }),
  };
}

describe("expense workflow finance service access", () => {
  test.each([
    ["payment", "pay"], ["manager_review", "approve"], ["finance_review", "reject"],
  ])("blocks %s/%s before any expense mutation when finance is outside trial scope", async (node, action) => {
    serviceAccess("trial", ["core.workflows"]);
    const effects = expenseEffects();
    await expect(bridge.complete(input(node, action))).rejects.toMatchObject({
      code: "TENANT_SERVICE_CAPABILITY_NOT_INCLUDED",
    });
    for (const effect of Object.values(effects)) expect(effect).not.toHaveBeenCalled();
  });

  test.each([
    ["grace", "TENANT_SERVICE_READ_ONLY"],
    ["service_blocked", "TENANT_SERVICE_ACCESS_EXPIRED"],
    ["hard_blocked", "TENANT_SERVICE_HARD_BLOCKED"],
  ] as const)("blocks %s before payment mutation", async (mode, code) => {
    serviceAccess(mode);
    const effects = expenseEffects();
    await expect(bridge.complete(input())).rejects.toMatchObject({ code });
    expect(effects.pay).not.toHaveBeenCalled();
    expect(effects.state).not.toHaveBeenCalled();
  });

  test.each(["paid", "trial"] as const)("preserves %s payment delegation and response", async (mode) => {
    const guard = serviceAccess(mode, mode === "paid" ? [] : ["business.finance"]);
    const effects = expenseEffects();
    await expect(bridge.complete(input())).resolves.toMatchObject({
      result: { ok: true, bridged: true, operation: "pay" },
      expense_request: { id: expenseId }, workflow_state: null,
    });
    expect(guard).toHaveBeenCalledWith({
      tenantId, routeAccess: "write", requiredCapability: "business.finance",
    });
    expect(effects.pay).toHaveBeenCalledWith(authContext, expenseId,
      expect.objectContaining({ paid_by: employeeId, paid_amount: 100 }),
      { workflowNodeKey: "payment" });
  });

  test("does not grant payment RBAC when finance service access is allowed", async () => {
    serviceAccess("paid", []);
    spyOn(repository, "findById").mockResolvedValue({
      id: expenseId, tenant_id: tenantId, employee_id: employeeId,
      request_no: null, project_id: null, cost_category_id: null, mode: "general",
      title: null, total_amount: 100, status: "approved", submitted_at: null,
      approved_at: null, rejected_at: null, cancelled_at: null, completed_at: null,
      assignee_id: employeeId, rejected_reason: null, created_at: null, updated_at: null,
    });
    const settlement = spyOn(repository, "createSettlement");
    const update = spyOn(repository, "update");
    const request = input();
    request.authContext = { ...authContext, permissions: [
      { code: "expense_request.read", scope: "all" },
    ] };
    await expect(bridge.complete(request)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(settlement).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  test("leaves unsupported expense nodes to the existing workflow path", async () => {
    const guard = serviceAccess("trial", []);
    const effects = expenseEffects();
    await expect(bridge.complete(input("unmapped_node", "complete"))).resolves.toBeNull();
    expect(guard).not.toHaveBeenCalled();
    for (const effect of Object.values(effects)) expect(effect).not.toHaveBeenCalled();
  });
});
