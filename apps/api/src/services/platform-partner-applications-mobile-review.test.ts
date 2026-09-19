import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { PlatformPartnerApplicationReviewCommandResult } from "@/repositories/platform-partner-applications";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const applicationId = "00000000-0000-4000-8000-000000000601";
const partnerId = "00000000-0000-4000-8000-000000000201";
const auth = {
  authUserId: "auth-platform",
  employeeId: "employee-platform",
  tenantId: null,
  isPlatformAdmin: true,
  isPlatformStaff: true,
  permissions: [],
} as unknown as AuthContext;

const approvedResult: PlatformPartnerApplicationReviewCommandResult = {
  status: "updated",
  idempotent: false,
  application: {
    id: applicationId,
    status: "approved",
    version: 2,
    converted_partner_id: partnerId,
  },
  partner: {
    id: partnerId,
    name: "信阳星河装饰运营中心",
    status: "active",
    default_invite_code: "CP-411502-000000000201",
  },
};

const applicationRepository = {
  createApplication: mock(async () => null as never),
  findActiveApplicationByPhone: mock(async () => null),
  listApplications: mock(async () => ({ list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } })),
  findApplicationById: mock(async () => null),
  updateApplicationStatus: mock(async () => null as never),
  markApplicationApproved: mock(async () => null as never),
  reviewApplicationAtomic: mock(async (): Promise<PlatformPartnerApplicationReviewCommandResult> => approvedResult),
};
const regionPolicy = {
  assertAssignableDistricts: mock(async (codes: readonly string[]) => [...codes]),
};

async function createService() {
  const { PlatformPartnerApplicationsService } = await import("./platform-partner-applications");
  return new PlatformPartnerApplicationsService({
    applicationRepository,
    partnerRepository: {
      createPartner: mock(async () => null as never),
      createPartnerMember: mock(async () => null as never),
    },
    regionPolicy,
    audit: { recordBestEffort: mock(async () => null) },
  });
}

describe("PlatformPartnerApplicationsService mobile review", () => {
  beforeEach(() => {
    applicationRepository.reviewApplicationAtomic.mockClear();
    applicationRepository.reviewApplicationAtomic.mockImplementation(async () => approvedResult);
    regionPolicy.assertAssignableDistricts.mockClear();
  });

  test("approves through the atomic versioned command", async () => {
    const service = await createService();
    const result = await service.approveMobileApplication(auth, applicationId, {
      expected_version: 1,
      remark: "符合合作条件",
      partner_level_code: "city",
      region_codes: ["411502"],
      generate_default_invite_code: true,
    }, "00000000-0000-4000-8000-000000000901");

    expect(applicationRepository.reviewApplicationAtomic).toHaveBeenCalledWith({
      applicationId,
      expectedVersion: 1,
      action: "approve",
      remark: "符合合作条件",
      requiredFields: [],
      partnerLevelCode: "city_partner",
      regionCodes: ["411502"],
      generateDefaultInviteCode: true,
      actorEmployeeId: "employee-platform",
      idempotencyKey: "00000000-0000-4000-8000-000000000901",
      requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(result.partner?.default_invite_code).toBe("CP-411502-000000000201");
  });

  test("maps version conflicts", async () => {
    applicationRepository.reviewApplicationAtomic.mockImplementationOnce(async () => ({
      status: "version_conflict",
      current_version: 2,
    }));
    const service = await createService();

    await expect(service.rejectMobileApplication(auth, applicationId, {
      expected_version: 1,
      remark: "暂不符合合作条件",
    }, "00000000-0000-4000-8000-000000000902"))
      .rejects.toMatchObject({ statusCode: 409, code: "VERSION_CONFLICT" });
  });

  test("replays supplement requests with the same idempotency key", async () => {
    applicationRepository.reviewApplicationAtomic.mockImplementationOnce(async () => ({
      status: "updated",
      idempotent: true,
      application: {
        id: applicationId,
        status: "supplement_required",
        version: 2,
        converted_partner_id: null,
      },
      partner: null,
    }));
    const service = await createService();
    const result = await service.requestMobileSupplement(auth, applicationId, {
      expected_version: 1,
      remark: "请补充资源说明",
      required_fields: ["resource_description"],
    }, "00000000-0000-4000-8000-000000000903");

    expect(result.idempotent).toBe(true);
    expect(applicationRepository.reviewApplicationAtomic).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "request_supplement",
        requiredFields: ["resource_description"],
        idempotencyKey: "00000000-0000-4000-8000-000000000903",
      }),
    );
  });
});
