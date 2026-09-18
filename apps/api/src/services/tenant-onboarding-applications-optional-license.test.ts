import { beforeEach, describe, expect, mock, test } from "bun:test";

import type {
  TenantOnboardingBusinessLicenseRecord,
  TenantOnboardingCreateApplicationInput,
} from "@/repositories/tenant-onboarding";
import type {
  TenantOnboardingApplicationRecord,
  TenantOnboardingApplicationSummaryRecord,
} from "@/repositories/tenant-onboarding-types";
import type { SubmitTenantOnboardingApplicationInput } from "@/schema/tenant-onboarding";
import type { TenantOnboardingPartnerResolution } from "./tenant-onboarding-region-match";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const NOW = "2026-07-14T08:00:00.000Z";
const VISITOR_ID = "visitor-applicant-optional-license";
const APPLICATION_ID = "00000000-0000-4000-8000-000000000101";
const CONTEXT_ID = "00000000-0000-4000-8000-000000000201";
const IDEMPOTENCY_KEY = "tenant-onboarding-optional-license";

const application: TenantOnboardingApplicationRecord = {
  id: APPLICATION_ID,
  application_no: "ZQ-20260714-A1B2",
  visitor_id: VISITOR_ID,
  visitor_context_id: CONTEXT_ID,
  company_name: "晴天装饰",
  unified_social_credit_code: "91411525MA9G000000",
  business_license_file_id: null,
  admin_name: "负责人",
  admin_phone: "13900139000",
  address_province: "河南省",
  address_city: "信阳市",
  address_district: "固始县",
  address_region_code: "411525",
  address: "蓼城大道 1 号",
  address_latitude: 32,
  address_longitude: 115,
  service_region_codes: ["411525"],
  source_channel: "local_services",
  invite_code_id: null,
  candidate_partner_id: null,
  candidate_match_reason: "no_eligible_partner",
  candidate_snapshot: { partner_ids: [] },
  final_partner_id: null,
  attribution_source_type: null,
  status: "submitted",
  partner_assist_status: "not_applicable",
  partner_assist_requested_at: null,
  partner_assist_due_at: null,
  version: 1,
  converted_tenant_id: null,
  reviewed_by_employee_id: null,
  reviewed_at: null,
  review_remark: null,
  privacy_policy_version: "privacy-1",
  onboarding_terms_version: "terms-1",
  consented_at: NOW,
  idempotency_key: IDEMPOTENCY_KEY,
  withdrawn_at: null,
  created_at: NOW,
  updated_at: NOW,
};

const submission: SubmitTenantOnboardingApplicationInput = {
  company_name: "晴天装饰",
  unified_social_credit_code: "91411525MA9G000000",
  admin_name: "负责人",
  admin_phone: "13900139000",
  sms_code: "123456",
  company_location: {
    province: "河南省",
    city: "信阳市",
    district: "固始县",
    region_code: "411525",
    address: "蓼城大道 1 号",
    latitude: 32,
    longitude: 115,
  },
  service_region_codes: ["411525"],
  visitor_context_id: CONTEXT_ID,
  source_channel: "local_services",
  invite_code: null,
  privacy_policy_version: "privacy-1",
  onboarding_terms_version: "terms-1",
  agree_privacy: true,
};

const unmatchedResolution: TenantOnboardingPartnerResolution = {
  kind: "none",
  partnerIds: [],
  selectedPartner: null,
  reason: "no_eligible_partner",
};

type AtomicCreateInput = {
  application: TenantOnboardingCreateApplicationInput;
  smsCodeId: string;
  smsPhone: string;
  now: string;
};

const repository = {
  createApplicationAtomic: mock(async (_input: AtomicCreateInput) => ({
    application,
    created: true,
  })),
  findByVisitorAndIdempotencyKey: mock(
    async () => null as TenantOnboardingApplicationRecord | null,
  ),
  findOpenByCreditCode: mock(
    async () => null as TenantOnboardingApplicationRecord | null,
  ),
  findOwnedById: mock(
    async () => application as TenantOnboardingApplicationRecord | null,
  ),
  listOwned: mock(async (): Promise<{
    list: TenantOnboardingApplicationSummaryRecord[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
  }> => ({
    list: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  })),
  supplementAtomic: mock(
    async () => ({ ...application, version: 2 }) as TenantOnboardingApplicationRecord,
  ),
  withdrawAtomic: mock(
    async () => ({ ...application, status: "withdrawn", version: 2 }) as TenantOnboardingApplicationRecord,
  ),
};
const smsService = {
  sendCode: mock(async () => ({ success: true as const })),
  findValidPending: mock(async () => ({ id: "sms-code-id" })),
};
const locationContextRepository = {
  findById: mock(async () => ({ id: CONTEXT_ID, visitor_id: VISITOR_ID })),
};
const fileRepository = {
  findById: mock(async (): Promise<TenantOnboardingBusinessLicenseRecord | null> => null),
};
const regionResolver = {
  resolve: mock(async () => unmatchedResolution),
};
const inviteCodeRepository = {
  findActiveInviteCodeByCode: mock(async () => null),
  findActiveInviteCodeById: mock(async () => null),
};
const notificationService = { deliver: mock(async () => undefined) };

async function createService() {
  const { TenantOnboardingApplicationsService } = await import(
    "./tenant-onboarding-applications"
  );
  return new TenantOnboardingApplicationsService({
    repository,
    smsService,
    locationContextRepository,
    fileRepository,
    regionResolver,
    inviteCodeRepository,
    notificationService,
    clock: () => new Date(NOW),
    applicationNumberGenerator: () => "ZQ-20260714-A1B2",
  });
}

describe("TenantOnboardingApplicationsService optional business license", () => {
  beforeEach(() => {
    for (const dependency of [
      ...Object.values(repository),
      ...Object.values(smsService),
      locationContextRepository.findById,
      fileRepository.findById,
      regionResolver.resolve,
      inviteCodeRepository.findActiveInviteCodeByCode,
      inviteCodeRepository.findActiveInviteCodeById,
      notificationService.deliver,
    ]) {
      dependency.mockClear();
    }
  });

  test("submits without a license and skips the file lookup", async () => {
    await (await createService()).submit(submission, {
      visitorId: VISITOR_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    expect(fileRepository.findById).not.toHaveBeenCalled();
    expect(repository.createApplicationAtomic).toHaveBeenCalledWith(
      expect.objectContaining({
        application: expect.objectContaining({
          business_license_file_id: null,
        }),
      }),
    );
  });

  test("clears a license during supplement without a file lookup", async () => {
    repository.findOwnedById.mockImplementationOnce(async () => ({
      ...application,
      status: "supplement_required",
    }));

    await (await createService()).supplement({
      applicationId: APPLICATION_ID,
      visitorId: VISITOR_ID,
      expectedVersion: 1,
      patch: { business_license_file_id: null },
    });

    expect(fileRepository.findById).not.toHaveBeenCalled();
    expect(repository.supplementAtomic).toHaveBeenCalledWith(
      expect.objectContaining({
        patch: { business_license_file_id: null },
      }),
    );
  });
});
