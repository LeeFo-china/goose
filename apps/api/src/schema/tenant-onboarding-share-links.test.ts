import { describe, expect, test } from "bun:test";
import {
  TenantOnboardingShareLinkCreateSchema,
  TenantOnboardingShareLinkIdParamSchema,
  TenantOnboardingShareLinkIdempotencyKeySchema,
  TenantOnboardingShareLinkListQuerySchema,
  TenantOnboardingShareTokenParamSchema,
} from "./tenant-onboarding-share-links";
import { SubmitTenantOnboardingApplicationSchema } from "./tenant-onboarding";

const submission = {
  company_name: "晴天装饰",
  business_license_file_id: "00000000-0000-4000-8000-000000000001",
  admin_name: "负责人",
  admin_phone: "13900139000",
  sms_code: "123456",
  company_location: {
    city: "信阳市",
    region_code: "411525",
    address: "蓼城大道 1 号",
  },
  service_region_codes: ["411525"],
  visitor_context_id: "00000000-0000-4000-8000-000000000002",
  source_channel: "local_services",
  privacy_policy_version: "2026-07",
  onboarding_terms_version: "2026-07",
  agree_privacy: true,
} as const;

describe("tenant onboarding share-link schemas", () => {
  test("validates create, path params, UUID idempotency, and bounded pagination", () => {
    expect(TenantOnboardingShareLinkCreateSchema.safeParse({}).success).toBe(true);
    expect(TenantOnboardingShareLinkCreateSchema.safeParse({ extra: true }).success).toBe(false);
    expect(TenantOnboardingShareTokenParamSchema.safeParse({
      token: "tnob_0123456789abcdef0123456789abcdef",
    }).success).toBe(true);
    expect(TenantOnboardingShareTokenParamSchema.parse({
      token: "forged-token",
    })).toEqual({ token: null });
    expect(TenantOnboardingShareLinkIdParamSchema.safeParse({
      id: "00000000-0000-4000-8000-000000000001",
    }).success).toBe(true);
    expect(TenantOnboardingShareLinkIdempotencyKeySchema.safeParse(
      "00000000-0000-4000-8000-000000000004",
    ).success).toBe(true);
    expect(TenantOnboardingShareLinkIdempotencyKeySchema.safeParse(
      "not-a-uuid",
    ).success).toBe(false);
    expect(TenantOnboardingShareLinkListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(TenantOnboardingShareLinkListQuerySchema.safeParse({
      page: 1,
      pageSize: 101,
    }).success).toBe(false);
  });

  test("accepts only a share token from the applicant for attribution", () => {
    expect(SubmitTenantOnboardingApplicationSchema.safeParse({
      ...submission,
      share_token: "tnob_0123456789abcdef0123456789abcdef",
    }).success).toBe(true);
    expect(SubmitTenantOnboardingApplicationSchema.parse({
      ...submission,
      share_token: "forged-token",
    }).share_token).toBeNull();
    for (const field of [
      "share_link_id",
      "referred_by_user_id",
      "referred_by_openid",
      "referred_by_employee_id",
      "referral_source",
    ]) {
      expect(SubmitTenantOnboardingApplicationSchema.safeParse({
        ...submission,
        [field]: "00000000-0000-4000-8000-000000000001",
      }).success).toBe(false);
    }
  });
});
