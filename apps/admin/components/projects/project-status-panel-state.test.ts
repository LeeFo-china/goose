import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  buildProjectActionViews,
} from "@/components/projects/project-mutation-utils";

describe("project status panel workflow boundary", () => {
  test("does not render local blocked actions when backend workflow actions are empty", () => {
    expect(buildProjectActionViews([])).toEqual([]);
  });

  test("does not map workflow node keys to legacy project status actions locally", () => {
    const source = readFileSync(
      new URL("./project-status-panel-state.ts", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("PROJECT_WORKFLOW_EFFECT_BY_NODE_KEY");
    expect(source).not.toContain("isProjectStatusAction");
    expect(source).not.toContain("resolveProjectWorkflowActionTransition");
    expect(source).not.toContain("sign_contract");
    expect(source).not.toContain("schedule_construction");
    const utilsSource = readFileSync(
      new URL("./project-mutation-utils.ts", import.meta.url),
      "utf8",
    );
    expect(utilsSource).not.toContain("sign_contract");
    expect(utilsSource).not.toContain("confirm_proposal");
    const workflowBusinessActionsSource = readFileSync(
      new URL("../workflows/workflow-business-actions.ts", import.meta.url),
      "utf8",
    );
    expect(workflowBusinessActionsSource).not.toContain("ProjectWorkflowActionConfig");
    expect(workflowBusinessActionsSource).not.toContain("resolveProjectWorkflowActionTransition");
  });
});
