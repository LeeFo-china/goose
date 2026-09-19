import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Errors } from "@/errors/error-factory";
import type { PlatformStaffAuthContext } from "@/services/platform-authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const auth = {
  authUserId: "00000000-0000-4000-8000-000000000010",
  employeeId: "00000000-0000-4000-8000-000000000011",
  tenantId: null,
  isPlatformAdmin: true,
  isPlatformStaff: true,
  isPlatformSuperAdmin: true,
  adminAuthVersion: 1,
  permissions: [{ code: "platform.tenant_onboarding.review", scope: "all" }],
} as unknown as PlatformStaffAuthContext;

const tenantApplication = {
  id: "00000000-0000-4000-8000-000000000101",
  application_no: "TOB202609190001",
  company_name: "晴天装饰工程有限公司",
  admin_name: "张三",
  admin_phone: "13800131234",
  status: "submitted",
  partner_assist_status: "not_applicable",
  source_channel: "local_services",
  address_province: "河南省",
  address_city: "信阳市",
  address_district: "固始县",
  address_region_code: "411525",
  address: "河南省信阳市固始县产业园 1 号",
  address_latitude: 32.123,
  address_longitude: 115.123,
  service_region_codes: ["411525"],
  unified_social_credit_code: null,
  business_license_file_id: null,
  business_license_file: null,
  share_link_id: null,
  sharer_display_name: null,
  candidate_partner: null,
  final_partner: null,
  version: 3,
  created_at: "2026-09-19T01:00:00.000Z",
  updated_at: "2026-09-19T01:00:00.000Z",
  reviewed_at: null,
  reviewer: null,
  review_remark: null,
  converted_tenant_id: null,
};

const partnerApplication = {
  id: "00000000-0000-4000-8000-000000000201",
  application_no: "CPA202609190001",
  applicant_name: "李四",
  subject_type: "company",
  contact_name: "李四",
  phone: "13900135678",
  region_codes: ["411525"],
  region_name: "河南省 信阳市 固始县",
  business_description: "本地装企资源",
  resource_description: "渠道资源",
  message: "希望合作",
  status: "submitted",
  version: 2,
  created_at: "2026-09-19T01:00:00.000Z",
  updated_at: "2026-09-19T01:00:00.000Z",
  reviewed_at: null,
  review_remark: null,
  converted_partner_id: null,
};

const repository = {
  getSummary: mock(async () => ({
    tenant_onboarding: { pending: 3, supplement_required: 2, reviewing: 1, approved_today: 4 },
    partner_applications: { pending: 1, supplement_required: 0, reviewing: 0, approved_today: 2 },
    latest: [{ id: tenantApplication.id, type: "tenant_onboarding", title: tenantApplication.company_name, status: "submitted", created_at: tenantApplication.created_at }],
  })),
  listTenantApplications: mock(async () => ({
    list: [tenantApplication],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  })),
  findTenantApplicationById: mock(async () => tenantApplication),
  listReviewLogs: mock(async () => ({
    list: [{
      id: "00000000-0000-4000-8000-000000000301",
      target_type: "tenant_onboarding_application",
      target_id: tenantApplication.id,
      action: "approve",
      from_status: "submitted",
      to_status: "approved",
      remark: "同意",
      operator: { id: auth.employeeId, name: "平台超管" },
      created_at: "2026-09-19T01:05:00.000Z",
    }],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  })),
};

const tenantReviewService = {
  accessLicense: mock(async () => ({ url: "https://signed.example/license", expires_at: "2026-09-19T01:10:00.000Z" })),
  approve: mock(async () => ({
    approval: {
      tenant_id: "00000000-0000-4000-8000-000000000401",
      initialization: { admin_employee_id: "00000000-0000-4000-8000-000000000402" },
      idempotent: false,
    },
    application: { ...tenantApplication, status: "approved", version: 4, converted_tenant_id: "00000000-0000-4000-8000-000000000401" },
  })),
  reject: mock(async () => ({ application: { ...tenantApplication, status: "rejected", version: 4 } })),
  requestSupplement: mock(async () => ({ application: { ...tenantApplication, status: "supplement_required", version: 4 } })),
};

const partnerService = {
  listApplications: mock(async () => ({
    list: [partnerApplication],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  })),
  getApplication: mock(async () => partnerApplication),
  approveMobileApplication: mock(async () => ({ status: "updated" as const, application: { id: partnerApplication.id, status: "approved" as const, version: 3, converted_partner_id: "00000000-0000-4000-8000-000000000501" }, partner: { id: "00000000-0000-4000-8000-000000000501", name: "李四", status: "active" as const, default_invite_code: "CP-411525-ABC" }, idempotent: false })),
  rejectMobileApplication: mock(async () => ({ status: "updated" as const, application: { id: partnerApplication.id, status: "rejected" as const, version: 3, converted_partner_id: null }, partner: null, idempotent: false })),
  requestMobileSupplement: mock(async () => ({ status: "updated" as const, application: { id: partnerApplication.id, status: "supplement_required" as const, version: 3, converted_partner_id: null }, partner: null, idempotent: false })),
};

async function createService() {
  const { PlatformAdminReviewWorkbenchService } = await import(
    "./platform-admin-review-workbench"
  );
  return new PlatformAdminReviewWorkbenchService({
    repository,
    tenantReviewService,
    partnerService,
  } as never);
}

describe("PlatformAdminReviewWorkbenchService", () => {
  beforeEach(() => {
    for (const method of Object.values(repository)) method.mockClear();
    for (const method of Object.values(tenantReviewService)) method.mockClear();
    for (const method of Object.values(partnerService)) method.mockClear();
  });

  test("returns summary and masked tenant application DTOs", async () => {
    const service = await createService();

    const summary = await service.summary(auth);
    const page = await service.listTenantApplications(auth, {
      page: 1,
      pageSize: 20,
      status: "submitted",
      source_channel: "local_services",
    });

    expect(summary.latest).toHaveLength(1);
    expect(page.list[0]?.admin_phone_masked).toBe("138****1234");
    expect(page.list[0]).not.toHaveProperty("admin_phone");
    expect(repository.listTenantApplications).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      status: "submitted",
      source_channel: "local_services",
    });
  });

  test("returns tenant details without exposing the full phone", async () => {
    const service = await createService();
    const detail = await service.getTenantApplication(auth, tenantApplication.id);

    expect(detail.admin_phone_masked).toBe("138****1234");
    expect(detail).not.toHaveProperty("admin_phone");
    expect(detail.share_attribution).toEqual({
      share_link_id: null,
      sharer_display_name: null,
      submitted_from_share: false,
    });
  });

  test("maps tenant approval and supplement fields to the existing domain service", async () => {
    const service = await createService();

    const approved = await service.approveTenantApplication(auth, tenantApplication.id, {
      expected_version: 3,
      remark: "资料完整，同意入驻",
      publish_local_service_provider: false,
      assign_partner_id: null,
    });
    await service.requestTenantSupplement(auth, tenantApplication.id, {
      expected_version: 3,
      remark: "请补充地址",
      required_fields: ["address"],
    });

    expect(tenantReviewService.approve).toHaveBeenCalledWith(auth, tenantApplication.id, {
      version: 3,
      attribution_mode: "auto",
      review_remark: "资料完整，同意入驻",
    });
    expect(tenantReviewService.requestSupplement).toHaveBeenCalledWith(auth, tenantApplication.id, {
      version: 3,
      remark: "请补充地址",
      required_fields: ["company_location"],
    });
    expect(approved.tenant.admin_employee_id).toBe("00000000-0000-4000-8000-000000000402");
  });

  test("masks partner phones and delegates atomic actions with the same key", async () => {
    const service = await createService();
    const page = await service.listPartnerApplications(auth, { page: 1, pageSize: 20 });
    const detail = await service.getPartnerApplication(auth, partnerApplication.id);
    const approved = await service.approvePartnerApplication(auth, partnerApplication.id, {
      expected_version: 2,
      remark: "符合合作条件",
      partner_level_code: "city",
      region_codes: ["411525"],
      generate_default_invite_code: true,
    }, "00000000-0000-4000-8000-000000000601");

    expect(page.list[0]?.phone_masked).toBe("139****5678");
    expect(detail.phone_masked).toBe("139****5678");
    expect(detail).not.toHaveProperty("phone");
    expect(approved).not.toHaveProperty("status");
    expect(approved.application.status).toBe("approved");
    expect(partnerService.approveMobileApplication).toHaveBeenCalledWith(
      auth,
      partnerApplication.id,
      expect.objectContaining({ partner_level_code: "city" }),
      "00000000-0000-4000-8000-000000000601",
    );
  });

  test("returns private preview and unified paginated review logs", async () => {
    const service = await createService();
    expect(await service.getTenantLicensePreview(auth, tenantApplication.id)).toEqual({
      url: "https://signed.example/license",
      expires_at: "2026-09-19T01:10:00.000Z",
    });
    const logs = await service.listReviewLogs(auth, {
      target_type: "tenant_onboarding_application",
      target_id: tenantApplication.id,
      page: 1,
      pageSize: 20,
    });
    expect(logs.list[0]?.operator?.name).toBe("平台超管");
  });

  test("maps existing tenant duplicate errors to the mobile contract", async () => {
    tenantReviewService.approve.mockImplementationOnce(async () => {
      throw Errors.business(
        409,
        "该企业主体已经入驻",
        "TENANT_ONBOARDING_SUBJECT_EXISTS",
      );
    });
    const service = await createService();

    await expect(service.approveTenantApplication(auth, tenantApplication.id, {
      expected_version: 3,
      remark: "资料完整，同意入驻",
      publish_local_service_provider: false,
      assign_partner_id: null,
    })).rejects.toMatchObject({ statusCode: 409, code: "DUPLICATED_SUBJECT" });
  });
});
