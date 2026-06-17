import { describe, expect, test } from "bun:test";
import type { WorkflowNode } from "@/components/workflows/workflow-types";
import {
  applyWorkflowConstructionStageKind,
  applyWorkflowNodeCapability,
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
