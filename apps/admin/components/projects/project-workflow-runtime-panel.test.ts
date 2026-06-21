import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

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
