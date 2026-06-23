import { describe, expect, test } from "bun:test";
import type { WorkflowTimelineNode } from "@/services/project-workflow-progress";
import { attachWorkflowActionsToTimelineNodes } from "./workflow-subjects";

const baseNode = {
  node_title: "节点",
  node_type: "procedure",
  business_kind: "procedure_template",
  group: {
    key: "construction",
    label: "施工阶段",
    order: 20,
  },
  status: "pending",
  display: {
    label: "节点",
    status_label: "待处理",
    status_variant: "secondary",
  },
  attributes: {},
  actions: [],
} satisfies Omit<WorkflowTimelineNode, "node_key">;

describe("workflow subject state timeline contract", () => {
  test("attaches visible workflow actions to matching timeline nodes", () => {
    const nodes: WorkflowTimelineNode[] = [
      {
        ...baseNode,
        node_key: "procedure_plumbing_electrical",
      },
      {
        ...baseNode,
        node_key: "procedure_tiling",
      },
    ];

    const result = attachWorkflowActionsToTimelineNodes(nodes, [{
      key: "complete_procedure",
      label: "瓦工施工",
      business_domain: "project_procedure",
      business_action: "complete_procedure",
      requires_reason: false,
      task_id: "task-1",
      node_key: "procedure_tiling",
      node_type: "procedure",
      disabled: false,
      output_fields: [],
    }]);

    expect(result[0]?.actions).toEqual([]);
    expect(result[1]?.actions).toMatchObject([{
      key: "complete_procedure",
      task_id: "task-1",
      node_key: "procedure_tiling",
      business_action: "complete_procedure",
      output_fields: [],
    }]);
    expect(nodes[1]?.actions).toEqual([]);
  });
});
