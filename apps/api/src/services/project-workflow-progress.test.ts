import { describe, expect, test } from "bun:test";
import { buildProjectWorkflowProgressProjection } from "./project-workflow-progress";

const graph = {
  nodes: [
    {
      id: "node-plumbing",
      node_key: "procedure_plumbing_electrical",
      title: "水电",
      node_type: "procedure",
      business_kind: "procedure_template",
      config: { stage_key: "plumbing_electrical" },
    },
    {
      id: "node-payment",
      node_key: "payment_stage_2",
      title: "中期进度款",
      node_type: "confirmation",
      business_kind: "payment_collection",
      config: { payment_type: "stage_2" },
    },
    {
      id: "node-tiling",
      node_key: "procedure_tiling",
      title: "瓦工",
      node_type: "procedure",
      business_kind: "procedure_template",
      config: { stage_key: "tiling" },
    },
  ],
  edges: [
    {
      source_node_id: "node-payment",
      target_node_id: "node-tiling",
    },
  ],
};

describe("buildProjectWorkflowProgressProjection", () => {
  test("maps a current procedure node to its stage code", () => {
    expect(buildProjectWorkflowProgressProjection({
      subjectState: {
        instance_id: "instance-1",
        instance_status: "running",
        current_node_key: "procedure_plumbing_electrical",
        current_node_title: "水电",
        current_business_kind: "procedure_template",
        pending_task_count: 1,
      },
      runtimeInstance: {
        id: "instance-1",
        status: "running",
        current_node_key: "procedure_plumbing_electrical",
        current_node_snapshot: graph.nodes[0],
      },
      graph,
      pendingActions: [],
    })).toMatchObject({
      source: "workflow_runtime",
      instance_id: "instance-1",
      current_node_key: "procedure_plumbing_electrical",
      current_node_title: "水电",
      current_node_type: "procedure",
      current_business_kind: "procedure_template",
      current_stage_code: "plumbing_electrical",
      current_gate: null,
      pending_task_count: 1,
      warnings: [],
    });
  });

  test("maps a payment node to a payment gate and blocked next stage", () => {
    const progress = buildProjectWorkflowProgressProjection({
      subjectState: {
        instance_id: "instance-1",
        instance_status: "running",
        current_node_key: "payment_stage_2",
        current_node_title: "中期进度款",
        current_business_kind: "payment_collection",
        pending_task_count: 1,
      },
      runtimeInstance: {
        id: "instance-1",
        status: "running",
        current_node_key: "payment_stage_2",
        current_node_snapshot: graph.nodes[1],
      },
      graph,
      pendingActions: [],
    });

    expect(progress).toMatchObject({
      current_stage_code: null,
      current_gate: {
        type: "payment_collection",
        payment_type: "stage_2",
        payment_label: "中期进度款",
        blocked_stage_code: "tiling",
        blocked_stage_label: "瓦工",
      },
    });
  });

  test("returns missing_runtime without guessing when runtime is absent", () => {
    expect(buildProjectWorkflowProgressProjection({
      subjectState: null,
      runtimeInstance: null,
      graph,
      pendingActions: [],
    })).toEqual({
      source: "missing_runtime",
      instance_id: null,
      instance_status: null,
      current_node_key: null,
      current_node_title: null,
      current_node_type: null,
      current_business_kind: null,
      current_stage_code: null,
      current_gate: null,
      pending_task_count: 0,
      actions: [],
      warnings: [],
    });
  });

  test("reports stale subject state when runtime current node differs", () => {
    expect(buildProjectWorkflowProgressProjection({
      subjectState: {
        instance_id: "instance-1",
        instance_status: "running",
        current_node_key: "construction_start",
        current_node_title: "开工",
        current_business_kind: "construction_start",
        pending_task_count: 1,
      },
      runtimeInstance: {
        id: "instance-1",
        status: "running",
        current_node_key: "payment_stage_2",
        current_node_snapshot: graph.nodes[1],
      },
      graph,
      pendingActions: [],
    }).warnings).toContainEqual({
      code: "STALE_SUBJECT_STATE",
      message: "workflow_subject_states 与 workflow_instances 当前节点不一致",
    });
  });
});
