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
import { findBusinessTrackIssues } from "./workflow-business-track-validation";

const NOW = "2026-06-17T00:00:00.000Z";

describe("findBusinessTrackIssues exception actions", () => {
  test("applies project signing rules to custom keys derived from the template key", () => {
    const nodes = [
      node("start", "start"),
      node("signed", "business", "contract"),
      node("designing", "business", "design"),
      node("proposal_confirmed", "business", "design"),
      node("design_finalized", "business", "design"),
      node("pending_start", "business", "construction_start"),
      node("end", "end"),
    ];

    expect(findBusinessTrackIssues({
      definition: definition("project_signing_custom", "construction"),
      nodes,
      edges: linearEdges(nodes),
    })).toEqual([
      "项目签约流程必须按标准顺序推进: start -> designing -> proposal_confirmed -> signed -> design_finalized -> pending_start -> end",
    ]);
  });

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

    expect(findBusinessTrackIssues({
      definition: definition("customer_main", "sales"),
      nodes,
      edges: linearEdges(nodes),
    })).toEqual([
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

    expect(findBusinessTrackIssues({
      definition: definition("project_signing", "construction"),
      nodes,
      edges: linearEdges(nodes),
    })).toEqual([
      "项目签约流程异常动作不能作为主线节点: pause_project",
    ]);
  });
});

describe("findBusinessTrackIssues construction track", () => {
  test("accepts admin construction start semantic node key on standard mainline", () => {
    const nodes = [
      node("start", "start"),
      node("construction_start", "construction_stage", "construction_start", {
        required_permissions: [],
        stage_type: "construction_start",
      }),
      procedureNode("procedure_demolition", "demolition"),
      procedureNode("procedure_plumbing_electrical", "plumbing_electrical"),
      procedureNode("procedure_tiling", "tiling"),
      procedureNode("procedure_woodwork", "woodwork"),
      procedureNode("procedure_painting", "painting"),
      procedureNode("procedure_installation", "installation"),
      node("final_acceptance", "construction_stage", "final_acceptance", {
        required_permissions: [],
        stage_type: "final_acceptance",
      }),
      node("handover", "confirmation", "final_acceptance"),
      node("end", "end"),
    ];

    expect(findBusinessTrackIssues({
      definition: definition("construction_main", "construction"),
      nodes,
      edges: linearEdges(nodes),
    })).toEqual([]);
  });
});

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
    required_permissions: [],
    stage_key: stageKey,
  });
}

function linearEdges(nodes: WorkflowNodeRow[]): WorkflowEdgeRow[] {
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
