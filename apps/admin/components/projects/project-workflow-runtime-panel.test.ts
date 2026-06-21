import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  timelineNodeAttributes,
} from "@/components/projects/project-workflow-runtime-view";

function readRuntimePanelSources() {
  return [
    "./project-workflow-runtime-panel.tsx",
    "./project-workflow-runtime-view.tsx",
  ].map((file) => readFileSync(new URL(file, import.meta.url), "utf8")).join("\n");
}

describe("ProjectWorkflowRuntimePanel read-only boundary", () => {
  test("uses project subject state as workflow runtime source", () => {
    const source = readRuntimePanelSources();

    expect(source).toContain("/workflow-subjects/project/${project.id}/state");
    expect(source).toContain("timeline_nodes");
    expect(source).toContain("currentNode?.actions");
    expect(source).toContain("finance_reviewer_employee_name");
    expect(source).toContain("等待财务人员确认");
    expect(source).not.toContain("fetchWorkflowDefinitions");
    expect(source).not.toContain("fetchWorkflowRuntimeInstances");
  });

  test("uses Chinese visible wording in project members status panel", () => {
    const panelSource = readFileSync(
      new URL("./project-workflow-runtime-panel.tsx", import.meta.url),
      "utf8",
    );
    const viewSource = readFileSync(
      new URL("./project-workflow-runtime-view.tsx", import.meta.url),
      "utf8",
    );

    expect(panelSource).not.toContain("Workflow 管理");
    expect(panelSource).not.toContain("Workflow 加载中");
    expect(panelSource).not.toContain("workflow 运行态");
    expect(panelSource).not.toContain("workflow task");
    expect(viewSource).not.toContain("timeline_nodes");
  });

  test("translates workflow attribute values instead of showing internal codes", () => {
    const attributes = timelineNodeAttributes({
      node_key: "procedure_plumbing_electrical",
      node_title: "水电",
      node_type: "procedure",
      business_kind: null,
      status: "blocked",
      attributes: {
        stage_code: "plumbing_electrical",
        payment_type: "stage_2",
        acceptance_status: "submitted",
        acceptance_enabled: true,
      },
      actions: [],
    });

    expect(attributes).toEqual([
      { key: "stage_code", label: "工序", value: "水电" },
      { key: "acceptance_status", label: "验收状态", value: "待领导复核" },
      { key: "acceptance_enabled", label: "阶段验收", value: "是" },
      { key: "payment_type", label: "收款类型", value: "中期进度款" },
    ]);
  });

  test("does not expose manual runtime start or rebuild controls", () => {
    const source = readFileSync(
      new URL("./project-workflow-runtime-panel.tsx", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("startWorkflowRuntimeInstance");
    expect(source).not.toContain("rebuildWorkflowRuntimeInstance");
    expect(source).not.toContain("启动项目流程");
    expect(source).not.toContain("重建实例");
    expect(source).not.toContain("项目状态校正");
  });
});
