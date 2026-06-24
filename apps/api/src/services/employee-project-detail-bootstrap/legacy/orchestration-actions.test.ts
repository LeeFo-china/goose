import { describe, expect, test } from "bun:test";
import { enrichWorkflowOutputsForBootstrap } from "./orchestration";
import type {
  ConstructionStagesResult,
  ProjectWorkflowState,
  WorkflowProgressResult,
} from "./shared";

const workflowGroup = {
  key: "construction",
  label: "施工阶段",
  order: 20,
};

const emptyConstructionStages: ConstructionStagesResult = {
  project_id: "project-1",
  project_status: "constructing",
  required_stage_codes: [
    "measure",
    "demolition",
    "plumbing_electrical",
    "tiling",
    "woodwork",
    "painting",
    "installation",
    "completion",
  ],
  required_completed: false,
  current_stage: null,
  next_stage: null,
  missing_required_stages: [],
  all_stage_codes: [
    "measure",
    "demolition",
    "plumbing_electrical",
    "tiling",
    "woodwork",
    "painting",
    "installation",
    "completion",
  ],
  stages: [],
};

describe("employee project detail bootstrap workflow actions", () => {
  test("aligns workflow progress actions with permission-filtered state actions", () => {
    const inaccessiblePaymentAction = {
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
    };
    const paymentTimelineNode = {
      node_key: "payment_stage_3",
      node_title: "工程尾款",
      node_type: "confirmation",
      business_kind: "payment_collection",
      group: workflowGroup,
      status: "current" as const,
      display: {
        label: "工程尾款",
        status_label: "当前",
        status_variant: "default" as const,
      },
      attributes: {},
      actions: [inaccessiblePaymentAction],
    };
    const workflowProgress: WorkflowProgressResult = {
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
      timeline_nodes: [paymentTimelineNode],
      pending_task_count: 1,
      actions: [inaccessiblePaymentAction],
      warnings: [],
    };
    const workflowState: ProjectWorkflowState = {
      subject_type: "project",
      subject_id: "project-1",
      instance_id: "instance-1",
      instance_status: "running",
      current_node_key: "payment_stage_3",
      current_node_title: "工程尾款",
      current_group_key: "construction",
      current_group_label: "施工阶段",
      current_group_order: 20,
      current_business_kind: "payment_collection",
      pending_task_count: 1,
      actions: [],
      timeline_nodes: [{
        ...paymentTimelineNode,
        actions: [],
      }],
    };

    const result = enrichWorkflowOutputsForBootstrap({
      workflowProgress,
      workflowState,
      constructionStages: emptyConstructionStages,
    });

    expect(result.workflowState?.actions).toEqual([]);
    expect(result.workflowProgress.actions).toEqual([]);
    expect(result.workflowProgress.timeline_nodes[0]?.actions).toEqual([]);
  });
});
