import { describe, expect, mock, test } from "bun:test";

const completeRuntimeNode = mock(async () => ({
  ok: true,
  instance: {},
  completedNode: {},
  nextNode: null,
  task: null,
}));
const completePaymentBridge = mock(async (): Promise<unknown> => null);
const completeProjectBridge = mock(async () => null);
const completeExpenseBridge = mock(async () => null);
const completeCustomerBridge = mock(async () => null);
const shouldRequireProjectWorkflowRebuild = mock((input: {
  workflowKey?: string | null;
  nodeKey: string;
}) =>
  input.workflowKey !== "project_signing" &&
  ["designing", "proposal_confirmed", "signed", "design_finalized", "pending_start"]
    .includes(input.nodeKey)
);

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
  assignee_permission_code: "finance.payment.confirm",
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

const customerDesignTask = {
  ...paymentTask,
  id: "task-customer-designing",
  node_key: "designing",
  node_type: "business",
  title: "方案设计",
  assignee_employee_id: null,
  assignee_permission_code: null,
  instance: {
    ...paymentTask.instance,
    subject_type: "customer",
    subject_id: "customer-1",
    current_node_key: "designing",
    current_node_snapshot: {
      node_key: "designing",
      business_kind: "design",
      title: "方案设计",
      config: {},
    },
  },
};

const legacyProjectDesigningTask = {
  ...paymentTask,
  id: "task-legacy-project-designing",
  node_key: "designing",
  node_type: "business",
  title: "设计中",
  assignee_employee_id: null,
  assignee_permission_code: null,
  instance: {
    ...paymentTask.instance,
    subject_type: "project",
    subject_id: "project-legacy-1",
    current_node_key: "designing",
    current_node_snapshot: {
      node_key: "designing",
      business_kind: "design",
      title: "设计中",
      config: {},
    },
  },
};

const findById = mock(async () => paymentTask);
const getDefinitionById = mock(async () => ({
  id: "definition-1",
  workflow_key: "project_signing",
}));
const listAccessibleTasks = mock(async () => ({
  list: [paymentTask],
  pagination: {
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  },
}));

mock.module("@/repositories/workflow-tasks", () => ({
  workflowTaskRepository: {
    findById,
    listAccessibleTasks,
  },
}));

mock.module("@/repositories/workflows", () => ({
  workflowRepository: {
    completeRuntimeNode,
    getDefinitionById,
  },
}));

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantId: mock((authContext: { tenantId?: string | null }) => {
      if (!authContext.tenantId) {
        throw new Error("missing tenant");
      }
      return authContext.tenantId;
    }),
  },
}));

mock.module("@/services/workflow-runtime-guards", () => ({
  assertRuntimeNodeCompletionAllowed: mock(async () => undefined),
}));

mock.module("@/services/workflow-subject-state", () => ({
  workflowSubjectStateService: {
    syncFromRuntimeInstance: mock(async () => null),
  },
}));

mock.module("@/services/workflow-task-project-bridge", () => ({
  shouldRequireProjectWorkflowRebuild,
  workflowTaskProjectBridge: {
    complete: completeProjectBridge,
  },
}));

mock.module("@/services/workflow-task-expense-bridge", () => ({
  workflowTaskExpenseBridge: {
    complete: completeExpenseBridge,
  },
}));

mock.module("@/services/workflow-task-customer-bridge", () => ({
  workflowTaskCustomerBridge: {
    complete: completeCustomerBridge,
  },
}));

mock.module("@/services/workflow-task-payment-bridge", () => ({
  workflowTaskPaymentBridge: {
    complete: completePaymentBridge,
  },
}));

describe("workflowTaskService", () => {
  test("keeps payment collection action executable for assigned finance", async () => {
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
      business_action: "confirm_payment",
      disabled: false,
    });
    expect(tasks.list[0]?.actions[0]).not.toHaveProperty("blocked_reason");
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
          permissions: [{ code: "finance.payment.confirm", scope: "all" }],
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

  test("routes project payment collection completion through payment bridge", async () => {
    const { workflowTaskService } = await import("./workflow-tasks");
    completePaymentBridge.mockImplementation(async () => ({
      result: {
        ok: true,
        bridged: true,
        operation: "confirm_payment",
      },
      payment: { id: "payment-1" },
      workflow_state: null,
    }));

    const result = await workflowTaskService.completeTask(
      {
        authUserId: "auth-1",
        employeeId: "finance-employee-1",
        tenantId: "tenant-1",
        tenantName: null,
        tenantSlug: null,
        tenantStatus: "active",
        isPlatformAdmin: false,
        employeeName: "财务",
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
        permissions: [{ code: "finance.payment.confirm", scope: "all" }],
      },
      "task-1",
      {
        action: "complete",
        reason: null,
        output: {
          amount: 10000,
          evidence_images: [{ url: "https://example.com/payment.jpg" }],
        },
      },
    );

    expect(result).toMatchObject({
      result: {
        ok: true,
        bridged: true,
        operation: "confirm_payment",
      },
      payment: { id: "payment-1" },
    });
    expect(completePaymentBridge).toHaveBeenCalledWith(
      expect.objectContaining({
        authContext: expect.objectContaining({
          employeeId: "finance-employee-1",
        }),
        task: expect.objectContaining({
          id: "task-1",
          tenant_id: "tenant-1",
          definition_id: "definition-1",
          instance_id: "instance-1",
          node_key: "payment_stage_2",
          instance: expect.objectContaining({
            subject_id: "project-1",
            current_node_snapshot: paymentTask.instance.current_node_snapshot,
          }),
        }),
        action: "complete",
        output: expect.objectContaining({
          amount: 10000,
          evidence_images: [{ url: "https://example.com/payment.jpg" }],
        }),
      }),
    );
    expect(completeRuntimeNode).not.toHaveBeenCalled();
  });

  test("falls back to generic runtime completion for customer design node", async () => {
    const { workflowTaskService } = await import("./workflow-tasks");
    findById.mockImplementationOnce(async () =>
      customerDesignTask as unknown as typeof paymentTask
    );
    completeCustomerBridge.mockImplementationOnce(async () => null);
    completeRuntimeNode.mockClear();

    const result = await workflowTaskService.completeTask(
      {
        authUserId: "auth-1",
        employeeId: "employee-1",
        tenantId: "tenant-1",
        tenantName: null,
        tenantSlug: null,
        tenantStatus: "active",
        isPlatformAdmin: false,
        employeeName: "设计师",
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
        permissions: [],
      },
      "task-customer-designing",
      { action: "complete", reason: null, output: {} },
    );

    expect(result).toMatchObject({
      result: { ok: true },
    });
    expect(completeRuntimeNode).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        definitionId: "definition-1",
        instanceId: "instance-1",
        nodeKey: "designing",
        action: "complete",
      }),
    );
  });

  test("requires rebuild before completing legacy project signing node", async () => {
    const { workflowTaskService } = await import("./workflow-tasks");
    findById.mockImplementationOnce(async () =>
      legacyProjectDesigningTask as unknown as typeof paymentTask
    );
    getDefinitionById.mockImplementationOnce(async () => ({
      id: "legacy-definition-1",
      workflow_key: "construction_main",
    }));
    completePaymentBridge.mockImplementationOnce(async () => null);
    completeProjectBridge.mockClear();
    completeRuntimeNode.mockClear();

    await expect(
      workflowTaskService.completeTask(
        {
          authUserId: "auth-1",
          employeeId: "employee-1",
          tenantId: "tenant-1",
          tenantName: null,
          tenantSlug: null,
          tenantStatus: "active",
          isPlatformAdmin: false,
          employeeName: "设计师",
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
          permissions: [],
        },
        "task-legacy-project-designing",
        { action: "complete", reason: null, output: {} },
      )
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "WORKFLOW_INSTANCE_REBUILD_REQUIRED",
    });

    expect(completeProjectBridge).not.toHaveBeenCalled();
    expect(completeRuntimeNode).not.toHaveBeenCalled();
  });
});
