import { describe, expect, test } from "bun:test";
import { workflowTemplateService } from "./workflow-templates";

describe("workflowTemplateService customer_main", () => {
  test("creates customer design workflow without project signing nodes", () => {
    const template = workflowTemplateService.getTemplateForTest({
      template_key: "customer_main",
    });

    expect(template.graph.nodes.map((node) => node.node_key)).toEqual([
      "start",
      "potential",
      "following",
      "arrived",
      "designing",
      "end",
    ]);
    expect(template.graph.edges.map((edge) => [
      edge.source_node_key,
      edge.target_node_key,
      edge.label,
    ])).toContainEqual(["potential", "following", "开始跟进"]);
  });
});

describe("workflowTemplateService project_signing", () => {
  test("creates project signing workflow from design to scheduled start", () => {
    const template = workflowTemplateService.getTemplateForTest({
      template_key: "project_signing",
    });

    expect(template.workflow_key).toBe("project_signing");
    expect(template.category).toBe("signing");
    expect(template.graph.nodes.map((node) => node.node_key)).toEqual([
      "start",
      "designing",
      "proposal_confirmed",
      "signed",
      "design_finalized",
      "pending_start",
      "end",
    ]);
    expect(template.graph.edges.map((edge) => [
      edge.source_node_key,
      edge.target_node_key,
    ])).toEqual([
      ["start", "designing"],
      ["designing", "proposal_confirmed"],
      ["proposal_confirmed", "signed"],
      ["signed", "design_finalized"],
      ["design_finalized", "pending_start"],
      ["pending_start", "end"],
    ]);
  });
});

describe("workflowTemplateService construction_main", () => {
  test("creates construction workflow with procedure and payment gates only", () => {
    const template = workflowTemplateService.getTemplateForTest({
      template_key: "construction_main",
    });

    expect(template.graph.nodes.map((node) => node.node_key)).toEqual([
      "start",
      "started",
      "procedure_demolition",
      "procedure_plumbing_electrical",
      "payment_stage_2",
      "procedure_tiling",
      "procedure_woodwork",
      "payment_stage_3",
      "procedure_painting",
      "procedure_installation",
      "final_acceptance",
      "handover",
      "end",
    ]);
    expect(template.graph.nodes.map((node) => node.node_key)).not.toContain("on_hold");
    expect(template.graph.nodes.map((node) => node.node_key)).not.toContain("invalid");
    expect(
      template.graph.nodes.find((node) => node.node_key === "payment_stage_2"),
    ).toMatchObject({
      node_type: "confirmation",
      business_kind: "payment_collection",
      config: {
        payment_type: "stage_2",
        required_permissions: ["finance.payment.confirm"],
      },
    });
    expect(
      template.graph.nodes.find((node) => node.node_key === "payment_stage_3"),
    ).toMatchObject({
      title: "工程尾款",
      node_type: "confirmation",
      business_kind: "payment_collection",
      config: {
        payment_type: "stage_3",
        required_permissions: ["finance.payment.confirm"],
      },
    });
    expect(template.graph.edges.map((edge) => [
      edge.source_node_key,
      edge.target_node_key,
      edge.label,
    ])).toContainEqual(["procedure_woodwork", "payment_stage_3", "工程尾款"]);
    expect(
      template.graph.nodes.find((node) => node.node_key === "procedure_woodwork"),
    ).toMatchObject({
      node_type: "procedure",
      business_kind: "procedure_template",
      config: {
        stage_key: "woodwork",
      },
    });
  });
});

describe("workflowTemplateService expense_approval", () => {
  test("uses applicant department manager for manager review", () => {
    const template = workflowTemplateService.getTemplateForTest({
      template_key: "expense_approval",
    });

    expect(
      template.graph.nodes.find((node) => node.node_key === "manager_review"),
    ).toMatchObject({
      title: "经理审批",
      node_type: "approval",
      business_kind: "expense_approval",
      config: {
        approval_type: "expense_approval",
        assignee_rule: "applicant_department_manager",
        required_permissions: ["expense_request.approve_manager"],
      },
    });
    expect(
      template.graph.nodes.find((node) => node.node_key === "finance_review"),
    ).toMatchObject({ title: "财务审批" });
    expect(
      template.graph.nodes.find((node) => node.node_key === "payment"),
    ).toMatchObject({ title: "出纳打款" });
  });
});
