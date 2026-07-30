import { describe, expect, test } from "bun:test";

import * as budgetUtils from "./project-cost-budget-panel-utils";

describe("project cost budget availability", () => {
  test("preserves commitment amounts while building editable rows", () => {
    const [row] = budgetUtils.buildEditableRows([
      {
        id: "budget-1",
        project_id: "project-1",
        cost_category_id: "category-1",
        category_code: "labor",
        category_name: "人工",
        budget_amount: 100,
        expense_amount: 70,
        commitment_amount: 50,
        available_amount: -20,
        remaining_amount: 30,
        usage_ratio: 0.7,
        warning_threshold_percent: 100,
        risk_level: "danger",
        remark: null,
        status: "active",
      },
    ], []);

    expect(row).toMatchObject({
      cost_category_id: "category-1",
      expense_amount: 70,
      commitment_amount: 50,
      has_existing_budget: true,
    });
  });

  test("does not turn a synthetic commitment row into an existing zero budget", () => {
    const [row] = budgetUtils.buildEditableRows([
      {
        id: "commitment:category-1",
        project_id: "project-1",
        cost_category_id: "category-1",
        category_code: "labor",
        category_name: "人工",
        budget_amount: 0,
        expense_amount: 0,
        commitment_amount: 50,
        available_amount: -50,
        remaining_amount: 0,
        usage_ratio: null,
        warning_threshold_percent: 100,
        risk_level: "danger",
        remark: null,
        status: null,
      },
    ], []);

    expect(row).toMatchObject({
      commitment_amount: 50,
      has_existing_budget: false,
    });
  });

  test("formats committed and available amounts without hiding a negative balance", () => {
    const formatBudgetAvailability = Reflect.get(
      budgetUtils,
      "formatBudgetAvailability",
    );
    expect(formatBudgetAvailability).toBeFunction();
    expect(formatBudgetAvailability({
      budget_amount: 100,
      expense_amount: 70,
      commitment_amount: 50,
      available_amount: -20,
    })).toBe("已承诺 ¥50.00，可用预算 ¥-20.00");
  });

  test("calculates available budget with money rounding", () => {
    const calculateBudgetAvailability = Reflect.get(
      budgetUtils,
      "calculateBudgetAvailability",
    );
    expect(calculateBudgetAvailability).toBeFunction();
    expect(calculateBudgetAvailability({
      budgetAmount: 100.1,
      expenseAmount: 70.05,
      commitmentAmount: 50.06,
    })).toBe(-20.01);
  });

  test("marks only a negative available amount as overcommitted", () => {
    const isNegativeBudgetAvailability = Reflect.get(
      budgetUtils,
      "isNegativeBudgetAvailability",
    );
    expect(isNegativeBudgetAvailability).toBeFunction();
    expect(isNegativeBudgetAvailability(-0.01)).toBe(true);
    expect(isNegativeBudgetAvailability(0)).toBe(false);
    expect(isNegativeBudgetAvailability(25)).toBe(false);
  });

  test("keeps existing risk copy explicit", () => {
    expect(budgetUtils.riskLabel("danger")).toBe("超预算");
    expect(budgetUtils.riskLabel("warning")).toBe("预警");
    expect(budgetUtils.riskLabel("normal")).toBe("正常");
  });

  test("keeps committed, available, and destructive rendering in the panel", async () => {
    const source = await Bun.file(
      `${import.meta.dir}/project-cost-budget-panel.tsx`,
    ).text();

    expect(source).toContain('label="已承诺"');
    expect(source).toContain('label="可用预算"');
    expect(source).toContain("row.commitment_amount");
    expect(source).toContain("row.available_amount");
    expect(source).toContain('"text-destructive"');
  });
});
