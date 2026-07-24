import { describe, expect, test } from "bun:test";
import { canEditTenantWechatPayApplyment } from "./wechat-pay-applyments-types";

describe("tenant wechat pay applyment edit capability", () => {
  test("requires submit permission and an editable lifecycle status", () => {
    expect(canEditTenantWechatPayApplyment(null, true)).toBe(true);
    expect(canEditTenantWechatPayApplyment(null, false)).toBe(false);
    for (const status of ["draft", "rejected", "wechat_editing"]) {
      expect(canEditTenantWechatPayApplyment(status, true)).toBe(true);
      expect(canEditTenantWechatPayApplyment(status, false)).toBe(false);
    }
    for (const status of ["submitted", "approved", "closed"]) {
      expect(canEditTenantWechatPayApplyment(status, true)).toBe(false);
    }
  });
});
