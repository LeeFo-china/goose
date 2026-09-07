import { describe, expect, test } from "bun:test";
import { appendPublicProjectWorkflowStatusLabels } from "./public-workflow-status";

describe("appendPublicProjectWorkflowStatusLabels", () => {
  test("uses the running workflow node title for the matching tenant project", () => {
    const rows = appendPublicProjectWorkflowStatusLabels({
      rows: [projectRow()],
      states: [workflowState({ current_node_title: "  水电  " })],
    });

    expect(rows[0]).toMatchObject({
      id: "project-1",
      status: "constructing",
      display_status_label: "水电",
    });
    expect(rows[0]).not.toHaveProperty("current_node_key");
    expect(rows[0]).not.toHaveProperty("current_node_title");
    expect(rows[0]).not.toHaveProperty("actions");
  });

  test("does not attach a state from another tenant", () => {
    const rows = appendPublicProjectWorkflowStatusLabels({
      rows: [projectRow()],
      states: [workflowState({
        tenant_id: "tenant-2",
        current_node_title: "木工",
      })],
    });

    expect(rows[0]?.display_status_label).toBe("施工中");
  });

  test("uses a completed label instead of exposing a terminal node", () => {
    const completed = appendPublicProjectWorkflowStatusLabels({
      rows: [projectRow()],
      states: [workflowState({
        instance_status: "completed",
        current_node_key: "end",
        current_node_title: "结束",
      })],
    });
    const terminal = appendPublicProjectWorkflowStatusLabels({
      rows: [{ ...projectRow(), status: "acceptance" }],
      states: [workflowState({
        current_node_key: "end",
        current_node_title: "结束",
      })],
    });

    expect(completed[0]?.display_status_label).toBe("已完成");
    expect(terminal[0]?.display_status_label).toBe("竣工验收");
  });

  test("falls back to the project status label or null", () => {
    const rows = appendPublicProjectWorkflowStatusLabels({
      rows: [
        projectRow(),
        { ...projectRow(), id: "project-2", status: "unknown" },
      ],
      states: [],
    });

    expect(rows[0]?.display_status_label).toBe("施工中");
    expect(rows[1]?.display_status_label).toBeNull();
  });
});

function projectRow() {
  return {
    id: "project-1",
    tenant_id: "tenant-1",
    status: "constructing",
  };
}

function workflowState(overrides: Record<string, unknown> = {}) {
  return {
    tenant_id: "tenant-1",
    subject_id: "project-1",
    instance_status: "running",
    current_node_key: "procedure_plumbing_electrical",
    current_node_title: "水电",
    ...overrides,
  };
}
