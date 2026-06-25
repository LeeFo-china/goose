import { describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const createExpense = mock(async (payload: Record<string, unknown>) => ({
  id: "expense-1",
  tenant_id: payload.tenant_id,
  employee_id: payload.employee_id,
  project_id: payload.project_id,
  cost_category_id: payload.cost_category_id,
  mode: payload.mode,
  title: payload.title,
  total_amount: payload.total_amount,
  status: payload.status,
}));
const findExpenseById = mock(async () => ({
  id: "expense-1",
  tenant_id: "tenant-1",
  employee_id: "employee-1",
  project_id: null,
  cost_category_id: null,
  mode: "reimbursement",
  title: "差旅费用",
  total_amount: 100,
  status: "draft",
  submitted_at: null,
  approved_at: null,
  rejected_at: null,
  cancelled_at: null,
  completed_at: null,
  assignee_id: null,
  rejected_reason: null,
  items: [
    {
      category: "差旅",
      amount: 100,
      evidence_images: [],
    },
  ],
  approvals: [],
}));
const updateExpense = mock(async (_id: string, payload: Record<string, unknown>) => ({
  id: "expense-1",
  tenant_id: "tenant-1",
  employee_id: "employee-1",
  project_id: null,
  cost_category_id: null,
  mode: "reimbursement",
  title: "差旅费用",
  total_amount: payload.total_amount,
  status: payload.status,
  assignee_id: payload.assignee_id,
}));
const syncSubmit = mock(async () => ({ status: "started" }));

const listActiveCategoriesByIds = mock(async () => [
  { id: "category-1", code: "labor", name: "人工", status: "active" },
]);

mock.module("@/repositories/expense-requests", () => ({
  expenseRequestRepository: {
    create: createExpense,
    findById: findExpenseById,
    update: updateExpense,
  },
}));

mock.module("@/repositories/project-cost-budgets", () => ({
  projectCostBudgetRepository: {
    listActiveCategoriesByIds,
  },
}));

mock.module("@/services/expense-request-categories", () => ({
  expenseRequestCategoryService: {},
}));

mock.module("@/services/expense-workflow-runtime", () => ({
  expenseWorkflowRuntimeService: {
    syncSubmit,
  },
}));

function authContext(): AuthContext {
  return {
    authUserId: "auth-1",
    employeeId: "employee-1",
    employeeName: "员工",
    employeeStatus: "active",
    tenantId: "tenant-1",
    tenantName: "租户",
    tenantSlug: "tenant",
    tenantStatus: "active",
    isPlatformAdmin: false,
    departmentId: null,
    tenantDepartmentId: null,
    departmentCode: "PROJECT",
    departmentName: "工程部",
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: [],
    roles: [],
    permissions: [{ code: "expense_request.create", scope: "all" }],
  };
}

function draftServiceContext() {
  const appendApprovalOnce = mock(async () => true);
  const getLatestExpenseRequest = mock(async (_id: string) => ({
    id: "expense-1",
    tenant_id: "tenant-1",
    employee_id: "employee-1",
    status: "pending",
    assignee_id: "manager-1",
  }));
  const resolveApplicantDepartmentManagerAssignee = mock(async () => "manager-1");

  return {
    requireTenantId: (context: AuthContext) => context.tenantId,
    ensureCurrentEmployee: mock(() => null),
    assertEmployeeExists: mock(async () => null),
    assertCanLinkProject: mock(async () => null),
    assertCanReadExpenseRequest: mock(async () => null),
    resolveItems: mock(async (items: unknown[]) => items),
    serializeExpenseRequest: mock((record: unknown) => record),
    getApprovalRound: mock(() => 1),
    appendApprovalOnce,
    getLatestExpenseRequest,
    resolveApplicantDepartmentManagerAssignee,
  };
}

describe("createExpenseRequest", () => {
  test("validates and saves cost category for project expense", async () => {
    const { createExpenseRequest } = await import("./drafts");

    const result = await createExpenseRequest.call(
      draftServiceContext(),
      authContext(),
      {
        employee_id: "employee-1",
        project_id: "project-1",
        cost_category_id: "category-1",
        mode: "direct",
        title: "人工费用",
        items: [
          {
            category_code: "labor",
            category: "人工",
            amount: 1000,
            evidence_images: [],
          },
        ],
      },
    );

    expect(listActiveCategoriesByIds).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      categoryIds: ["category-1"],
    });
    expect(createExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "tenant-1",
        project_id: "project-1",
        cost_category_id: "category-1",
      }),
      expect.any(Array),
    );
    expect(result).toMatchObject({
      cost_category_id: "category-1",
    });
  });

  test("assigns submitted manager review to applicant department manager", async () => {
    const { submitExpenseRequest } = await import("./drafts");
    const context = draftServiceContext();

    await submitExpenseRequest.call(
      context,
      authContext(),
      "expense-1",
      {
        operator_id: "employee-1",
        comment: "提交",
      },
    );

    expect(context.resolveApplicantDepartmentManagerAssignee)
      .toHaveBeenCalledWith("employee-1", "tenant-1");
    expect(updateExpense).toHaveBeenCalledWith(
      "expense-1",
      expect.objectContaining({
        status: "pending",
        assignee_id: "manager-1",
      }),
      undefined,
      "tenant-1",
    );
    expect(syncSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        expenseRequest: expect.objectContaining({
          assignee_id: "manager-1",
        }),
      }),
    );
  });
});
