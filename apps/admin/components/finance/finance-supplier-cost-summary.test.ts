import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("项目供应商成本摘要", () => {
  test("项目成本只合并费用与已发生供应商成本", async () => {
    const types = await import("./finance-project-summary-types");
    const calculateDisplayedProjectCost = Reflect.get(
      types,
      "calculateDisplayedProjectCost",
    );
    const summary = {
      expense_paid_amount: 100,
      supplier_cost_amount: 40,
      supplier_cash_paid_amount: 20,
    };

    expect(typeof calculateDisplayedProjectCost).toBe("function");
    expect(calculateDisplayedProjectCost(summary)).toBe(140);
    expect(calculateDisplayedProjectCost({
      expense_paid_amount: Number.NaN,
      supplier_cost_amount: Number.POSITIVE_INFINITY,
    })).toBe(0);
  });

  test("DTO 和空汇总要求三个供应商金额字段", () => {
    const types = readSource("./finance-project-summary-types.ts");

    for (const field of [
      "supplier_cost_amount: number",
      "supplier_payable_open_amount: number",
      "supplier_cash_paid_amount: number",
    ]) {
      expect(types.split(field).length).toBeGreaterThanOrEqual(2);
    }
    expect(types).toContain("supplier_cost_amount: 0");
    expect(types).toContain("supplier_payable_open_amount: 0");
    expect(types).toContain("supplier_cash_paid_amount: 0");
  });

  test("财务表格和项目摘要展示三个供应商事实", () => {
    const table = readSource("./finance-project-summary-table.tsx");
    const panel = readSource(
      "../projects/project-finance-operating-summary-panel.tsx",
    );
    const widgets = readSource(
      "../projects/project-finance-operating-summary-widgets.tsx",
    );

    for (const label of [
      "已发生供应商成本",
      "未付供应商应付",
      "已付供应商现金",
    ]) {
      expect(`${table}\n${panel}\n${widgets}`).toContain(label);
    }
    expect(panel).toContain("calculateDisplayedProjectCost(summary)");
    expect(panel).toContain("supplier_cost_amount: 0");
    expect(panel).toContain("supplier_payable_open_amount: 0");
    expect(panel).toContain("supplier_cash_paid_amount: 0");
  });

  test("总览不再把仅费用现金误标为全部已付成本", () => {
    const charts = readSource("./finance-overview-charts.tsx");
    const diagnostics = readSource("./finance-diagnostics-panel.tsx");

    expect(charts).toContain('{ label: "已付费用"');
    expect(charts).not.toContain('{ label: "已付成本"');
    expect(diagnostics).toContain(
      "formatFinanceMoney(summary.expense_paid_amount)",
    );
  });
});
