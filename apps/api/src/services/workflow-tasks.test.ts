import { describe, expect, mock, spyOn, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";
import { projectWorkflowProgressService } from "@/services/project-workflow-progress";

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
const shouldRequireAssignmentForTask = mock(() => false);
const markProcedureCompleted = mock(async () => null);
const canAccessProject = mock(async () => true);
const invalidateProjectProgress = spyOn(projectWorkflowProgressService, "invalidateProject")
  .mockImplementation(() => undefined);
const shouldRequireProjectWorkflowRebuild = mock((input: {
  workflowKey?: string | null; nodeKey: string;
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
  node_key: "payment_stage_2",
  node_type: "confirmation",
  title: "中期进度款",
  status: "pending",
  assignee_employee_id: "finance-employee-1",
  assignee_role_code: null,
  assignee_permission_code: "finance.payment.confirm",
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
      config: { payment_type: "stage_2", block_message: "请先确认中期进度款已入账后再进入瓦工" },
    },
  },
};

const stalePaymentTask = {
  ...paymentTask,
  id: "task-stale-payment",
  instance: {
    ...paymentTask.instance,
    current_node_key: "procedure_tiling",
    current_node_snapshot: {
      node_key: "procedure_tiling",
      business_kind: "procedure_template",
      title: "瓦工施工",
      config: { stage_key: "tiling" },
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

const procedureTask = {
  ...paymentTask,
  id: "task-procedure-demolition",
  node_key: "procedure_demolition",
  node_type: "procedure",
  title: "拆改",
  assignee_employee_id: null,
  assignee_permission_code: "project.update",
  instance: {
    ...paymentTask.instance,
    subject_type: "project",
    subject_id: "project-1",
    current_node_key: "procedure_demolition",
    current_node_snapshot: {
      node_key: "procedure_demolition",
      node_type: "procedure",
      business_kind: "procedure_template",
      title: "拆改",
      config: { stage_key: "demolition", require_procedure_assignment: true },
    },
  },
};

const findById = mock(async () => paymentTask);
const getDefinitionById = mock(async () => ({
  id: "definition-1", workflow_key: "project_signing",
}));
const listAccessibleTasks = mock(async () => ({
  list: [paymentTask],
  pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
}));
const getRuntimeInstanceById = mock(async () => ({
  status: "completed", current_node_key: "designing", current_node_id: "node-1",
}));

function authContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    authUserId: "auth-1", employeeId: "employee-1", tenantId: "tenant-1",
    tenantStatus: "active",
    isPlatformAdmin: false,
    employeeName: "员工",
    employeeStatus: "active",
    roleCodes: [], roles: [], permissions: [],
    tenantName: null, tenantSlug: null, departmentId: null, tenantDepartmentId: null,
    departmentCode: null, departmentName: null, postId: null, postName: null,
    avatar: null,
    ...overrides,
  };
}

mock.module("@/repositories/workflow-tasks", () => ({
  workflowTaskRepository: {
    findById,
    listAccessibleTasks,
  },
}));

mock.module("@/repositories/workflows", () => ({
  workflowRepository: {
    getRuntimeInstanceById,
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
    getScope: mock((
      authContext: { permissions?: Array<{ code: string; scope: string }> },
      permissionCode: string,
    ) =>
      authContext.permissions?.find((permission) =>
        permission.code === permissionCode
      )?.scope ?? null
    ),
    canAccessProject,
  },
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

mock.module("@/services/workflow-task-payment-bridge", () => ({
  workflowTaskPaymentBridge: {
    complete: completePaymentBridge,
  },
}));

mock.module("@/services/project-procedure-assignments", () => ({
  projectProcedureAssignmentService: {
    shouldRequireAssignmentForTask,
    markProcedureCompleted,
  },
}));
mock.module("@/repositories/workflow-task-card-context", () => ({ workflowTaskCardContextRepository: { listProjectSummariesByIds: mock(async () => []), listCustomerSummariesByIds: mock(async () => []), listExpenseRequestSummariesByIds: mock(async () => []), listProjectReceivableSummaries: mock(async () => []), listProjectAcceptanceSummariesByProjectIds: mock(async () => []) } }));

describe("workflowTaskService", () => {
  test("keeps payment collection action executable for assigned finance", async () => {
    const { workflowTaskService } = await import("./workflow-tasks");

    const tasks = await workflowTaskService.listTasks(
      authContext({
        employeeId: "finance-employee-1",
        employeeName: "小龙女",
        departmentCode: "FINANCE",
        departmentName: "财务部",
      }),
      { page: 1, pageSize: 20, status: "pending" },
    );

    expect(tasks.list[0]?.actions[0]).toMatchObject({
      business_domain: "payment_collection",
      business_action: "confirm_payment",
      disabled: false,
    });
    expect(tasks.list[0]?.card_context).toMatchObject({ todo_type: "project_payment" });
    expect(tasks.list[0]?.actions[0]).not.toHaveProperty("blocked_reason");
  });

  test("denies permission holders when a task is assigned to a specific employee", async () => {
    const { workflowTaskService } = await import("./workflow-tasks");

    await expect(
      workflowTaskService.completeTask(
        authContext({
          employeeId: "other-employee",
          employeeName: "非指定财务",
          permissions: [{ code: "finance.payment.confirm", scope: "all" }],
        }),
        "task-1",
        { action: "complete", reason: null, output: {} },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });

    expect(completeRuntimeNode).not.toHaveBeenCalled();
  });

  test("allows procedure completion permission to advance procedure tasks", async () => {
    const { workflowTaskService } = await import("./workflow-tasks");
    findById.mockImplementationOnce(async () => procedureTask as unknown as typeof paymentTask);
    completePaymentBridge.mockImplementationOnce(async () => null);
    completeProjectBridge.mockImplementationOnce(async () => null);
    completeRuntimeNode.mockClear();
    invalidateProjectProgress.mockClear();

    const result = await workflowTaskService.completeTask(
      authContext({
        employeeId: "construction-manager-1",
        employeeName: "工程监理",
        departmentCode: "PROJECT",
        departmentName: "工程部",
        permissions: [{ code: "project_procedure.complete", scope: "self" }],
      }),
      "task-procedure-demolition",
      { action: "complete_procedure", reason: null, output: {} },
    );

    expect(result).toMatchObject({
      result: { ok: true },
    });
    expect(completeRuntimeNode).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        definitionId: "definition-1",
        instanceId: "instance-1",
        nodeKey: "procedure_demolition",
        action: "complete_procedure",
      }),
    );
    expect(invalidateProjectProgress).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1" });
  });

  test("denies procedure completion when project scope is not visible", async () => {
    const { workflowTaskService } = await import("./workflow-tasks");
    findById.mockImplementationOnce(async () => procedureTask as unknown as typeof paymentTask);
    canAccessProject.mockImplementationOnce(async () => false);
    completeRuntimeNode.mockClear();

    await expect(workflowTaskService.completeTask(
      authContext({
        employeeId: "construction-manager-1",
        employeeName: "工程监理",
        departmentCode: "PROJECT",
        departmentName: "工程部",
        permissions: [{ code: "project_procedure.complete", scope: "self" }],
      }),
      "task-procedure-demolition",
      { action: "complete_procedure", reason: null, output: {} },
    )).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });

    expect(completeRuntimeNode).not.toHaveBeenCalled();
  });

  test("rejects stale pending task before running business bridges", async () => {
    const { workflowTaskService } = await import("./workflow-tasks");
    findById.mockImplementationOnce(async () => stalePaymentTask as unknown as typeof paymentTask);
    completePaymentBridge.mockClear();
    completeRuntimeNode.mockClear();
    invalidateProjectProgress.mockClear();

    await expect(
      workflowTaskService.completeTask(
        authContext({
          employeeId: "finance-employee-1",
          employeeName: "财务",
          departmentCode: "FINANCE",
          departmentName: "财务部",
          permissions: [{ code: "finance.payment.confirm", scope: "all" }],
        }),
        "task-stale-payment",
        {
          action: "complete",
          reason: null,
          output: {
            amount: 10000,
            evidence_images: [{ url: "https://example.com/payment.jpg" }],
          },
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "WORKFLOW_NODE_NOT_CURRENT",
    });

    expect(completePaymentBridge).not.toHaveBeenCalled();
    expect(completeRuntimeNode).not.toHaveBeenCalled();
    expect(invalidateProjectProgress).not.toHaveBeenCalled();
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
    invalidateProjectProgress.mockClear();

    const result = await workflowTaskService.completeTask(
      authContext({
        employeeId: "finance-employee-1",
        employeeName: "财务",
        departmentCode: "FINANCE",
        departmentName: "财务部",
        permissions: [{ code: "finance.payment.confirm", scope: "all" }],
      }),
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
    expect(invalidateProjectProgress).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1" });
  });

  test("falls back to generic runtime completion for customer design node", async () => {
    const { workflowTaskService } = await import("./workflow-tasks");
    findById.mockImplementationOnce(async () => customerDesignTask as unknown as typeof paymentTask);
    completeRuntimeNode.mockClear();

    const result = await workflowTaskService.completeTask(
      authContext({
        employeeId: "employee-1",
        employeeName: "设计师",
      }),
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
    findById.mockImplementationOnce(async () => legacyProjectDesigningTask as unknown as typeof paymentTask);
    getDefinitionById.mockImplementationOnce(async () => ({
      id: "legacy-definition-1",
      workflow_key: "construction_main",
    }));
    completePaymentBridge.mockImplementationOnce(async () => null);
    completeProjectBridge.mockClear();
    completeRuntimeNode.mockClear();

    await expect(
      workflowTaskService.completeTask(
        authContext({
          employeeId: "employee-1",
          employeeName: "设计师",
        }),
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
