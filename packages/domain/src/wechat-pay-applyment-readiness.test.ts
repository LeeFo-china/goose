import { describe, expect, test } from "bun:test";
import {
  WECHAT_PAY_APPLYMENT_KNOWN_BLOCKER_CODES,
  WECHAT_PAY_APPLYMENT_TENANT_REVIEW_BLOCKER_CODES,
} from "./wechat-pay-applyment-readiness";

describe("wechat pay applyment blocker contract", () => {
  test("keeps one unique known-code source with a tenant review subset", () => {
    expect(new Set(WECHAT_PAY_APPLYMENT_KNOWN_BLOCKER_CODES).size).toBe(
      WECHAT_PAY_APPLYMENT_KNOWN_BLOCKER_CODES.length,
    );
    expect(
      WECHAT_PAY_APPLYMENT_TENANT_REVIEW_BLOCKER_CODES.every((code) =>
        WECHAT_PAY_APPLYMENT_KNOWN_BLOCKER_CODES.includes(code)
      ),
    ).toBe(true);
    expect(WECHAT_PAY_APPLYMENT_TENANT_REVIEW_BLOCKER_CODES).not.toContain(
      "APPLYMENT_STATUS_NOT_SUBMITTABLE",
    );
    expect(WECHAT_PAY_APPLYMENT_TENANT_REVIEW_BLOCKER_CODES).not.toContain(
      "PLATFORM_PAYMENT_CONFIG_MISSING",
    );
  });
});
