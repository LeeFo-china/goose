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
    expect(shell).toContain("UsersRound");
    expect(shell).toContain("CreateCustomerButton");
    expect(page).not.toContain("<CreateCustomerButton");
    expect(shell).toContain("Card className=\"flex min-h-0 flex-1 flex-col overflow-hidden shadow-none\"");
    expect(shell).toContain('data-testid="customer-list-table-viewport"');
    expect(shell).toContain("tableViewportRef");
    expect(shell).toContain("calculateCustomerListPageSize");
    expect(shell).toContain("calculateCustomerListRowHeight");
    expect(shell).toContain("getBoundingClientRect().height");
    expect(shell).toContain("measureHorizontalScrollbarHeight");
    expect(shell).toContain("--customer-table-row-height");
    expect(shell).toContain("pageSize={pagination.pageSize}");
  });

  test("keeps customer table rows stable for viewport-based pagination", () => {
    const { shell } = readCustomerManagementSources();
    const table = readFileSync(
      new URL("./customers-table.tsx", import.meta.url),
      "utf8",
    );

    expect(table).toContain("CUSTOMER_TABLE_ROW_HEIGHT_CLASS_NAME");
    expect(table).toContain("h-[var(--customer-table-row-height,75px)]");
    expect(table).toContain("rowClassName={() => CUSTOMER_TABLE_ROW_HEIGHT_CLASS_NAME}");
    expect(shell).toContain("CUSTOMER_TABLE_HEADER_HEIGHT");
  });

  test("keeps customer table within the list viewport without horizontal scrolling", () => {
    const table = readFileSync(
      new URL("./customers-table.tsx", import.meta.url),
      "utf8",
    );

    expect(table).toContain('tableClassName="border-t-0 table-fixed"');
    expect(table).not.toContain('minWidth="min-w-');
    expect(table).toContain("CUSTOMER_ACTION_COLUMN_CLASS_NAME");
  });

  test("uses a single centered refresh spinner for customer list navigation", () => {
    const { shell } = readCustomerManagementSources();
    const actions = readFileSync(
      new URL("./customer-list-actions.tsx", import.meta.url),
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

  test("keeps customer list navigation and dialogs light for first render", () => {
    const { shell } = readCustomerManagementSources();
    const mutations = readFileSync(
      new URL("./customer-mutations.tsx", import.meta.url),
      "utf8",
    );

    expect(shell).toContain("router.push(href)");
    expect(shell).not.toContain("router.refresh();");
    expect(mutations).toContain("import dynamic from \"next/dynamic\"");
    expect(mutations).not.toContain("import { CustomerDialog }");
    expect(mutations).not.toContain("import { CustomerDetailDialog }");
    expect(mutations).toContain("dynamic(");
    expect(mutations).toContain("open ? (");
    expect(mutations).toContain("editOpen ? (");
  });
});
