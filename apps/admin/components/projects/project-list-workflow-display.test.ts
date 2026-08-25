import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  projectStatusStageSummary,
  projectWorkflowSummary,
} from "./project-list-workflow-display";

describe("projectWorkflowSummary", () => {
  test("uses connected workflow title before current node details", () => {
    expect(projectWorkflowSummary({
      workflow_progress: {
        workflow_title: "标准施工流程",
        current_group_label: "施工阶段",
        current_node_title: "水电",
        instance_status: "running",
      },
    })).toEqual({
      workflowTitle: "标准施工流程",
      groupLabel: "施工阶段",
      nodeLabel: "水电",
      statusLabel: "进行中",
    });
  });

  test("falls back without guessing from legacy project status", () => {
    expect(projectWorkflowSummary({
      status: "constructing",
    })).toEqual({
      workflowTitle: "未接入流程",
      groupLabel: "未绑定流程",
      nodeLabel: "未定位当前节点",
      statusLabel: "未知",
    });
  });

  test("builds a compact stage summary for the project list status column", () => {
    expect(projectStatusStageSummary({
      status: "constructing",
      workflow_progress: {
        workflow_title: "标准施工流程",
        current_group_label: "施工阶段",
        current_node_title: "水电",
        instance_status: "running",
      },
    })).toEqual("水电进行中");

    expect(projectStatusStageSummary({
      status: "acceptance",
      workflow_progress: {
        workflow_title: "标准施工流程",
        current_group_label: "施工阶段",
        current_node_title: "竣工验收",
        instance_status: "completed",
      },
    })).toBeNull();
  });

  test("wires the compact stage summary into the project table status column", () => {
    const table = readFileSync(
      new URL("./projects-table.tsx", import.meta.url),
      "utf8",
    );

    expect(table).toContain("projectStatusStageSummary(row.original)");
    expect(table).toContain("{stageSummary}");
  });
});
