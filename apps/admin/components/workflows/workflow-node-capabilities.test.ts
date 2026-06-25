import { describe, expect, test } from "bun:test";
import type { WorkflowNode } from "@/components/workflows/workflow-types";
import {
  applyWorkflowConstructionStageKind,
  applyWorkflowNodeCapability,
  getWorkflowNodeDisplayLabels,
} from "./workflow-node-capabilities";

const NOW = "2026-06-17T00:00:00.000Z";

describe("applyWorkflowConstructionStageKind", () => {
  test("uses the construction template node key for construction capability", () => {
    const result = applyWorkflowNodeCapability({
      node: baseNode(),
      capability: "construction",
      usedNodeKeys: ["start"],
    });

    expect(result.node_key).toBe("started");
    expect(result.business_kind).toBe("construction_start");
    expect(result.config).toMatchObject({
      required_permissions: [],
      stage_type: "construction_start",
    });
  });

  test("uses the construction template node key for construction start", () => {
    const result = applyWorkflowConstructionStageKind({
      node: baseNode(),
      stageKind: "construction_start",
      usedNodeKeys: ["start"],
    });

    expect(result.node_key).toBe("started");
    expect(result.business_kind).toBe("construction_start");
    expect(result.config).toMatchObject({
      required_permissions: [],
      stage_type: "construction_start",
    });
  });

  test("enables report config for final acceptance construction stage", () => {
    const result = applyWorkflowConstructionStageKind({
      node: baseNode(),
      stageKind: "final_acceptance",
      usedNodeKeys: ["start"],
    });

    expect(result.node_key).toBe("final_acceptance");
    expect(result.business_kind).toBe("final_acceptance");
    expect(result.config).toMatchObject({
      required_permissions: [],
      stage_type: "final_acceptance",
      final_acceptance_report_enabled: true,
    });
  });
});

describe("applyWorkflowNodeCapability", () => {
  test("uses applicant department manager by default for expense approval nodes", () => {
    const result = applyWorkflowNodeCapability({
      node: baseNode(),
      capability: "approval",
      usedNodeKeys: ["start"],
    });

    expect(result.config).toMatchObject({
      approval_type: "expense_approval",
      assignee_rule: "applicant_department_manager",
    });
  });
});

describe("getWorkflowNodeDisplayLabels", () => {
  test("uses the configured node title as approval node label", () => {
    expect(
      getWorkflowNodeDisplayLabels({
        ...baseNode(),
        node_type: "approval",
        business_kind: "expense_approval",
        title: "经理审批",
        config: {
          required_permissions: ["expense_request.approve_manager"],
          approval_type: "expense_approval",
        },
      }).specificLabel,
    ).toBe("经理审批");
  });
});

function baseNode(): WorkflowNode {
  return {
    id: "node-1",
    tenant_id: "tenant-1",
    definition_id: "definition-1",
    node_key: "workflow_step",
    node_type: "business",
    business_kind: "customer_lead",
    title: "节点",
    description: null,
    position: { x: 0, y: 0 },
    config: { required_permissions: [] },
    sort_order: 10,
    created_at: NOW,
    updated_at: NOW,
  };
}
