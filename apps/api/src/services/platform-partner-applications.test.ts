import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  PlatformPartnerApplicationRecord,
  PlatformPartnerApplicationStatus,
} from "@/repositories/platform-partner-applications";
import type {
  PlatformPartnerLevelRecord,
  PlatformPartnerMemberRecord,
  PlatformPartnerRecord,
} from "@/repositories/platform-partners";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
const platformAuthContext = {
  authUserId: "auth-platform",
  employeeId: "employee-platform",
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  isPlatformAdmin: true,
  employeeName: "平台超管",
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
  permissions: [{ code: "platform.partner.manage", scope: "all" }],
} satisfies AuthContext;
const tenantAuthContext = {
  ...platformAuthContext,
  isPlatformAdmin: false,
  roleCodes: [],
  permissions: [],
} satisfies AuthContext;

const level = {
  id: "00000000-0000-4000-8000-000000000101",
  code: "city_partner",
  name: "城市合伙人",
  status: "active",
  tenant_recharge_commission_bps: 1500,
  lead_service_fee_commission_bps: 3500,
  lead_service_fee_default_rate_bps: 250,
  settlement_cycle: "monthly",
  settlement_method: "manual",
  requirements: {},
  sort_order: 20,
  version: 1,
  effective_at: "2026-07-05T10:00:00.000Z",
  expired_at: null,
  created_at: "2026-07-05T10:00:00.000Z",
  updated_at: "2026-07-05T10:00:00.000Z",
} satisfies PlatformPartnerLevelRecord;

const application = {
  id: "00000000-0000-4000-8000-000000000601",
  application_no: "CPA-20260705-0001",
  applicant_name: "信阳星河装饰运营中心",
  subject_type: "company",
  contact_name: "李经理",
  phone: "13800138000",
  region_codes: ["411500"],
  region_name: "河南省信阳市",
  business_description: "本地装修公司渠道资源",
  resource_description: "10 家意向装企",
  message: "希望代理信阳市场",
  source_channel: "official_website",
  source_url: "https://www.goodcms.cn/partners",
  utm_source: "website",
  utm_medium: null,
  utm_campaign: null,
  status: "submitted",
  reviewed_by_employee_id: null,
  reviewed_at: null,
  review_remark: null,
  converted_partner_id: null,
  metadata: {},
  created_at: "2026-07-05T10:00:00.000Z",
  updated_at: "2026-07-05T10:00:00.000Z",
} satisfies PlatformPartnerApplicationRecord;

const partner = {
  id: "00000000-0000-4000-8000-000000000201",
  name: application.applicant_name,
  subject_type: "company",
  contact_name: application.contact_name,
  phone: application.phone,
  status: "active",
  level_id: level.id,
  region_codes: ["411502"],
  region_version: 1,
  contract_status: "pending",
  settlement_account_status: "pending",
  settlement_account: {},
  remark: "官网申请审核通过",
  created_by_employee_id: "employee-platform",
  updated_by_employee_id: "employee-platform",
  created_at: "2026-07-05T10:00:00.000Z",
  updated_at: "2026-07-05T10:00:00.000Z",
  level,
} satisfies PlatformPartnerRecord;

const approvedApplication = {
  ...application,
  status: "approved" as PlatformPartnerApplicationStatus,
  reviewed_by_employee_id: "employee-platform",
  reviewed_at: "2026-07-05T10:10:00.000Z",
  review_remark: "官网申请审核通过",
  converted_partner_id: partner.id,
  converted_partner: {
    id: partner.id,
    name: partner.name,
    status: partner.status,
  },
} satisfies PlatformPartnerApplicationRecord;

const pendingBindMember = {
  id: "00000000-0000-4000-8000-000000000701",
  partner_id: partner.id,
  auth_user_id: null,
  name: application.contact_name,
  phone: application.phone,
  role: "owner",
  status: "pending_bind",
  remark: null,
  created_by_employee_id: "employee-platform",
  updated_by_employee_id: "employee-platform",
  created_at: "2026-07-05T10:10:00.000Z",
  updated_at: "2026-07-05T10:10:00.000Z",
  partner: {
    id: partner.id,
    name: partner.name,
    status: partner.status,
  },
} satisfies PlatformPartnerMemberRecord;

const applicationRepository = {
  createApplication: mock(async (): Promise<PlatformPartnerApplicationRecord> => application),
  findActiveApplicationByPhone: mock(async (): Promise<PlatformPartnerApplicationRecord | null> => null),
  listApplications: mock(async () => ({
    list: [application],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  })),
  findApplicationById: mock(async (): Promise<PlatformPartnerApplicationRecord | null> => application),
  updateApplicationStatus: mock(async (): Promise<PlatformPartnerApplicationRecord> => ({
    ...application,
    status: "reviewing",
    reviewed_by_employee_id: "employee-platform",
  })),
  markApplicationApproved: mock(async (): Promise<PlatformPartnerApplicationRecord> => approvedApplication),
};

const partnerRepository = {
  createPartner: mock(async (): Promise<PlatformPartnerRecord> => partner),
  createPartnerMember: mock(async (): Promise<PlatformPartnerMemberRecord> => pendingBindMember),
};

const verificationCode = {
  id: "00000000-0000-4000-8000-000000000801",
  phone: application.phone, scene: "partner_application", code: "123456",
  status: "pending", expired_at: "2026-07-05T10:05:00.000Z",
  verified_at: null, created_at: "2026-07-05T10:00:00.000Z",
  request_ip: null, request_device: null,
} as const;

const smsService = {
  sendCode: mock(async () => ({
    success: true as const,
    cooldown_seconds: 60,
  })),
  findValidPending: mock(async (): Promise<typeof verificationCode | null> =>
    verificationCode
  ),
  markVerified: mock(async () => undefined),
};

const regionPolicy = {
  assertAssignableDistricts: mock(async (regionCodes: readonly string[]) =>
    Array.from(new Set(regionCodes.map((code) => code.trim()))).sort()
  ),
};

const audit = {
  recordBestEffort: mock(async () => null),
};

async function createService() {
  const { PlatformPartnerApplicationsService } = await import(
    "./platform-partner-applications"
  );
  return new PlatformPartnerApplicationsService({
    applicationRepository,
    partnerRepository,
    smsService,
    regionPolicy,
    audit,
  });
}

describe("PlatformPartnerApplicationsService", () => {
  beforeEach(() => {
    for (const fn of Object.values(applicationRepository)) fn.mockClear();
    for (const fn of Object.values(partnerRepository)) fn.mockClear();
    for (const fn of Object.values(smsService)) fn.mockClear();
    regionPolicy.assertAssignableDistricts.mockClear();
    regionPolicy.assertAssignableDistricts.mockImplementation(
      async (regionCodes) =>
        Array.from(new Set(regionCodes.map((code) => code.trim()))).sort(),
    );
    audit.recordBestEffort.mockClear();
    applicationRepository.findApplicationById.mockImplementation(async () => application);
    applicationRepository.findActiveApplicationByPhone.mockImplementation(async () => null);
    applicationRepository.markApplicationApproved.mockImplementation(async () => approvedApplication);
    smsService.findValidPending.mockImplementation(async () => verificationCode);
  });

  test("sends mini-program public application verification code", async () => {
    const service = await createService();

    const result = await service.sendPublicApplicationCode({
      phone: application.phone,
      requestIp: "127.0.0.1",
      requestDevice: " mini-device-1 ",
    });

    expect(result).toEqual({ success: true, cooldown_seconds: 60 });
    expect(applicationRepository.findActiveApplicationByPhone).toHaveBeenCalledWith(
      application.phone,
    );
    expect(smsService.sendCode).toHaveBeenCalledWith({
      phone: application.phone,
      scene: "partner_application",
      requestIp: "127.0.0.1",
      requestDevice: "mini-device-1",
      requestIpLimit: 5,
    });
  });

  test("creates official website partner application as submitted", async () => {
    const service = await createService();

    await service.submitPublicApplication({
      applicant_name: " 信阳星河装饰运营中心 ",
      subject_type: "company",
      contact_name: "李经理",
      phone: "13800138000",
      region_codes: ["411500"],
      region_name: "河南省信阳市",
      business_description: "本地装修公司渠道资源",
      resource_description: "10 家意向装企",
      message: "希望代理信阳市场",
      source_channel: "official_website",
      source_url: "https://www.goodcms.cn/partners",
      utm_source: "website",
      agree_privacy: true,
    });

    expect(applicationRepository.createApplication).toHaveBeenCalledWith({
      application_no: expect.stringMatching(/^CPA-\d{8}-/),
      applicant_name: "信阳星河装饰运营中心",
      subject_type: "company",
      contact_name: "李经理",
      phone: "13800138000",
      region_codes: ["411500"],
      region_name: "河南省信阳市",
      business_description: "本地装修公司渠道资源",
      resource_description: "10 家意向装企",
      message: "希望代理信阳市场",
      source_channel: "official_website",
      source_url: "https://www.goodcms.cn/partners",
      utm_source: "website",
      utm_medium: null,
      utm_campaign: null,
      status: "submitted",
      metadata: {},
    });
  });

  test("verifies and consumes SMS code before creating mini-program application", async () => {
    const service = await createService();

    await service.submitPublicApplication({
      applicant_name: "信阳星河装饰运营中心",
      subject_type: "company",
      contact_name: "李经理",
      phone: application.phone,
      sms_code: "123456",
      region_codes: ["411500"],
      region_name: "河南省信阳市",
      resource_description: "10 家意向装企",
      source_channel: "mini_program",
      agree_privacy: true,
    });

    expect(smsService.findValidPending).toHaveBeenCalledWith({
      phone: application.phone,
      scene: "partner_application",
      code: "123456",
    });
    expect(smsService.markVerified).toHaveBeenCalledWith(verificationCode.id);
    expect(applicationRepository.createApplication).toHaveBeenCalled();
  });

  test("requires SMS code for mini-program application submission", async () => {
    const service = await createService();

    await expect(service.submitPublicApplication({
      applicant_name: "信阳星河装饰运营中心",
      subject_type: "company",
      contact_name: "李经理",
      phone: application.phone,
      region_codes: ["411500"],
      source_channel: "mini_program",
      agree_privacy: true,
    })).rejects.toMatchObject({
      statusCode: 400,
      code: "SMS_CODE_REQUIRED",
    });
    expect(applicationRepository.createApplication).not.toHaveBeenCalled();
  });

  test("rejects invalid mini-program application SMS code", async () => {
    smsService.findValidPending.mockImplementationOnce(async () => null);
    const service = await createService();

    await expect(service.submitPublicApplication({
      applicant_name: "信阳星河装饰运营中心",
      subject_type: "company",
      contact_name: "李经理",
      phone: application.phone,
      sms_code: "000000",
      region_codes: ["411500"],
      source_channel: "mini_program",
      agree_privacy: true,
    })).rejects.toMatchObject({
      statusCode: 400,
      code: "SMS_CODE_INVALID",
    });
    expect(applicationRepository.createApplication).not.toHaveBeenCalled();
  });

  test("rejects duplicated active application by phone", async () => {
    applicationRepository.findActiveApplicationByPhone.mockImplementationOnce(
      async () => application,
    );
    const service = await createService();

    await expect(service.submitPublicApplication({
      applicant_name: "信阳星河装饰运营中心",
      subject_type: "company",
      contact_name: "李经理",
      phone: application.phone,
      sms_code: "123456",
      region_codes: ["411500"],
      source_channel: "mini_program",
      agree_privacy: true,
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "PARTNER_APPLICATION_DUPLICATED",
    });
    expect(smsService.markVerified).not.toHaveBeenCalled();
    expect(applicationRepository.createApplication).not.toHaveBeenCalled();
  });

  test("lists applications only for platform admins", async () => {
    const service = await createService();

    await expect(
      service.listApplications(tenantAuthContext, { page: 1, pageSize: 20 }),
    ).rejects.toMatchObject({ statusCode: 403 });

    await service.listApplications(platformAuthContext, {
      page: 1,
      pageSize: 20,
      status: "submitted",
      keyword: "星河",
    });

    expect(applicationRepository.listApplications).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      status: "submitted",
      keyword: "星河",
      region_code: undefined,
    });
  });

  test("updates application status with platform partner manage permission", async () => {
    const service = await createService();

    await service.updateApplicationStatus(platformAuthContext, application.id, {
      status: "reviewing",
      review_remark: "已电话沟通",
    });

    expect(applicationRepository.updateApplicationStatus).toHaveBeenCalledWith(
      application.id,
      {
        status: "reviewing",
        reviewed_by_employee_id: "employee-platform",
        review_remark: "已电话沟通",
      },
    );
  });

  test("approves application and converts it to immediately bindable platform partner", async () => {
    const service = await createService();

    const result = await service.approveApplication(platformAuthContext, application.id, {
      level_id: level.id,
      region_codes: ["411502"],
      review_remark: "官网申请审核通过",
    });

    expect(regionPolicy.assertAssignableDistricts).toHaveBeenCalledWith([
      "411502",
    ]);
    expect(partnerRepository.createPartner).toHaveBeenCalledWith({
      name: application.applicant_name,
      subject_type: application.subject_type,
      contact_name: application.contact_name,
      phone: application.phone,
      status: "active",
      level_id: level.id,
      region_codes: ["411502"],
      contract_status: "pending",
      settlement_account_status: "pending",
      settlement_account: {},
      remark: "官网申请审核通过",
      created_by_employee_id: "employee-platform",
      updated_by_employee_id: "employee-platform",
    });
    expect(partnerRepository.createPartnerMember).toHaveBeenCalledWith({
      partner_id: partner.id,
      name: application.contact_name,
      phone: application.phone,
      role: "owner",
      status: "pending_bind",
      created_by_employee_id: "employee-platform",
      updated_by_employee_id: "employee-platform",
    });
    expect(applicationRepository.markApplicationApproved).toHaveBeenCalledWith(
      application.id,
      {
        converted_partner_id: partner.id,
        reviewed_by_employee_id: "employee-platform",
        review_remark: "官网申请审核通过",
      },
    );
    expect(result.partner).toEqual(partner);
    expect(result.application).toEqual(approvedApplication);
    expect(result.created).toBe(true);
    expect(audit.recordBestEffort).toHaveBeenCalledWith({
      action: "platform_partner_regions_update",
      actorEmployeeId: "employee-platform",
      actorUserId: "auth-platform",
      resourceType: "platform_partner",
      resourceId: partner.id,
      resourceLabel: partner.name,
      summary: "设置城市合伙人「信阳星河装饰运营中心」运营区县",
      metadata: {
        reason: "官网申请审核通过",
        previous_region_codes: [],
        current_region_codes: ["411502"],
        previous_version: 0,
        current_version: 1,
        source_application_id: application.id,
      },
    });
  });

  test("returns existing partner when approved application is converted again", async () => {
    applicationRepository.findApplicationById.mockImplementationOnce(
      async () => ({
        ...approvedApplication,
        converted_partner: partner,
      }),
    );
    const service = await createService();

    const result = await service.approveApplication(platformAuthContext, application.id, {
      level_id: level.id,
      region_codes: ["411502"],
    });

    expect(partnerRepository.createPartner).not.toHaveBeenCalled();
    expect(result.created).toBe(false);
    expect(result.idempotent).toBe(true);
    expect(result.partner).toEqual(partner);
  });
});
