import { describe, expect, test } from "bun:test";
import {
  buildProjectWorkflowProgressProjection,
  enrichProjectWorkflowProgressWithConstructionStages,
} from "./project-workflow-progress";

const procedureGraph = {
  nodes: [
    {
      id: "node-plumbing",
      node_key: "procedure_plumbing_electrical",
      title: "水电",
      node_type: "procedure",
      business_kind: "procedure_template",
      config: {
        stage_key: "plumbing_electrical",
        require_log: true,
        min_image_count: 3,
        trigger_acceptance: true,
      },
    },
    {
      id: "node-tiling",
      node_key: "procedure_tiling",
      title: "瓦工",
      node_type: "procedure",
      business_kind: "procedure_template",
      config: {
        stage_key: "tiling",
        require_log: true,
        min_image_count: 2,
        trigger_acceptance: false,
      },
    },
  ],
  edges: [
    {
      source_node_id: "node-plumbing",
      target_node_id: "node-tiling",
    },
  ],
};

describe("project workflow node contract", () => {
  test("stops workflow timeline at a reachable payment node without outgoing edge", () => {
    const paymentWithoutOutgoingEdgeGraph = {
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
          id: "node-payment",
          node_key: "payment_stage_2",
          title: "中期收款",
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
        {
          id: "node-end",
          node_key: "end",
          title: "结束",
          node_type: "end",
          business_kind: null,
          config: {},
        },
      ],
      edges: [
        {
          source_node_id: "node-start",
          target_node_id: "node-plumbing",
        },
        {
          source_node_id: "node-plumbing",
          target_node_id: "node-payment",
        },
        {
          source_node_id: "node-tiling",
          target_node_id: "node-end",
        },
      ],
    };
    const progress = buildProjectWorkflowProgressProjection({
      subjectState: {
        instance_id: "instance-1",
        instance_status: "running",
        current_node_key: "payment_stage_2",
        current_node_title: "中期收款",
        current_business_kind: "payment_collection",
        pending_task_count: 1,
      },
      runtimeInstance: {
        id: "instance-1",
        status: "running",
        current_node_key: "payment_stage_2",
        current_node_snapshot: paymentWithoutOutgoingEdgeGraph.nodes[2],
      },
      graph: paymentWithoutOutgoingEdgeGraph,
      completedNodeKeys: ["procedure_plumbing_electrical"],
      pendingActions: [],
    });

    expect(progress.timeline_nodes.map((node) => node.node_key)).toEqual([
      "procedure_plumbing_electrical",
      "payment_stage_2",
    ]);
  });

  test("adds display attributes and actions to workflow timeline nodes", () => {
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
        current_node_snapshot: procedureGraph.nodes[0],
      },
      graph: procedureGraph,
      pendingActions: [{
        task_id: "task-1",
        key: "complete",
        label: "水电施工",
        node_key: "procedure_plumbing_electrical",
        node_type: "procedure",
        business_domain: "workflow_project",
        business_action: "complete_procedure",
        requires_reason: false,
        disabled: false,
        output_fields: [],
      }],
    });

    expect(progress.timeline_nodes[0]).toMatchObject({
      display: {
        label: "水电",
        status_label: "当前",
        status_variant: "default",
      },
      attributes: {
        stage_code: "plumbing_electrical",
        require_log: true,
        min_image_count: 3,
        acceptance_enabled: true,
        acceptance_required: true,
      },
      actions: [{
        key: "complete",
        label: "水电施工",
        task_id: "task-1",
      }],
    });
  });

  test("marks completed acceptance-enabled procedure as pending acceptance", () => {
    const progress = buildProjectWorkflowProgressProjection({
      subjectState: {
        instance_id: "instance-1",
        instance_status: "running",
        current_node_key: "procedure_tiling",
        current_node_title: "瓦工",
        current_business_kind: "procedure_template",
        pending_task_count: 1,
      },
      runtimeInstance: {
        id: "instance-1",
        status: "running",
        current_node_key: "procedure_tiling",
        current_node_snapshot: procedureGraph.nodes[1],
      },
      graph: procedureGraph,
      completedNodeKeys: ["procedure_plumbing_electrical"],
      pendingActions: [],
    });

    const enriched = enrichProjectWorkflowProgressWithConstructionStages(progress, {
      stages: [{
        stage_code: "plumbing_electrical",
        stage_label: "水电",
        acceptance_id: null,
        acceptance_status: null,
        acceptance_action: {
          type: "create",
          label: "发起验收",
          enabled: true,
          reason: null,
        },
      }],
    });

    const plumbingNode = enriched.timeline_nodes[0];
    if (!plumbingNode) {
      throw new Error("Missing enriched plumbing node");
    }

    expect(plumbingNode).toMatchObject({
      status: "blocked",
      display: {
        status_label: "待验收",
        status_variant: "warning",
      },
      attributes: {
        acceptance_enabled: true,
        acceptance_required: true,
        acceptance_id: null,
        acceptance_status: null,
      },
      actions: [{
        key: "create_acceptance",
        label: "发起验收",
        business_domain: "project_acceptance",
        business_action: "create",
        disabled: false,
        stage_code: "plumbing_electrical",
      }],
    });
  });

  test("does not add acceptance action when procedure acceptance is disabled", () => {
    const plumbingNode = procedureGraph.nodes[0];
    const tilingNode = procedureGraph.nodes[1];
    if (!plumbingNode || !tilingNode) {
      throw new Error("Missing procedure graph nodes");
    }
    const disabledGraph = {
      ...procedureGraph,
      nodes: [
        {
          ...plumbingNode,
          config: {
            ...plumbingNode.config,
            trigger_acceptance: false,
          },
        },
        tilingNode,
      ],
    };
    const progress = buildProjectWorkflowProgressProjection({
      subjectState: {
        instance_id: "instance-1",
        instance_status: "running",
        current_node_key: "procedure_tiling",
        current_node_title: "瓦工",
        current_business_kind: "procedure_template",
        pending_task_count: 1,
      },
      runtimeInstance: {
        id: "instance-1",
        status: "running",
        current_node_key: "procedure_tiling",
        current_node_snapshot: tilingNode,
      },
      graph: disabledGraph,
      completedNodeKeys: ["procedure_plumbing_electrical"],
      pendingActions: [],
    });

    const enriched = enrichProjectWorkflowProgressWithConstructionStages(progress, {
      stages: [{
        stage_code: "plumbing_electrical",
        stage_label: "水电",
        acceptance_id: null,
        acceptance_status: null,
        acceptance_action: {
          type: "create",
          label: "发起验收",
          enabled: true,
          reason: null,
        },
      }],
    });

    const enrichedPlumbingNode = enriched.timeline_nodes[0];
    if (!enrichedPlumbingNode) {
      throw new Error("Missing enriched plumbing node");
    }

    expect(enrichedPlumbingNode.status).toBe("done");
    expect(enrichedPlumbingNode.attributes.acceptance_enabled).toBe(false);
    expect(enrichedPlumbingNode.actions).toEqual([]);
  });
});
