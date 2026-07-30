import { describe, expect, test } from "bun:test";

import * as budgetUtils from "./project-cost-budget-panel-utils";

describe("project cost budget availability", () => {
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
});
