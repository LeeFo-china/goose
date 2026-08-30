import { describe, expect, mock, test } from "bun:test";
import type { WorkflowTaskWithInstanceRow } from "@/repositories/workflow-tasks";
import type { AuthContext } from "@/services/authorization";
import type { ProcedureAssignmentRow } from "@/services/project-procedure-assignments";

const procedureTask = {
  id: "task-procedure-demolition",
  tenant_id: "tenant-1",
  instance_id: "instance-1",
  instance_node_id: "instance-node-1",
  definition_id: "definition-1",
  version_id: "version-1",
  node_id: "node-1",
  node_key: "procedure_demolition",
  node_type: "procedure",
  title: "拆改",
  status: "pending",
  assignee_employee_id: null,
  assignee_role_code: null,
  assignee_permission_code: "project.update",
  due_at: null,
  completed_by: null,
  completed_at: null,
  created_at: "2026-06-23T00:00:00.000Z",
  updated_at: "2026-06-23T00:00:00.000Z",
  instance: {
    id: "instance-1",
    subject_type: "project",
    subject_id: "project-1",
    status: "running",
    current_node_key: "procedure_demolition",
    current_node_snapshot: {
      node_key: "procedure_demolition",
      node_type: "procedure",
      business_kind: "procedure_template",
      title: "拆改",
      config: { stage_key: "demolition", require_procedure_assignment: true },
    },
  },
} satisfies WorkflowTaskWithInstanceRow;

const activeAssignment = {
  id: "assignment-1",
  tenant_id: "tenant-1",
  project_id: "project-1",
  workflow_instance_id: "instance-1",
  workflow_instance_node_id: "instance-node-1",
  node_key: "procedure_demolition",
  stage_code: "demolition",
  assignee_employee_id: "worker-1",
  planned_start_date: "2026-06-23",
  planned_duration_days: 1,
  planned_end_date: "2026-06-23",
  status: "in_progress",
  started_by_employee_id: "manager-1",
  started_at: "2026-06-23T00:00:00.000Z",
  completed_by_employee_id: null,
  completed_at: null,
  adjusted_by_employee_id: null,
  adjusted_at: null,
  adjust_reason: null,
  created_at: "2026-06-23T00:00:00.000Z",
  updated_at: "2026-06-23T00:00:00.000Z",
  assignee_employee: { id: "worker-1", name: "施工员", avatar: null },
} satisfies ProcedureAssignmentRow;

const listAccessibleTasks = mock(async () => ({
  list: [procedureTask],
  pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
}));
const listProjectAssignmentsForRuntime = mock(async () => [activeAssignment]);

function authContext(): AuthContext {
  return {
    authUserId: "auth-1",
    employeeId: "employee-1",
    tenantId: "tenant-1",
    tenantStatus: "active",
    isPlatformAdmin: false,
    employeeName: "员工",
    employeeStatus: "active",
    roleCodes: [],
    roles: [],
    permissions: [],
    tenantName: null,
    tenantSlug: null,
    departmentId: null,
    tenantDepartmentId: null,
    departmentCode: null,
    departmentName: null,
    postId: null,
    postName: null,
    avatar: null,
  };
}

mock.module("@/repositories/workflow-tasks", () => ({
  workflowTaskRepository: { listAccessibleTasks },
}));
mock.module("@/repositories/workflows", () => ({
  workflowRepository: {},
}));
mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantId: mock((authContext: AuthContext) => authContext.tenantId),
  },
}));
mock.module("@/services/project-procedure-assignments", () => ({
  projectProcedureAssignmentService: {
    listProjectAssignmentsForRuntime,
  },
}));
mock.module("@/services/workflow-runtime-guards", () => ({
  assertRuntimeNodeCompletionAllowed: mock(async () => null),
}));
mock.module("@/services/workflow-subject-state", () => ({
  workflowSubjectStateService: {},
}));
mock.module("@/services/workflow-task-customer-bridge", () => ({
  workflowTaskCustomerBridge: { complete: mock(async () => null) },
}));
mock.module("@/services/workflow-task-expense-bridge", () => ({
  workflowTaskExpenseBridge: { complete: mock(async () => null) },
}));
mock.module("@/services/workflow-task-payment-bridge", () => ({
  workflowTaskPaymentBridge: { complete: mock(async () => null) },
}));
mock.module("@/services/workflow-task-project-bridge", () => ({
  shouldRequireProjectWorkflowRebuild: mock(() => false),
  workflowTaskProjectBridge: { complete: mock(async () => null) },
}));
mock.module("@/repositories/workflow-task-card-context", () => ({
  workflowTaskCardContextRepository: {
    listProjectSummariesByIds: mock(async () => []),
    listCustomerSummariesByIds: mock(async () => []),
    listExpenseRequestSummariesByIds: mock(async () => []),
    listProjectReceivableSummaries: mock(async () => []),
    listProjectAcceptanceSummariesByProjectIds: mock(async () => []),
    listSupplierPurchaseBatchSummariesByIds: mock(async () => []),
    listEmployeeSummariesByIds: mock(async () => []),
  },
}));

describe("workflowTaskService procedure actions", () => {
  test("uses active procedure assignment actions in task list", async () => {
    const { workflowTaskService } = await import("./workflow-tasks");

    const tasks = await workflowTaskService.listTasks(
      authContext(),
      { page: 1, pageSize: 20, status: "pending", subject_id: "project-1" },
    );

    expect(tasks.list[0]?.actions.map((action) => action.key)).toEqual([
      "complete_procedure",
      "adjust_procedure_schedule",
    ]);
    expect(tasks.list[0]?.actions[0]).toMatchObject({
      business_domain: "project_procedure",
      business_action: "complete_procedure",
      disabled: false,
      task_id: "task-procedure-demolition",
    });
    expect(listProjectAssignmentsForRuntime).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      projectId: "project-1",
      workflowInstanceId: "instance-1",
    });
  });
});
