import { describe, expect, test } from "bun:test";
import type { ProjectWorkflowProgress } from "@/services/project-workflow-progress";
import { resolveProjectLogNodeName } from "./node-name";

function workflowProgress(): ProjectWorkflowProgress {
  return {
    source: "workflow_runtime",
    instance_id: "instance-1",
    instance_status: "running",
    current_node_key: "procedure_plumbing_electrical",
    current_node_title: "水电布管布线",
    current_group_key: "construction",
    current_group_label: "施工阶段",
    current_group_order: 20,
    current_node_type: "procedure",
    current_business_kind: "procedure_template",
    current_stage_code: "plumbing_electrical",
    current_gate: null,
    timeline_nodes: [
      {
        node_key: "procedure_plumbing_electrical",
        node_title: "水电布管布线",
        node_type: "procedure",
        business_kind: "procedure_template",
        group: { key: "construction", label: "施工阶段", order: 20 },
        status: "current",
        display: {
          label: "水电布管布线",
          status_label: "当前",
          status_variant: "default",
        },
        attributes: { stage_code: "plumbing_electrical" },
        actions: [],
      },
    ],
    pending_task_count: 1,
    actions: [],
    warnings: [],
  };
}

describe("resolveProjectLogNodeName", () => {
  test("preserves a client supplied process name", () => {
    expect(resolveProjectLogNodeName({
      requestedNodeName: " 厨房墙砖铺贴 ",
      stageCode: "tiling",
      workflowProgress: workflowProgress(),
    })).toBe("厨房墙砖铺贴");
  });

  test("snapshots the matching current workflow process", () => {
    expect(resolveProjectLogNodeName({
      requestedNodeName: null,
      stageCode: "plumbing_electrical",
      workflowProgress: workflowProgress(),
    })).toBe("水电布管布线");
  });

  test("does not guess from a different workflow stage", () => {
    expect(resolveProjectLogNodeName({
      requestedNodeName: null,
      stageCode: "woodwork",
      workflowProgress: workflowProgress(),
    })).toBeNull();
  });

  test("keeps the name empty when workflow runtime is unavailable", () => {
    expect(resolveProjectLogNodeName({
      requestedNodeName: null,
      stageCode: "plumbing_electrical",
      workflowProgress: null,
    })).toBeNull();
  });
});
