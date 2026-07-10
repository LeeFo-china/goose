import { describe, expect, test } from "bun:test";
import {
  buildUnavailableProjectWorkflowProgress,
  buildProjectWorkflowProgressProjection,
  toCustomerProjectWorkflowProgress,
} from "./project-workflow-progress";

const graph = {
  definition: {
    workflow_key: "construction_main",
    category: "construction",
  },
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
    expect(progress.timeline_nodes).toMatchObject([
      {
        node_key: "procedure_plumbing_electrical",
        node_title: "水电",
        node_type: "procedure",
        business_kind: "procedure_template",
        status: "pending",
      },
      {
        node_key: "payment_stage_2",
        node_title: "中期进度款",
        node_type: "confirmation",
        business_kind: "payment_collection",
        status: "current",
      },
      {
        node_key: "procedure_tiling",
        node_title: "瓦工",
        node_type: "procedure",
        business_kind: "procedure_template",
        status: "pending",
      },
    ]);
  });

  test("uses payment type label for payment node title and timeline display", () => {
    const paymentGraph = {
      nodes: [
        {
          id: "node-woodwork",
          node_key: "procedure_woodwork",
          title: "木工",
          node_type: "procedure",
          business_kind: "procedure_template",
          config: { stage_key: "woodwork" },
        },
        {
          id: "node-payment",
          node_key: "payment_stage_3",
          title: "中期收款",
          node_type: "confirmation",
          business_kind: "payment_collection",
          config: { payment_type: "stage_3" },
        },
        {
          id: "node-painting",
          node_key: "procedure_painting",
          title: "油工",
          node_type: "procedure",
          business_kind: "procedure_template",
          config: { stage_key: "painting" },
        },
      ],
      edges: [
        {
          source_node_id: "node-payment",
          target_node_id: "node-painting",
        },
      ],
    };
    const progress = buildProjectWorkflowProgressProjection({
      subjectState: {
        instance_id: "instance-1",
        instance_status: "running",
        current_node_key: "payment_stage_3",
        current_node_title: "中期收款",
        current_business_kind: "payment_collection",
        pending_task_count: 1,
      },
      runtimeInstance: {
        id: "instance-1",
        status: "running",
        current_node_key: "payment_stage_3",
        current_node_snapshot: paymentGraph.nodes[1],
      },
      graph: paymentGraph,
      pendingActions: [],
    });

    expect(progress.current_node_title).toBe("工程尾款");
    expect(progress.current_gate).toMatchObject({
      payment_type: "stage_3",
      payment_label: "工程尾款",
    });
    expect(progress.timeline_nodes.find((node) =>
      node.node_key === "payment_stage_3"
    )).toMatchObject({
      node_title: "工程尾款",
      display: { label: "工程尾款" },
    });
  });

  test("adds payment task assignee to the current payment timeline node", () => {
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
      pendingActions: [{
        task_id: "task-1",
        node_key: "payment_stage_2",
        assignee_employee_id: "finance-1",
        assignee_employee_name: "张三",
        assignee_employee: {
          id: "finance-1",
          name: "张三",
          avatar: null,
        },
      }],
    });

    expect(progress.timeline_nodes.find((node) =>
      node.node_key === "payment_stage_2"
    )).toMatchObject({
      assignee_employee_id: "finance-1",
      assignee_employee_name: "张三",
      assignee_employee: {
        id: "finance-1",
        name: "张三",
        avatar: null,
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
      workflow_definition_id: null,
      workflow_title: null,
      instance_status: null,
      current_node_key: null,
      current_node_title: null,
      current_group_key: null,
      current_group_label: null,
      current_group_order: null,
      current_node_type: null,
      current_business_kind: null,
      current_stage_code: null,
      current_gate: null,
      timeline_nodes: [],
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

  test("marks completed runtime nodes as done in workflow timeline", () => {
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
      completedNodeKeys: ["procedure_plumbing_electrical"],
      pendingActions: [],
    });

    expect(progress.timeline_nodes.map((node) => ({
      node_key: node.node_key,
      status: node.status,
    }))).toEqual([
      { node_key: "procedure_plumbing_electrical", status: "done" },
      { node_key: "payment_stage_2", status: "current" },
      { node_key: "procedure_tiling", status: "pending" },
    ]);
  });

  test("does not expose disconnected nodes in workflow timeline", () => {
    const disconnectedGraph = {
      nodes: [
        {
          id: "node-start",
          node_key: "start",
          title: "开始",
          node_type: "start",
          business_kind: null,
          config: {},
        },
        {
          id: "node-plumbing",
          node_key: "procedure_plumbing_electrical",
          title: "水电",
          node_type: "procedure",
          business_kind: "procedure_template",
          config: { stage_key: "plumbing_electrical" },
        },
        {
          id: "node-tiling",
          node_key: "procedure_tiling",
          title: "瓦工",
          node_type: "procedure",
          business_kind: "procedure_template",
          config: { stage_key: "tiling" },
        },
        {
          id: "node-end",
          node_key: "end",
          title: "结束",
          node_type: "end",
          business_kind: null,
          config: {},
        },
        {
          id: "node-payment",
          node_key: "water_electricity_payment",
          title: "中期进度款",
          node_type: "confirmation",
          business_kind: "payment_collection",
          config: { payment_type: "stage_2" },
        },
      ],
      edges: [
        {
          source_node_id: "node-start",
          target_node_id: "node-plumbing",
        },
        {
          source_node_id: "node-plumbing",
          target_node_id: "node-tiling",
        },
        {
          source_node_id: "node-tiling",
          target_node_id: "node-end",
        },
        {
          source_node_id: "node-payment",
          target_node_id: "node-tiling",
        },
      ],
    };
    const progress = buildProjectWorkflowProgressProjection({
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
        current_node_snapshot: disconnectedGraph.nodes[1],
      },
      graph: disconnectedGraph,
      pendingActions: [],
    });

    expect(progress.timeline_nodes.map((node) => node.node_key)).toEqual([
      "procedure_plumbing_electrical",
      "procedure_tiling",
    ]);
  });

  test("builds an unavailable progress object without guessing stage state", () => {
    expect(buildUnavailableProjectWorkflowProgress()).toMatchObject({
      source: "unavailable",
      current_node_key: null,
      current_stage_code: null,
      current_gate: null,
      timeline_nodes: [],
      pending_task_count: 0,
      actions: [],
      warnings: [],
    });
  });

  test("serializes customer workflow progress without employee action metadata", () => {
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
      pendingActions: [{
        task_id: "task-1",
        type: "complete",
        label: "确认收款",
        assignee_employee_id: "employee-1",
      }],
    });

    const customerProgress = toCustomerProjectWorkflowProgress(progress);
    expect("actions" in customerProgress).toBe(false);
    expect("warnings" in customerProgress).toBe(false);
    expect(customerProgress).toMatchObject({
      source: "workflow_runtime",
      instance_id: "instance-1",
      instance_status: "running",
      current_node_key: "payment_stage_2",
      current_node_title: "中期进度款",
      current_node_type: "confirmation",
      current_business_kind: "payment_collection",
      current_stage_code: null,
      current_gate: {
        type: "payment_collection",
        payment_type: "stage_2",
        payment_label: "中期进度款",
        blocked_stage_code: "tiling",
        blocked_stage_label: "瓦工",
      },
      timeline_nodes: [
        {
          node_key: "procedure_plumbing_electrical",
          node_title: "水电",
          node_type: "procedure",
          business_kind: "procedure_template",
          status: "pending",
        },
        {
          node_key: "payment_stage_2",
          node_title: "中期进度款",
          node_type: "confirmation",
          business_kind: "payment_collection",
          status: "current",
        },
        {
          node_key: "procedure_tiling",
          node_title: "瓦工",
          node_type: "procedure",
          business_kind: "procedure_template",
          status: "pending",
        },
      ],
      pending_task_count: 1,
    });
  });
});
