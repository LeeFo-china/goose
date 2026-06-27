import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readWorkflowManagementSources() {
  return {
    page: readFileSync(
      new URL("../../app/(console)/workflows/page.tsx", import.meta.url),
      "utf8",
    ),
    shell: readFileSync(
      new URL("./workflow-list-shell.tsx", import.meta.url),
      "utf8",
    ),
    table: readFileSync(
      new URL("./workflow-table.tsx", import.meta.url),
      "utf8",
    ),
    actions: readFileSync(
      new URL("./workflow-list-actions.tsx", import.meta.url),
      "utf8",
    ),
  };
}

describe("Workflow management page layout", () => {
  test("keeps list state inside a project-style fixed-height workspace", () => {
    const { page, shell } = readWorkflowManagementSources();

    expect(page).toContain("h-[calc(100vh-6.5625rem)]");
    expect(page).toContain("min-h-0 flex-col gap-5 overflow-hidden");

    expect(shell).toContain("flex min-h-0 flex-1 flex-col");
    expect(shell).toContain("Card className=\"flex min-h-0 flex-1 flex-col overflow-hidden shadow-none\"");
    expect(shell).toContain('data-testid="workflow-list-table-viewport"');
    expect(shell).toContain("tableViewportRef");
    expect(shell).toContain("calculateWorkflowListPageSize");
    expect(shell).toContain("calculateWorkflowListRowHeight");
    expect(shell).toContain("getBoundingClientRect().height");
    expect(shell).toContain("--workflow-table-row-height");
    expect(shell).toContain("min-h-0 flex-1 overflow-auto");
    expect(shell).toContain("pageSize={pagination.pageSize}");
  });

  test("keeps workflow table rows stable for viewport-based pagination", () => {
    const { shell, table } = readWorkflowManagementSources();

    expect(table).toContain("WORKFLOW_TABLE_ROW_HEIGHT_CLASS_NAME");
    expect(table).toContain("h-[var(--workflow-table-row-height,88px)]");
    expect(table).toContain("rowClassName={() => WORKFLOW_TABLE_ROW_HEIGHT_CLASS_NAME}");
    expect(shell).toContain("WORKFLOW_TABLE_HEADER_HEIGHT");
  });

  test("keeps workflow table within the list viewport without horizontal scrolling", () => {
    const { table } = readWorkflowManagementSources();

    expect(table).toContain("DataTable");
    expect(table).toContain('tableClassName="border-t-0 table-fixed"');
    expect(table).not.toContain("min-w-[1270px]");
    expect(table).not.toContain("overflow-x-auto");
  });

  test("uses a single refresh spinner for workflow list navigation", () => {
    const { shell, actions } = readWorkflowManagementSources();

    expect(shell.match(/animate-spin/g)?.length ?? 0).toBe(1);
    expect(actions).not.toContain("animate-spin");
    expect(actions).not.toContain("Loader2");
  });

  test("centers the workflow list refresh spinner inside the loading mask", () => {
    const { shell } = readWorkflowManagementSources();

    expect(shell).toContain(
      "absolute inset-0 flex items-center justify-center bg-background/65 backdrop-blur-[1px]",
    );
    expect(shell).not.toContain("items-start justify-center bg-background/65 pt-8");
  });

  test("preserves measured page size across workflow filters and pagination", () => {
    const { page, actions } = readWorkflowManagementSources();
    const filterUtilsUrl = new URL("./workflow-list-filter-utils.ts", import.meta.url);

    expect(page).toContain("normalizePageSize");
    expect(page).toContain("pageSize: String(pageSize)");
    expect(page).not.toContain('pageSize: "20"');
    expect(actions).toContain("pageSize,");
    expect(actions).toContain("buildWorkflowsHref");
    expect(existsSync(filterUtilsUrl)).toBe(true);
    if (!existsSync(filterUtilsUrl)) return;

    const filterUtils = readFileSync(filterUtilsUrl, "utf8");
    expect(filterUtils).toContain("pageSize?: number");
    expect(filterUtils).toContain('params.set("pageSize", String(input.pageSize))');
  });

  test("clips the first workflow response to the measured viewport page size", () => {
    const { shell } = readWorkflowManagementSources();

    expect(shell).toContain("useLayoutEffect");
    expect(shell).toContain("measuredWorkflowPageSize");
    expect(shell).toContain("visibleWorkflows");
    expect(shell).toContain("workflows.slice(0, measuredWorkflowPageSize)");
    expect(shell).toContain("当前显示 {visibleWorkflows.length} 条");
  });

  test("keeps workflow version viewing from increasing table row count", () => {
    const { table } = readWorkflowManagementSources();

    expect(table).toContain("DialogContent");
    expect(table).toContain("WorkflowVersionInlineList");
    expect(table).not.toContain("expandedWorkflowId");
    expect(table).not.toContain("<Fragment");
    expect(table).not.toContain("colSpan={7}");
  });

  test("defines workflow viewport page size math", async () => {
    const moduleUrl = new URL("./workflow-list-page-size.ts", import.meta.url);

    expect(existsSync(moduleUrl)).toBe(true);
    if (!existsSync(moduleUrl)) return;

    const {
      calculateWorkflowListPageSize,
      calculateWorkflowListRowHeight,
    } = await import("./workflow-list-page-size");

    expect(calculateWorkflowListPageSize({
      viewportHeight: 920,
      headerHeight: 40,
      rowHeight: 88,
    })).toBe(10);
    expect(calculateWorkflowListRowHeight({
      viewportHeight: 920,
      headerHeight: 40,
      pageSize: 10,
    })).toBeCloseTo(88);
  });
});
