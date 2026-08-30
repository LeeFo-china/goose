import { describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const getSubjectStateWithRuntime = mock(async () => ({
  subjectState: {
    id: "state-1",
    tenant_id: "tenant-1",
    subject_type: "supplier_purchase_batch",
    subject_id: "batch-1",
    definition_id: "definition-1",
    instance_id: "instance-1",
    instance_status: "running",
    current_node_key: "purchase_review",
    current_node_title: "采购审批",
    current_business_kind: null,
    pending_task_count: 1,
    created_at: "2026-08-30T00:00:00.000Z",
    updated_at: "2026-08-30T00:00:00.000Z",
  },
  runtimeInstance: {
    id: "instance-1",
    tenant_id: "tenant-1",
    definition_id: "definition-1",
    version_id: "version-1",
    subject_type: "supplier_purchase_batch",
    subject_id: "batch-1",
    status: "running",
    current_node_key: "purchase_review",
    current_node_snapshot: { title: "采购审批", node_type: "approval" },
    started_at: "2026-08-30T00:00:00.000Z",
    created_at: "2026-08-30T00:00:00.000Z",
    updated_at: "2026-08-30T00:00:00.000Z",
  },
}));
const getGraph = mock(async () => ({
  definition: {
    id: "definition-1",
    name: "采购批次审批",
    workflow_key: "supplier_purchase_batch_approval",
    category: "approval",
  },
  nodes: [{
    id: "node-start",
    node_key: "start",
    title: "开始",
    node_type: "start",
    business_kind: null,
    config: {},
    sort_order: 10,
  }, {
    id: "node-purchase",
    node_key: "purchase_review",
    title: "采购审批",
    node_type: "approval",
    business_kind: null,
    config: {},
    sort_order: 20,
  }, {
    id: "node-end",
    node_key: "approved_end",
    title: "已通过",
    node_type: "end",
    business_kind: null,
    config: {},
    sort_order: 30,
  }],
  edges: [{
    source_node_id: "node-start",
    target_node_id: "node-purchase",
  }, {
    source_node_id: "node-purchase",
    target_node_id: "node-end",
  }],
}));
const listRuntimeInstanceNodes = mock(async () => [{
  node_key: "purchase_review",
  status: "running",
  completed_by: null,
  completed_at: null,
}]);
const listPendingByInstance = mock(async () => []);

mock.module("@/services/access-policy", () => ({
  accessPolicyService: { assertTenantId: mock(() => "tenant-1") },
}));
mock.module("@/services/workflow-subject-state", () => ({
  workflowSubjectStateService: { getSubjectStateWithRuntime },
}));
mock.module("@/repositories/workflow-subject-states", () => ({
  workflowSubjectStateRepository: {
    findLatestRuntimeInstance: mock(async () => null),
  },
}));
mock.module("@/repositories/workflow-tasks", () => ({
  workflowTaskRepository: {
    listPendingByInstance,
    listAccessibleTasks: mock(async () => ({
      list: [],
      pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
    })),
  },
}));
mock.module("@/repositories/workflows", () => ({
  workflowRepository: { getGraph, listRuntimeInstanceNodes },
}));
mock.module("@/services/project-procedure-assignments", () => ({
  projectProcedureAssignmentService: {
    listProjectAssignmentsForRuntime: mock(async () => []),
  },
}));
mock.module("@/services/project-workflow-finance-reviewer", () => ({
  enrichWorkflowGraphWithFinanceReviewersForTenant: mock(async ({ graph }) =>
    graph),
  buildFinanceConfirmationActorsForTenant: mock(async () => []),
}));
mock.module("@/services/workflow-task-actions", () => ({
  buildWorkflowTaskActionPayloads: mock(async () => []),
  buildWorkflowTaskActionsForTask: mock(async () => []),
}));
mock.module("@/services/workflow-task-assignee", () => ({
  buildWorkflowTaskAssigneeMetadata: mock(() => ({})),
  buildWorkflowTaskAssigneeMetadataFromRecord: mock(() => ({})),
}));

describe("workflowSubjectsService supplier purchase batch timeline", () => {
  test("builds the complete published graph timeline for batch detail", async () => {
    const { workflowSubjectsService } = await import("./workflow-subjects");
    const result = await workflowSubjectsService.getState({
      tenantId: "tenant-1",
      employeeId: "employee-1",
      roleCodes: [],
      permissions: [],
    } as never, {
      subjectType: "supplier_purchase_batch",
      subjectId: "batch-1",
    }, {
      actionsPromise: Promise.resolve([]),
    });

    expect(result.workflow_state?.timeline_nodes.map(({ node_key }) => node_key))
      .toEqual(["purchase_review"]);
    expect(getGraph).toHaveBeenCalledTimes(1);
    expect(listRuntimeInstanceNodes).toHaveBeenCalledTimes(1);
    expect(listPendingByInstance).toHaveBeenCalledTimes(1);
  });
});
