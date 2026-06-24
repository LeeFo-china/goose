import { describe, expect, test } from "bun:test";
import {
  financeRiskActionHref,
  financeRiskLabel,
  financeRiskVariant,
  summarizeFinanceRiskReasons,
} from "./finance-risk-display";

describe("finance risk display helpers", () => {
  test("maps risk levels to labels and badge variants", () => {
    expect(financeRiskLabel("danger")).toBe("高风险");
    expect(financeRiskVariant("warning")).toBe("warning");
    expect(financeRiskVariant("normal")).toBe("success");
  });

  test("summarizes first two reasons with overflow count", () => {
    expect(summarizeFinanceRiskReasons([
      { code: "budget_missing", title: "未配置预算" },
      { code: "unallocated_expense", title: "存在未归集成本" },
      { code: "receivable_overdue", title: "存在逾期应收" },
    ])).toBe("未配置预算、存在未归集成本 +1");
  });

  test("maps backend action keys to local hrefs", () => {
    expect(financeRiskActionHref({
      key: "open_unallocated_ledger",
      label: "去归集成本",
      target:
        "/finance/ledger?project_id=project-1&direction=out&unallocated_only=true",
    })).toBe(
      "/finance/ledger?project_id=project-1&direction=out&unallocated_only=true",
    );
    expect(financeRiskActionHref({
      key: "unknown_action",
      label: "未知",
      target: "/not-used",
    })).toBeNull();
  });
});
