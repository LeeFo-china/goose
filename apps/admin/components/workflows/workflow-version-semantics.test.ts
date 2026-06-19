import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  getWorkflowRuntimeVersionState,
  WORKFLOW_VERSION_EFFECT_COPY,
} from "./workflow-version-semantics";

describe("workflow version semantics", () => {
  test("labels running instances by active workflow version", () => {
    expect(getWorkflowRuntimeVersionState({
      activeVersionId: "version-3",
      instanceVersionId: "version-2",
      status: "running",
    })).toEqual({
      label: "旧版本",
      variant: "warning",
      stale: true,
    });

    expect(getWorkflowRuntimeVersionState({
      activeVersionId: "version-3",
      instanceVersionId: "version-3",
      status: "running",
    })).toEqual({
      label: "当前版本",
      variant: "success",
      stale: false,
    });
  });

  test("keeps version effect copy explicit in designer and publish flow", () => {
    const designerSource = readFileSync(
      new URL("./workflow-designer-shell.tsx", import.meta.url),
      "utf8",
    );
    const tableSource = readFileSync(
      new URL("./workflow-table.tsx", import.meta.url),
      "utf8",
    );
    const requestsSource = readFileSync(
      new URL("./workflow-requests.ts", import.meta.url),
      "utf8",
    );

    expect(WORKFLOW_VERSION_EFFECT_COPY.publishConfirm).toContain("只影响新创建或受控重建的实例");
    expect(WORKFLOW_VERSION_EFFECT_COPY.versionPanelDescription).toContain("运行中的实例数量");
    expect(designerSource).toContain("WorkflowVersionEffectNotice");
    expect(designerSource).toContain("WorkflowVersionListPanel");
    expect(tableSource).toContain("WorkflowVersionInlineList");
    expect(tableSource).toContain("expandedWorkflowId");
    expect(designerSource).toContain("ConfirmActionDialog");
    expect(designerSource).toContain("WORKFLOW_VERSION_EFFECT_COPY.publishConfirm");
    expect(requestsSource).toContain("fetchWorkflowVersions");
    expect(requestsSource).toContain("/versions?");
  });
});
