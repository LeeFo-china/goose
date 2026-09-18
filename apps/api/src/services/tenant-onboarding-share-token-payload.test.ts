import { describe, expect, test } from "bun:test";
import type { SubmitTenantOnboardingApplicationInput } from "@/schema/tenant-onboarding";
import { buildTenantOnboardingCreateRecord } from "./tenant-onboarding-applicant-payloads";

const input: SubmitTenantOnboardingApplicationInput = {
  company_name: "晴天装饰",
  unified_social_credit_code: null,
  business_license_file_id: "00000000-0000-4000-8000-000000000001",
  admin_name: "负责人",
  admin_phone: "13900139000",
  sms_code: "123456",
  company_location: {
    city: "信阳市",
    district: "固始县",
    region_code: "411525",
    address: "蓼城大道 1 号",
  },
  service_region_codes: ["411525"],
  visitor_context_id: "00000000-0000-4000-8000-000000000002",
  source_channel: "local_services",
  share_token: "tnob_abcdefghijklmnopqrstuvwxyz",
  privacy_policy_version: "2026-07",
  onboarding_terms_version: "2026-07",
  agree_privacy: true,
};

describe("tenant onboarding share-token payload", () => {
  test("forwards only the validated token to the atomic submission payload", () => {
    const payload = buildTenantOnboardingCreateRecord({
      input,
      applicationNumber: "ZQ-20260918-A1B2",
      visitorId: "visitor-1",
      idempotencyKey: "request-1",
      normalizedCreditCode: null,
      phone: input.admin_phone,
      resolution: {
        kind: "none",
        partnerIds: [],
        selectedPartner: null,
        reason: "no_eligible_partner",
      },
      inviteCodeId: null,
      now: new Date("2026-09-18T08:00:00.000Z"),
    });

    expect(payload.share_token).toBe("tnob_abcdefghijklmnopqrstuvwxyz");
    expect(payload).not.toHaveProperty("referred_by_user_id");
    expect(payload).not.toHaveProperty("share_link_id");
  });
});
