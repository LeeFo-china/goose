import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readTenantBillingPage() {
  return readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
}

function readTenantBillingSections() {
  return readFileSync(new URL("./billing-page-sections.tsx", import.meta.url), "utf8");
}

describe("Tenant billing page layout", () => {
  test("keeps the billing account page in a viewport-bound admin workspace", () => {
    const page = readTenantBillingPage();

    expect(page).toContain("h-[calc(100vh-6.5625rem)]");
    expect(page).toContain("min-h-0 flex-col gap-4 overflow-hidden");
    expect(page).toContain('data-testid="tenant-billing-account-section"');
    expect(page).toContain('data-testid="tenant-billing-ledger-card"');
    expect(page).toContain("flex min-h-0 flex-1 flex-col overflow-hidden shadow-none");
    expect(page).toContain('data-testid="tenant-billing-ledger-viewport"');
    expect(page).toContain("min-h-0 flex-1 overflow-auto");
  });

  test("uses lightweight shadcn cards for account overview, pricing, and ledger", () => {
    const page = readTenantBillingPage();
    const sections = readTenantBillingSections();

    expect(sections).toContain("@/components/ui/card");
    expect(sections).toContain("@/components/ui/progress");
    expect(sections).toContain("功能计费");
    expect(page).toContain("积分流水");
    expect(sections).toContain('data-testid="tenant-billing-account-card"');
    expect(sections).toContain('data-testid="tenant-billing-pricing-card"');
    expect(sections).toContain('data-testid="tenant-billing-account-metrics"');
    expect(sections).toContain("shadow-none");
    expect(sections).toContain("可用率");
    expect(page).toContain("@/components/ui/card");
    expect(page).toContain("CardHeader");
    expect(page).toContain("CardContent");
    expect(page).toContain("CardFooter");
    expect(page).toContain("Empty");
    expect(page).toContain('data-testid="tenant-billing-ledger-empty"');
    expect(page).not.toContain("grid divide-y md:grid-cols-4 md:divide-x md:divide-y-0");
    expect(page).not.toContain("colSpan={5}");
  });

  test("renders subscription lock state while keeping recharge actions available", () => {
    const page = readTenantBillingPage();
    const sections = readTenantBillingSections();
    const rechargeAction = readFileSync(
      new URL("../../../components/billing/tenant-recharge-actions.tsx", import.meta.url),
      "utf8",
    );

    expect(page).toContain("TENANT_BILLING_LOCKED");
    expect(sections).toContain("系统使用费待缴纳");
    expect(sections).toContain("当前租户积分不足");
    expect(sections).toContain("@/components/ui/alert");
    expect(page).toContain("billing.recharge.create");
    expect(sections).toContain("TenantRechargeOrderButton");
    expect(page).toContain("/billing/recharge-products?page=1&pageSize=20");
    expect(rechargeAction).toContain("/billing/recharge-orders");
    expect(rechargeAction).toContain("创建支付订单");
  });
});
