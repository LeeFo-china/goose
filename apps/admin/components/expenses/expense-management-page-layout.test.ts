import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function readExpenseManagementSources() {
  return {
    page: readFileSync(
      new URL("../../app/(console)/expenses/page.tsx", import.meta.url),
      "utf8",
    ),
    loading: readFileSync(
      new URL("../../app/(console)/expenses/loading.tsx", import.meta.url),
      "utf8",
    ),
    panel: readFileSync(
      new URL("./expenses-panel.tsx", import.meta.url),
      "utf8",
    ),
    table: readFileSync(
      new URL("./expenses-table.tsx", import.meta.url),
      "utf8",
    ),
  };
}

describe("Expense management page layout", () => {
  test("keeps the expense list inside a fixed-height workspace", () => {
    const { page, loading, panel } = readExpenseManagementSources();

    expect(page).toContain("h-[calc(100vh-6.5625rem)]");
    expect(page).toContain("min-h-0 flex-col gap-5 overflow-hidden");
    expect(loading).toContain("h-[calc(100vh-6.5625rem)]");
    expect(loading).toContain("min-h-0 flex-col gap-5 overflow-hidden");
    expect(panel).toContain("flex min-h-0 flex-1 flex-col");
    expect(panel).toContain("Card className=\"flex min-h-0 flex-1 flex-col overflow-hidden shadow-none\"");
  });

  test("keeps expense request table within the viewport without horizontal scrolling", () => {
    const { panel, table } = readExpenseManagementSources();

    expect(panel).toContain("min-h-0 flex-1 overflow-y-auto overflow-x-hidden");
    expect(panel).not.toContain("min-h-0 flex-1 overflow-auto");
    expect(table).toContain('tableClassName="border-t-0 table-fixed"');
    expect(table).toContain('containerClassName="overflow-x-hidden"');
    expect(table).toContain('tableContainerClassName="overflow-x-hidden"');
    expect(table).not.toContain('minWidth="min-w-[1480px]"');
    expect(table).toContain("EXPENSE_ACTION_COLUMN_CLASS_NAME");
  });
});
