import { describe, expect, test } from "bun:test";
import {
  parseNullableTenantOnboardingApplication,
  parseNullableTenantOnboardingNotificationDelivery,
  parseTenantOnboardingActiveInvite,
  parseTenantOnboardingApprovalRpcResult,
  parseTenantOnboardingAdministrativeAreas,
  parseTenantOnboardingApplication,
  parseTenantOnboardingApplicationSummaries,
  parseTenantOnboardingBusinessFile,
  parseTenantOnboardingLocationContext,
  parseTenantOnboardingMutation,
  parseTenantOnboardingNestedInvite,
  parseTenantOnboardingNotificationDelivery,
  parseTenantOnboardingNotificationRpcResult,
  parseTenantOnboardingPartners,
  parseTenantOnboardingRecipientRow,
  parseTenantOnboardingSubmitMutation,
} from "./tenant-onboarding-parsers";
import type {
  TenantOnboardingApplicationRecord,
  TenantOnboardingApplicationSummaryRecord,
  TenantOnboardingNotificationDeliveryRecord,
  TenantOnboardingPartnerBrief,
} from "./tenant-onboarding-types";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const ID = "00000000-0000-4000-8000-000000000101";
const ID_2 = "00000000-0000-4000-8000-000000000102";
const NOW = "2026-07-14T08:00:00.000Z";

const partner: TenantOnboardingPartnerBrief = {
  id: ID_2, name: "信阳合伙人", status: "active", region_codes: ["411500"],
};
const application: TenantOnboardingApplicationRecord = {
  id: ID, application_no: "ZQ-20260714-A1", visitor_id: "visitor-1",
  visitor_context_id: ID_2, company_name: "晴天装饰",
  unified_social_credit_code: "91411525MA9G000000",
  business_license_file_id: ID_2, admin_name: "负责人", admin_phone: "13900139000",
  address_province: "河南省", address_city: "信阳市", address_district: "固始县",
  address_region_code: "411525", address: "蓼城大道 1 号",
  address_latitude: 32, address_longitude: 115, service_region_codes: ["411525"],
  source_channel: "local_services", invite_code_id: null,
  candidate_partner_id: ID_2, candidate_match_reason: "region",
  candidate_snapshot: { partner_id: ID_2 }, final_partner_id: null,
  attribution_source_type: null, status: "submitted", partner_assist_status: "pending",
  partner_assist_requested_at: NOW, partner_assist_due_at: NOW, version: 1,
  converted_tenant_id: null, reviewed_by_employee_id: null, reviewed_at: null,
  review_remark: null, privacy_policy_version: "privacy-1",
  onboarding_terms_version: "terms-1", consented_at: NOW,
  idempotency_key: "request-1", withdrawn_at: null, created_at: NOW, updated_at: NOW,
};
const summary: TenantOnboardingApplicationSummaryRecord = {
  id: ID, application_no: "ZQ-20260714-A1", company_name: "晴天装饰",
  status: "submitted", partner_assist_status: "pending", version: 1,
  created_at: NOW, updated_at: NOW,
};
const delivery: TenantOnboardingNotificationDeliveryRecord = {
  id: ID, application_id: ID_2, application_version: 1, event_type: "submitted",
  channel: "sms", status: "pending", attempt_count: 0, last_error: null,
  sent_at: null, claim_token: null, claim_expires_at: null,
  created_at: NOW, updated_at: NOW,
};

describe("tenant onboarding repository runtime parsers", () => {
  test("parses application, summary, notification, and recipient rows", () => {
    expect(parseTenantOnboardingApplication(application, "bad")).toEqual(application);
    expect(parseNullableTenantOnboardingApplication(null, "bad")).toBeNull();
    expect(parseTenantOnboardingApplicationSummaries([summary], "bad"))
      .toEqual([summary]);
    expect(parseTenantOnboardingNotificationDelivery(delivery, "bad"))
      .toEqual(delivery);
    expect(parseNullableTenantOnboardingNotificationDelivery(null, "bad")).toBeNull();
    expect(parseTenantOnboardingNotificationRpcResult([delivery], "bad"))
      .toEqual(delivery);
    expect(parseTenantOnboardingRecipientRow({
      id: ID, application_no: "ZQ-1", company_name: "晴天", admin_phone: "13900139000",
    }, "bad")).toMatchObject({ id: ID, admin_phone: "13900139000" });
  });

  test("parses ownership, region, partner, and invite rows", () => {
    expect(parseTenantOnboardingLocationContext({ id: ID, visitor_id: "visitor-1" }, "bad"))
      .toMatchObject({ visitor_id: "visitor-1" });
    expect(parseTenantOnboardingBusinessFile({
      id: ID, owner_type: "visitor", owner_visitor_id: "visitor-1",
      scene: "tenant_onboarding_license", status: "active", visibility: "private",
      public_url: null, deleted_at: null,
    }, "bad")).toMatchObject({ owner_type: "visitor", public_url: null });
    expect(parseTenantOnboardingAdministrativeAreas([
      { adcode: "411525", level: "district", parent_adcode: "411500" },
    ], "bad")).toHaveLength(1);
    expect(parseTenantOnboardingPartners([partner], "bad")).toEqual([partner]);
    expect(parseTenantOnboardingNestedInvite({
      id: ID, code: "JOIN", partner_id: ID_2, expires_at: null, partner,
    }, "bad")?.partner).toEqual(partner);
    expect(parseTenantOnboardingActiveInvite({
      id: ID, code: "JOIN", partner_id: ID_2, expires_at: null,
    }, "bad")).toMatchObject({ code: "JOIN", partner_id: ID_2 });
  });

  test("parses bounded mutation results", () => {
    expect(parseTenantOnboardingSubmitMutation([
      { application_id: ID, created: true },
    ], "bad")).toEqual({ application_id: ID, created: true });
    expect(parseTenantOnboardingMutation([], "bad")).toBeNull();
    expect(parseTenantOnboardingMutation([{ application_id: ID }], "bad"))
      .toEqual({ application_id: ID });
  });

  test("parses every stable approval RPC result", () => {
    const initialization = {
      template_code: "default_decoration_company",
      template_version: "2026.05.10",
      departments_count: 43,
      posts_count: 48,
      roles_count: 4,
      admin_employee_id: ID,
      admin_role_id: ID_2,
    };
    expect(parseTenantOnboardingApprovalRpcResult({
      status: "approved",
      application_id: ID,
      tenant_id: ID_2,
      binding_id: null,
      profile_id: ID,
      initialization,
      idempotent: false,
    }, "bad")).toMatchObject({ status: "approved", idempotent: false });

    for (const status of [
      "application_not_found", "application_state_conflict",
      "application_version_conflict", "subject_exists", "admin_phone_exists",
      "partner_ambiguous", "partner_unavailable",
    ] as const) {
      expect(parseTenantOnboardingApprovalRpcResult({ status }, "bad"))
        .toEqual({ status });
    }
  });

  test("fails malformed approval RPC results closed", () => {
    for (const result of [
      { status: "approved", application_id: ID },
      { status: "unknown" },
      { status: "subject_exists", tenant_id: ID },
      [{ status: "subject_exists" }],
    ]) {
      expect(() => parseTenantOnboardingApprovalRpcResult(result, "invalid"))
        .toThrow(expect.objectContaining({ code: "DB_ERROR" }));
    }
  });

  test("fails every ordinary row family closed with DB_ERROR", () => {
    const invalidParsers = [
      () => parseTenantOnboardingApplication({ ...application, id: "bad" }, "invalid"),
      () => parseTenantOnboardingApplicationSummaries([{ ...summary, version: "1" }], "invalid"),
      () => parseTenantOnboardingNotificationDelivery({ ...delivery, status: "unknown" }, "invalid"),
      () => parseTenantOnboardingRecipientRow({ id: "bad" }, "invalid"),
      () => parseTenantOnboardingLocationContext({ id: "bad" }, "invalid"),
      () => parseTenantOnboardingBusinessFile({ id: "bad" }, "invalid"),
      () => parseTenantOnboardingAdministrativeAreas([{ level: "county" }], "invalid"),
      () => parseTenantOnboardingPartners([{ ...partner, id: "bad" }], "invalid"),
      () => parseTenantOnboardingNestedInvite({ id: "bad" }, "invalid"),
      () => parseTenantOnboardingActiveInvite({ id: "bad" }, "invalid"),
    ];
    for (const parseInvalid of invalidParsers) {
      expect(parseInvalid).toThrow(expect.objectContaining({ code: "DB_ERROR" }));
    }
  });

  test("maps only stable applicant RPC boundary errors", async () => {
    const { mapTenantOnboardingApplicantMutationError } = await import("./tenant-onboarding");
    expect(mapTenantOnboardingApplicantMutationError({
      code: "P0001", message: "TENANT_ONBOARDING_SMS_INVALID",
    })).toMatchObject({ code: "SMS_CODE_INVALID" });
    expect(mapTenantOnboardingApplicantMutationError({
      code: "P0001", message: "TENANT_ONBOARDING_CONTEXT_FORBIDDEN",
    })).toMatchObject({ code: "TENANT_ONBOARDING_APPLICATION_NOT_FOUND" });
    expect(mapTenantOnboardingApplicantMutationError({
      code: "P0001", message: "TENANT_ONBOARDING_DOCUMENT_FORBIDDEN",
    })).toMatchObject({ code: "TENANT_ONBOARDING_DOCUMENT_FORBIDDEN" });
    expect(mapTenantOnboardingApplicantMutationError({
      code: "23505", message: "TENANT_ONBOARDING_DOCUMENT_FORBIDDEN",
    })).toBeNull();
  });
});
