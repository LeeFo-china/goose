import { describe, expect, test } from "bun:test";

import { ErrorCodes } from "@/errors/error-codes";
import { PlatformAuditLogActionSchema } from "@/schema/platform-audit-logs";

import {
  AdministrativeRegionCodeSchema,
  ApproveTenantOnboardingApplicationSchema,
  CreateTenantServiceProviderAreaSchema,
  MobilePhoneSchema,
  PublishTenantServiceProviderProfileSchema,
  RejectTenantOnboardingApplicationSchema,
  RequestSupplementTenantOnboardingApplicationSchema,
  RequestTenantOnboardingPartnerAssistSchema,
  RetryTenantOnboardingNotificationSchema,
  ReturnTenantServiceProviderProfileToDraftSchema,
  StartReviewTenantOnboardingApplicationSchema,
  SubmitTenantOnboardingApplicationSchema,
  SubmitTenantServiceProviderProfileSchema,
  SupplementTenantOnboardingApplicationSchema,
  SuspendTenantServiceProviderProfileSchema,
  TenantOnboardingApplicationListQuerySchema,
  TenantOnboardingApplicationStatusSchema,
  TenantOnboardingPartnerAssistDecisionSchema,
  TenantOnboardingPartnerAssistStatusSchema,
  UnifiedSocialCreditCodeSchema,
  UpdateTenantServiceProviderAreaSchema,
  UpdateTenantServiceProviderProfileSchema,
  WithdrawTenantOnboardingApplicationSchema,
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
  "TENANT_ONBOARDING_INVITE_INVALID",
  "TENANT_ONBOARDING_STATE_CONFLICT",
  "TENANT_ONBOARDING_SUPPLEMENT_NOT_ALLOWED",
  "TENANT_ONBOARDING_PARTNER_AMBIGUOUS",
  "TENANT_ONBOARDING_REVIEW_FORBIDDEN",
  "TENANT_ONBOARDING_APPLICATION_NOT_FOUND",
  "TENANT_ONBOARDING_DOCUMENT_FORBIDDEN",
  "TENANT_ONBOARDING_CLIENT_UPGRADE_REQUIRED",
  "SUPPLIER_NOT_FOUND",
  "SUPPLIER_STATE_CONFLICT",
  "SUPPLIER_VERSION_CONFLICT",
  "SUPPLIER_IDEMPOTENCY_CONFLICT",
  "SUPPLIER_MODULE_DISABLED",
  "TENANT_SUPPLIER_NOT_FOUND",
  "TENANT_SUPPLIER_STATE_CONFLICT",
  "SUPPLIER_ORDER_NOT_ELIGIBLE",
  "SUPPLIER_CATALOG_CONFLICT",
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
  "platform_supplier_create",
  "platform_supplier_submit",
  "platform_supplier_approve",
  "platform_supplier_reject",
  "platform_supplier_suspend",
  "platform_supplier_resume",
  "platform_supplier_blacklist",
  "supplier_qualification_verify",
  "supplier_qualification_reject",
  "tenant_supplier_module_enable",
  "tenant_supplier_module_disable",
  "tenant_supplier_rollout_update",
  "tenant_supplier_contract_policy_update",
  "tenant_supplier_create",
  "tenant_supplier_activate",
  "tenant_supplier_suspend",
  "tenant_supplier_terminate",
  "tenant_supplier_blacklist",
  "supplier_contract_activate",
  "supplier_contract_terminate",
] as const;

type VersionedMutationCase = {
  name: string;
  schema: {
    safeParse: (input: unknown) => { success: boolean };
  };
  validInput: Record<string, unknown>;
};

const versionedMutations = [
  { name: "applicant supplement", schema: SupplementTenantOnboardingApplicationSchema, validInput: { version: 1, company_name: "晴天装饰" } },
  { name: "withdraw", schema: WithdrawTenantOnboardingApplicationSchema, validInput: { version: 1 } },
  { name: "start review", schema: StartReviewTenantOnboardingApplicationSchema, validInput: { version: 1 } },
  { name: "request supplement", schema: RequestSupplementTenantOnboardingApplicationSchema, validInput: { version: 1, required_fields: ["business_license_file_id"], remark: "请补充营业执照" } },
  { name: "request partner assist", schema: RequestTenantOnboardingPartnerAssistSchema, validInput: { version: 1, partner_id: "00000000-0000-4000-8000-000000000701" } },
  { name: "partner assist decision", schema: TenantOnboardingPartnerAssistDecisionSchema, validInput: { version: 1, decision: "verified" } },
  { name: "approve", schema: ApproveTenantOnboardingApplicationSchema, validInput: { version: 1, attribution_mode: "unassigned", review_remark: "主体信息核验通过" } },
  { name: "reject", schema: RejectTenantOnboardingApplicationSchema, validInput: { version: 1, review_remark: "主体信息不符合要求" } },
  { name: "profile update", schema: UpdateTenantServiceProviderProfileSchema, validInput: { version: 1, public_name: "晴天装饰" } },
  { name: "area update", schema: UpdateTenantServiceProviderAreaSchema, validInput: { version: 1, city: "信阳市" } },
  { name: "submit profile review", schema: SubmitTenantServiceProviderProfileSchema, validInput: { version: 1 } },
  { name: "publish profile", schema: PublishTenantServiceProviderProfileSchema, validInput: { version: 1, review_remark: "公开信息核验通过" } },
  { name: "return profile to draft", schema: ReturnTenantServiceProviderProfileToDraftSchema, validInput: { version: 1, review_remark: "请修改公开信息" } },
  { name: "suspend profile", schema: SuspendTenantServiceProviderProfileSchema, validInput: { version: 1, review_remark: "暂停公开展示" } },
] satisfies readonly VersionedMutationCase[];

describe("tenant onboarding schemas", () => {
  test("accepts a complete local-services applicant payload", () => {
    const result = SubmitTenantOnboardingApplicationSchema.safeParse(validInput);

    expect(result.success).toBe(true);
  });

  test("normalizes valid credit codes and rejects invalid forms", () => {
    const normalized = UnifiedSocialCreditCodeSchema.safeParse(
      " 91411525ma9g000000 ",
    );

    expect(normalized.success).toBe(true);
    if (normalized.success) {
      expect(normalized.data).toBe("91411525MA9G000000");
    }
    for (const value of ["91411525MA9I000000", "91411525MA9G00000"]) {
      expect(UnifiedSocialCreditCodeSchema.safeParse(value).success).toBe(false);
    }
  });

  test("rejects invalid mobile phones and administrative region codes", () => {
    for (const value of ["12900139000", "1390013900", "1390013900A"]) {
      expect(MobilePhoneSchema.safeParse(value).success).toBe(false);
    }
    for (const value of ["41152", "4115250", "41152A"]) {
      expect(AdministrativeRegionCodeSchema.safeParse(value).success).toBe(false);
    }

    expect(SubmitTenantOnboardingApplicationSchema.safeParse({
      ...validInput,
      company_location: { ...validInput.company_location, region_code: "41152A" },
    }).success).toBe(false);
    expect(SubmitTenantOnboardingApplicationSchema.safeParse({
      ...validInput,
      service_region_codes: ["41152A"],
    }).success).toBe(false);
  });

  test("rejects out-of-range company coordinates", () => {
    const invalidCoordinates = [
      ["latitude", 90.001],
      ["latitude", -90.001],
      ["longitude", 180.001],
      ["longitude", -180.001],
    ] as const;

    for (const [field, value] of invalidCoordinates) {
      expect(SubmitTenantOnboardingApplicationSchema.safeParse({
        ...validInput,
        company_location: {
          ...validInput.company_location,
          [field]: value,
        },
      }).success).toBe(false);
    }
  });

  test("rejects unknown and camelCase submission fields", () => {
    for (const extra of [
      { unexpected_field: true },
      { companyName: "晴天装饰" },
    ]) {
      expect(SubmitTenantOnboardingApplicationSchema.safeParse({
        ...validInput,
        ...extra,
      }).success).toBe(false);
    }
  });

  test("accepts an optional normalized partner invite code", () => {
    const withoutInvite = SubmitTenantOnboardingApplicationSchema.safeParse(validInput);
    const withNullInvite = SubmitTenantOnboardingApplicationSchema.safeParse({ ...validInput, invite_code: null });
    const withInvite = SubmitTenantOnboardingApplicationSchema.safeParse({
      ...validInput,
      source_channel: "partner_invite",
      invite_code: " cp-411525-abc ",
    });

    expect(withoutInvite.success).toBe(true);
    expect(withNullInvite.success).toBe(true);
    expect(withInvite.success).toBe(true);
    if (withInvite.success) {
      expect(withInvite.data.invite_code).toBe("CP-411525-ABC");
    }
  });

  test("requires an invite code for partner-invite submissions", () => {
    expect(SubmitTenantOnboardingApplicationSchema.safeParse({
      ...validInput,
      source_channel: "partner_invite",
    }).success).toBe(false);
  });

  test("rejects invite codes on local-services submissions", () => {
    expect(SubmitTenantOnboardingApplicationSchema.safeParse({
      ...validInput,
      invite_code: "CP-411525-ABC",
    }).success).toBe(false);
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
    expect(TenantOnboardingApplicationStatusSchema.safeParse("pending").success).toBe(false);
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
    expect(TenantOnboardingPartnerAssistStatusSchema.safeParse("approved").success).toBe(false);
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
    expect(ApproveTenantOnboardingApplicationSchema.safeParse({
      version: 3,
      attribution_mode: "partner",
      final_partner_id: "not-a-uuid",
      review_remark: "主体信息核验通过",
    }).success).toBe(false);
    expect(ApproveTenantOnboardingApplicationSchema.safeParse({
      version: 3,
      attribution_mode: "partner",
      final_partner_id: "00000000-0000-4000-8000-000000000701",
      review_remark: "主体信息核验通过",
    }).success).toBe(true);
  });

  for (const attribution_mode of ["auto", "unassigned"] as const) {
    test(`rejects a final partner for ${attribution_mode} attribution`, () => {
      expect(ApproveTenantOnboardingApplicationSchema.safeParse({
        version: 3,
        attribution_mode,
        final_partner_id: "00000000-0000-4000-8000-000000000701",
        review_remark: "主体信息核验通过",
      }).success).toBe(false);
    });
  }

  for (const mutation of versionedMutations) {
    test(`${mutation.name} requires a positive integer version`, () => {
      const withoutVersion: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(mutation.validInput)) {
        if (key !== "version") withoutVersion[key] = value;
      }

      expect(mutation.schema.safeParse(mutation.validInput).success).toBe(true);
      expect(mutation.schema.safeParse(withoutVersion).success).toBe(false);
      for (const version of [0, -1, 1.5]) {
        expect(mutation.schema.safeParse({
          ...mutation.validInput,
          version,
        }).success).toBe(false);
      }
    });
  }

  test("keeps notification retry unversioned because it changes delivery only", () => {
    expect(RetryTenantOnboardingNotificationSchema.safeParse({}).success).toBe(true);
    expect(RetryTenantOnboardingNotificationSchema.safeParse({ version: 1 }).success).toBe(false);
  });

  test("rejects area updates without caller-supplied business fields", () => {
    expect(UpdateTenantServiceProviderAreaSchema.safeParse({ version: 1 }).success).toBe(false);

    const result = UpdateTenantServiceProviderAreaSchema.safeParse({
      version: 1,
      city: "信阳市",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("priority");
    }
  });

  test("keeps the priority default scoped to area creation", () => {
    const result = CreateTenantServiceProviderAreaSchema.safeParse({
      version: 1,
      city: "信阳市",
      adcode: "411500",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority).toBe(100);
    }
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
    for (const requiredField of ["status", "admin_phone", "company_nmae"]) {
      expect(RequestSupplementTenantOnboardingApplicationSchema.safeParse({
        version: 2,
        required_fields: [requiredField],
        remark: "请补充资料",
      }).success).toBe(false);
    }
  });

  test("rejects blank or oversized approval remarks", () => {
    for (const review_remark of [" ", "验".repeat(501)]) {
      expect(ApproveTenantOnboardingApplicationSchema.safeParse({
        version: 3,
        attribution_mode: "unassigned",
        review_remark,
      }).success).toBe(false);
    }
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
