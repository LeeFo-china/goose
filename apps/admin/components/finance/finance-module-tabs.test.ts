import { describe, expect, test } from "bun:test";
import { FINANCE_MODULE_TABS } from "./finance-module-tabs";

describe("FinanceModuleTabs", () => {
  test("includes reconciliation as a finance module tab", () => {
    expect(FINANCE_MODULE_TABS).toContainEqual({
      value: "reconciliation",
      label: "对账异常",
      href: "/finance/reconciliation",
    });
  });
});
