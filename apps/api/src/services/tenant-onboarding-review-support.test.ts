import { describe, expect, test } from "bun:test";
import type { TenantOnboardingPlatformApplicationRecord } from "@/repositories/tenant-onboarding-types";
import { defaultTenantSlug } from "./tenant-onboarding-review-support";

describe("tenant onboarding review support", () => {
  test("builds a deterministic tenant slug when the credit code is missing", () => {
    const application = {
      id: "00000000-0000-4000-8000-000000000101",
      unified_social_credit_code: null,
    } as TenantOnboardingPlatformApplicationRecord;

    expect(defaultTenantSlug(application, 1))
      .toBe("zq-nocredit-00000000-1");
  });
});
