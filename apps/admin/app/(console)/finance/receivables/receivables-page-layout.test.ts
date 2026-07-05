import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("Finance receivables page layout", () => {
  test("uses a shadcn card workspace with internal list scrolling", () => {
    const page = readSource("./page.tsx");

    expect(page).toContain("h-[calc(100vh-6.5625rem)]");
    expect(page).toContain("min-h-0 flex-col gap-5 overflow-hidden");
    expect(page).toContain("CardHeader");
    expect(page).toContain("CardFooter");
    expect(page).toContain("data-testid=\"tenant-receivables-table-viewport\"");
    expect(page).toContain("className=\"min-h-0 flex-1 overflow-auto\"");
    expect(page).not.toContain("应收计划列表");
    expect(page).not.toContain("按状态、收款类型、来源、项目、负责人和应收日期筛选应收记录。");
    expect(page).not.toContain("当前显示 {data.list.length} / {data.pagination.total} 条");
  });

  test("keeps the filter form on shadcn field components", () => {
    const page = readSource("./page.tsx");
    const filters = readSource("../../../../components/finance/finance-receivable-filters.tsx");

    expect(page).toContain("FinanceReceivableFilters");
    expect(filters).toContain("FieldGroup");
    expect(filters).toContain("FieldLabel");
    expect(filters).toContain("Collapsible");
    expect(filters).toContain("CollapsibleContent");
    expect(filters).toContain("CollapsibleTrigger");
    expect(filters).toContain("receivable-primary-filters");
    expect(filters).toContain("receivable-advanced-filters");
    expect(filters).toContain("defaultOpen={hasAdvancedFilters}");
    expect(page).not.toContain("xl:grid-cols-[minmax(9rem,11rem)_minmax(9rem,11rem)_minmax(9rem,11rem)_minmax(10rem,12rem)_minmax(12rem,1fr)_minmax(10rem,12rem)_minmax(10rem,12rem)_auto]");
    expect(page).not.toContain("<label");
    expect(filters).not.toContain("<label");
  });

  test("pins the receivable table action column to the right", () => {
    const table = readSource("../../../../components/finance/finance-receivables-table.tsx");

    expect(table).toContain("DataTable");
    expect(table).toContain("sticky right-0 z-10 w-[11rem] bg-muted/60 text-right");
    expect(table).toContain("sticky right-0 z-10 whitespace-nowrap border-l bg-background text-right");
  });
});
