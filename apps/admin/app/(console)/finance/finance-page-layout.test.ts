import { readFileSync } from "node:fs";
import { expect, test } from "bun:test";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("removes the page count badge from the finance overview header", () => {
  const pageSource = readSource("./page.tsx");
  const tablePanelSource = readSource(
    "../../../components/finance/finance-project-summary-table-panel.tsx",
  );

  expect(pageSource).not.toContain(
    "第 {data.pagination.page || 1} / {Math.max(data.pagination.totalPages || 0, 1)} 页",
  );
  expect(pageSource).not.toContain('className="w-fit tabular-nums"');
  expect(tablePanelSource).toContain('data-testid="finance-project-summary-footer"');
  expect(tablePanelSource).toContain("第 {tableData.pagination.page || 1}");
});
