import { describe, expect, test } from "bun:test";
import type {
  JsonObject,
  WorkflowDefinitionRow,
  WorkflowEdgeRow,
  WorkflowNodeRow,
} from "@/repositories/workflows";
import type {
  WorkflowBusinessKind,
  WorkflowCategory,
  WorkflowNodeType,
} from "@gooes/domain";
import { validateWorkflowPublishGraph } from "./workflow-publish-graph";

const NOW = "2026-06-17T00:00:00.000Z";

describe("validateWorkflowPublishGraph connectivity", () => {
  test("rejects construction workflow with a disconnected payment gate", () => {
    const nodes = constructionWorkflowNodesWithPaymentGate();
    const mainlineWithoutPayment = nodes.filter((item) =>
      item.node_key !== "water_electricity_payment"
    );
    const edges = [
      ...linearEdges(mainlineWithoutPayment),
      edgeByKey(nodes, "water_electricity_payment", "procedure_tiling"),
    ];

    expect(() =>
      validateWorkflowPublishGraph({
        definition: definition("construction_main", "construction"),
        nodes,
        edges,
      })
    ).toThrow(/非开始节点必须至少有一条入边: water_electricity_payment/);
  });
});

function constructionWorkflowNodesWithPaymentGate() {
  return [
    node("start", "start"),
    node("started", "construction_stage", "construction_start"),
    procedureNode("procedure_demolition", "demolition"),
    procedureNode("procedure_plumbing_electrical", "plumbing_electrical"),
    paymentNode("water_electricity_payment", "stage_2"),
    procedureNode("procedure_tiling", "tiling"),
    procedureNode("procedure_woodwork", "woodwork"),
    procedureNode("procedure_painting", "painting"),
    procedureNode("procedure_installation", "installation"),
    node("final_acceptance", "construction_stage", "final_acceptance"),
    node("handover", "confirmation", "final_acceptance"),
    node("end", "end"),
  ];
}

function definition(
  workflowKey: string,
  category: WorkflowCategory,
): WorkflowDefinitionRow {
  return {
    id: "definition-1",
    tenant_id: "tenant-1",
    workflow_key: workflowKey,
    name: workflowKey,
    description: null,
    category,
    status: "draft",
    active_version_id: null,
    created_by: null,
    updated_by: null,
    created_at: NOW,
    updated_at: NOW,
  };
}

function node(
  nodeKey: string,
  nodeType: WorkflowNodeType,
  businessKind: WorkflowBusinessKind | null = null,
  config: JsonObject = { required_permissions: [] },
): WorkflowNodeRow {
  return {
    id: nodeKey,
    tenant_id: "tenant-1",
    definition_id: "definition-1",
    node_key: nodeKey,
    node_type: nodeType,
    business_kind: businessKind,
    title: nodeKey,
    description: null,
    position: { x: 0, y: 0 },
    config,
    sort_order: 10,
    created_at: NOW,
    updated_at: NOW,
  };
}

function procedureNode(nodeKey: string, stageKey: string) {
  return node(nodeKey, "procedure", "procedure_template", {
    stage_key: stageKey,
    require_log: true,
    min_image_count: 1,
  });
}

function paymentNode(nodeKey: string, paymentType: string) {
  return node(nodeKey, "confirmation", "payment_collection", {
    required_permissions: ["finance.payment.confirm"],
    finance_type: "payment_collection",
    payment_type: paymentType,
    requirement_mode: "any_confirmed",
    required_percentage: null,
    finance_reviewer_employee_id: null,
  });
}

function linearEdges(nodes: WorkflowNodeRow[]): WorkflowEdgeRow[] {
  return nodes.slice(0, -1).map((source, index) => {
    const target = nodes[index + 1];
    if (!target) {
      throw new Error(`Missing target node after ${source.node_key}`);
    }
    return edge(source, target);
  });
}

function edgeByKey(
  nodes: WorkflowNodeRow[],
  sourceNodeKey: string,
  targetNodeKey: string,
) {
  return edge(mustNode(nodes, sourceNodeKey), mustNode(nodes, targetNodeKey));
}

function mustNode(nodes: WorkflowNodeRow[], nodeKey: string) {
  const matchedNode = nodes.find((item) => item.node_key === nodeKey);
  if (!matchedNode) {
    throw new Error(`Missing node ${nodeKey}`);
  }
  return matchedNode;
}

function edge(source: WorkflowNodeRow, target: WorkflowNodeRow): WorkflowEdgeRow {
  return {
    id: `edge-${source.node_key}-${target.node_key}`,
    tenant_id: "tenant-1",
    definition_id: "definition-1",
    source_node_id: source.id,
    target_node_id: target.id,
    label: null,
    condition: { operator: "always" },
    priority: 100,
    created_at: NOW,
    updated_at: NOW,
  };
}
