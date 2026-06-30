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

  test("includes reports as a finance module tab", () => {
    expect(FINANCE_MODULE_TABS).toContainEqual({
      value: "reports",
      label: "运营报表",
      href: "/finance/reports",
    });
  });

  test("includes correction audits as a finance module tab", () => {
    expect(FINANCE_MODULE_TABS).toContainEqual({
      value: "audits",
      label: "修正审计",
      href: "/finance/audits",
    });
  });
});
