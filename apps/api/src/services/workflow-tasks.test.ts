import { describe, expect, mock, test } from "bun:test";

const completeRuntimeNode = mock(async () => ({
  ok: true,
  instance: {},
  completedNode: {},
  nextNode: null,
  task: null,
}));

mock.module("@/repositories/workflow-tasks", () => ({
  workflowTaskRepository: {
    findById: mock(async () => ({
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
      due_at: null,
      completed_by: null,
      completed_at: null,
      created_at: "2026-06-15T00:00:00.000Z",
      updated_at: "2026-06-15T00:00:00.000Z",
      instance: {
        id: "instance-1",
        subject_type: "manual",
        subject_id: "subject-1",
        status: "running",
        current_node_key: "payment_stage_2",
        current_node_snapshot: {
          business_kind: "payment_collection",
          config: { payment_type: "stage_2" },
        },
      },
    })),
  },
}));

mock.module("@/repositories/workflows", () => ({
  workflowRepository: {
    completeRuntimeNode,
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

describe("workflowTaskService", () => {
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
