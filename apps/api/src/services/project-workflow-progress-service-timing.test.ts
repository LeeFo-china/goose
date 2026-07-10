import { expect, mock, test } from "bun:test";
import { createProjectWorkflowProgressTimingSteps } from "./project-workflow-progress-timing";

const delayed = async <Value>(value: Value): Promise<Value> => {
  await Bun.sleep(2);
  return value;
};

mock.module("@/services/workflow-subject-state", () => ({
  workflowSubjectStateService: {
    getSubjectStateWithRuntime: mock(() => delayed({
      subjectState: {
        instance_id: "instance-1",
        instance_status: "running",
        current_node_key: "procedure_woodwork",
        current_node_title: "木工",
        current_business_kind: "procedure_template",
        pending_task_count: 0,
      },
      runtimeInstance: {
        id: "instance-1",
        definition_id: "definition-1",
        version_id: "version-1",
        status: "running",
        current_node_key: "procedure_woodwork",
        current_node_snapshot: {
          id: "node-1",
          node_key: "procedure_woodwork",
          title: "木工",
          node_type: "procedure",
          business_kind: "procedure_template",
          config: { stage_key: "woodwork" },
        },
      },
    })),
  },
}));

mock.module("@/repositories/workflows", () => ({
  workflowRepository: {
    getGraph: mock(() => delayed({
      definition: { name: "项目施工", category: "construction" },
      nodes: [{
        id: "node-1",
        node_key: "procedure_woodwork",
        title: "木工",
        node_type: "procedure",
        business_kind: "procedure_template",
        config: { stage_key: "woodwork" },
      }],
      edges: [],
    })),
    listRuntimeInstanceNodes: mock(() => delayed([])),
  },
}));

mock.module("@/repositories/workflow-tasks", () => ({
  workflowTaskRepository: {
    listPendingByInstance: mock(() => delayed([])),
  },
}));

mock.module("@/services/project-procedure-assignments", () => ({
  projectProcedureAssignmentService: {
    listProjectAssignmentsForRuntime: mock(() => delayed([])),
  },
}));

mock.module("@/services/workflow-task-actions", () => ({
  buildWorkflowTaskActionPayloads: mock(() => delayed([])),
}));

mock.module("@/services/project-workflow-finance-reviewer", () => ({
  enrichWorkflowGraphWithFinanceReviewersForTenant: mock((input) =>
    delayed(input.graph)
  ),
  buildFinanceConfirmationActorsForTenant: mock(() => delayed([])),
}));

test("records every asynchronous workflow progress query step", async () => {
  const { projectWorkflowProgressService } = await import(
    "./project-workflow-progress"
  );
  const timing = createProjectWorkflowProgressTimingSteps();

  const progress = await projectWorkflowProgressService.getProjectProgress(
    { tenantId: "tenant-1", projectId: "project-1" },
    { timing },
  );

  expect(progress.source).toBe("workflow_runtime");
  expect(timing.subject_state_runtime_ms).toBeGreaterThanOrEqual(1);
  expect(timing.graph_ms).toBeGreaterThanOrEqual(1);
  expect(timing.pending_tasks_ms).toBeGreaterThanOrEqual(1);
  expect(timing.runtime_nodes_ms).toBeGreaterThanOrEqual(1);
  expect(timing.procedure_assignments_ms).toBeGreaterThanOrEqual(1);
  expect(timing.task_actions_ms).toBeGreaterThanOrEqual(1);
  expect(timing.finance_reviewers_ms).toBeGreaterThanOrEqual(1);
  expect(timing.completed_node_actors_ms).toBeGreaterThanOrEqual(1);
});
