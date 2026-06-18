import { describe, expect, test } from "bun:test";
import { toWorkflowFlowEdges } from "./workflow-flow-adapter";
import type { WorkflowEdge, WorkflowNode } from "./workflow-types";

const NOW = "2026-06-18T00:00:00.000Z";

describe("toWorkflowFlowEdges", () => {
  test("uses the default success handle for payment node always edges", () => {
    const payment = workflowNode({
      id: "node-payment",
      node_key: "payment_stage_2",
      node_type: "confirmation",
      business_kind: "payment_collection",
    });
    const tiling = workflowNode({
      id: "node-tiling",
      node_key: "procedure_tiling",
      node_type: "procedure",
      business_kind: "procedure_template",
    });

    const [edge] = toWorkflowFlowEdges({
      activeValidationEdgeIds: new Set(),
      edges: [workflowEdge(payment, tiling)],
      nodes: [payment, tiling],
      onDeleteEdge: () => undefined,
    });

    expect(edge?.sourceHandle).toBe("payment_success");
  });
});

function workflowNode(input: {
  id: string;
  node_key: string;
  node_type: WorkflowNode["node_type"];
  business_kind: WorkflowNode["business_kind"];
}): WorkflowNode {
  return {
    id: input.id,
    tenant_id: "tenant-1",
    definition_id: "definition-1",
    node_key: input.node_key,
    node_type: input.node_type,
    business_kind: input.business_kind,
    title: input.node_key,
    description: null,
    position: { x: 0, y: 0 },
    config: {},
    sort_order: 10,
    created_at: NOW,
    updated_at: NOW,
  };
}

function workflowEdge(source: WorkflowNode, target: WorkflowNode): WorkflowEdge {
  return {
    id: "edge-1",
    tenant_id: "tenant-1",
    definition_id: "definition-1",
    source_node_id: source.id,
    target_node_id: target.id,
    label: "默认放行",
    condition: { operator: "always" },
    priority: 10,
    created_at: NOW,
    updated_at: NOW,
  };
}
