import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { TenantOnboardingApplicationRecord } from "@/repositories/tenant-onboarding-types";
import {
  SubmitTenantOnboardingApplicationSchema,
  type SubmitTenantOnboardingApplicationInput,
} from "@/schema/tenant-onboarding";
import type { TenantOnboardingPartnerResolution } from "./tenant-onboarding-region-match";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const APPLICATION_ID = "00000000-0000-4000-8000-000000000101";
const CONTEXT_ID = "00000000-0000-4000-8000-000000000201";
const FILE_ID = "00000000-0000-4000-8000-000000000301";
const VISITOR_ID = "visitor-optional-credit-code";
const NOW = "2026-09-17T08:00:00.000Z";

const submission = {
  company_name: "晴天装饰",
  unified_social_credit_code: "91411525MA9G000000",
  business_license_file_id: FILE_ID,
  admin_name: "负责人",
  admin_phone: "13900139000",
  sms_code: "123456",
  company_location: {
    province: "河南省",
    city: "信阳市",
    district: "固始县",
    region_code: "411525",
    address: "蓼城大道 1 号",
  },
  service_region_codes: ["411525"],
  visitor_context_id: CONTEXT_ID,
  source_channel: "local_services",
  invite_code: null,
  privacy_policy_version: "privacy-1",
  onboarding_terms_version: "terms-1",
  agree_privacy: true,
} satisfies SubmitTenantOnboardingApplicationInput;

const application = {
  id: APPLICATION_ID,
  version: 1,
  status: "submitted",
  service_region_codes: ["411525"],
  invite_code_id: null,
  unified_social_credit_code: null,
} as TenantOnboardingApplicationRecord;
const noPartnerResolution: TenantOnboardingPartnerResolution = {
  kind: "none",
  partnerIds: [],
  selectedPartner: null,
  reason: "no_eligible_partner",
};

const repository = {
  createApplicationAtomic: mock(async () => ({ application, created: true })),
  findByVisitorAndIdempotencyKey: mock(async () => null),
  findOpenByCreditCode: mock(async () => null),
  findOwnedById: mock(async () => application),
  listOwned: mock(async () => ({
    list: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  })),
  supplementAtomic: mock(async () => application),
  withdrawAtomic: mock(async () => application),
};

async function createService() {
  const { TenantOnboardingApplicationsService } = await import(
    "./tenant-onboarding-applications"
  );
  return new TenantOnboardingApplicationsService({
    repository,
    smsService: {
      sendCode: mock(async () => ({ success: true })),
      findValidPending: mock(async () => ({ id: "sms-code-id" })),
    },
    locationContextRepository: {
      findById: mock(async () => ({ id: CONTEXT_ID, visitor_id: VISITOR_ID })),
    },
    fileRepository: {
      findById: mock(async () => ({
        id: FILE_ID,
        owner_type: "visitor",
        owner_visitor_id: VISITOR_ID,
        scene: "tenant_onboarding_license",
        status: "active",
        visibility: "private",
        public_url: null,
        deleted_at: null,
      })),
    },
    regionResolver: {
      resolve: mock(async () => noPartnerResolution),
    },
    inviteCodeRepository: {
      findActiveInviteCodeByCode: mock(async () => null),
      findActiveInviteCodeById: mock(async () => null),
    },
    notificationService: { deliver: mock(async () => undefined) },
    clock: () => new Date(NOW),
    applicationNumberGenerator: () => "ZQ-20260917-OPTIONAL",
  });
}

describe("optional tenant onboarding credit code", () => {
  beforeEach(() => {
    repository.createApplicationAtomic.mockClear();
    repository.findOpenByCreditCode.mockClear();
    repository.findOwnedById.mockClear();
    repository.supplementAtomic.mockClear();
  });

  test("normalizes omitted, null, empty, and whitespace-only input to null", () => {
    const { unified_social_credit_code: _creditCode, ...withoutCreditCode } = submission;
    for (const payload of [
      withoutCreditCode,
      { ...submission, unified_social_credit_code: null },
      { ...submission, unified_social_credit_code: "" },
      { ...submission, unified_social_credit_code: "   " },
    ]) {
      expect(SubmitTenantOnboardingApplicationSchema.parse(payload)
        .unified_social_credit_code).toBeNull();
    }
  });

  test("persists a missing code as null without a duplicate lookup", async () => {
    await (await createService()).submit(
      { ...submission, unified_social_credit_code: null },
      { visitorId: VISITOR_ID, idempotencyKey: "optional-credit-code" },
    );

    expect(repository.findOpenByCreditCode).not.toHaveBeenCalled();
    expect(repository.createApplicationAtomic).toHaveBeenCalledWith(
      expect.objectContaining({
        application: expect.objectContaining({ unified_social_credit_code: null }),
      }),
    );
  });

  test("clears a supplemented code without a duplicate lookup", async () => {
    repository.findOwnedById.mockImplementationOnce(async () => ({
      ...application,
      status: "supplement_required",
      version: 4,
    }));

    await (await createService()).supplement({
      applicationId: APPLICATION_ID,
      visitorId: VISITOR_ID,
      expectedVersion: 4,
      patch: { unified_social_credit_code: null },
    });

    expect(repository.findOpenByCreditCode).not.toHaveBeenCalled();
    expect(repository.supplementAtomic).toHaveBeenCalledWith(
      expect.objectContaining({ patch: { unified_social_credit_code: null } }),
    );
  });
});
