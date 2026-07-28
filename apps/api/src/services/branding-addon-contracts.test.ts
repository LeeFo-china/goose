import { describe, expect, test } from "bun:test";

import {
  BRANDING_ADDON_ORDER_STATUSES,
  BRANDING_ADDON_PAYMENT_WINDOW_MS,
  BRANDING_ADDON_PRODUCT_CODE,
  BRANDING_ADDON_REFUND_POLICY,
  BRANDING_ADDON_TERM_YEARS,
} from "./branding-addon-contracts";

describe("branding addon contracts", () => {
  test("freezes the annual branding entitlement product contract", () => {
    expect(BRANDING_ADDON_PRODUCT_CODE)
      .toBe("custom_support_branding_annual");
    expect(BRANDING_ADDON_TERM_YEARS).toBe(1);
    expect(BRANDING_ADDON_PAYMENT_WINDOW_MS).toBe(5 * 60 * 1000);
    expect(BRANDING_ADDON_REFUND_POLICY)
      .toBe("数字权益支付成功并开通后不支持退款");
  });

  test("freezes the order statuses", () => {
    expect(BRANDING_ADDON_ORDER_STATUSES).toEqual([
      "pending",
      "paid",
      "closed",
      "failed",
    ]);
  });
});
