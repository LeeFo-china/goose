import { describe, expect, test } from "bun:test";
import {
  buildFinanceProjectRisk,
  type FinanceProjectRiskInput,
} from "./finance-project-risk";

const baseInput = {
  projectId: "project-1",
  contractAmount: 100000,
  receivedAmount: 50000,
  expensePaidAmount: 20000,
  budgetConfigured: true,
  budgetCostAmount: 80000,
  budgetUsageRatio: 0.25,
  projectedBudgetGrossMargin: 0.2,
  overdueCount: 0,
  overdueAmount: 0,
  unallocatedExpenseAmount: 0,
  hasCategoryOverBudget: false,
} satisfies FinanceProjectRiskInput;

describe("buildFinanceProjectRisk", () => {
  test("returns normal when no finance risk is present", () => {
    expect(buildFinanceProjectRisk(baseInput)).toEqual({
      risk_level: "normal",
      risk_flags: [],
      risk_reasons: [],
    });
  });

  test("returns info reason for unallocated project expenses", () => {
    const result = buildFinanceProjectRisk({
      ...baseInput,
      unallocatedExpenseAmount: 1200,
    });

    expect(result.risk_level).toBe("info");
    expect(result.risk_flags).toContain("unallocated_expense");
    expect(result.risk_reasons).toContainEqual(
      expect.objectContaining({
        code: "unallocated_expense",
        level: "info",
        title: "存在未归集成本",
        current_value: 1200,
        unit: "money",
        action: expect.objectContaining({
          key: "open_unallocated_ledger",
          label: "去归集成本",
        }),
      }),
    );
  });

  test("returns danger for negative actual and projected profit", () => {
    const result = buildFinanceProjectRisk({
      ...baseInput,
      contractAmount: 50000,
      receivedAmount: 10000,
      expensePaidAmount: 90000,
      budgetCostAmount: 80000,
      projectedBudgetGrossMargin: -0.6,
    });

    expect(result.risk_level).toBe("danger");
    expect(result.risk_flags).toContain("project_over_budget");
    expect(result.risk_flags).toContain("negative_actual_profit");
    expect(result.risk_flags).toContain("negative_projected_profit");
    expect(result.risk_reasons.map((reason) => reason.code)).toEqual(
      expect.arrayContaining([
        "project_over_budget",
        "negative_actual_profit",
        "negative_projected_profit",
      ]),
    );
  });

  test("keeps overdue and low margin as warning when no danger exists", () => {
    const result = buildFinanceProjectRisk({
      ...baseInput,
      projectedBudgetGrossMargin: 0.12,
      overdueCount: 2,
      overdueAmount: 3000,
    });

    expect(result.risk_level).toBe("warning");
    expect(result.risk_flags).toEqual([
      "low_projected_margin",
      "receivable_overdue",
    ]);
    expect(result.risk_reasons).toHaveLength(2);
  });
});
