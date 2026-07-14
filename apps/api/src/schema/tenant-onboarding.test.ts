import { describe, expect, test } from "bun:test";

import { ErrorCodes } from "@/errors/error-codes";
import { PlatformAuditLogActionSchema } from "@/schema/platform-audit-logs";

import {
  ApproveTenantOnboardingApplicationSchema,
  RequestSupplementTenantOnboardingApplicationSchema,
  StartReviewTenantOnboardingApplicationSchema,
  SubmitTenantOnboardingApplicationSchema,
  SupplementTenantOnboardingApplicationSchema,
  TenantOnboardingApplicationListQuerySchema,
  TenantOnboardingApplicationStatusSchema,
  TenantOnboardingPartnerAssistStatusSchema,
} from "./tenant-onboarding";

const validInput = {
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

const stableErrorCodes = [
  "TENANT_ONBOARDING_APPLICATION_DUPLICATED",
  "TENANT_ONBOARDING_SUBJECT_EXISTS",
  "TENANT_ONBOARDING_PHONE_MEMBER_EXISTS",
  "TENANT_ONBOARDING_LICENSE_REQUIRED",
  "TENANT_ONBOARDING_REGION_INVALID",
  "TENANT_ONBOARDING_STATE_CONFLICT",
  "TENANT_ONBOARDING_SUPPLEMENT_NOT_ALLOWED",
  "TENANT_ONBOARDING_PARTNER_AMBIGUOUS",
  "TENANT_ONBOARDING_REVIEW_FORBIDDEN",
  "TENANT_ONBOARDING_APPLICATION_NOT_FOUND",
  "TENANT_ONBOARDING_DOCUMENT_FORBIDDEN",
  "TENANT_ONBOARDING_CLIENT_UPGRADE_REQUIRED",
] as const;

const stableAuditActions = [
  "tenant_onboarding_submit",
  "tenant_onboarding_start_review",
  "tenant_onboarding_request_supplement",
  "tenant_onboarding_request_partner_assist",
  "tenant_onboarding_approve",
  "tenant_onboarding_reject",
  "tenant_onboarding_withdraw",
  "tenant_onboarding_partner_assist",
  "tenant_onboarding_notification_retry",
  "service_provider_submit_review",
  "service_provider_publish",
  "service_provider_return_draft",
  "service_provider_suspend",
] as const;

describe("tenant onboarding schemas", () => {
  test("accepts a complete local-services applicant payload", () => {
    const result = SubmitTenantOnboardingApplicationSchema.safeParse(validInput);

    expect(result.success).toBe(true);
  });

  test("accepts an optional normalized partner invite code", () => {
    const withoutInvite = SubmitTenantOnboardingApplicationSchema.safeParse(validInput);
    const withInvite = SubmitTenantOnboardingApplicationSchema.safeParse({
      ...validInput,
      source_channel: "partner_invite",
      invite_code: " cp-411525-abc ",
    });

    expect(withoutInvite.success).toBe(true);
    expect(withInvite.success).toBe(true);
    if (withInvite.success) {
      expect(withInvite.data.invite_code).toBe("CP-411525-ABC");
    }
  });

  test("accepts at most 20 unique service regions", () => {
    const twentyRegions = Array.from(
      { length: 20 },
      (_, index) => String(410000 + index),
    );
    const accepted = SubmitTenantOnboardingApplicationSchema.safeParse({
      ...validInput,
      service_region_codes: twentyRegions,
    });
    const tooMany = SubmitTenantOnboardingApplicationSchema.safeParse({
      ...validInput,
      service_region_codes: [...twentyRegions, "410020"],
    });
    const duplicated = SubmitTenantOnboardingApplicationSchema.safeParse({
      ...validInput,
      service_region_codes: ["411525", "411525"],
    });

    expect(accepted.success).toBe(true);
    expect(tooMany.success).toBe(false);
    expect(duplicated.success).toBe(false);
  });

  test("requires non-empty consent versions and privacy agreement", () => {
    expect(SubmitTenantOnboardingApplicationSchema.safeParse({
      ...validInput,
      privacy_policy_version: " ",
    }).success).toBe(false);
    expect(SubmitTenantOnboardingApplicationSchema.safeParse({
      ...validInput,
      onboarding_terms_version: "",
    }).success).toBe(false);
    expect(SubmitTenantOnboardingApplicationSchema.safeParse({
      ...validInput,
      agree_privacy: false,
    }).success).toBe(false);
  });

  test("accepts all application statuses", () => {
    const statuses = [
      "submitted",
      "reviewing",
      "supplement_required",
      "approved",
      "rejected",
      "withdrawn",
    ] as const;

    for (const status of statuses) {
      expect(TenantOnboardingApplicationStatusSchema.safeParse(status).success).toBe(true);
    }
  });

  test("accepts all partner assist statuses", () => {
    const statuses = [
      "not_applicable",
      "pending",
      "verified",
      "supplement_suggested",
      "not_recommended",
      "expired",
    ] as const;

    for (const status of statuses) {
      expect(TenantOnboardingPartnerAssistStatusSchema.safeParse(status).success).toBe(true);
    }
  });

  test("requires a positive optimistic version on approval", () => {
    const accepted = ApproveTenantOnboardingApplicationSchema.safeParse({
      version: 3,
      attribution_mode: "unassigned",
      review_remark: "主体信息核验通过",
    });
    const rejected = ApproveTenantOnboardingApplicationSchema.safeParse({
      version: 0,
      attribution_mode: "unassigned",
      review_remark: "主体信息核验通过",
    });

    expect(accepted.success).toBe(true);
    expect(rejected.success).toBe(false);
  });

  test("requires a selected partner for partner attribution", () => {
    const result = ApproveTenantOnboardingApplicationSchema.safeParse({
      version: 3,
      attribution_mode: "partner",
      review_remark: "主体信息核验通过",
    });

    expect(result.success).toBe(false);
  });

  test("requires positive versions on supplement and review mutations", () => {
    expect(StartReviewTenantOnboardingApplicationSchema.safeParse({ version: 1 }).success).toBe(true);
    expect(StartReviewTenantOnboardingApplicationSchema.safeParse({ version: 0 }).success).toBe(false);
    expect(SupplementTenantOnboardingApplicationSchema.safeParse({
      version: 2,
      company_name: "固始晴天装饰工程有限公司",
    }).success).toBe(true);
    expect(SupplementTenantOnboardingApplicationSchema.safeParse({
      version: -1,
      company_name: "固始晴天装饰工程有限公司",
    }).success).toBe(false);
  });

  test("requires unique supplement fields and a nonblank remark", () => {
    expect(RequestSupplementTenantOnboardingApplicationSchema.safeParse({
      version: 2,
      required_fields: ["business_license_file_id"],
      remark: "请上传清晰的营业执照",
    }).success).toBe(true);
    expect(RequestSupplementTenantOnboardingApplicationSchema.safeParse({
      version: 2,
      required_fields: [],
      remark: "请补充资料",
    }).success).toBe(false);
    expect(RequestSupplementTenantOnboardingApplicationSchema.safeParse({
      version: 2,
      required_fields: ["company_name", "company_name"],
      remark: "请补充资料",
    }).success).toBe(false);
    expect(RequestSupplementTenantOnboardingApplicationSchema.safeParse({
      version: 2,
      required_fields: ["company_name"],
      remark: " ",
    }).success).toBe(false);
  });

  test("coerces and defaults paginated list query values", () => {
    const defaults = TenantOnboardingApplicationListQuerySchema.safeParse({});
    const strings = TenantOnboardingApplicationListQuerySchema.safeParse({
      page: "2",
      pageSize: "50",
    });

    expect(defaults.success).toBe(true);
    expect(strings.success).toBe(true);
    if (defaults.success) {
      expect(defaults.data).toEqual({ page: 1, pageSize: 20 });
    }
    if (strings.success) {
      expect(strings.data.page).toBe(2);
      expect(strings.data.pageSize).toBe(50);
    }
  });

  test("rejects list page sizes over 100", () => {
    expect(TenantOnboardingApplicationListQuerySchema.safeParse({
      pageSize: 101,
    }).success).toBe(false);
  });

  test("exposes stable tenant onboarding error codes", () => {
    for (const code of stableErrorCodes) {
      expect(ErrorCodes[code]).toBe(code);
    }
  });

  test("accepts all tenant onboarding audit actions", () => {
    for (const action of stableAuditActions) {
      expect(PlatformAuditLogActionSchema.safeParse(action).success).toBe(true);
    }
  });
});
