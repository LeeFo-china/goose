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

describe("validateWorkflowPublishGraph business tracks", () => {
  test("rejects customer design workflow that contains project signing nodes", () => {
    const nodes = [
      node("start", "start"),
      node("potential", "business", "customer_lead"),
      node("following", "business", "phone_follow_up"),
      node("arrived", "business", "store_visit"),
      node("designing", "business", "design"),
      node("signed", "business", "contract"),
      node("end", "end"),
    ];

    expect(() =>
      validateWorkflowPublishGraph({
        definition: definition("customer_main", "sales"),
        nodes,
        edges: linearEdges(nodes),
      })
    ).toThrow(/客户设计流程不能包含项目签约节点/);
  });

  test("allows project signing workflow with deposit payment gate before signing", () => {
    const nodes = [
      node("start", "start"),
      node("designing", "business", "design"),
      node("proposal_confirmed", "business", "design"),
      node("payment_deposit", "confirmation", "payment_collection", {
        required_permissions: ["finance.payment.confirm"],
        finance_type: "payment_collection",
        payment_type: "deposit",
        requirement_mode: "any_confirmed",
        required_percentage: null,
        finance_reviewer_employee_id: null,
      }),
      node("signed", "business", "contract"),
      node("design_finalized", "business", "design"),
      node("pending_start", "business", "construction_start"),
      node("end", "end"),
    ];

    const result = validateWorkflowPublishGraph({
      definition: definition("project_signing", "construction"),
      nodes,
      edges: linearEdges(nodes),
    });

    expect(result.valid).toBe(true);
  });

  test("allows project signing workflow with stage one payment gate before scheduled start", () => {
    const nodes = [
      node("start", "start"),
      node("designing", "business", "design"),
      node("proposal_confirmed", "business", "design"),
      node("signed", "business", "contract"),
      node("design_finalized", "business", "design"),
      node("payment_stage_1", "confirmation", "payment_collection", {
        required_permissions: ["finance.payment.confirm"],
        finance_type: "payment_collection",
        payment_type: "stage_1",
        requirement_mode: "any_confirmed",
        required_percentage: null,
        finance_reviewer_employee_id: null,
      }),
      node("pending_start", "business", "construction_start"),
      node("end", "end"),
    ];

    const result = validateWorkflowPublishGraph({
      definition: definition("project_signing", "construction"),
      nodes,
      edges: linearEdges(nodes),
    });

    expect(result.valid).toBe(true);
  });

  test("rejects project signing payment gates before proposal confirmation", () => {
    const nodes = [
      node("start", "start"),
      node("payment_deposit", "confirmation", "payment_collection", {
        required_permissions: ["finance.payment.confirm"],
        finance_type: "payment_collection",
        payment_type: "deposit",
        requirement_mode: "any_confirmed",
        required_percentage: null,
        finance_reviewer_employee_id: null,
      }),
      node("designing", "business", "design"),
      node("proposal_confirmed", "business", "design"),
      node("signed", "business", "contract"),
      node("design_finalized", "business", "design"),
      node("pending_start", "business", "construction_start"),
      node("end", "end"),
    ];

    expect(() =>
      validateWorkflowPublishGraph({
        definition: definition("project_signing", "construction"),
        nodes,
        edges: linearEdges(nodes),
      })
    ).toThrow(/项目签约流程收定金节点必须在方案确认之后/);
  });

  test("rejects unsupported project signing payment collection type", () => {
    const nodes = [
      node("start", "start"),
      node("designing", "business", "design"),
      node("proposal_confirmed", "business", "design"),
      node("payment_stage_2", "confirmation", "payment_collection", {
        required_permissions: ["finance.payment.confirm"],
        finance_type: "payment_collection",
        payment_type: "stage_2",
        requirement_mode: "any_confirmed",
        required_percentage: null,
        finance_reviewer_employee_id: null,
      }),
      node("signed", "business", "contract"),
      node("design_finalized", "business", "design"),
      node("pending_start", "business", "construction_start"),
      node("end", "end"),
    ];

    expect(() =>
      validateWorkflowPublishGraph({
        definition: definition("project_signing", "construction"),
        nodes,
        edges: linearEdges(nodes),
      })
    ).toThrow(/项目签约流程收款节点只允许定金或开工前款/);
  });

  test("rejects project signing stage one payment before contract signing", () => {
    const nodes = [
      node("start", "start"),
      node("designing", "business", "design"),
      node("proposal_confirmed", "business", "design"),
      node("payment_stage_1", "confirmation", "payment_collection", {
        required_permissions: ["finance.payment.confirm"],
        finance_type: "payment_collection",
        payment_type: "stage_1",
        requirement_mode: "any_confirmed",
        required_percentage: null,
        finance_reviewer_employee_id: null,
      }),
      node("signed", "business", "contract"),
      node("design_finalized", "business", "design"),
      node("pending_start", "business", "construction_start"),
      node("end", "end"),
    ];

    expect(() =>
      validateWorkflowPublishGraph({
        definition: definition("project_signing", "construction"),
        nodes,
        edges: linearEdges(nodes),
      })
    ).toThrow(/项目签约流程开工前款节点必须在项目签约之后/);
  });

  test("rejects project signing deposit payment after contract signing", () => {
    const nodes = [
      node("start", "start"),
      node("designing", "business", "design"),
      node("proposal_confirmed", "business", "design"),
      node("signed", "business", "contract"),
      node("payment_deposit", "confirmation", "payment_collection", {
        required_permissions: ["finance.payment.confirm"],
        finance_type: "payment_collection",
        payment_type: "deposit",
        requirement_mode: "any_confirmed",
        required_percentage: null,
        finance_reviewer_employee_id: null,
      }),
      node("design_finalized", "business", "design"),
      node("pending_start", "business", "construction_start"),
      node("end", "end"),
    ];

    expect(() =>
      validateWorkflowPublishGraph({
        definition: definition("project_signing", "construction"),
        nodes,
        edges: linearEdges(nodes),
      })
    ).toThrow(/项目签约流程收定金节点必须在方案确认之后、项目签约之前/);
  });

  test("rejects project signing workflow when mainline order is broken", () => {
    const nodes = [
      node("start", "start"),
      node("signed", "business", "contract"),
      node("designing", "business", "design"),
      node("proposal_confirmed", "business", "design"),
      node("design_finalized", "business", "design"),
      node("pending_start", "business", "construction_start"),
      node("end", "end"),
    ];

    expect(() =>
      validateWorkflowPublishGraph({
        definition: definition("project_signing", "construction"),
        nodes,
        edges: linearEdges(nodes),
      })
    ).toThrow(/项目签约流程必须按标准顺序推进/);
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

    expect(() =>
      validateWorkflowPublishGraph({
        definition: definition("project_signing", "construction"),
        nodes,
        edges: linearEdges(nodes),
      })
    ).toThrow(/项目签约流程主状态节点重复/);
  });

  test("rejects customer design workflow that contains payment collection gates", () => {
    const nodes = [
      node("start", "start"),
      node("potential", "business", "customer_lead"),
      node("following", "business", "phone_follow_up"),
      node("payment_deposit", "confirmation", "payment_collection", {
        required_permissions: ["finance.payment.confirm"],
        finance_type: "payment_collection",
        payment_type: "deposit",
        requirement_mode: "any_confirmed",
        required_percentage: null,
        finance_reviewer_employee_id: null,
      }),
      node("arrived", "business", "store_visit"),
      node("designing", "business", "design"),
      node("end", "end"),
    ];

    expect(() =>
      validateWorkflowPublishGraph({
        definition: definition("customer_main", "sales"),
        nodes,
        edges: linearEdges(nodes),
      })
    ).toThrow(/客户设计流程不能包含项目签约节点/);
  });

  test("rejects project signing workflow that contains customer stage nodes", () => {
    const nodes = [
      node("start", "start"),
      node("designing", "business", "design"),
      node("following", "business", "phone_follow_up"),
      node("proposal_confirmed", "business", "design"),
      node("signed", "business", "contract"),
      node("design_finalized", "business", "design"),
      node("pending_start", "business", "construction_start"),
      node("end", "end"),
    ];

    expect(() =>
      validateWorkflowPublishGraph({
        definition: definition("project_signing", "construction"),
        nodes,
        edges: linearEdges(nodes),
      })
    ).toThrow(/项目签约流程不能包含客户节点/);
  });

  test("rejects project pause and invalid as construction mainline nodes", () => {
    const nodes = [
      node("start", "start"),
      node("started", "construction_stage", "construction_start"),
      node("on_hold", "business", null, { required_permissions: ["project.update"] }),
      node("invalid", "end"),
      node("end", "end"),
    ];

    expect(() =>
      validateWorkflowPublishGraph({
        definition: definition("construction_main", "construction"),
        nodes,
        edges: linearEdges(nodes),
      })
    ).toThrow(/施工流程异常动作不能作为主线节点/);
  });

  test("rejects construction workflow that contains customer stage nodes", () => {
    const nodes = [
      node("start", "start"),
      node("started", "construction_stage", "construction_start"),
      node("following", "business", "phone_follow_up"),
      procedureNode("procedure_demolition", "demolition"),
      procedureNode("procedure_plumbing_electrical", "plumbing_electrical"),
      paymentNode("payment_stage_2", "stage_2"),
      procedureNode("procedure_tiling", "tiling"),
      procedureNode("procedure_woodwork", "woodwork"),
      paymentNode("payment_stage_3", "stage_3"),
      procedureNode("procedure_painting", "painting"),
      procedureNode("procedure_installation", "installation"),
      node("final_acceptance", "construction_stage", "final_acceptance"),
      node("handover", "confirmation", "final_acceptance"),
      node("end", "end"),
    ];

    expect(() =>
      validateWorkflowPublishGraph({
        definition: definition("construction_main", "construction"),
        nodes,
        edges: linearEdges(nodes),
      })
    ).toThrow(/施工流程不能包含客户节点/);
  });

  test("allows construction workflow without fixed payment gate node keys", () => {
    const nodes = [
      node("start", "start"),
      node("started", "construction_stage", "construction_start"),
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

    const result = validateWorkflowPublishGraph({
      definition: definition("construction_main", "construction"),
      nodes,
      edges: linearEdges(nodes),
    });

    expect(result.valid).toBe(true);
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

    const result = validateWorkflowPublishGraph({
      definition: definition("construction_main", "construction"),
      nodes,
      edges: linearEdges(nodes),
    });

    expect(result.valid).toBe(true);
  });

  test("rejects construction workflow with duplicate construction start status semantics", () => {
    const nodes = [
      node("start", "start"),
      node("construction_start_duplicate", "construction_stage", "construction_start", { stage_type: "construction_start" }),
      node("started", "construction_stage", "construction_start", { stage_type: "construction_start" }),
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

    expect(() =>
      validateWorkflowPublishGraph({
        definition: definition("construction_main", "construction"),
        nodes,
        edges: linearEdges(nodes),
      })
    ).toThrow(/施工流程主状态节点重复/);
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
