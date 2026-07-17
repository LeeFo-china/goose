import { describe, expect, test } from "bun:test";
import { billingTabs, normalizeBillingTab } from "./billing-page-data";

describe("platform billing page tabs", () => {
  test("keeps wechat recharge as a first-class billing tab", () => {
    expect(billingTabs).toContain("recharge");
    expect(normalizeBillingTab("recharge")).toBe("recharge");
    expect(normalizeBillingTab("unknown")).toBe("tenants");
  });

  test("keeps recharge refund review as a first-class billing tab", () => {
    expect(billingTabs).toContain("refunds");
    expect(normalizeBillingTab("refunds")).toBe("refunds");
  });
});
