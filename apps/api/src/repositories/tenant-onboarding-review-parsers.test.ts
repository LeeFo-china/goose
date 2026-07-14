import { describe, expect, test } from "bun:test";
import {
  parseNullableLicenseAccess,
  parseNullablePlatformApplication,
  parsePlatformApplicationList,
  parsePlatformApplicationReviews,
  parsePlatformReviewMutation,
} from "./tenant-onboarding-review-parsers";
import type {
  TenantOnboardingApplicationReviewRecord,
  TenantOnboardingPartnerBrief,
  TenantOnboardingPlatformApplicationListRecord,
  TenantOnboardingPlatformApplicationRecord,
  TenantOnboardingPlatformReviewMutationErrorStatus,
} from "./tenant-onboarding-types";

const ID = "00000000-0000-4000-8000-000000000001";
const OTHER_ID = "00000000-0000-4000-8000-000000000002";
const NOW = "2026-07-14T04:00:00.000Z";
const partner: TenantOnboardingPartnerBrief = {
  id: OTHER_ID,
  name: "固始城市合伙人",
  status: "active",
  region_codes: ["411525"],
};
const listRecord: TenantOnboardingPlatformApplicationListRecord = {
  id: ID,
  application_no: "ZQ-20260714-A1B2C3",
  company_name: "晴天装饰",
  admin_name: "负责人",
  address_city: "信阳市",
  address_district: "固始县",
  address_region_code: "411525",
  service_region_codes: ["411525"],
  source_channel: "local_services",
  candidate_partner_id: OTHER_ID,
  candidate_match_reason: "region",
  status: "reviewing",
  partner_assist_status: "pending",
  partner_assist_due_at: NOW,
  version: 2,
  created_at: NOW,
  updated_at: NOW,
  candidate_partner: partner,
  final_partner: null,
};
const detailRecord: TenantOnboardingPlatformApplicationRecord = {
  ...listRecord,
  unified_social_credit_code: "91411525MA9G000000",
  business_license_file_id: OTHER_ID,
  admin_phone: "13900139000",
  address_province: "河南省",
  address: "详细地址",
  address_latitude: null,
  address_longitude: null,
  invite_code_id: null,
  candidate_snapshot: {},
  final_partner_id: null,
  attribution_source_type: null,
  partner_assist_requested_at: NOW,
  converted_tenant_id: null,
  reviewed_by_employee_id: null,
  reviewed_at: null,
  review_remark: null,
  privacy_policy_version: "2026-07",
  onboarding_terms_version: "2026-07",
  consented_at: NOW,
  withdrawn_at: null,
};

describe("tenant onboarding review repository parsers", () => {
  test("parses minimal platform list and detail projections", () => {
    expect(parsePlatformApplicationList([listRecord])).toEqual([listRecord]);
    expect(parseNullablePlatformApplication(detailRecord)).toEqual(detailRecord);
    expect(parseNullablePlatformApplication(null)).toBeNull();
  });

  test("parses paginated review rows without embedding them in detail", () => {
    const review: TenantOnboardingApplicationReviewRecord = {
      id: OTHER_ID,
      application_id: ID,
      review_stage: "platform_review",
      decision: "start_review",
      actor_type: "platform_employee",
      actor_visitor_id: null,
      actor_employee_id: OTHER_ID,
      actor_partner_member_id: null,
      before_status: "submitted",
      after_status: "reviewing",
      before_partner_assist_status: "pending",
      after_partner_assist_status: "pending",
      required_fields: [],
      remark: null,
      metadata: {},
      created_at: NOW,
    };
    expect(parsePlatformApplicationReviews([review])).toEqual([review]);
  });

  test("parses every bounded mutation result and rejects malformed versions", () => {
    const mutationApplication = Object.fromEntries(
      Object.entries(detailRecord).filter(([key]) =>
        key !== "candidate_partner" && key !== "final_partner"
      ),
    );
    expect(parsePlatformReviewMutation({
      status: "updated",
      application_id: ID,
      application_version: 2,
      application: mutationApplication,
      idempotent: false,
    })).toMatchObject({
      status: "updated", application_version: 2,
      application: { id: ID, version: 2 },
    });
    const statuses: TenantOnboardingPlatformReviewMutationErrorStatus[] = [
      "application_not_found",
      "state_conflict",
      "version_conflict",
      "partner_unavailable",
    ];
    for (const status of statuses) {
      expect(parsePlatformReviewMutation({ status })).toEqual({ status });
    }
    expect(() => parsePlatformReviewMutation({
      status: "updated",
      application_id: ID,
      application_version: 0,
      application: mutationApplication,
      idempotent: false,
    })).toThrow();
    expect(() => parsePlatformReviewMutation({
      status: "updated", application_id: ID,
      application_version: 3, idempotent: false,
    })).toThrow();
    expect(() => parsePlatformReviewMutation({
      status: "updated", application_id: ID, application_version: 3,
      application: mutationApplication, idempotent: false,
    })).toThrow();
  });

  test("parses the internal license relation while keeping it out of API DTOs", () => {
    const record = {
      application_id: ID,
      visitor_id: "visitor-1",
      business_license_file_id: OTHER_ID,
      file: {
        id: OTHER_ID,
        owner_type: "visitor",
        owner_visitor_id: "visitor-1",
        scene: "tenant_onboarding_license",
        provider: "tencent_cos",
        object_key: "private/tenant-onboarding-license/visitors/hash/license.jpg",
        visibility: "private",
        public_url: null,
        status: "active",
        deleted_at: null,
      },
    };
    expect(parseNullableLicenseAccess(record)).toEqual(record);
    expect(parseNullableLicenseAccess(null)).toBeNull();
  });

  test("fails unknown repository fields closed", () => {
    expect(() => parsePlatformApplicationList([{ ...listRecord, object_key: "leak" }]))
      .toThrow();
    expect(() => parseNullablePlatformApplication({
      ...detailRecord,
      idempotency_key: "leak",
    })).toThrow();
  });
});
