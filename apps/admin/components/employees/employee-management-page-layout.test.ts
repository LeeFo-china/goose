import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readEmployeeManagementSources() {
  return {
    page: readFileSync(
      new URL("../../app/(console)/employees/page.tsx", import.meta.url),
      "utf8",
    ),
    loading: readFileSync(
      new URL("../../app/(console)/employees/loading.tsx", import.meta.url),
      "utf8",
    ),
    skeleton: readFileSync(
      new URL("./employee-list-skeleton.tsx", import.meta.url),
      "utf8",
    ),
    shell: readFileSync(
      new URL("./employees-client-shell.tsx", import.meta.url),
      "utf8",
    ),
  };
}

describe("Employee management page layout", () => {
  test("keeps list and loading states inside a fixed-height workspace", () => {
    const { page, loading, skeleton, shell } = readEmployeeManagementSources();

    expect(page).toContain("h-[calc(100vh-6.5625rem)]");
    expect(page).toContain("min-h-0 flex-col gap-5 overflow-hidden");
    expect(loading).toContain("EmployeeListSkeleton");
    expect(skeleton).toContain("h-[calc(100vh-6.5625rem)]");
    expect(skeleton).toContain("min-h-0 flex-col gap-5 overflow-hidden");
    expect(skeleton).toContain("flex min-h-0 flex-1 flex-col overflow-hidden shadow-none");
    expect(skeleton).toContain("min-h-0 flex-1 overflow-hidden");

    expect(shell).toContain("flex min-h-0 flex-1 flex-col");
    expect(shell).toContain("Card className=\"flex min-h-0 flex-1 flex-col overflow-hidden shadow-none\"");
    expect(shell).toContain('data-testid="employee-list-table-viewport"');
    expect(shell).toContain("tableViewportRef");
    expect(shell).toContain("calculateEmployeeListPageSize");
    expect(shell).toContain("calculateEmployeeListRowHeight");
    expect(shell).toContain("getBoundingClientRect().height");
    expect(shell).toContain("--employee-table-row-height");
    expect(shell).toContain("min-h-0 flex-1 overflow-auto");
    expect(shell).toContain("pageSize={pagination.pageSize}");
  });

  test("keeps employee table rows stable for viewport-based pagination", () => {
    const { shell } = readEmployeeManagementSources();
    const table = readFileSync(
      new URL("./employees-table.tsx", import.meta.url),
      "utf8",
    );

    expect(table).toContain("EMPLOYEE_TABLE_ROW_HEIGHT_CLASS_NAME");
    expect(table).toContain("h-[var(--employee-table-row-height,76px)]");
    expect(table).toContain("rowClassName={() => EMPLOYEE_TABLE_ROW_HEIGHT_CLASS_NAME}");
    expect(shell).toContain("EMPLOYEE_TABLE_HEADER_HEIGHT");
  });

  test("keeps employee table within the list viewport without horizontal scrolling", () => {
    const table = readFileSync(
      new URL("./employees-table.tsx", import.meta.url),
      "utf8",
    );
    const mutations = readFileSync(
      new URL("./employee-mutations.tsx", import.meta.url),
      "utf8",
    );

    expect(table).toContain('tableClassName="border-t-0 table-fixed"');
    expect(table).not.toContain('minWidth="min-w-[1180px]"');
    expect(table).toContain("EMPLOYEE_ACTION_COLUMN_CLASS_NAME");
    expect(mutations).toContain("DropdownMenu");
    expect(mutations).toContain("MoreHorizontal");
  });

  test("uses a single refresh spinner for employee list navigation", () => {
    const { shell } = readEmployeeManagementSources();
    const actions = readFileSync(
      new URL("./employee-list-actions.tsx", import.meta.url),
      "utf8",
    );

    expect(shell.match(/animate-spin/g)?.length ?? 0).toBe(1);
    expect(actions).not.toContain("animate-spin");
    expect(actions).not.toContain("pending ? <Loader2");
  });

  test("centers the employee list refresh spinner inside the loading mask", () => {
    const { shell } = readEmployeeManagementSources();

    expect(shell).toContain(
      "absolute inset-0 flex items-center justify-center bg-background/65 backdrop-blur-[1px]",
    );
    expect(shell).not.toContain("items-start justify-center bg-background/65 pt-8");
  });

  test("preserves measured page size across employee filters and pagination", () => {
    const { page } = readEmployeeManagementSources();
    const actions = readFileSync(
      new URL("./employee-list-actions.tsx", import.meta.url),
      "utf8",
    );
    const filterUtilsUrl = new URL("./employee-list-filter-utils.ts", import.meta.url);

    expect(page).toContain("normalizePageSize");
    expect(page).toContain("pageSize: String(pageSize)");
    expect(page).not.toContain('pageSize: "20"');
    expect(actions).toContain("pageSize,");
    expect(existsSync(filterUtilsUrl)).toBe(true);
    if (!existsSync(filterUtilsUrl)) return;

    const filterUtils = readFileSync(filterUtilsUrl, "utf8");
    expect(filterUtils).toContain("pageSize?: number");
    expect(filterUtils).toContain('params.set("pageSize", String(input.pageSize))');
  });

  test("clips the first employee response to the measured viewport page size", () => {
    const { shell } = readEmployeeManagementSources();

    expect(shell).toContain("useLayoutEffect");
    expect(shell).toContain("measuredEmployeePageSize");
    expect(shell).toContain("visibleEmployees");
    expect(shell).toContain("employees.slice(0, measuredEmployeePageSize)");
    expect(shell).toContain("当前显示 {visibleEmployees.length} 条");
  });

  test("defines employee viewport page size math", async () => {
    const moduleUrl = new URL("./employee-list-page-size.ts", import.meta.url);

    expect(existsSync(moduleUrl)).toBe(true);
    if (!existsSync(moduleUrl)) return;

    const {
      calculateEmployeeListPageSize,
      calculateEmployeeListRowHeight,
    } = await import("./employee-list-page-size");

    expect(calculateEmployeeListPageSize({
      viewportHeight: 844,
      headerHeight: 40,
      rowHeight: 76,
    })).toBe(10);
    expect(calculateEmployeeListRowHeight({
      viewportHeight: 844,
      headerHeight: 40,
      pageSize: 10,
    })).toBeCloseTo(80.4);
  });
});
