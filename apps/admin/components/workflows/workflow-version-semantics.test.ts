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
    const versionPanelSource = readFileSync(
      new URL("./workflow-version-list-panel.tsx", import.meta.url),
      "utf8",
    );
    const inlineVersionSource = readFileSync(
      new URL("./workflow-version-inline-content.tsx", import.meta.url),
      "utf8",
    );
    const publishDialogSource = readFileSync(
      new URL("./workflow-publish-confirm-dialog.tsx", import.meta.url),
      "utf8",
    );
    const runtimePanelSource = readFileSync(
      new URL("./workflow-runtime-panel.tsx", import.meta.url),
      "utf8",
    );
    const requestsSource = readFileSync(
      new URL("./workflow-requests.ts", import.meta.url),
      "utf8",
    );

    expect(WORKFLOW_VERSION_EFFECT_COPY.publishConfirm).toContain("只影响新创建或受控重建的实例");
    expect(WORKFLOW_VERSION_EFFECT_COPY.versionPanelDescription).toContain("运行中的实例数量");
    expect(designerSource).not.toContain("WorkflowVersionEffectNotice");
    expect(designerSource).not.toContain("headerSummary");
    expect(designerSource).not.toContain("关键节点同步施工状态");
    expect(designerSource).not.toContain("租户业务、施工、工序和审批流程编排");
    expect(designerSource).toContain("WorkflowVersionListPanel");
    expect(designerSource).toContain("WorkflowPublishConfirmDialog");
    expect(tableSource).toContain("WorkflowVersionInlineList");
    expect(tableSource).toContain("expandedWorkflowId");
    expect(tableSource).toContain("getExpandedRowModel");
    expect(tableSource).toContain("colSpan={columns.length}");
    expect(tableSource).not.toContain("DialogContent");
    expect(versionPanelSource).toContain("WorkflowVersionInlineContent");
    expect(versionPanelSource).toContain("compact = false");
    expect(versionPanelSource).toContain("if (compact)");
    expect(versionPanelSource).toContain("compact\n      defaultOpen");
    expect(versionPanelSource).toContain("const FULL_VERSION_PAGE_SIZE = 20");
    expect(versionPanelSource).toContain("const INLINE_VERSION_PAGE_SIZE = 3");
    expect(versionPanelSource).toContain(
      "const pageSize = compact ? INLINE_VERSION_PAGE_SIZE : FULL_VERSION_PAGE_SIZE",
    );
    expect(inlineVersionSource).toContain('data-testid="workflow-version-inline-list"');
    expect(inlineVersionSource).toContain('data-testid="workflow-version-inline-item"');
    expect(inlineVersionSource).not.toContain('"rounded-md border bg-background"');
    expect(versionPanelSource).not.toContain('"rounded-md shadow-none"');
    expect(tableSource).not.toContain('className="px-4 py-4"');
    expect(tableSource).not.toContain('className="bg-card"');
    expect(inlineVersionSource).not.toContain("TableHeader");
    expect(inlineVersionSource).not.toContain("TableHead");
    expect(publishDialogSource).toContain("ConfirmActionDialog");
    expect(publishDialogSource).toContain("WORKFLOW_VERSION_EFFECT_COPY.publishConfirm");
    expect(publishDialogSource).toContain("版本标签");
    expect(publishDialogSource).toContain("versionLabel");
    expect(requestsSource).toContain("fetchWorkflowVersions");
    expect(requestsSource).toContain("/versions?");
    expect(requestsSource).toContain("version_label");
    expect(requestsSource).toContain("archiveWorkflowVersion");
    expect(requestsSource).toContain("archiveWorkflowRuntimeInstance");
    expect(requestsSource).toContain("activateWorkflowVersion");
    expect(versionPanelSource).toContain("归档版本");
    expect(versionPanelSource).toContain("设为当前版本");
    expect(versionPanelSource).toContain("version.version_label");
    expect(runtimePanelSource).toContain("归档实例");
  });
});
