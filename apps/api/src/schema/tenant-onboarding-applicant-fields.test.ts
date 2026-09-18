import { describe, expect, test } from "bun:test";

import {
  SubmitTenantOnboardingApplicationSchema,
  SupplementTenantOnboardingApplicationSchema,
} from "./tenant-onboarding";

const validSubmission = {
  company_name: "固始晴天装饰工程有限公司",
  unified_social_credit_code: "91411525MA9G000000",
  business_license_file_id: "00000000-0000-4000-8000-000000000901",
  admin_name: "王总",
  admin_phone: "13900139000",
  sms_code: "123456",
  company_location: {
    province: "河南省",
    city: "信阳市",
    district: "固始县",
    region_code: "411525",
    address: "蓼城大道 1 号",
    latitude: 32.168,
    longitude: 115.654,
  },
  service_region_codes: ["411525"],
  visitor_context_id: "00000000-0000-4000-8000-000000000801",
  source_channel: "local_services",
  privacy_policy_version: "2026.07",
  onboarding_terms_version: "2026.07",
  agree_privacy: true,
} as const;

describe("tenant onboarding applicant business license schema", () => {
  test.each([
    ["missing", undefined],
    ["null", null],
    ["empty", ""],
    ["whitespace", "   "],
  ] as const)("accepts a %s business license on submit", (_label, value) => {
    const input = { ...validSubmission } as Record<string, unknown>;
    if (value === undefined) delete input.business_license_file_id;
    else input.business_license_file_id = value;

    const result = SubmitTenantOnboardingApplicationSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.business_license_file_id ?? null).toBeNull();
    }
  });

  test("preserves supplement omission", () => {
    expect(SupplementTenantOnboardingApplicationSchema.parse({
      version: 1,
      company_name: "晴天装饰",
    })).not.toHaveProperty("business_license_file_id");
  });

  test.each([
    ["null", null],
    ["empty", ""],
    ["whitespace", "   "],
  ] as const)(
    "normalizes an explicit %s supplement business license to null",
    (_label, value) => {
      expect(SupplementTenantOnboardingApplicationSchema.parse({
        version: 1,
        business_license_file_id: value,
      })).toMatchObject({ business_license_file_id: null });
    },
  );

  test("rejects a non-empty invalid business license ID", () => {
    expect(SubmitTenantOnboardingApplicationSchema.safeParse({
      ...validSubmission,
      business_license_file_id: "not-a-uuid",
    }).success).toBe(false);
    expect(SupplementTenantOnboardingApplicationSchema.safeParse({
      version: 1,
      business_license_file_id: "not-a-uuid",
    }).success).toBe(false);
  });
});
