import { describe, expect, mock, test } from "bun:test";
import { createCustomerProjectDetailTimingSteps } from "@/utils/customer-project-detail-timing";

const getProjectProgress = mock(async () => ({
  source: "workflow_runtime",
  instance_id: "instance-1",
  instance_status: "running",
  current_node_key: "payment_stage_2",
  current_node_title: "中期进度款",
  current_node_type: "confirmation",
  current_business_kind: "payment_collection",
  current_stage_code: null,
  current_gate: null,
  timeline_nodes: [
    {
      node_key: "procedure_plumbing_electrical",
      node_title: "水电",
      node_type: "procedure",
      business_kind: "procedure_template",
      status: "done",
    },
    {
      node_key: "payment_stage_2",
      node_title: "中期进度款",
      node_type: "confirmation",
      business_kind: "payment_collection",
      status: "current",
    },
  ],
  pending_task_count: 0,
  actions: [],
  warnings: [],
}));

mock.module("@/services/project-workflow-progress", () => ({
  buildUnavailableProjectWorkflowProgress: () => ({
    source: "unavailable",
    instance_id: null,
    instance_status: null,
    current_node_key: null,
    current_node_title: null,
    current_node_type: null,
    current_business_kind: null,
    current_stage_code: null,
    current_gate: null,
    timeline_nodes: [],
    pending_task_count: 0,
    actions: [],
    warnings: [],
  }),
  projectWorkflowProgressService: {
    getProjectProgress,
  },
}));

describe("loadCustomerProjectWorkflowProgress", () => {
  test("does not downgrade workflow progress through optional module timeout", async () => {
    const { loadCustomerProjectWorkflowProgress } = await import(
      "./detail-bootstrap-workflow-progress"
    );
    const addPartialError = mock(() => undefined);

    const progress = await loadCustomerProjectWorkflowProgress({
      projectId: "project-1",
      tenantId: "tenant-1",
      steps: createCustomerProjectDetailTimingSteps(),
      addPartialError,
    });

    expect(progress.source).toBe("workflow_runtime");
    expect(progress.timeline_nodes.length).toBe(2);
    expect(addPartialError).not.toHaveBeenCalled();
  });
});
