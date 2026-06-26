import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function readOrganizationManagementSources() {
  return {
    page: readFileSync(
      new URL("../../app/(console)/organization/page.tsx", import.meta.url),
      "utf8",
    ),
    loading: readFileSync(
      new URL("../../app/(console)/organization/loading.tsx", import.meta.url),
      "utf8",
    ),
    tabs: readFileSync(
      new URL("./organization-tabs.tsx", import.meta.url),
      "utf8",
    ),
    shell: readFileSync(
      new URL("./departments-client-shell.tsx", import.meta.url),
      "utf8",
    ),
  };
}

describe("Organization management page layout", () => {
  test("keeps the page and loading state aligned with fixed-height list pages", () => {
    const { page, loading, tabs } = readOrganizationManagementSources();

    expect(page).toContain("h-[calc(100vh-6.5625rem)]");
    expect(page).toContain("min-h-0 flex-col gap-5 overflow-hidden");
    expect(page).not.toContain("<StatusAlert");
    expect(page).not.toContain("<Building2");

    expect(loading).toContain("h-[calc(100vh-6.5625rem)]");
    expect(loading).toContain("min-h-0 flex-col gap-5 overflow-hidden");
    expect(loading).toContain("flex min-h-0 flex-1 flex-col overflow-hidden shadow-none");
    expect(loading).toContain("min-h-0 flex-1 overflow-hidden");

    expect(tabs).toContain("Building2");
    expect(tabs).toContain("StatusAlert");
    expect(tabs).toContain("flex min-h-0 flex-1 flex-col gap-5");
    expect(tabs).toContain("Card className=\"flex min-h-0 flex-1 flex-col overflow-hidden shadow-none\"");
  });

  test("uses viewport-based department pagination like project and customer lists", () => {
    const { shell } = readOrganizationManagementSources();

    expect(shell).toContain('data-testid="department-list-table-viewport"');
    expect(shell).toContain("tableViewportRef");
    expect(shell).toContain("calculateOrganizationListPageSize");
    expect(shell).toContain("calculateOrganizationListRowHeight");
    expect(shell).toContain("measureHorizontalScrollbarHeight");
    expect(shell).toContain("--organization-table-row-height");
    expect(shell).toContain("pageSize={pagination.pageSize}");
    expect(shell).not.toContain("DepartmentPageSizeSelect");
  });

  test("keeps department rows stable and avoids horizontal list scrolling", () => {
    const table = readFileSync(
      new URL("./departments-table.tsx", import.meta.url),
      "utf8",
    );

    expect(table).toContain("DEPARTMENT_TABLE_ROW_HEIGHT_CLASS_NAME");
    expect(table).toContain("min-h-[var(--organization-table-row-height,112px)]");
    expect(table).toContain("data-organization-table-header");
    expect(table).not.toContain("minmax(280px,1fr)_120px_120px_140px_190px");
    expect(table).toContain("DEPARTMENT_ACTION_COLUMN_CLASS_NAME");
  });

  test("uses one centered spinner for department list navigation", () => {
    const { shell } = readOrganizationManagementSources();
    const actions = readFileSync(
      new URL("./department-list-actions.tsx", import.meta.url),
      "utf8",
    );

    expect(shell.match(/animate-spin/g)?.length ?? 0).toBe(1);
    expect(shell).toContain(
      "absolute inset-0 flex items-center justify-center bg-background/65 backdrop-blur-[1px]",
    );
    expect(shell).not.toContain("items-start justify-center bg-background/65 pt-8");
    expect(actions).not.toContain("animate-spin");
    expect(actions).not.toContain("pending ? <Loader2");
  });
});
