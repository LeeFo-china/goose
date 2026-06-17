import { describe, expect, test } from "bun:test";
import type {
  WorkflowBusinessKind,
  WorkflowCategory,
  WorkflowNodeType,
} from "@gooes/domain";
import type {
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
} from "@/components/workflows/workflow-types";
import { findWorkflowBusinessTrackIssues } from "./workflow-business-track-validation";

const NOW = "2026-06-17T00:00:00.000Z";

describe("findWorkflowBusinessTrackIssues exception actions", () => {
  test("rejects customer exception actions as mainline nodes", () => {
    const nodes = [
      node("start", "start"),
      node("potential", "business", "customer_lead"),
      node("mark_dormant", "business"),
      node("following", "business", "phone_follow_up"),
      node("arrived", "business", "store_visit"),
      node("designing", "business", "design"),
      node("end", "end"),
    ];

    expect(findWorkflowBusinessTrackIssues({
      definition: definition("customer_main", "sales"),
      nodes,
      edges: linearEdges(nodes),
    }).map((issue) => issue.message)).toEqual([
      "客户设计流程异常动作不能作为主线节点: mark_dormant",
    ]);
  });

  test("rejects project exception actions as mainline nodes", () => {
    const nodes = [
      node("start", "start"),
      node("designing", "business", "design"),
      node("pause_project", "business"),
      node("proposal_confirmed", "business", "design"),
      node("signed", "business", "contract"),
      node("design_finalized", "business", "design"),
      node("pending_start", "business", "construction_start"),
      node("end", "end"),
    ];

    expect(findWorkflowBusinessTrackIssues({
      definition: definition("project_signing", "construction"),
      nodes,
      edges: linearEdges(nodes),
    }).map((issue) => issue.message)).toEqual([
      "项目签约流程异常动作不能作为主线节点: pause_project",
    ]);
  });
});

function definition(
  workflowKey: string,
  category: WorkflowCategory,
): WorkflowDefinition {
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
): WorkflowNode {
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
    config: { required_permissions: [] },
    sort_order: 10,
    created_at: NOW,
    updated_at: NOW,
  };
}

function linearEdges(nodes: WorkflowNode[]): WorkflowEdge[] {
  return nodes.slice(0, -1).map((source, index) => {
    const target = nodes[index + 1];
    if (!target) throw new Error(`Missing target node after ${source.node_key}`);
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
  });
}
