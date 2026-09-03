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

  test("does not repeat the expense request list title inside the table card", () => {
    const sections = readFileSync(
      new URL("./expenses-panel-sections.tsx", import.meta.url),
      "utf8",
    );

    expect(sections).not.toContain('title="费用申请列表"');
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

  test("shows project summaries from expense row data with a shadcn hover card", () => {
    const { table } = readExpenseManagementSources();

    expect(table).toContain("@/components/ui/hover-card");
    expect(table).toContain("ExpenseProjectCell");
    expect(table).toContain("HoverCard openDelay={120} closeDelay={80}");
    expect(table).toContain("HoverCardTrigger asChild");
    expect(table).toContain('data-testid="expense-project-summary-hover-card"');
    expect(table).toContain("项目摘要");
    expect(table).toContain("客户");
    expect(table).toContain("房产");
    expect(table).toContain("状态");
    expect(table).toContain("签约金额");
    expect(table).toContain("项目 ID");
    expect(table).not.toContain("fetch(");
  });
});
