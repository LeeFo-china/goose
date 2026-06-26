import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function readProjectManagementSources() {
  return {
    page: readFileSync(
      new URL("../../app/(console)/projects/page.tsx", import.meta.url),
      "utf8",
    ),
    loading: readFileSync(
      new URL("../../app/(console)/projects/loading.tsx", import.meta.url),
      "utf8",
    ),
    shell: readFileSync(
      new URL("./projects-client-shell.tsx", import.meta.url),
      "utf8",
    ),
  };
}

describe("Project management page layout", () => {
  test("keeps list and loading states inside a fixed-height workspace", () => {
    const { page, loading, shell } = readProjectManagementSources();

    expect(page).toContain("h-[calc(100vh-6.5625rem)]");
    expect(page).toContain("min-h-0 flex-col gap-5 overflow-hidden");
    expect(page).not.toContain("min-h-[calc(100vh-6.5rem)]");

    expect(loading).toContain("h-[calc(100vh-6.5625rem)]");
    expect(loading).toContain("min-h-0 flex-col gap-5 overflow-hidden");
    expect(loading).toContain("flex min-h-0 flex-1 flex-col overflow-hidden shadow-none");
    expect(loading).toContain("min-h-0 flex-1 overflow-hidden");

    expect(shell).toContain("flex min-h-0 flex-1 flex-col");
    expect(shell).toContain("Card className=\"flex min-h-0 flex-1 flex-col overflow-hidden shadow-none\"");
    expect(shell).toContain('data-testid="project-list-table-viewport"');
    expect(shell).toContain("tableViewportRef");
    expect(shell).toContain("calculateProjectListPageSize");
    expect(shell).toContain("getBoundingClientRect().height");
    expect(shell).toContain("min-h-0 flex-1 overflow-auto");
    expect(shell).toContain("pageSize={pagination.pageSize}");
  });

  test("keeps project table rows stable for viewport-based pagination", () => {
    const { shell } = readProjectManagementSources();
    const table = readFileSync(
      new URL("./projects-table.tsx", import.meta.url),
      "utf8",
    );

    expect(table).toContain("PROJECT_TABLE_ROW_HEIGHT_CLASS_NAME");
    expect(table).toContain("rowClassName={() => PROJECT_TABLE_ROW_HEIGHT_CLASS_NAME}");
    expect(shell).toContain("PROJECT_TABLE_HEADER_HEIGHT");
  });
});
