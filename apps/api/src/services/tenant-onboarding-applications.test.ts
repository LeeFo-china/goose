import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Errors } from "@/errors/error-factory";
import type { TenantOnboardingBusinessLicenseRecord } from "@/repositories/tenant-onboarding";
import type { TenantOnboardingApplicationRecord } from "@/repositories/tenant-onboarding-types";
import type { SubmitTenantOnboardingApplicationInput } from "@/schema/tenant-onboarding";
import type { TenantOnboardingPartnerResolution } from "@/services/tenant-onboarding-region-match";
process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
const NOW = "2026-07-14T08:00:00.000Z";
const VISITOR_ID = "visitor-applicant-1";
const APPLICATION_ID = "00000000-0000-4000-8000-000000000101";
const CONTEXT_ID = "00000000-0000-4000-8000-000000000201";
const FILE_ID = "00000000-0000-4000-8000-000000000301";
const PARTNER_ID = "00000000-0000-4000-8000-000000000401";
const IDEMPOTENCY_KEY = "tenant-onboarding-request-1";
const OPEN_SUBJECT_CONSTRAINT = "tenant_onboarding_applications_open_subject_unique_idx";
const IDEMPOTENCY_CONSTRAINT = "tenant_onboarding_applications_visitor_idempotency_unique";
const application: TenantOnboardingApplicationRecord = {
  id: APPLICATION_ID, application_no: "ZQ-20260714-A1B2",
  visitor_id: VISITOR_ID, visitor_context_id: CONTEXT_ID,
  company_name: "固始晴天装饰工程有限公司",
  unified_social_credit_code: "91411525MA9G000000", business_license_file_id: FILE_ID,
  admin_name: "负责人", admin_phone: "13900139000",
  address_province: "河南省", address_city: "信阳市", address_district: "固始县",
  address_region_code: "411525", address: "固始县蓼城大道 1 号",
  address_latitude: 32, address_longitude: 115, service_region_codes: ["411525"],
  source_channel: "local_services", invite_code_id: null,
  candidate_partner_id: PARTNER_ID, candidate_match_reason: "region",
  candidate_snapshot: { partner_id: PARTNER_ID, partner_name: "信阳合伙人" },
  final_partner_id: null, attribution_source_type: null, status: "submitted",
  partner_assist_status: "pending", partner_assist_requested_at: NOW,
  partner_assist_due_at: "2026-07-16T08:00:00.000Z",
  version: 1, converted_tenant_id: null, reviewed_by_employee_id: null,
  reviewed_at: null, review_remark: null, privacy_policy_version: "privacy-2026-07",
  onboarding_terms_version: "onboarding-2026-07",
  consented_at: NOW, idempotency_key: IDEMPOTENCY_KEY, withdrawn_at: null,
  created_at: NOW, updated_at: NOW,
};
const submission: SubmitTenantOnboardingApplicationInput = {
  company_name: "固始晴天装饰工程有限公司", unified_social_credit_code: "91411525MA9G000000",
  business_license_file_id: FILE_ID, admin_name: "负责人", admin_phone: "13900139000",
  sms_code: "123456",
  company_location: {
    province: "河南省", city: "信阳市", district: "固始县", region_code: "411525",
    address: "固始县蓼城大道 1 号", latitude: 32, longitude: 115,
  },
  service_region_codes: ["411525"], visitor_context_id: CONTEXT_ID,
  source_channel: "local_services", invite_code: null,
  privacy_policy_version: "privacy-2026-07", onboarding_terms_version: "onboarding-2026-07",
  agree_privacy: true,
};
const verificationCode = { id: "verification-code-1" };
const ownedContext = { id: CONTEXT_ID, visitor_id: VISITOR_ID };
const privateLicense: TenantOnboardingBusinessLicenseRecord = {
  id: FILE_ID, owner_visitor_id: VISITOR_ID, scene: "tenant_onboarding_license",
  status: "active", visibility: "private", deleted_at: null,
};
const uniqueResolution: TenantOnboardingPartnerResolution = {
  kind: "unique", partnerIds: [PARTNER_ID],
  selectedPartner: {
    id: PARTNER_ID, name: "信阳合伙人", status: "active", region_codes: ["411500"],
  },
  reason: "region",
};
const repository = {
  createApplication: mock(async () => application),
  findByVisitorAndIdempotencyKey: mock(async () => null as TenantOnboardingApplicationRecord | null),
  findOpenByCreditCode: mock(async () => null as TenantOnboardingApplicationRecord | null),
  findOwnedById: mock(async () => application as TenantOnboardingApplicationRecord | null),
  listOwned: mock(async () => ({
    list: [application],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  })),
  updateSupplement: mock(async (): Promise<TenantOnboardingApplicationRecord | null> => ({ ...application, version: 2 })),
  withdraw: mock(async (): Promise<TenantOnboardingApplicationRecord | null> => ({
    ...application, status: "withdrawn" as const, version: 2, withdrawn_at: NOW,
  })),
  appendReviewEvent: mock(async () => undefined),
};
const smsService = {
  sendCode: mock(async () => ({ success: true as const, cooldown_seconds: 60 })),
  findValidPending: mock(async () => verificationCode as { id: string } | null),
  markVerified: mock(async () => undefined),
};
const locationContextRepository = { findById: mock(async () => ownedContext as typeof ownedContext | null) };
const fileRepository = { findById: mock(async () => privateLicense as typeof privateLicense | null) };
const regionResolver = { resolve: mock(async (): Promise<TenantOnboardingPartnerResolution> => uniqueResolution) };
const notificationService = { deliver: mock(async () => undefined) };
async function createService() {
  const { TenantOnboardingApplicationsService } = await import("./tenant-onboarding-applications");
  return new TenantOnboardingApplicationsService({
    repository,
    smsService,
    locationContextRepository,
    fileRepository,
    regionResolver,
    notificationService,
    clock: () => new Date(NOW),
    applicationNumberGenerator: () => "ZQ-20260714-A1B2",
  });
}
function submitContext(overrides: Partial<{ visitorId: string; idempotencyKey: string }> = {}) {
  return {
    visitorId: overrides.visitorId ?? VISITOR_ID,
    idempotencyKey: overrides.idempotencyKey ?? IDEMPOTENCY_KEY,
  };
}
describe("TenantOnboardingApplicationsService", () => {
  beforeEach(() => {
    for (const fn of Object.values(repository)) fn.mockClear();
    for (const fn of Object.values(smsService)) fn.mockClear();
    locationContextRepository.findById.mockClear();
    fileRepository.findById.mockClear();
    regionResolver.resolve.mockClear();
    notificationService.deliver.mockClear();
    repository.createApplication.mockImplementation(async () => application);
    repository.findByVisitorAndIdempotencyKey.mockImplementation(async () => null);
    repository.findOpenByCreditCode.mockImplementation(async () => null);
    repository.findOwnedById.mockImplementation(async () => application);
    repository.updateSupplement.mockImplementation(async () => ({ ...application, version: 2 }));
    repository.withdraw.mockImplementation(async () => ({
      ...application, status: "withdrawn", version: 2, withdrawn_at: NOW,
    }));
    smsService.findValidPending.mockImplementation(async () => verificationCode);
    locationContextRepository.findById.mockImplementation(async () => ownedContext);
    fileRepository.findById.mockImplementation(async () => privateLicense);
    regionResolver.resolve.mockImplementation(async () => uniqueResolution);
    notificationService.deliver.mockImplementation(async () => undefined);
  });
  test("delegates verification-code sending with the onboarding scene and request dimensions", async () => {
    const service = await createService();
    const result = await service.sendCode({
      phone: " 13900139000 ",
      requestIp: "127.0.0.1",
      requestDevice: "device-1",
    });
    expect(result).toEqual({ success: true, cooldown_seconds: 60 });
    expect(smsService.sendCode).toHaveBeenCalledWith({
      phone: "13900139000",
      scene: "partner_tenant_onboarding",
      requestIp: "127.0.0.1",
      requestDevice: "device-1",
    });
  });
  test("persists before consuming the code, then delivers a submitted notification", async () => {
    const order: string[] = [];
    repository.createApplication.mockImplementationOnce(async () => {
      order.push("create");
      return application;
    });
    smsService.markVerified.mockImplementationOnce(async () => {
      order.push("consume");
    });
    notificationService.deliver.mockImplementationOnce(async () => {
      order.push("notify");
    });
    const service = await createService();
    const result = await service.submit(submission, submitContext());
    expect(smsService.findValidPending).toHaveBeenCalledWith({
      phone: submission.admin_phone,
      scene: "partner_tenant_onboarding",
      code: submission.sms_code,
    });
    expect(order).toEqual(["create", "consume", "notify"]);
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
    expect(result).not.toHaveProperty("tenant");
    expect(result).not.toHaveProperty("member");
    expect(result).not.toHaveProperty("auth");
    expect(result).not.toHaveProperty("token");
  });
  test("does not consume the code or notify when application creation fails", async () => {
    repository.createApplication.mockImplementationOnce(async () => {
      throw Errors.dbError("申请写入失败");
    });
    const service = await createService();
    await expect(service.submit(submission, submitContext())).rejects.toMatchObject({
      code: "DB_ERROR",
    });
    expect(smsService.markVerified).not.toHaveBeenCalled();
    expect(notificationService.deliver).not.toHaveBeenCalled();
  });
  test("returns the original envelope before verification for the same visitor idempotency key", async () => {
    repository.findByVisitorAndIdempotencyKey.mockImplementationOnce(async () => application);
    const service = await createService();
    const result = await service.submit(submission, submitContext());
    expect(result).toEqual({
      application,
      next_action: "wait_for_review",
      estimated_review_hours: 48,
      created: false,
      idempotent: true,
    });
    expect(smsService.findValidPending).not.toHaveBeenCalled();
    expect(repository.createApplication).not.toHaveBeenCalled();
    expect(notificationService.deliver).not.toHaveBeenCalled();
    await expect(service.submit(submission, submitContext({ visitorId: " " })))
      .rejects.toMatchObject({ statusCode: 401 });
    await expect(service.submit(submission, submitContext({ idempotencyKey: " " })))
      .rejects.toMatchObject({ statusCode: 400 });
  });
  test.each([null, { id: CONTEXT_ID, visitor_id: "visitor-other" }])(
    "requires an existing location context owned by the exact visitor",
    async (context) => {
    locationContextRepository.findById.mockImplementationOnce(async () => context);
    const service = await createService();
    await expect(service.submit(submission, submitContext())).rejects.toMatchObject({
      code: "TENANT_ONBOARDING_APPLICATION_NOT_FOUND",
    });
    expect(repository.createApplication).not.toHaveBeenCalled();
    },
  );
  test.each([
    ["missing", null],
    ["public", { visibility: "public" }],
    ["deleted", { deleted_at: NOW }],
    ["wrong owner", { owner_visitor_id: "visitor-other" }],
    ["wrong scene", { scene: "avatar" }],
    ["inactive", { status: "deleted" }],
  ] as const)("rejects a %s business license", async (_label, changes) => {
    fileRepository.findById.mockImplementationOnce(async () =>
      changes ? { ...privateLicense, ...changes } : null
    );
    const service = await createService();
    await expect(service.submit(submission, submitContext())).rejects.toMatchObject({
      code: "TENANT_ONBOARDING_DOCUMENT_FORBIDDEN",
    });
    expect(repository.createApplication).not.toHaveBeenCalled();
  });
  test("maps an existing normalized open subject to the stable duplicate code", async () => {
    repository.findOpenByCreditCode.mockImplementationOnce(async () => application);
    const service = await createService();
    await expect(service.submit({
      ...submission,
      unified_social_credit_code: "91411525ma9g000000",
    }, submitContext())).rejects.toMatchObject({
      code: "TENANT_ONBOARDING_APPLICATION_DUPLICATED",
    });
    expect(repository.findOpenByCreditCode).toHaveBeenCalledWith(
      "91411525MA9G000000",
    );
    expect(repository.createApplication).not.toHaveBeenCalled();
  });
  test("re-reads an idempotent application after its concurrent unique violation", async () => {
    repository.findByVisitorAndIdempotencyKey
      .mockImplementationOnce(async () => null)
      .mockImplementationOnce(async () => application);
    repository.createApplication.mockImplementationOnce(async () => {
      throw Errors.dbError("提交申请失败", {
        code: "23505",
        constraint: IDEMPOTENCY_CONSTRAINT,
      });
    });
    const service = await createService();
    const result = await service.submit(submission, submitContext());
    expect(result.created).toBe(false);
    expect(result.idempotent).toBe(true);
    expect(result.application).toEqual(application);
    expect(smsService.markVerified).not.toHaveBeenCalled();
  });
  test("maps only the concurrent open-subject constraint to a stable duplicate", async () => {
    repository.createApplication.mockImplementationOnce(async () => {
      throw Errors.dbError("提交申请失败", {
        code: "23505",
        constraint: OPEN_SUBJECT_CONSTRAINT,
      });
    });
    const service = await createService();
    await expect(service.submit(submission, submitContext())).rejects.toMatchObject({
      code: "TENANT_ONBOARDING_APPLICATION_DUPLICATED",
    });
    expect(repository.findByVisitorAndIdempotencyKey).toHaveBeenCalledTimes(2);
    expect(smsService.markVerified).not.toHaveBeenCalled();
  });
  test("does not misclassify unrelated unique or generic database failures", async () => {
    const service = await createService();
    for (const details of [
      { code: "23505", constraint: "unrelated_unique" },
      { code: "40001", constraint: OPEN_SUBJECT_CONSTRAINT },
    ]) {
      repository.createApplication.mockImplementationOnce(async () => {
        throw Errors.dbError("提交申请失败", details);
      });
      await expect(service.submit(submission, submitContext())).rejects.toMatchObject({
        code: "DB_ERROR",
      });
    }
  });
  test("stores a unique partner candidate with an exact 48-hour assist window", async () => {
    const service = await createService();
    await service.submit(submission, submitContext());
    expect(repository.createApplication).toHaveBeenCalledWith(expect.objectContaining({
      candidate_partner_id: PARTNER_ID,
      candidate_match_reason: "region",
      candidate_snapshot: expect.objectContaining({ partner_id: PARTNER_ID }),
      partner_assist_status: "pending",
      partner_assist_requested_at: NOW,
      partner_assist_due_at: "2026-07-16T08:00:00.000Z",
    }));
  });
  test.each(["none", "ambiguous"] as const)(
    "stores no candidate for a %s region resolution",
    async (kind) => {
      regionResolver.resolve.mockImplementationOnce(async () => kind === "none"
        ? {
          kind,
          partnerIds: [],
          selectedPartner: null,
          reason: "no_eligible_partner",
        }
        : {
          kind,
          partnerIds: [PARTNER_ID, "partner-2"],
          selectedPartner: null,
          reason: "same_specificity",
        });
      const service = await createService();
      await service.submit(submission, submitContext());
      expect(repository.createApplication).toHaveBeenCalledWith(expect.objectContaining({
        candidate_partner_id: null,
        partner_assist_status: "not_applicable",
        partner_assist_requested_at: null,
        partner_assist_due_at: null,
      }));
    },
  );
  test("scopes list and detail reads to the mandatory visitor", async () => {
    const service = await createService();
    await service.listOwned({ visitorId: VISITOR_ID, page: 1, pageSize: 20 });
    await service.getOwned({ applicationId: APPLICATION_ID, visitorId: VISITOR_ID });
    expect(repository.listOwned).toHaveBeenCalledWith({
      visitorId: VISITOR_ID,
      page: 1,
      pageSize: 20,
    });
    expect(repository.findOwnedById).toHaveBeenCalledWith(APPLICATION_ID, VISITOR_ID);
    for (const operation of [
      () => service.listOwned({ visitorId: " " }),
      () => service.getOwned({ applicationId: APPLICATION_ID, visitorId: " " }),
      () => service.supplement({ applicationId: APPLICATION_ID, visitorId: " ", expectedVersion: 1, patch: {} }),
      () => service.withdraw({ applicationId: APPLICATION_ID, visitorId: " ", expectedVersion: 1 }),
    ]) await expect(operation()).rejects.toMatchObject({ statusCode: 401 });
  });
  test("supplements only an owned required application at the exact version and appends review", async () => {
    const supplementRequired = {
      ...application,
      status: "supplement_required" as const,
      version: 4,
    };
    repository.findOwnedById.mockImplementationOnce(async () => supplementRequired);
    repository.updateSupplement.mockImplementationOnce(async () => ({
      ...supplementRequired,
      company_name: "晴天装饰集团",
      status: "submitted",
      version: 5,
    }));
    const service = await createService();
    const patch = { company_name: "晴天装饰集团", admin_phone: "18800000000" };
    const updated = await service.supplement({
      applicationId: APPLICATION_ID,
      visitorId: VISITOR_ID,
      expectedVersion: 4,
      patch,
    });
    expect(updated.status).toBe("submitted");
    expect(repository.updateSupplement).toHaveBeenCalledWith({
      applicationId: APPLICATION_ID,
      visitorId: VISITOR_ID,
      expectedVersion: 4,
      patch: { company_name: "晴天装饰集团" },
    });
    expect(repository.appendReviewEvent).toHaveBeenCalledWith(expect.objectContaining({
      application_id: APPLICATION_ID,
      review_stage: "applicant",
      decision: "supplemented",
      actor_type: "visitor",
      actor_visitor_id: VISITOR_ID,
      before_status: "supplement_required",
      after_status: "submitted",
    }));
  });
  test("maps supplement wrong state, stale version, and optimistic misses stably", async () => {
    const service = await createService();
    await expect(service.supplement({
      applicationId: APPLICATION_ID,
      visitorId: VISITOR_ID,
      expectedVersion: 1,
      patch: { company_name: "新名称" },
    })).rejects.toMatchObject({ code: "TENANT_ONBOARDING_SUPPLEMENT_NOT_ALLOWED" });

    repository.findOwnedById.mockImplementationOnce(async () => ({
      ...application,
      status: "supplement_required",
      version: 3,
    }));
    await expect(service.supplement({
      applicationId: APPLICATION_ID,
      visitorId: VISITOR_ID,
      expectedVersion: 2,
      patch: { company_name: "新名称" },
    })).rejects.toMatchObject({ code: "TENANT_ONBOARDING_STATE_CONFLICT" });

    repository.findOwnedById.mockImplementationOnce(async () => ({
      ...application,
      status: "supplement_required",
      version: 3,
    }));
    repository.updateSupplement.mockImplementationOnce(async () => null);
    await expect(service.supplement({
      applicationId: APPLICATION_ID,
      visitorId: VISITOR_ID,
      expectedVersion: 3,
      patch: { company_name: "新名称" },
    })).rejects.toMatchObject({ code: "TENANT_ONBOARDING_STATE_CONFLICT" });
  });

  test("withdraws only an owned nonterminal application at the exact version and appends review", async () => {
    const service = await createService();

    const withdrawn = await service.withdraw({
      applicationId: APPLICATION_ID,
      visitorId: VISITOR_ID,
      expectedVersion: 1,
      reason: "暂缓入驻",
    });

    expect(withdrawn.status).toBe("withdrawn");
    expect(repository.withdraw).toHaveBeenCalledWith({
      applicationId: APPLICATION_ID,
      visitorId: VISITOR_ID,
      expectedVersion: 1,
    });
    expect(repository.appendReviewEvent).toHaveBeenCalledWith(expect.objectContaining({
      application_id: APPLICATION_ID,
      decision: "withdrawn",
      actor_visitor_id: VISITOR_ID,
      remark: "暂缓入驻",
      before_status: "submitted",
      after_status: "withdrawn",
    }));
  });

  test.each(["approved", "rejected", "withdrawn"] as const)(
    "rejects withdrawal from terminal state %s",
    async (status) => {
      repository.findOwnedById.mockImplementationOnce(async () => ({
        ...application,
        status,
      }));
      const service = await createService();
      await expect(service.withdraw({
        applicationId: APPLICATION_ID,
        visitorId: VISITOR_ID,
        expectedVersion: 1,
      })).rejects.toMatchObject({ code: "TENANT_ONBOARDING_STATE_CONFLICT" });
      expect(repository.withdraw).not.toHaveBeenCalled();
    },
  );

  test("maps withdrawal optimistic misses and blank visitor ownership stably", async () => {
    repository.withdraw.mockImplementationOnce(async () => null);
    const service = await createService();
    await expect(service.withdraw({
      applicationId: APPLICATION_ID,
      visitorId: VISITOR_ID,
      expectedVersion: 1,
    })).rejects.toMatchObject({ code: "TENANT_ONBOARDING_STATE_CONFLICT" });
    await expect(service.withdraw({
      applicationId: APPLICATION_ID,
      visitorId: " ",
      expectedVersion: 1,
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  test("absorbs notification failures after successful persistence", async () => {
    notificationService.deliver.mockImplementationOnce(async () => {
      throw new Error("provider token=secret phone=13900139000");
    });
    const service = await createService();

    const result = await service.submit(submission, submitContext());

    expect(result.created).toBe(true);
    expect(result.application).toEqual(application);
    expect(smsService.markVerified).toHaveBeenCalledWith(verificationCode.id);
  });
});
