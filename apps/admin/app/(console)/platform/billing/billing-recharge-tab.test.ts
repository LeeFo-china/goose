import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const rechargeTab = readFileSync(
  new URL("./billing-recharge-tab.tsx", import.meta.url),
  "utf8",
);
const billingPage = readFileSync(
  new URL("./page.tsx", import.meta.url),
  "utf8",
);
const refundTab = readFileSync(
  new URL("./billing-recharge-refunds-tab.tsx", import.meta.url),
  "utf8",
);
const productActions = readFileSync(
  new URL("../../../../components/billing/billing-recharge-actions.tsx", import.meta.url),
  "utf8",
);
const orderActions = readFileSync(
  new URL("../../../../components/billing/billing-recharge-order-actions.tsx", import.meta.url),
  "utf8",
);
const refundActions = readFileSync(
  new URL("../../../../components/billing/billing-recharge-refund-actions.tsx", import.meta.url),
  "utf8",
);

describe("platform billing recharge operations UI", () => {
  test("exposes recommended package and recharge order operation entrypoints", () => {
    expect(rechargeTab).toContain("RecommendedRechargeProductsButton");
    expect(rechargeTab).toContain("RechargeOrderDetailButton");
    expect(rechargeTab).toContain("<TableHead className=\"text-right\">操作</TableHead>");
    expect(productActions).toContain("/api/backend/platform/billing/recharge-products/recommended");
    expect(orderActions).toContain("/api/backend/platform/billing/recharge-orders/${order.id}/compensate");
  });

  test("routes payment configuration to the canonical settings workflow", () => {
    expect(rechargeTab).toContain('href="/settings?group=payment"');
    expect(productActions).not.toContain("encrypted_config_ref");
    expect(productActions).not.toContain(
      "/api/backend/platform/payment/wechat-pay/config",
    );
  });

  test("exposes refund review without exposing real refund execution", () => {
    expect(billingPage).toContain("tab: \"refunds\"");
    expect(billingPage).toContain("/platform/billing/recharge-refund-requests?");
    expect(billingPage).toContain("rechargeRefundPage");
    expect(refundTab).toContain("退款审核");
    expect(refundTab).toContain("RechargeRefundRequestDetailButton");
    expect(refundActions).toContain("/api/backend/platform/billing/recharge-refund-requests/${request.id}/approve");
    expect(refundActions).toContain("/api/backend/platform/billing/recharge-refund-requests/${request.id}/reject");
    expect(refundActions).not.toContain("/execute");
  });
});
