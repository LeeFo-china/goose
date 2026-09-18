import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  TenantOnboardingApprovalRpcResult,
  TenantOnboardingLicenseAccessRecord,
  TenantOnboardingPlatformApplicationRecord,
} from "@/repositories/tenant-onboarding-types";
import type { AuthContext } from "@/services/authorization";
import type {
  ApprovalRepositoryPort,
  AuditLogServicePort,
  NotificationServicePort,
  RegionResolverPort,
  ReviewRepositoryPort,
} from "@/services/tenant-onboarding-review-ports";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const APPLICATION_ID = "00000000-0000-4000-8000-000000000001";
const EMPLOYEE_ID = "00000000-0000-4000-8000-000000000002";
const TENANT_ID = "00000000-0000-4000-8000-000000000003";
const NOW = "2026-07-14T04:00:00.000Z";

const application: TenantOnboardingPlatformApplicationRecord = {
  id: APPLICATION_ID,
  application_no: "ZQ-20260714-A1B2C3",
  company_name: "晴天装饰",
  unified_social_credit_code: "91411525MA9G000000",
  business_license_file_id: null,
  admin_name: "负责人",
  admin_phone: "13900139000",
  address_province: "河南省",
  address_city: "信阳市",
  address_district: "固始县",
  address_region_code: "411525",
  address: "详细地址",
  address_latitude: null,
  address_longitude: null,
  service_region_codes: ["411525"],
  source_channel: "local_services",
  invite_code_id: null,
  share_link_id: null,
  referred_by_user_id: null,
  referred_by_openid: null,
  referred_by_employee_id: null,
  referral_source: null,
  candidate_partner_id: null,
  candidate_match_reason: null,
  candidate_snapshot: {},
  final_partner_id: null,
  attribution_source_type: null,
  status: "submitted",
  partner_assist_status: "pending",
  partner_assist_requested_at: null,
  partner_assist_due_at: null,
  version: 1,
  converted_tenant_id: null,
  reviewed_by_employee_id: null,
  reviewed_at: null,
  review_remark: null,
  privacy_policy_version: "2026-07",
  onboarding_terms_version: "2026-07",
  consented_at: NOW,
  withdrawn_at: null,
  created_at: NOW,
  updated_at: NOW,
  candidate_partner: null,
  final_partner: null,
};

const approvedApplication: TenantOnboardingPlatformApplicationRecord = {
  ...application,
  status: "approved",
  version: 2,
  converted_tenant_id: TENANT_ID,
};

const noLicenseRecord: TenantOnboardingLicenseAccessRecord = {
  application_id: APPLICATION_ID,
  visitor_id: "visitor-1",
  business_license_file_id: null,
  file: null,
};

const unexpectedCall = mock(async (): Promise<never> => {
  throw new Error("unexpected repository call");
});
const findApplicationById = mock(async () => application);
const findTenantBySlug = mock(async () => null);
const findLicenseAccessRecord = mock(async () => noLicenseRecord);
const repository = {
  listApplications: unexpectedCall,
  findApplicationById,
  listReviews: unexpectedCall,
  startReviewAtomic: unexpectedCall,
  requestSupplementAtomic: unexpectedCall,
  requestPartnerAssistAtomic: unexpectedCall,
  rejectAtomic: unexpectedCall,
  findTenantBySlug,
  findLicenseAccessRecord,
} satisfies ReviewRepositoryPort;

const approval: TenantOnboardingApprovalRpcResult = {
  status: "approved",
  application_id: APPLICATION_ID,
  tenant_id: TENANT_ID,
  binding_id: null,
  profile_id: "00000000-0000-4000-8000-000000000004",
  initialization: {
    template_code: "default_decoration_company",
    template_version: "2026.08.30",
    departments_count: 42,
    posts_count: 48,
    roles_count: 11,
    admin_employee_id: EMPLOYEE_ID,
    admin_role_id: "00000000-0000-4000-8000-000000000005",
  },
  idempotent: false,
};
const approveApplication = mock(async () => approval);
const approvalRepository = { approveApplication } satisfies ApprovalRepositoryPort;
const deliver = mock(async () => null);
const notificationService = {
  deliver,
  retry: unexpectedCall,
} satisfies NotificationServicePort;
const recordBestEffort = mock(async () => null);
const auditLogService = { recordBestEffort } satisfies AuditLogServicePort;
const resolveSigned = mock(async () => "https://private.example/signed-license");
const resolveRegion = mock(async () => ({
  kind: "none" as const,
  partnerIds: [] as [],
  selectedPartner: null,
  reason: "no_eligible_partner" as const,
}));
const regionResolver = { resolve: resolveRegion } satisfies RegionResolverPort;

const auth: AuthContext = {
  authUserId: "auth-user-1",
  employeeId: EMPLOYEE_ID,
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  isPlatformAdmin: true,
  employeeName: "平台审核员",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["platform_admin"],
  roles: [],
  permissions: [{ code: "platform.tenant_onboarding.review", scope: "all" }],
};

async function createService() {
  const { TenantOnboardingReviewService } = await import(
    "@/services/tenant-onboarding-review"
  );
  return new TenantOnboardingReviewService({
    repository,
    approvalRepository,
    notificationService,
    regionResolver,
    auditLogService,
    resolveSignedStoredFileUrl: resolveSigned,
    clock: () => new Date(NOW),
    tenantSlugGenerator: () => "zq-no-license-1",
  });
}

beforeEach(() => {
  for (const dependency of [
    unexpectedCall,
    findApplicationById,
    findTenantBySlug,
    findLicenseAccessRecord,
    approveApplication,
    deliver,
    recordBestEffort,
    resolveSigned,
    resolveRegion,
  ]) dependency.mockClear();
  findApplicationById
    .mockImplementationOnce(async () => application)
    .mockImplementationOnce(async () => approvedApplication);
  findLicenseAccessRecord.mockImplementation(async () => noLicenseRecord);
});

describe("TenantOnboardingReviewService optional business license", () => {
  test("reports that an existing application has no uploaded license", async () => {
    const service = await createService();

    await expect(service.accessLicense(auth, APPLICATION_ID)).rejects.toMatchObject({
      statusCode: 404,
      code: "TENANT_ONBOARDING_DOCUMENT_NOT_UPLOADED",
    });
    expect(resolveSigned).not.toHaveBeenCalled();
  });

  test("approves an application without a business license", async () => {
    const service = await createService();

    const result = await service.approve(auth, APPLICATION_ID, {
      version: 1,
      attribution_mode: "unassigned",
      review_remark: "主体信息核验通过",
    });

    expect(approveApplication).toHaveBeenCalledWith(expect.objectContaining({
      applicationId: APPLICATION_ID,
      expectedVersion: 1,
      reviewerEmployeeId: EMPLOYEE_ID,
    }));
    expect(result.approval).toEqual(approval);
    expect(result.application).toEqual(approvedApplication);
  });
});
