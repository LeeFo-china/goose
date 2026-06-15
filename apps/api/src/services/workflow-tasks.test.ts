import { describe, expect, mock, test } from "bun:test";

const completeRuntimeNode = mock(async () => ({
  ok: true,
  instance: {},
  completedNode: {},
  nextNode: null,
  task: null,
}));

const paymentTask = {
  id: "task-1",
  tenant_id: "tenant-1",
  instance_id: "instance-1",
  instance_node_id: "instance-node-1",
  definition_id: "definition-1",
  version_id: "version-1",
  node_id: "node-1",
  node_key: "payment_stage_2",
  node_type: "confirmation",
  title: "中期进度款",
  status: "pending",
  assignee_employee_id: "finance-employee-1",
  assignee_role_code: null,
  assignee_permission_code: "project_payment.confirm",
  assignee_employee: null,
  due_at: null,
  completed_by: null,
  completed_at: null,
  created_at: "2026-06-15T00:00:00.000Z",
  updated_at: "2026-06-15T00:00:00.000Z",
  instance: {
    id: "instance-1",
    subject_type: "project",
    subject_id: "project-1",
    status: "running",
    current_node_key: "payment_stage_2",
    current_node_snapshot: {
      node_key: "payment_stage_2",
      business_kind: "payment_collection",
      title: "中期进度款",
      config: {
        payment_type: "stage_2",
        block_message: "请先确认中期进度款已入账后再进入瓦工",
      },
    },
  },
};

const findById = mock(async () => paymentTask);
const listAccessibleTasks = mock(async () => ({
  list: [paymentTask],
  pagination: {
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  },
}));

const summarizeConfirmedProjectPayments = mock(async () => ({
  count: 0,
  totalAmount: 0,
}));

mock.module("@/repositories/workflow-tasks", () => ({
  workflowTaskRepository: {
    findById,
    listAccessibleTasks,
  },
}));

mock.module("@/repositories/payments", () => ({
  paymentRepository: {
    findProjectSignedAmount: mock(async () => 100000),
    summarizeConfirmedProjectPayments,
  },
}));

mock.module("@/repositories/workflows", () => ({
  workflowRepository: {
    completeRuntimeNode,
  },
}));

mock.module("@/services/workflow-runtime-guards", () => ({
  assertRuntimeNodeCompletionAllowed: mock(async () => undefined),
  getPaymentCollectionCompletionBlock: mock(async () => ({
    blocked: true,
    message: "请先确认中期进度款已入账后再进入瓦工",
    payment_type: "stage_2",
    confirmed_payment_count: 0,
    confirmed_amount: 0,
    requirement_mode: "any_confirmed",
    required_percentage: null,
    required_amount: null,
    signed_amount: null,
    legacy_min_amount: null,
  })),
}));

mock.module("@/services/workflow-subject-state", () => ({
  workflowSubjectStateService: {
    syncFromRuntimeInstance: mock(async () => null),
  },
}));

describe("workflowTaskService", () => {
  test("disables payment collection action when confirmed payment is missing", async () => {
    const { workflowTaskService } = await import("./workflow-tasks");

    const tasks = await workflowTaskService.listTasks(
      {
        authUserId: "auth-1",
        employeeId: "finance-employee-1",
        tenantId: "tenant-1",
        tenantName: null,
        tenantSlug: null,
        tenantStatus: "active",
        isPlatformAdmin: false,
        employeeName: "小龙女",
        employeeStatus: "active",
        departmentId: null,
        tenantDepartmentId: null,
        departmentCode: "FINANCE",
        departmentName: "财务部",
        postId: null,
        postName: null,
        avatar: null,
        roleCodes: [],
        roles: [],
        permissions: [],
      },
      { page: 1, pageSize: 20, status: "pending" },
    );

    expect(tasks.list[0]?.actions[0]).toMatchObject({
      business_domain: "payment_collection",
      disabled: true,
      disabled_reason: "请先确认中期进度款已入账后再进入瓦工",
      blocked_reason: "请先确认中期进度款已入账后再进入瓦工",
    });
  });

  test("denies permission holders when a task is assigned to a specific employee", async () => {
    const { workflowTaskService } = await import("./workflow-tasks");

    await expect(
      workflowTaskService.completeTask(
        {
          authUserId: "auth-1",
          employeeId: "other-employee",
          tenantId: "tenant-1",
          tenantName: null,
          tenantSlug: null,
          tenantStatus: "active",
          isPlatformAdmin: false,
          employeeName: "非指定财务",
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
          permissions: [{ code: "project_payment.confirm", scope: "all" }],
        },
        "task-1",
        { action: "complete", reason: null, output: {} },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });

    expect(completeRuntimeNode).not.toHaveBeenCalled();
  });
});
