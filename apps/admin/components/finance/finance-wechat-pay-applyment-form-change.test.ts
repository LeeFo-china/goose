import { describe, expect, test } from "bun:test";

import { isApplymentDataBearingControl } from "./finance-wechat-pay-applyment-form-change";

describe("wechat pay applyment form change", () => {
  test("invalidates review only for named business controls", () => {
    expect(isApplymentDataBearingControl({ name: "merchant_short_name" }))
      .toBe(true);
    expect(isApplymentDataBearingControl({ name: "license_name" })).toBe(true);
    expect(isApplymentDataBearingControl({ name: "" })).toBe(false);
    expect(isApplymentDataBearingControl({})).toBe(false);
  });

  test("does not treat the unnamed review confirmation checkbox as data", () => {
    expect(isApplymentDataBearingControl({
      id: "wechat-pay-applyment-confirmed",
      name: "",
    })).toBe(false);
  });
});
