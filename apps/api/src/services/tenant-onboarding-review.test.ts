import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";
import type {
  TenantOnboardingApplicationRecord,
  TenantOnboardingApprovalRpcResult,
  TenantOnboardingLicenseAccessRecord,
  TenantOnboardingNotificationDeliveryRecord,
} from "@/repositories/tenant-onboarding-types";
import type { TenantOnboardingPartnerResolution } from "@/services/tenant-onboarding-region-match";
process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
const APPLICATION_ID = "00000000-0000-4000-8000-000000000001";
const EMPLOYEE_ID = "00000000-0000-4000-8000-000000000002";
const PARTNER_ID = "00000000-0000-4000-8000-000000000003";
const FILE_ID = "00000000-0000-4000-8000-000000000004";
const DELIVERY_ID = "00000000-0000-4000-8000-000000000005";
const TENANT_ID = "00000000-0000-4000-8000-000000000006";
const NOW = "2026-07-14T04:00:00.000Z";
const auth = (input: {
  isPlatformAdmin?: boolean;
  permissions?: AuthContext["permissions"];
  employeeId?: string | null;
} = {}): AuthContext => ({
  authUserId: "auth-user-1",
  employeeId: input.employeeId === undefined ? EMPLOYEE_ID : input.employeeId,
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  isPlatformAdmin: input.isPlatformAdmin ?? true,
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
  permissions: input.permissions ?? [{
    code: "platform.tenant_onboarding.review",
    scope: "all",
  }],
});

const application: TenantOnboardingApplicationRecord = {
  id: APPLICATION_ID, application_no: "ZQ-20260714-A1B2C3",
  visitor_id: "visitor-1", visitor_context_id: null, company_name: "晴天装饰",
  unified_social_credit_code: "91411525MA9G000000",
  business_license_file_id: FILE_ID, admin_name: "负责人",
  admin_phone: "13900139000", address_province: "河南省",
  address_city: "信阳市", address_district: "固始县",
  address_region_code: "411525", address: "详细地址",
  address_latitude: null, address_longitude: null,
  service_region_codes: ["411525"], source_channel: "local_services",
  invite_code_id: null, candidate_partner_id: PARTNER_ID,
  candidate_match_reason: "region", candidate_snapshot: {},
  final_partner_id: null, attribution_source_type: null,
  status: "submitted", partner_assist_status: "pending",
  partner_assist_requested_at: NOW,
  partner_assist_due_at: "2026-07-16T04:00:00.000Z",
  version: 1, converted_tenant_id: null, reviewed_by_employee_id: null,
  reviewed_at: null, review_remark: null, privacy_policy_version: "2026-07",
  onboarding_terms_version: "2026-07", consented_at: NOW,
  idempotency_key: "intent-1", withdrawn_at: null,
  created_at: NOW, updated_at: NOW,
};

const failedDelivery: TenantOnboardingNotificationDeliveryRecord = {
  id: DELIVERY_ID,
  application_id: APPLICATION_ID,
  application_version: 2,
  event_type: "supplement_required",
  channel: "sms",
  status: "failed",
  attempt_count: 1,
  last_error: "SMS_DELIVERY_FAILED: 短信发送失败",
  sent_at: null,
  claim_token: DELIVERY_ID,
  claim_expires_at: NOW,
  created_at: NOW,
  updated_at: NOW,
};

const repository = {
  listApplications: mock(async (query: unknown) => ({
    query,
    list: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  })),
  findApplicationById: mock(async () => application as TenantOnboardingApplicationRecord | null),
  listReviews: mock(async (input: unknown) => ({
    input,
    list: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  })),
  startReviewAtomic: mock(async () => ({
    status: "updated" as const,
    application: { ...application, status: "reviewing" as const, version: 2 },
    idempotent: false,
  })),
  requestSupplementAtomic: mock(async () => ({
    status: "updated" as const,
    application: {
      ...application,
      status: "supplement_required" as const,
      version: 2,
    },
    idempotent: false,
  })),
  requestPartnerAssistAtomic: mock(async () => ({
    status: "updated" as const,
    application: { ...application, version: 2 },
    idempotent: false,
  })),
  rejectAtomic: mock(async () => ({
    status: "updated" as const,
    application: {
      ...application,
      status: "rejected" as const,
      partner_assist_status: "expired" as const,
      version: 2,
    },
    idempotent: false,
  })),
  findTenantBySlug: mock(async () => null as { id: string } | null),
  findLicenseAccessRecord: mock(async (): Promise<TenantOnboardingLicenseAccessRecord | null> => ({
    application_id: APPLICATION_ID,
    visitor_id: "visitor-1",
    business_license_file_id: FILE_ID,
    file: {
      id: FILE_ID,
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
  })),
};
const notificationRepository = {
  listByApplication: mock(async (input: unknown) => ({
    input,
    list: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  })),
  findByIdAndApplication: mock(async () => ({
    ...failedDelivery,
    status: "failed" as const,
    attempt_count: 0,
  }) as TenantOnboardingNotificationDeliveryRecord | null),
};
const approvalRepository = {
  approveApplication: mock(async (): Promise<TenantOnboardingApprovalRpcResult> => ({
    status: "approved",
    application_id: APPLICATION_ID,
    tenant_id: TENANT_ID,
    binding_id: null,
    profile_id: "00000000-0000-4000-8000-000000000007",
    initialization: {
      template_code: "default_decoration_company",
      template_version: "2026.05.10",
      departments_count: 1,
      posts_count: 1,
      roles_count: 1,
      admin_employee_id: EMPLOYEE_ID,
      admin_role_id: "00000000-0000-4000-8000-000000000008",
    },
    idempotent: false,
  })),
};
const resolution = {
  kind: "unique" as const,
  partnerIds: [PARTNER_ID] as [string],
  selectedPartner: {
    id: PARTNER_ID,
    name: "固始城市合伙人",
    status: "active" as const,
    region_codes: ["411525"],
  },
  reason: "region" as const,
};
const candidateLimitResolution: TenantOnboardingPartnerResolution = {
  kind: "ambiguous", partnerIds: [PARTNER_ID], selectedPartner: null,
  reason: "candidate_limit",
};
const regionResolver = {
  resolve: mock(async (): Promise<TenantOnboardingPartnerResolution> => resolution),
};
const inviteRepository = { findActiveInviteCodeById: mock(async () => null) };
const notifications = {
  deliver: mock(async () => failedDelivery as TenantOnboardingNotificationDeliveryRecord | null),
  retry: mock(async () => failedDelivery as TenantOnboardingNotificationDeliveryRecord | null),
};
const audit = { recordBestEffort: mock(async () => null) };
const resolveSigned = mock(async () => "https://private.example/signed-license");
const expiryRepository = { expireDuePartnerAssistTasks: mock(async () => [] as string[]) };
async function createService() {
  const { TenantOnboardingReviewService } = await import("./tenant-onboarding-review");
  return new TenantOnboardingReviewService({
    repository,
    approvalRepository,
    notificationRepository,
    regionResolver,
    inviteCodeRepository: inviteRepository,
    notificationService: notifications,
    auditLogService: audit,
    resolveSignedStoredFileUrl: resolveSigned,
    expiryRepository,
    clock: () => new Date(NOW),
    tenantSlugGenerator: (_record, attempt) => `zq-91411525-${attempt}`,
  });
}

beforeEach(() => {
  for (const dependency of [
    ...Object.values(repository),
    ...Object.values(approvalRepository),
    ...Object.values(notificationRepository),
    ...Object.values(regionResolver),
    ...Object.values(inviteRepository),
    ...Object.values(notifications),
    ...Object.values(audit),
    resolveSigned,
    ...Object.values(expiryRepository),
  ]) dependency.mockClear();
  repository.findApplicationById.mockImplementation(async () => application);
  repository.findTenantBySlug.mockImplementation(async () => null);
  regionResolver.resolve.mockImplementation(async () => resolution);
  inviteRepository.findActiveInviteCodeById.mockImplementation(async () => null);
  notifications.deliver.mockImplementation(async () => failedDelivery);
});
describe("TenantOnboardingReviewService", () => {
  test("requires a platform admin and the dedicated review permission", async () => {
    const service = await createService();
    await expect(service.list(auth({ isPlatformAdmin: false }), { page: 1, pageSize: 20 }))
      .rejects.toMatchObject({ statusCode: 403 });
    await expect(service.list(auth({ permissions: [] }), { page: 1, pageSize: 20 }))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(repository.listApplications).not.toHaveBeenCalled();
  });
  test("passes bounded pagination and all platform queue filters", async () => {
    const service = await createService();
    await service.list(auth(), {
      page: 2,
      pageSize: 999,
      status: "reviewing",
      region_code: "411525",
      candidate_partner_id: PARTNER_ID,
      assist_status: "pending",
      keyword: " 晴天 ",
    });
    expect(repository.listApplications).toHaveBeenCalledWith({
      page: 2,
      pageSize: 100,
      status: "reviewing",
      region_code: "411525",
      candidate_partner_id: PARTNER_ID,
      assist_status: "pending",
      keyword: "晴天",
    });
  });
  test("loads reviews and deliveries through separate bounded pages", async () => {
    const service = await createService();
    await service.get(auth(), APPLICATION_ID);
    await service.listReviews(auth(), APPLICATION_ID, { page: 1, pageSize: 101 });
    await service.listNotifications(auth(), APPLICATION_ID, { page: 3, pageSize: 20 });
    expect(repository.findApplicationById).toHaveBeenCalledTimes(3);
    expect(repository.listReviews).toHaveBeenCalledWith({
      applicationId: APPLICATION_ID,
      page: 1,
      pageSize: 100,
    });
    expect(notificationRepository.listByApplication).toHaveBeenCalledWith({
      applicationId: APPLICATION_ID,
      page: 3,
      pageSize: 20,
    });
  });

  test("starts review atomically and audits only after mutation succeeds", async () => {
    const service = await createService();
    await service.startReview(auth(), APPLICATION_ID, { version: 1 });
    expect(repository.startReviewAtomic).toHaveBeenCalledWith({
      applicationId: APPLICATION_ID,
      expectedVersion: 1,
      reviewerEmployeeId: EMPLOYEE_ID,
      now: NOW,
    });
    expect(audit.recordBestEffort).toHaveBeenCalledTimes(1);

    repository.startReviewAtomic.mockImplementationOnce(async () => {
      throw new Error("mutation failed");
    });
    await expect(service.startReview(auth(), APPLICATION_ID, { version: 1 }))
      .rejects.toThrow("mutation failed");
    expect(audit.recordBestEffort).toHaveBeenCalledTimes(1);
  });

  test("requests supplement atomically and exposes failed post-commit delivery", async () => {
    const service = await createService();
    const result = await service.requestSupplement(auth(), APPLICATION_ID, {
      version: 1,
      required_fields: ["business_license_file_id"],
      remark: "请重新上传清晰执照",
    });
    expect(repository.requestSupplementAtomic).toHaveBeenCalledWith(expect.objectContaining({
      requiredFields: ["business_license_file_id"],
      remark: "请重新上传清晰执照",
    }));
    expect(notifications.deliver).toHaveBeenCalledWith({
      applicationId: APPLICATION_ID,
      applicationVersion: 2,
      eventType: "supplement_required",
    });
    expect(result.notification_delivery).toMatchObject({ status: "failed" });
    expect(result.notification_delivery).not.toHaveProperty("claim_token");
    expect(result.notification_delivery).not.toHaveProperty("claim_expires_at");
  });

  test("requests assist only for a freshly eligible explicit partner", async () => {
    const service = await createService();
    await service.requestPartnerAssist(auth(), APPLICATION_ID, {
      version: 1,
      partner_id: PARTNER_ID,
      remark: "请协查门店",
    });
    expect(regionResolver.resolve).toHaveBeenCalledWith({
      serviceRegionCodes: ["411525"],
      inviteCode: null,
    });
    expect(repository.requestPartnerAssistAtomic).toHaveBeenCalledWith(
      expect.objectContaining({
        partnerId: PARTNER_ID,
        candidateSnapshot: expect.objectContaining({ partner_id: PARTNER_ID }),
      }),
    );
  });

  test("never treats candidate-limit diagnostics as explicit eligibility", async () => {
    regionResolver.resolve.mockImplementation(async () => candidateLimitResolution);
    const service = await createService();
    await expect(service.requestPartnerAssist(auth(), APPLICATION_ID, {
      version: 1, partner_id: PARTNER_ID,
    })).rejects.toMatchObject({ code: "TENANT_ONBOARDING_STATE_CONFLICT" });
    await expect(service.approve(auth(), APPLICATION_ID, {
      version: 1, attribution_mode: "partner", final_partner_id: PARTNER_ID,
      review_remark: "审核通过",
    })).rejects.toMatchObject({ code: "TENANT_ONBOARDING_STATE_CONFLICT" });
    expect(repository.requestPartnerAssistAtomic).not.toHaveBeenCalled();
    expect(approvalRepository.approveApplication).not.toHaveBeenCalled();
  });

  test("rejects terminally, expires assist, and does not roll back for notification failure", async () => {
    const service = await createService();
    notifications.deliver.mockImplementationOnce(async () => {
      throw new Error("provider unavailable");
    });
    const result = await service.reject(auth(), APPLICATION_ID, {
      version: 1,
      review_remark: "主体资料无法核验",
    });
    expect(result.application).toMatchObject({
      status: "rejected",
      partner_assist_status: "expired",
    });
    expect(result.notification_delivery).toBeNull();
    expect(audit.recordBestEffort).toHaveBeenCalledTimes(1);
  });

  test("approves from a fresh unique resolver while pending assist remains non-blocking", async () => {
    const service = await createService();
    repository.findApplicationById
      .mockImplementationOnce(async () => application)
      .mockImplementationOnce(async () => ({
        ...application,
        status: "approved",
        version: 2,
        converted_tenant_id: TENANT_ID,
      }));
    const result = await service.approve(auth(), APPLICATION_ID, {
      version: 1,
      attribution_mode: "auto",
      review_remark: "审核通过",
    });
    expect(approvalRepository.approveApplication).toHaveBeenCalledWith(
      expect.objectContaining({
        finalPartnerId: PARTNER_ID,
        attributionSourceType: "region_auto_assignment",
      }),
    );
    expect(result.approval).toMatchObject({ status: "approved" });
    expect(notifications.deliver).toHaveBeenCalledWith({
      applicationId: APPLICATION_ID,
      applicationVersion: 2,
      eventType: "approved",
    });
  });

  test("rejects ambiguous auto attribution before the approval RPC", async () => {
    regionResolver.resolve.mockImplementationOnce(async () => ({
      kind: "ambiguous",
      partnerIds: [PARTNER_ID, "00000000-0000-4000-8000-000000000009"],
      selectedPartner: null,
      reason: "same_specificity",
    }));
    const service = await createService();
    await expect(service.approve(auth(), APPLICATION_ID, {
      version: 1, attribution_mode: "auto", review_remark: "审核通过",
    })).rejects.toMatchObject({ code: "TENANT_ONBOARDING_PARTNER_AMBIGUOUS" });
    expect(approvalRepository.approveApplication).not.toHaveBeenCalled();
  });

  test("returns an already approved RPC result without duplicate audit or notification", async () => {
    const approved = {
      ...application, status: "approved" as const, version: 2,
      final_partner_id: PARTNER_ID,
      attribution_source_type: "region_auto_assignment",
      converted_tenant_id: TENANT_ID,
    };
    repository.findApplicationById.mockImplementation(async () => approved);
    approvalRepository.approveApplication.mockImplementationOnce(async () => ({
      ...(await approvalRepository.approveApplication()), idempotent: true,
    }));
    const result = await (await createService()).approve(auth(), APPLICATION_ID, {
      version: 1, attribution_mode: "auto", review_remark: "审核通过",
    });
    expect(result.approval).toMatchObject({ idempotent: true });
    expect(audit.recordBestEffort).not.toHaveBeenCalled();
    expect(notifications.deliver).not.toHaveBeenCalled();
  });

  test.each([
    ["application_not_found", 404, "TENANT_ONBOARDING_APPLICATION_NOT_FOUND"],
    ["application_state_conflict", 409, "TENANT_ONBOARDING_STATE_CONFLICT"],
    ["application_version_conflict", 409, "TENANT_ONBOARDING_STATE_CONFLICT"],
    ["subject_exists", 409, "TENANT_ONBOARDING_SUBJECT_EXISTS"],
    ["admin_phone_exists", 409, "TENANT_ONBOARDING_PHONE_MEMBER_EXISTS"],
    ["partner_ambiguous", 409, "TENANT_ONBOARDING_PARTNER_AMBIGUOUS"],
    ["partner_unavailable", 409, "TENANT_ONBOARDING_STATE_CONFLICT"],
  ] as const)("maps approval status %s", async (status, statusCode, code) => {
    approvalRepository.approveApplication.mockImplementationOnce(async () => ({ status }));
    const service = await createService();
    await expect(service.approve(auth(), APPLICATION_ID, {
      version: 1,
      attribution_mode: "auto",
      review_remark: "审核通过",
    })).rejects.toMatchObject({ statusCode, code });
    expect(audit.recordBestEffort).not.toHaveBeenCalled();
  });

  test("retries only an associated delivery after permission and audits success", async () => {
    const service = await createService();
    const result = await service.retryNotification(
      auth(),
      APPLICATION_ID,
      DELIVERY_ID,
    );
    expect(notifications.retry).toHaveBeenCalledWith({
      applicationId: APPLICATION_ID,
      deliveryId: DELIVERY_ID,
    });
    expect(result).toMatchObject({ id: DELIVERY_ID });
    expect(result).not.toHaveProperty("claim_token");
    expect(result).not.toHaveProperty("claim_expires_at");
    expect(audit.recordBestEffort).toHaveBeenCalledTimes(1);
  });

  test("authorizes the related private license and returns only a short signed URL", async () => {
    const service = await createService();
    const result = await service.accessLicense(auth(), APPLICATION_ID);
    expect(resolveSigned).toHaveBeenCalledWith(
      "private/tenant-onboarding-license/visitors/hash/license.jpg",
      { ttlSeconds: 600 },
    );
    expect(result).toEqual({
      url: "https://private.example/signed-license",
      expires_at: "2026-07-14T04:10:00.000Z",
    });
    expect(JSON.stringify(result)).not.toContain("object_key");
  });

  test("rejects a license relation that no longer satisfies the private invariant", async () => {
    repository.findLicenseAccessRecord.mockImplementationOnce(async () => {
      const record = await repository.findLicenseAccessRecord();
      return record ? { ...record, file: { ...record.file!, public_url: "https://public" } } : null;
    });
    await expect((await createService()).accessLicense(auth(), APPLICATION_ID))
      .rejects.toMatchObject({ code: "TENANT_ONBOARDING_DOCUMENT_FORBIDDEN" });
    expect(resolveSigned).not.toHaveBeenCalled();
  });
});
