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
  WorkflowNodeConfig,
} from "@/components/workflows/workflow-types";
import { validateGraph } from "./workflow-designer-graph-utils";

const NOW = "2026-06-17T00:00:00.000Z";

describe("validateGraph business tracks", () => {
  test("rejects project signing payment gates before proposal confirmation", () => {
    const nodes = [
      node("start", "start"),
      paymentNode("payment_deposit", "deposit"),
      node("designing", "business", "design"),
      node("proposal_confirmed", "business", "design"),
      node("signed", "business", "contract"),
      node("design_finalized", "business", "design"),
      node("pending_start", "business", "construction_start"),
      node("end", "end"),
    ];

    const result = validateGraph({
      definition: definition("project_signing", "construction"),
      nodes,
      edges: linearEdges(nodes),
    });

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.message)).toContain(
      "项目签约流程收定金节点必须在方案确认之后、项目签约之前: payment_deposit",
    );
  });

  test("rejects project signing workflow with duplicate contract status semantics", () => {
    const nodes = [
      node("start", "start"),
      node("designing", "business", "design"),
      node("proposal_confirmed", "business", "design"),
      node("contract_review_as_status", "business", "contract"),
      node("signed", "business", "contract"),
      node("design_finalized", "business", "design"),
      node("pending_start", "business", "construction_start"),
      node("end", "end"),
    ];

    const result = validateGraph({
      definition: definition("project_signing", "construction"),
      nodes,
      edges: linearEdges(nodes),
    });

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.message)).toContain(
      "项目签约流程主状态节点重复: 项目签约(contract_review_as_status、signed)",
    );
  });

  test("allows construction workflow with custom payment collection gates inserted", () => {
    const nodes = [
      node("start", "start"),
      node("started", "construction_stage", "construction_start"),
      procedureNode("procedure_demolition", "demolition"),
      procedureNode("procedure_plumbing_electrical", "plumbing_electrical"),
      paymentNode("water_electricity_payment", "stage_2"),
      procedureNode("procedure_tiling", "tiling"),
      procedureNode("procedure_woodwork", "woodwork"),
      paymentNode("woodwork_payment", "stage_3"),
      procedureNode("procedure_painting", "painting"),
      procedureNode("procedure_installation", "installation"),
      node("final_acceptance", "construction_stage", "final_acceptance"),
      node("handover", "confirmation", "final_acceptance"),
      node("end", "end"),
    ];

    const result = validateGraph({
      definition: definition("construction_main", "construction"),
      nodes,
      edges: linearEdges(nodes),
    });

    expect(result.valid).toBe(true);
  });

  test("rejects enabled receivable plan without a valid amount rule", () => {
    const nodes = [
      node("start", "start"),
      node("started", "construction_stage", "construction_start"),
      paymentNode("water_electricity_payment", "stage_2", {
        receivable_plan_enabled: true,
        receivable_amount_mode: "signed_amount_percentage",
        receivable_percentage: null,
      }),
      node("end", "end"),
    ];

    const result = validateGraph({
      definition: definition("construction_main", "construction"),
      nodes,
      edges: linearEdges(nodes),
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "payment_collection_receivable_percentage_invalid",
      nodeKey: "water_electricity_payment",
    }));
  });

  test("rejects construction workflow with a disconnected payment gate", () => {
    const nodes = [
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
    const nodeByKey = new Map(nodes.map((item) => [item.node_key, item]));
    const mustNode = (nodeKey: string) => {
      const matchedNode = nodeByKey.get(nodeKey);
      if (!matchedNode) {
        throw new Error(`Missing node ${nodeKey}`);
      }
      return matchedNode;
    };
    const mainlineWithoutPayment = nodes.filter((item) =>
      item.node_key !== "water_electricity_payment"
    );

    const result = validateGraph({
      definition: definition("construction_main", "construction"),
      nodes,
      edges: [
        ...linearEdges(mainlineWithoutPayment),
        edge(
          mustNode("water_electricity_payment"),
          mustNode("procedure_tiling"),
        ),
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.message)).toContain(
      "非开始节点需要至少一条入边",
    );
    expect(result.issues.find((issue) =>
      issue.code === "node_incoming_required"
    )?.nodeKey).toBe("water_electricity_payment");
  });

  test("rejects construction workflow with duplicate construction start status semantics", () => {
    const nodes = [
      node("start", "start"),
      node("construction_start_duplicate", "construction_stage", "construction_start", {
        stage_type: "construction_start",
      }),
      node("started", "construction_stage", "construction_start", {
        stage_type: "construction_start",
      }),
      procedureNode("procedure_demolition", "demolition"),
      procedureNode("procedure_plumbing_electrical", "plumbing_electrical"),
      procedureNode("procedure_tiling", "tiling"),
      procedureNode("procedure_woodwork", "woodwork"),
      procedureNode("procedure_painting", "painting"),
      procedureNode("procedure_installation", "installation"),
      node("final_acceptance", "construction_stage", "final_acceptance"),
      node("handover", "confirmation", "final_acceptance"),
      node("end", "end"),
    ];

    const result = validateGraph({
      definition: definition("construction_main", "construction"),
      nodes,
      edges: linearEdges(nodes),
    });

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.message)).toContain(
      "施工流程主状态节点重复: 确认开工(construction_start_duplicate、started)",
    );
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
  config: WorkflowNodeConfig = { required_permissions: [] },
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

function paymentNode(
  nodeKey: string,
  paymentType: string,
  config: Partial<WorkflowNodeConfig> = {},
) {
  return node(nodeKey, "confirmation", "payment_collection", {
    required_permissions: ["finance.payment.confirm"],
    finance_type: "payment_collection",
    payment_type: paymentType as "deposit" | "stage_1" | "stage_2" | "stage_3" | "add_on",
    requirement_mode: "any_confirmed",
    required_percentage: null,
    finance_reviewer_employee_id: null,
    receivable_plan_enabled: false,
    receivable_amount_mode: "signed_amount_percentage",
    receivable_fixed_amount: null,
    receivable_percentage: null,
    receivable_due_offset_days: 0,
    receivable_due_date_rule: "node_entered_at",
    receivable_title: null,
    ...config,
  });
}

function linearEdges(nodes: WorkflowNode[]): WorkflowEdge[] {
  return nodes.slice(0, -1).map((source, index) => {
    const target = nodes[index + 1];
    if (!target) {
      throw new Error(`Missing target node after ${source.node_key}`);
    }
    return edge(source, target);
  });
}

function edge(source: WorkflowNode, target: WorkflowNode): WorkflowEdge {
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
