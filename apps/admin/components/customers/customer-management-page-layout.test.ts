import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function readCustomerManagementSources() {
  return {
    page: readFileSync(
      new URL("../../app/(console)/customers/page.tsx", import.meta.url),
      "utf8",
    ),
    loading: readFileSync(
      new URL("../../app/(console)/customers/loading.tsx", import.meta.url),
      "utf8",
    ),
    shell: readFileSync(
      new URL("./customers-client-shell.tsx", import.meta.url),
      "utf8",
    ),
  };
}

describe("Customer management page layout", () => {
  test("keeps list and loading states inside a fixed-height workspace", () => {
    const { page, loading, shell } = readCustomerManagementSources();

    expect(page).toContain("h-[calc(100vh-6.5625rem)]");
    expect(page).toContain("min-h-0 flex-col gap-5 overflow-hidden");
    expect(page).not.toContain("min-h-[calc(100vh-6.5rem)]");

    expect(loading).toContain("h-[calc(100vh-6.5625rem)]");
    expect(loading).toContain("min-h-0 flex-col gap-5 overflow-hidden");
    expect(loading).toContain("flex min-h-0 flex-1 flex-col overflow-hidden shadow-none");
    expect(loading).toContain("min-h-0 flex-1 overflow-hidden");

    expect(shell).toContain("flex min-h-0 flex-1 flex-col");
    expect(shell).toContain("Card className=\"flex min-h-0 flex-1 flex-col overflow-hidden shadow-none\"");
    expect(shell).toContain('data-testid="customer-list-table-viewport"');
    expect(shell).toContain("tableViewportRef");
    expect(shell).toContain("calculateCustomerListPageSize");
    expect(shell).toContain("getBoundingClientRect().height");
    expect(shell).toContain("pageSize={pagination.pageSize}");
  });

  test("keeps customer table rows stable for viewport-based pagination", () => {
    const table = readFileSync(
      new URL("./customers-table.tsx", import.meta.url),
      "utf8",
    );

    expect(table).toContain("CUSTOMER_TABLE_ROW_HEIGHT_CLASS_NAME");
    expect(table).toContain("rowClassName={() => CUSTOMER_TABLE_ROW_HEIGHT_CLASS_NAME}");
  });
});
