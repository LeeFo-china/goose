import { describe, expect, test } from "bun:test";
import {
  financeDirectionMeta,
  formatFinanceDateTime,
  formatFinanceMoney,
} from "./finance-ledger-utils";

describe("finance ledger display helpers", () => {
  test("formats income and outcome amounts with currency sign", () => {
    expect(formatFinanceMoney(12800)).toBe("¥12,800.00");
    expect(formatFinanceMoney("300.5")).toBe("¥300.50");
    expect(formatFinanceMoney(null)).toBe("¥0.00");
  });

  test("maps finance direction to table badge metadata", () => {
    expect(financeDirectionMeta("in")).toEqual({
      label: "收入",
      variant: "success",
    });
    expect(financeDirectionMeta("out")).toEqual({
      label: "支出",
      variant: "secondary",
    });
  });

  test("formats valid ledger occurrence time and hides invalid time", () => {
    expect(formatFinanceDateTime("2026-06-16T09:30:00.000Z")).toContain("2026");
    expect(formatFinanceDateTime("")).toBe("-");
    expect(formatFinanceDateTime(null)).toBe("-");
  });
});
