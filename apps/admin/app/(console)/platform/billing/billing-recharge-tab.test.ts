import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const rechargeTab = readFileSync(
  new URL("./billing-recharge-tab.tsx", import.meta.url),
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

describe("platform billing recharge operations UI", () => {
  test("exposes recommended package and recharge order operation entrypoints", () => {
    expect(rechargeTab).toContain("RecommendedRechargeProductsButton");
    expect(rechargeTab).toContain("RechargeOrderDetailButton");
    expect(rechargeTab).toContain("<TableHead className=\"text-right\">操作</TableHead>");
    expect(productActions).toContain("/api/backend/platform/billing/recharge-products/recommended");
    expect(orderActions).toContain("/api/backend/platform/billing/recharge-orders/${order.id}/compensate");
  });
});
