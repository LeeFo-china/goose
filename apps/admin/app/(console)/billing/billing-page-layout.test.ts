import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readTenantBillingPage() {
  return readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
}

describe("Tenant billing page layout", () => {
  test("keeps the billing account page in a viewport-bound admin workspace", () => {
    const page = readTenantBillingPage();

    expect(page).toContain("h-[calc(100vh-6.5625rem)]");
    expect(page).toContain("min-h-0 flex-col gap-5 overflow-auto lg:overflow-hidden");
    expect(page).toContain("Card className=\"shrink-0 overflow-hidden shadow-none\"");
    expect(page).toContain("Card className=\"flex min-h-[18rem] flex-1 flex-col overflow-hidden shadow-none lg:min-h-0\"");
    expect(page).toContain('data-testid="tenant-billing-ledger-viewport"');
    expect(page).toContain("min-h-0 flex-1 overflow-auto");
  });

  test("uses shadcn card sections for account overview, pricing, and ledger", () => {
    const page = readTenantBillingPage();

    expect(page).toContain("CardHeader");
    expect(page).toContain("CardTitle");
    expect(page).toContain("CardDescription");
    expect(page).toContain("CardContent");
    expect(page).toContain("账户概览");
    expect(page).toContain("功能计费");
    expect(page).toContain("积分流水");
    expect(page).toContain("Separator");
    expect(page).toContain('data-testid="tenant-billing-ledger-empty"');
    expect(page).not.toContain("colSpan={5}");
  });

  test("renders subscription lock state while keeping recharge actions available", () => {
    const page = readTenantBillingPage();
    const rechargeAction = readFileSync(
      new URL("../../../components/billing/tenant-recharge-actions.tsx", import.meta.url),
      "utf8",
    );

    expect(page).toContain("TENANT_BILLING_LOCKED");
    expect(page).toContain("系统使用费待缴纳");
    expect(page).toContain("当前租户积分不足");
    expect(page).toContain("billing.recharge.create");
    expect(page).toContain("TenantRechargeOrderButton");
    expect(page).toContain("/billing/recharge-products?page=1&pageSize=20");
    expect(rechargeAction).toContain("/billing/recharge-orders");
    expect(rechargeAction).toContain("创建支付订单");
  });
});
