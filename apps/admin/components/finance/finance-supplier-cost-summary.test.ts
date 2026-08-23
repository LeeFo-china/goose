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

  test("预算进度主金额使用项目成本且不受供应商现金变化影响", async () => {
    const types = await import("./finance-project-summary-types");
    const buildDisplayedProjectCostMetric = Reflect.get(
      types,
      "buildDisplayedProjectCostMetric",
    );
    const baseSummary = {
      expense_paid_amount: 100,
      supplier_cost_amount: 40,
      supplier_cash_paid_amount: 20,
    };
    const changedCashSummary = {
      ...baseSummary,
      supplier_cash_paid_amount: 999,
    };

    expect(typeof buildDisplayedProjectCostMetric).toBe("function");
    expect(buildDisplayedProjectCostMetric(baseSummary)).toEqual({
      label: "已发生项目成本",
      value: 140,
      emptyText: "暂无成本",
    });
    expect(buildDisplayedProjectCostMetric(changedCashSummary)).toEqual({
      label: "已发生项目成本",
      value: 140,
      emptyText: "暂无成本",
    });
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

  test("财务表格风险状态列保留稳定宽度和可换行标签", () => {
    const table = readSource("./finance-project-summary-table.tsx");

    expect(table).toContain("function FinanceRiskCell");
    expect(table).toContain("flex min-w-[11rem] max-w-[13rem]");
    expect(table).toContain("flex max-w-full flex-wrap items-center gap-1");
    expect(table).toContain('headerClassName: "w-[12.5rem] min-w-[12.5rem]"');
    expect(table).toContain('cellClassName: "min-w-[12.5rem] align-middle"');
    expect(table).toContain('minWidth="min-w-[96rem]"');
    expect(table).not.toContain('className="ml-1"');
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
