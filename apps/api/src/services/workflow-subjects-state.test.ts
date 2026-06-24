import { describe, expect, mock, test } from "bun:test";

const subjectState = {
  id: "state-1",
  tenant_id: "tenant-1",
  subject_type: "project",
  subject_id: "project-1",
  definition_id: "definition-1",
  instance_id: "instance-1",
  instance_status: "running",
  current_node_key: "procedure_woodwork",
  current_node_title: "木工",
  current_business_kind: "procedure_template",
  pending_task_count: 1,
  created_at: "2026-06-24T00:00:00.000Z",
  updated_at: "2026-06-24T00:00:00.000Z",
};

const runtimeInstance = {
  id: "instance-1",
  tenant_id: "tenant-1",
  definition_id: "definition-1",
  version_id: "version-1",
  subject_type: "project",
  subject_id: "project-1",
  status: "running",
  current_node_key: "procedure_woodwork",
  current_node_snapshot: {
    title: "木工",
    business_kind: "procedure_template",
  },
  started_at: "2026-06-24T00:00:00.000Z",
  created_at: "2026-06-24T00:00:00.000Z",
  updated_at: "2026-06-24T00:00:00.000Z",
};

const progressTimelineNode = {
  node_key: "procedure_woodwork",
  node_title: "木工",
  node_type: "procedure",
  business_kind: "procedure_template",
  group: {
    key: "construction",
    label: "施工阶段",
    order: 20,
  },
  status: "current" as const,
  display: {
    label: "木工",
    status_label: "当前",
    status_variant: "default" as const,
  },
  attributes: {},
  actions: [],
};

const authContext = {
  tenantId: "tenant-1",
  employeeId: "employee-1",
  roleCodes: ["project"],
  permissions: [{ code: "project.read", scope: "all" }],
};

const getSubjectState = mock(async () => subjectState);
const getSubjectStateWithRuntime = mock(async () => ({
  subjectState,
  runtimeInstance,
}));
const findLatestRuntimeInstance = mock(async () => runtimeInstance);
const listAccessibleTasks = mock(async () => ({
  list: [{
    id: "task-1",
    tenant_id: "tenant-1",
    instance_id: "instance-1",
    node_key: "procedure_woodwork",
    node_type: "procedure",
    title: "完成木工",
    status: "pending",
    assignee_employee_id: "employee-1",
    assignee_role_code: null,
    assignee_permission_code: null,
    assignee_employee: null,
  }],
  pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
}));
const listPendingByInstance = mock(async () => []);
const getGraph = mock(async () => ({
  definition: { workflow_key: "construction_main", category: "construction" },
  nodes: [{
    id: "node-woodwork",
    node_key: "procedure_woodwork",
    title: "木工",
    node_type: "procedure",
    business_kind: "procedure_template",
    config: { stage_key: "woodwork" },
  }],
  edges: [],
}));
const listRuntimeInstanceNodes = mock(async () => []);
const listProjectAssignmentsForRuntime = mock(async () => []);
const buildWorkflowTaskActionPayloads = mock(async () => [{
  key: "complete_procedure",
  label: "完成木工",
  business_domain: "project_procedure",
  business_action: "complete_procedure",
  requires_reason: false,
  task_id: "task-1",
  node_key: "procedure_woodwork",
  node_type: "procedure",
  disabled: false,
  output_fields: [],
}]);

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantId: mock(() => "tenant-1"),
  },
}));

mock.module("@/services/workflow-subject-state", () => ({
  workflowSubjectStateService: {
    getSubjectState,
    getSubjectStateWithRuntime,
  },
}));

mock.module("@/repositories/workflow-subject-states", () => ({
  workflowSubjectStateRepository: {
    findLatestRuntimeInstance,
  },
}));

mock.module("@/repositories/workflow-tasks", () => ({
  workflowTaskRepository: {
    listAccessibleTasks,
    listPendingByInstance,
  },
}));

mock.module("@/repositories/workflows", () => ({
  workflowRepository: {
    getGraph,
    listRuntimeInstanceNodes,
  },
}));

mock.module("@/services/project-procedure-assignments", () => ({
  projectProcedureAssignmentService: {
    listProjectAssignmentsForRuntime,
  },
}));

mock.module("@/services/project-workflow-finance-reviewer", () => ({
  enrichWorkflowGraphWithFinanceReviewersForTenant: mock(async ({ graph }) => graph),
  buildFinanceConfirmationActorsForTenant: mock(async () => []),
}));

mock.module("@/services/workflow-task-actions", () => ({
  buildWorkflowTaskActionPayloads,
}));

mock.module("@/services/workflow-task-assignee", () => ({
  buildWorkflowTaskAssigneeMetadata: mock(() => ({})),
  buildWorkflowTaskAssigneeMetadataFromRecord: mock(() => ({})),
}));

describe("workflowSubjectsService state performance", () => {
  test("uses runtime returned with subject state without another latest-runtime lookup", async () => {
    getSubjectState.mockClear();
    getSubjectStateWithRuntime.mockClear();
    findLatestRuntimeInstance.mockClear();
    listAccessibleTasks.mockClear();
    getGraph.mockClear();

    const { workflowSubjectsService } = await import("./workflow-subjects");

    const result = await workflowSubjectsService.getState(authContext as never, {
      subjectType: "project",
      subjectId: "project-1",
    });

    expect(result.workflow_state?.current_node_key).toBe("procedure_woodwork");
    expect(getSubjectStateWithRuntime).toHaveBeenCalledTimes(1);
    expect(findLatestRuntimeInstance).not.toHaveBeenCalled();
    expect(getGraph).toHaveBeenCalledTimes(1);
  });

  test("reuses supplied workflow progress timeline instead of rebuilding project timeline", async () => {
    getSubjectState.mockClear();
    getSubjectStateWithRuntime.mockClear();
    findLatestRuntimeInstance.mockClear();
    listAccessibleTasks.mockClear();
    getGraph.mockClear();
    listRuntimeInstanceNodes.mockClear();
    listPendingByInstance.mockClear();

    const { workflowSubjectsService } = await import("./workflow-subjects");

    const result = await workflowSubjectsService.getState(
      authContext as never,
      {
        subjectType: "project",
        subjectId: "project-1",
      },
      {
        workflowProgress: {
          source: "workflow_runtime",
          instance_id: "instance-1",
          instance_status: "running",
          current_node_key: "procedure_woodwork",
          current_node_title: "木工",
          current_group_key: "construction",
          current_group_label: "施工阶段",
          current_group_order: 20,
          current_node_type: "procedure",
          current_business_kind: "procedure_template",
          current_stage_code: "woodwork",
          current_gate: null,
          timeline_nodes: [progressTimelineNode],
          pending_task_count: 1,
          actions: [],
          warnings: [],
        },
        actionsPromise: Promise.resolve([{
          key: "complete_procedure",
          label: "完成木工",
          business_domain: "project_procedure",
          business_action: "complete_procedure",
          requires_reason: false,
          task_id: "task-1",
          node_key: "procedure_woodwork",
          node_type: "procedure",
          disabled: false,
          output_fields: [],
        }]),
      },
    );

    expect(result.workflow_state?.timeline_nodes).toHaveLength(1);
    expect(result.workflow_state?.actions).toMatchObject([{
      key: "complete_procedure",
      task_id: "task-1",
      node_key: "procedure_woodwork",
    }]);
    expect(getSubjectStateWithRuntime).not.toHaveBeenCalled();
    expect(listAccessibleTasks).not.toHaveBeenCalled();
    expect(findLatestRuntimeInstance).not.toHaveBeenCalled();
    expect(getGraph).not.toHaveBeenCalled();
    expect(listRuntimeInstanceNodes).not.toHaveBeenCalled();
    expect(listPendingByInstance).not.toHaveBeenCalled();
  });

  test("prefers preloaded workflow progress node actions over stale supplied top-level actions", async () => {
    const { workflowSubjectsService } = await import("./workflow-subjects");

    const result = await workflowSubjectsService.getState(
      authContext as never,
      {
        subjectType: "project",
        subjectId: "project-1",
      },
      {
        workflowProgress: {
          source: "workflow_runtime",
          instance_id: "instance-1",
          instance_status: "running",
          current_node_key: "procedure_woodwork",
          current_node_title: "木工",
          current_group_key: "construction",
          current_group_label: "施工阶段",
          current_group_order: 20,
          current_node_type: "procedure",
          current_business_kind: "procedure_template",
          current_stage_code: "woodwork",
          current_gate: null,
          timeline_nodes: [{
            ...progressTimelineNode,
            actions: [{
              key: "complete_procedure",
              label: "完成木工",
              business_domain: "project_procedure",
              business_action: "complete_procedure",
              requires_reason: false,
              task_id: "task-1",
              node_key: "procedure_woodwork",
              node_type: "procedure",
              disabled: false,
              output_fields: [],
            }, {
              key: "adjust_procedure_schedule",
              label: "调整派工",
              business_domain: "project_procedure",
              business_action: "adjust_procedure_schedule",
              requires_reason: false,
              task_id: "task-1",
              node_key: "procedure_woodwork",
              node_type: "procedure",
              disabled: false,
              output_fields: [],
            }],
          }],
          pending_task_count: 1,
          actions: [{
            key: "complete_procedure",
            label: "完成木工",
            business_domain: "project_procedure",
            business_action: "complete_procedure",
            requires_reason: false,
            task_id: "task-1",
            node_key: "procedure_woodwork",
            node_type: "procedure",
            disabled: false,
            output_fields: [],
          }],
          warnings: [],
        },
        actionsPromise: Promise.resolve([{
          key: "start_procedure",
          label: "开始木工",
          business_domain: "project_procedure",
          business_action: "start_procedure",
          requires_reason: false,
          task_id: "task-1",
          node_key: "procedure_woodwork",
          node_type: "procedure",
          disabled: false,
          output_fields: [],
        }]),
      },
    );

    expect(result.workflow_state?.actions.map((action) => action.key)).toEqual([
      "complete_procedure",
      "adjust_procedure_schedule",
    ]);
    expect(result.workflow_state?.timeline_nodes[0]?.actions.map((action) =>
      action.key
    )).toEqual([
      "complete_procedure",
      "adjust_procedure_schedule",
    ]);
  });

  test("uses accessible actions as authority for preloaded payment nodes", async () => {
    const { workflowSubjectsService } = await import("./workflow-subjects");

    const result = await workflowSubjectsService.getState(
      authContext as never,
      {
        subjectType: "project",
        subjectId: "project-1",
      },
      {
        workflowProgress: {
          source: "workflow_runtime",
          instance_id: "instance-1",
          instance_status: "running",
          current_node_key: "payment_stage_3",
          current_node_title: "工程尾款",
          current_group_key: "construction",
          current_group_label: "施工阶段",
          current_group_order: 20,
          current_node_type: "confirmation",
          current_business_kind: "payment_collection",
          current_stage_code: null,
          current_gate: {
            type: "payment_collection",
            payment_type: "stage_3",
            payment_label: "工程尾款",
            blocked_stage_code: null,
            blocked_stage_label: null,
          },
          timeline_nodes: [{
            ...progressTimelineNode,
            node_key: "payment_stage_3",
            node_title: "工程尾款",
            node_type: "confirmation",
            business_kind: "payment_collection",
            display: {
              label: "工程尾款",
              status_label: "当前",
              status_variant: "default" as const,
            },
            actions: [{
              key: "complete",
              label: "中期收款",
              business_domain: "payment_collection",
              business_action: "confirm_payment",
              requires_reason: false,
              task_id: "task-payment",
              node_key: "payment_stage_3",
              node_type: "confirmation",
              disabled: false,
              output_fields: [],
            }],
          }],
          pending_task_count: 1,
          actions: [{
            key: "complete",
            label: "中期收款",
            business_domain: "payment_collection",
            business_action: "confirm_payment",
            requires_reason: false,
            task_id: "task-payment",
            node_key: "payment_stage_3",
            node_type: "confirmation",
            disabled: false,
            output_fields: [],
          }],
          warnings: [],
        },
        actionsPromise: Promise.resolve([]),
      },
    );

    expect(result.workflow_state?.actions).toEqual([]);
    expect(result.workflow_state?.timeline_nodes[0]?.actions).toEqual([]);
  });
});
