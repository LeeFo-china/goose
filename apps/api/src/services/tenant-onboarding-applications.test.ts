import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Errors } from "@/errors/error-factory";
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
const VISITOR_ID = "visitor-applicant-1";
const APPLICATION_ID = "00000000-0000-4000-8000-000000000101";
const CONTEXT_ID = "00000000-0000-4000-8000-000000000201";
const FILE_ID = "00000000-0000-4000-8000-000000000301";
const PARTNER_ID = "00000000-0000-4000-8000-000000000401";
const INVITE_ID = "00000000-0000-4000-8000-000000000501";
const IDEMPOTENCY_KEY = "tenant-onboarding-request-1";
const APP_NO_CONSTRAINT = "tenant_onboarding_applications_application_no_key";
const OPEN_CONSTRAINT = "tenant_onboarding_applications_open_subject_unique_idx";
const IDEMPOTENCY_CONSTRAINT =
  "tenant_onboarding_applications_visitor_idempotency_unique";

const application: TenantOnboardingApplicationRecord = {
  id: APPLICATION_ID, application_no: "ZQ-20260714-A1B2", visitor_id: VISITOR_ID,
  visitor_context_id: CONTEXT_ID, company_name: "晴天装饰",
  unified_social_credit_code: "91411525MA9G000000", business_license_file_id: FILE_ID,
  admin_name: "负责人", admin_phone: "13900139000", address_province: "河南省",
  address_city: "信阳市", address_district: "固始县", address_region_code: "411525",
  address: "蓼城大道 1 号", address_latitude: 32, address_longitude: 115,
  service_region_codes: ["411525"], source_channel: "local_services",
  invite_code_id: null, candidate_partner_id: PARTNER_ID, candidate_match_reason: "region",
  candidate_snapshot: { partner_id: PARTNER_ID }, final_partner_id: null,
  attribution_source_type: null, status: "submitted", partner_assist_status: "pending",
  partner_assist_requested_at: NOW, partner_assist_due_at: "2026-07-16T08:00:00.000Z",
  version: 1, converted_tenant_id: null, reviewed_by_employee_id: null, reviewed_at: null,
  review_remark: null, privacy_policy_version: "privacy-1", onboarding_terms_version: "terms-1",
  consented_at: NOW, idempotency_key: IDEMPOTENCY_KEY, withdrawn_at: null,
  created_at: NOW, updated_at: NOW,
};

const submission: SubmitTenantOnboardingApplicationInput = {
  company_name: "晴天装饰", unified_social_credit_code: "91411525MA9G000000",
  business_license_file_id: FILE_ID, admin_name: "负责人", admin_phone: "13900139000",
  sms_code: "123456", company_location: {
    province: "河南省", city: "信阳市", district: "固始县", region_code: "411525",
    address: "蓼城大道 1 号", latitude: 32, longitude: 115,
  },
  service_region_codes: ["411525"], visitor_context_id: CONTEXT_ID,
  source_channel: "local_services", invite_code: null,
  privacy_policy_version: "privacy-1", onboarding_terms_version: "terms-1",
  agree_privacy: true,
};

const uniqueResolution: TenantOnboardingPartnerResolution = {
  kind: "unique", partnerIds: [PARTNER_ID],
  selectedPartner: {
    id: PARTNER_ID, name: "信阳合伙人", status: "active", region_codes: ["411500"],
  },
  reason: "region",
};
const unmatchedResolutions: Array<[string, TenantOnboardingPartnerResolution]> = [
  ["none", {
    kind: "none", partnerIds: [], selectedPartner: null,
    reason: "no_eligible_partner",
  }],
  ["ambiguous", {
    kind: "ambiguous", partnerIds: [PARTNER_ID, "partner-2"],
    selectedPartner: null, reason: "same_specificity",
  }],
];
const license: TenantOnboardingBusinessLicenseRecord = {
  id: FILE_ID, owner_type: "visitor", owner_visitor_id: VISITOR_ID,
  scene: "tenant_onboarding_license", status: "active", visibility: "private",
  public_url: null, deleted_at: null,
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
  findByVisitorAndIdempotencyKey: mock(async () => null as TenantOnboardingApplicationRecord | null),
  findOpenByCreditCode: mock(async () => null as TenantOnboardingApplicationRecord | null),
  findOwnedById: mock(async () => application as TenantOnboardingApplicationRecord | null),
  listOwned: mock(async (): Promise<{
    list: TenantOnboardingApplicationSummaryRecord[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
  }> => ({
    list: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  })),
  supplementAtomic: mock(async () => ({ ...application, status: "submitted" as const, version: 2 }) as TenantOnboardingApplicationRecord | null),
  withdrawAtomic: mock(async () => ({ ...application, status: "withdrawn" as const, version: 2 }) as TenantOnboardingApplicationRecord | null),
};
const smsService = {
  sendCode: mock(async () => ({ success: true as const })),
  findValidPending: mock(async () => ({ id: "sms-code-id" }) as { id: string } | null),
};
const locationContextRepository = {
  findById: mock(async (): Promise<{ id: string; visitor_id: string | null } | null> =>
    ({ id: CONTEXT_ID, visitor_id: VISITOR_ID })
  ),
};
const fileRepository = {
  findById: mock(async (): Promise<TenantOnboardingBusinessLicenseRecord | null> =>
    license
  ),
};
const regionResolver = {
  resolve: mock(async (): Promise<TenantOnboardingPartnerResolution> => uniqueResolution),
};
const inviteCodeRepository = {
  findActiveInviteCodeByCode: mock(async () => null as { id: string; code: string; partner_id: string } | null),
  findActiveInviteCodeById: mock(async () => null as { id: string; code: string; partner_id: string } | null),
};
const notificationService = { deliver: mock(async () => undefined) };

async function createService(numbers = ["ZQ-20260714-A1B2"]) {
  const { TenantOnboardingApplicationsService } = await import("./tenant-onboarding-applications");
  let index = 0;
  return new TenantOnboardingApplicationsService({
    repository, smsService, locationContextRepository, fileRepository,
    regionResolver, inviteCodeRepository, notificationService,
    clock: () => new Date(NOW),
    applicationNumberGenerator: () => numbers[index++] ?? numbers.at(-1)!,
  });
}

function context() {
  return { visitorId: VISITOR_ID, idempotencyKey: IDEMPOTENCY_KEY };
}

describe("TenantOnboardingApplicationsService atomic applicant flow", () => {
  beforeEach(() => {
    for (const value of Object.values(repository)) value.mockClear();
    for (const value of Object.values(smsService)) value.mockClear();
    locationContextRepository.findById.mockClear();
    fileRepository.findById.mockClear();
    regionResolver.resolve.mockClear();
    inviteCodeRepository.findActiveInviteCodeByCode.mockClear();
    inviteCodeRepository.findActiveInviteCodeById.mockClear();
    notificationService.deliver.mockClear();
    repository.createApplicationAtomic.mockImplementation(async () => ({ application, created: true }));
    repository.findByVisitorAndIdempotencyKey.mockImplementation(async () => null);
    repository.findOpenByCreditCode.mockImplementation(async () => null);
    repository.findOwnedById.mockImplementation(async () => application);
    repository.supplementAtomic.mockImplementation(async () => ({ ...application, version: 2 }));
    repository.withdrawAtomic.mockImplementation(async () => ({ ...application, status: "withdrawn", version: 2 }));
    smsService.findValidPending.mockImplementation(async () => ({ id: "sms-code-id" }));
    locationContextRepository.findById.mockImplementation(async () => ({ id: CONTEXT_ID, visitor_id: VISITOR_ID }));
    fileRepository.findById.mockImplementation(async () => license);
    regionResolver.resolve.mockImplementation(async () => uniqueResolution);
    inviteCodeRepository.findActiveInviteCodeByCode.mockImplementation(async () => null);
    inviteCodeRepository.findActiveInviteCodeById.mockImplementation(async () => null);
  });

  test("uses the applicant-only scene and one atomic durable mutation", async () => {
    const service = await createService();
    await service.sendCode({ phone: " 13900139000 ", requestIp: null, requestDevice: null });
    const result = await service.submit(submission, context());

    expect(smsService.sendCode).toHaveBeenCalledWith(expect.objectContaining({
      scene: "tenant_onboarding_application", phone: "13900139000",
    }));
    expect(smsService.findValidPending).toHaveBeenCalledWith({
      phone: "13900139000", scene: "tenant_onboarding_application", code: "123456",
    });
    expect(repository.createApplicationAtomic).toHaveBeenCalledWith(expect.objectContaining({
      smsCodeId: "sms-code-id", smsPhone: "13900139000", now: NOW,
    }));
    expect(notificationService.deliver).toHaveBeenCalledWith({
      applicationId: APPLICATION_ID,
      applicationVersion: 1,
      eventType: "submitted",
    });
    expect(result).toEqual({
      application,
      next_action: "wait_for_review",
      estimated_review_hours: 48,
      created: true,
      idempotent: false,
    });
  });

  test("returns a pre-existing idempotent result without touching SMS", async () => {
    repository.findByVisitorAndIdempotencyKey.mockImplementationOnce(async () => application);
    const result = await (await createService()).submit(submission, context());
    expect(result).toMatchObject({ created: false, idempotent: true });
    expect(smsService.findValidPending).not.toHaveBeenCalled();
    expect(repository.createApplicationAtomic).not.toHaveBeenCalled();
  });

  test("honors RPC created=false as the authoritative concurrent idempotent result", async () => {
    repository.createApplicationAtomic.mockImplementationOnce(async () => ({
      application, created: false,
    }));
    const result = await (await createService()).submit(submission, context());
    expect(result).toEqual({
      application,
      next_action: "wait_for_review",
      estimated_review_hours: 48,
      created: false,
      idempotent: true,
    });
    expect(notificationService.deliver).not.toHaveBeenCalled();
  });

  test("re-reads only the exact concurrent idempotency constraint", async () => {
    repository.findByVisitorAndIdempotencyKey
      .mockImplementationOnce(async () => null)
      .mockImplementationOnce(async () => application);
    repository.createApplicationAtomic.mockImplementationOnce(async () => {
      throw Errors.dbError("concurrent", {
        code: "23505", constraint: IDEMPOTENCY_CONSTRAINT,
      });
    });
    const result = await (await createService()).submit(submission, context());
    expect(result).toMatchObject({ application, created: false, idempotent: true });
    expect(repository.findByVisitorAndIdempotencyKey).toHaveBeenCalledTimes(2);
    expect(notificationService.deliver).not.toHaveBeenCalled();
  });

  test("retries only the exact application-number constraint at most three times", async () => {
    const collision = Errors.dbError("collision", {
      code: "23505", constraint: APP_NO_CONSTRAINT,
    });
    repository.createApplicationAtomic
      .mockImplementationOnce(async () => { throw collision; })
      .mockImplementationOnce(async () => { throw collision; })
      .mockImplementationOnce(async () => ({ application, created: true }));
    await (await createService(["NO-1", "NO-2", "NO-3"])).submit(submission, context());
    expect(repository.createApplicationAtomic).toHaveBeenCalledTimes(3);
    expect(repository.createApplicationAtomic.mock.calls.map((call) =>
      call[0].application.application_no
    )).toEqual(["NO-1", "NO-2", "NO-3"]);
  });

  test("stops after three exact application-number collisions", async () => {
    repository.createApplicationAtomic.mockImplementation(async () => {
      throw Errors.dbError("collision", {
        code: "23505", constraint: APP_NO_CONSTRAINT,
      });
    });
    await expect((await createService(["NO-1", "NO-2", "NO-3"]))
      .submit(submission, context())).rejects.toMatchObject({ code: "DB_ERROR" });
    expect(repository.createApplicationAtomic).toHaveBeenCalledTimes(3);
  });

  test("does not retry unrelated uniqueness and maps the open-subject constraint", async () => {
    repository.createApplicationAtomic.mockImplementationOnce(async () => {
      throw Errors.dbError("duplicate", { code: "23505", constraint: OPEN_CONSTRAINT });
    });
    await expect((await createService()).submit(submission, context()))
      .rejects.toMatchObject({ code: "TENANT_ONBOARDING_APPLICATION_DUPLICATED" });
    expect(repository.createApplicationAtomic).toHaveBeenCalledTimes(1);
  });

  test("persists invite provenance only when active lookup matches the resolved partner", async () => {
    const inviteResolution = { ...uniqueResolution, reason: "invite_code" as const };
    const order: string[] = [];
    inviteCodeRepository.findActiveInviteCodeByCode.mockImplementationOnce(async () => {
      order.push("provenance");
      return { id: INVITE_ID, code: "JOINME", partner_id: PARTNER_ID };
    });
    regionResolver.resolve.mockImplementationOnce(async () => {
      order.push("resolve");
      return inviteResolution;
    });
    await (await createService()).submit({
      ...submission, source_channel: "partner_invite", invite_code: " joinme ",
    }, context());
    expect(order).toEqual(["provenance", "resolve"]);
    expect(repository.createApplicationAtomic.mock.calls[0]?.[0].application.invite_code_id)
      .toBe(INVITE_ID);
  });

  test("fails a rebound partner invite closed after resolving again without it", async () => {
    inviteCodeRepository.findActiveInviteCodeByCode.mockImplementationOnce(async () => ({
      id: INVITE_ID, code: "JOINME", partner_id: "00000000-0000-4000-8000-000000000999",
    }));
    regionResolver.resolve
      .mockImplementationOnce(async () => ({ ...uniqueResolution, reason: "invite_code" }))
      .mockImplementationOnce(async () => uniqueResolution);
    await expect((await createService()).submit({
      ...submission, source_channel: "partner_invite", invite_code: "JOINME",
    }, context())).rejects.toMatchObject({ code: "TENANT_ONBOARDING_INVITE_INVALID" });
    expect(regionResolver.resolve).toHaveBeenNthCalledWith(2, {
      serviceRegionCodes: submission.service_region_codes, inviteCode: null,
    });
    expect(repository.createApplicationAtomic).not.toHaveBeenCalled();
  });

  test("fails an inactive partner invite with the stable business code", async () => {
    await expect((await createService()).submit({
      ...submission, source_channel: "partner_invite", invite_code: "EXPIRED",
    }, context())).rejects.toMatchObject({ code: "TENANT_ONBOARDING_INVITE_INVALID" });
    expect(regionResolver.resolve).toHaveBeenCalledWith({
      serviceRegionCodes: submission.service_region_codes, inviteCode: null,
    });
    expect(repository.createApplicationAtomic).not.toHaveBeenCalled();
  });

  test.each(unmatchedResolutions)(
    "persists a %s resolution without candidate assistance",
    async (_label, resolution) => {
      regionResolver.resolve.mockImplementationOnce(async () => resolution);
      await (await createService()).submit(submission, context());
      const payload = repository.createApplicationAtomic.mock.calls[0]?.[0].application;
      expect(payload).toMatchObject({
        candidate_partner_id: null,
        candidate_match_reason: resolution.reason,
        candidate_snapshot: {
          partner_ids: [...resolution.partnerIds],
          match_reason: resolution.reason,
        },
        partner_assist_status: "not_applicable",
        partner_assist_requested_at: null,
        partner_assist_due_at: null,
      });
    },
  );

  test.each([
    ["a missing", null],
    ["another visitor's", { id: CONTEXT_ID, visitor_id: "visitor-other" }],
  ] as const)("rejects %s location context", async (_label, record) => {
    locationContextRepository.findById.mockImplementationOnce(async () => record);
    await expect((await createService()).submit(submission, context()))
      .rejects.toMatchObject({ code: "TENANT_ONBOARDING_APPLICATION_NOT_FOUND" });
    expect(fileRepository.findById).not.toHaveBeenCalled();
    expect(repository.createApplicationAtomic).not.toHaveBeenCalled();
  });

  test.each([
    ["a missing", null],
    ["a public", { visibility: "public" }],
    ["an inactive", { status: "deleted" }],
    ["a non-visitor-owned", { owner_type: "employee" }],
    ["another visitor's", { owner_visitor_id: "visitor-other" }],
    ["a wrong-scene", { scene: "avatar" }],
    ["a public-URL-bearing", { public_url: "https://cdn.example/license.png" }],
    ["a deleted", { deleted_at: NOW }],
  ] as const)("rejects %s license under the Task4 file contract", async (_label, changes) => {
    // Task4's applicant file port does not project owner_type; Task5 extends that contract.
    fileRepository.findById.mockImplementationOnce(async () =>
      changes ? { ...license, ...changes } : null
    );
    await expect((await createService()).submit(submission, context()))
      .rejects.toMatchObject({ code: "TENANT_ONBOARDING_DOCUMENT_FORBIDDEN" });
    expect(repository.createApplicationAtomic).not.toHaveBeenCalled();
  });

  test("supplements credit through precheck excluding self and one atomic RPC", async () => {
    const current = { ...application, status: "supplement_required" as const, version: 4 };
    repository.findOwnedById.mockImplementationOnce(async () => current);
    await (await createService()).supplement({
      applicationId: APPLICATION_ID, visitorId: VISITOR_ID, expectedVersion: 4,
      patch: { unified_social_credit_code: " 91411525ma9g000001 " },
    });
    expect(repository.findOpenByCreditCode).toHaveBeenCalledWith(
      "91411525MA9G000001", APPLICATION_ID,
    );
    expect(repository.supplementAtomic).toHaveBeenCalledWith(expect.objectContaining({
      applicationId: APPLICATION_ID,
      patch: { unified_social_credit_code: "91411525MA9G000001" },
      candidate: expect.objectContaining({ replace: false }),
    }));
  });

  test("re-resolves changed regions using only the stored active invite provenance", async () => {
    const current = {
      ...application, status: "supplement_required" as const, version: 2,
      invite_code_id: INVITE_ID,
    };
    repository.findOwnedById.mockImplementationOnce(async () => current);
    inviteCodeRepository.findActiveInviteCodeById.mockImplementationOnce(async () => ({
      id: INVITE_ID, code: "ORIGINAL", partner_id: PARTNER_ID,
    }));
    await (await createService()).supplement({
      applicationId: APPLICATION_ID, visitorId: VISITOR_ID, expectedVersion: 2,
      patch: { service_region_codes: ["411500"] },
    });
    expect(regionResolver.resolve).toHaveBeenCalledWith({
      serviceRegionCodes: ["411500"], inviteCode: "ORIGINAL",
    });
    expect(repository.supplementAtomic).toHaveBeenCalledWith(expect.objectContaining({
      candidate: expect.objectContaining({ replace: true, partnerId: PARTNER_ID }),
    }));
  });

  test.each([
    ["same order", ["411525", "411500"]],
    ["different order with duplicates", ["411500", "411525", "411500"]],
  ] as const)("does not reset candidate for the %s region set", async (_label, regions) => {
    repository.findOwnedById.mockImplementationOnce(async () => ({
      ...application, status: "supplement_required",
      service_region_codes: ["411525", "411500"],
    }));
    await (await createService()).supplement({
      applicationId: APPLICATION_ID, visitorId: VISITOR_ID, expectedVersion: 1,
      patch: { service_region_codes: [...regions] },
    });
    expect(regionResolver.resolve).not.toHaveBeenCalled();
    expect(repository.supplementAtomic).toHaveBeenCalledWith(
      expect.objectContaining({ candidate: expect.objectContaining({ replace: false }) }),
    );
  });

  test("falls back to normal region resolution when stored invite is inactive", async () => {
    repository.findOwnedById.mockImplementationOnce(async () => ({
      ...application, status: "supplement_required", invite_code_id: INVITE_ID,
    }));
    await (await createService()).supplement({
      applicationId: APPLICATION_ID, visitorId: VISITOR_ID, expectedVersion: 1,
      patch: { service_region_codes: ["411500"] },
    });
    expect(regionResolver.resolve).toHaveBeenCalledWith({
      serviceRegionCodes: ["411500"], inviteCode: null,
    });
  });

  test("withdraws and appends audit only inside the atomic repository method", async () => {
    const withdrawn = await (await createService()).withdraw({
      applicationId: APPLICATION_ID, visitorId: VISITOR_ID, expectedVersion: 1,
      reason: " 暂缓入驻 ",
    });
    expect(repository.withdrawAtomic).toHaveBeenCalledWith({
      applicationId: APPLICATION_ID, visitorId: VISITOR_ID, expectedVersion: 1,
      reason: "暂缓入驻", now: NOW,
    });
    expect(withdrawn).toEqual({ ...application, status: "withdrawn", version: 2 });
  });

  test("returns exact list, detail, and supplement service responses", async () => {
    const summary = {
      id: APPLICATION_ID, application_no: application.application_no,
      company_name: application.company_name, status: application.status,
      partner_assist_status: application.partner_assist_status,
      version: 1, created_at: NOW, updated_at: NOW,
    };
    const page = {
      list: [summary],
      pagination: { page: 2, pageSize: 10, total: 11, totalPages: 2 },
    };
    repository.listOwned.mockImplementationOnce(async () => page);
    const service = await createService();
    expect(await service.listOwned({ visitorId: VISITOR_ID, page: 2, pageSize: 10 }))
      .toEqual(page);
    expect(await service.getOwned({ applicationId: APPLICATION_ID, visitorId: VISITOR_ID }))
      .toEqual(application);
    expect(repository.listOwned).toHaveBeenCalledWith({
      visitorId: VISITOR_ID, page: 2, pageSize: 10,
    });
    expect(repository.findOwnedById).toHaveBeenCalledWith(
      APPLICATION_ID,
      VISITOR_ID,
    );

    const current = { ...application, status: "supplement_required" as const, version: 3 };
    const updated = { ...current, company_name: "晴天装饰集团", status: "submitted" as const, version: 4 };
    repository.findOwnedById.mockImplementationOnce(async () => current);
    repository.supplementAtomic.mockImplementationOnce(async () => updated);
    expect(await service.supplement({
      applicationId: APPLICATION_ID, visitorId: VISITOR_ID, expectedVersion: 3,
      patch: { company_name: " 晴天装饰集团 " },
    })).toEqual(updated);
    expect(repository.supplementAtomic).toHaveBeenCalledWith(expect.objectContaining({
      patch: { company_name: "晴天装饰集团" },
    }));
  });

  test("rejects invalid SMS and optimistic state with stable codes", async () => {
    smsService.findValidPending.mockImplementationOnce(async () => null);
    await expect((await createService()).submit(submission, context()))
      .rejects.toMatchObject({ code: "SMS_CODE_INVALID" });
    repository.findOwnedById.mockImplementationOnce(async () => ({
      ...application, status: "supplement_required", version: 3,
    }));
    repository.supplementAtomic.mockImplementationOnce(async () => null);
    await expect((await createService()).supplement({
      applicationId: APPLICATION_ID, visitorId: VISITOR_ID, expectedVersion: 3,
      patch: {},
    })).rejects.toMatchObject({ code: "TENANT_ONBOARDING_STATE_CONFLICT" });
  });
});
