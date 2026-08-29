import { beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type {
  PlatformPartnerInviteCodeRecord,
  PlatformPartnerLevelRecord,
  PlatformPartnerRecord,
  TenantPartnerBindingRecord,
} from "@/repositories/platform-partners";
import type {
  PlatformTenantInitializationResult,
  PlatformTenantRecord,
} from "@/repositories/platform-tenants/legacy/shared";
import type { SmsVerificationCodeRow } from "@/repositories/sms-verification-codes";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const migrationDir = join(import.meta.dir, "../../../../supabase/migrations");

function readAllMigrations() {
  return readdirSync(migrationDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(migrationDir, name), "utf8"))
    .join("\n");
}

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
  effective_at: "2026-07-04T10:00:00.000Z",
  expired_at: null,
  created_at: "2026-07-04T10:00:00.000Z",
  updated_at: "2026-07-04T10:00:00.000Z",
} satisfies PlatformPartnerLevelRecord;

const partner = {
  id: "00000000-0000-4000-8000-000000000201",
  name: "信阳城市合伙人",
  subject_type: "company",
  contact_name: "张三",
  phone: "13800138000",
  status: "active",
  level_id: "00000000-0000-4000-8000-000000000101",
  region_codes: ["411500"],
  contract_status: "signed",
  settlement_account_status: "valid",
  settlement_account: {},
  remark: null,
  created_by_employee_id: "employee-platform",
  updated_by_employee_id: "employee-platform",
  created_at: "2026-07-04T10:00:00.000Z",
  updated_at: "2026-07-04T10:00:00.000Z",
  level,
} satisfies PlatformPartnerRecord;

const inviteCode = {
  id: "00000000-0000-4000-8000-000000000301",
  partner_id: partner.id,
  code: "CP-411500-0001",
  region_code: "411500",
  campaign_code: null,
  status: "active",
  scan_count: 0,
  submitted_count: 0,
  approved_count: 0,
  expires_at: null,
  created_by_employee_id: "employee-platform",
  created_at: "2026-07-04T10:00:00.000Z",
  updated_at: "2026-07-04T10:00:00.000Z",
} satisfies PlatformPartnerInviteCodeRecord;

const tenant = {
  id: "00000000-0000-4000-8000-000000000501",
  name: "晴天装饰",
  slug: "tenant-1890-abc123",
  status: "active",
  address: "信阳市浉河区北京路 1 号",
  address_title: "北京路 1 号",
  address_poi_id: null,
  address_province: "河南省",
  address_city: "信阳市",
  address_district: "浉河区",
  address_adcode: "411502",
  address_latitude: 32.123,
  address_longitude: 114.123,
  address_source: "map_picker",
  address_confidence: 1,
  address_confirmed_at: "2026-07-07T10:00:00.000Z",
  contact_name: "王总",
  contact_phone: "13900139000",
  unified_social_credit_code: null,
  created_at: "2026-07-07T10:00:00.000Z",
  updated_at: "2026-07-07T10:00:00.000Z",
} satisfies PlatformTenantRecord;

const initialization = {
  template_code: "default_decoration_company",
  template_version: "2026.05.10",
  departments_count: 4,
  posts_count: 8,
  roles_count: 3,
  admin_employee_id: "00000000-0000-4000-8000-000000000601",
  admin_role_id: "00000000-0000-4000-8000-000000000701",
} satisfies PlatformTenantInitializationResult;

const binding = {
  id: "00000000-0000-4000-8000-000000000401",
  tenant_id: tenant.id,
  partner_id: partner.id,
  invite_code_id: inviteCode.id,
  source_type: "invite_code",
  source_id: "scene=partner-onboarding",
  status: "active",
  bound_at: "2026-07-07T10:00:00.000Z",
  unbound_at: null,
  changed_by_employee_id: initialization.admin_employee_id,
  change_reason: "装企小程序扫码入驻自动绑定",
  created_at: "2026-07-07T10:00:00.000Z",
  updated_at: "2026-07-07T10:00:00.000Z",
} satisfies TenantPartnerBindingRecord;

const smsCode = {
  id: "sms-code-id",
  phone: "13900139000",
  scene: "partner_tenant_onboarding",
  code: "123456",
  status: "pending",
  expired_at: "2026-07-07T10:05:00.000Z",
  verified_at: null,
  created_at: "2026-07-07T10:00:00.000Z",
  request_ip: "127.0.0.1",
  request_device: "iphone-test",
} satisfies SmsVerificationCodeRow;

type EmployeePhoneRow = {
  id: string;
  tenant_id: string | null;
  name: string | null;
  phone: string | null;
  status: string | null;
};

const partnerRepository = {
  findInviteCodeByCode: mock(async () => ({ ...inviteCode, partner })),
  findActiveTenantBinding: mock(async () => null as TenantPartnerBindingRecord | null),
  createTenantBinding: mock(async () => binding),
  incrementInviteCodeCounts: mock(async () => undefined),
};

const tenantRepository = {
  findBySlug: mock(async () => null as PlatformTenantRecord | null),
  findEmployeesByPhone: mock(async (): Promise<EmployeePhoneRow[]> => []),
  create: mock(async () => tenant),
  initializeDefaultData: mock(async () => initialization),
};

const smsService = {
  sendCode: mock(async () => ({
    success: true as const,
    cooldown_seconds: 60,
  })),
  findValidPending: mock(async (): Promise<SmsVerificationCodeRow | null> => smsCode),
  markVerified: mock(async () => undefined),
};

async function createService() {
  const { PlatformPartnerTenantOnboardingService } = await import(
    "./platform-partner-tenant-onboarding"
  );
  return new PlatformPartnerTenantOnboardingService({
    partnerRepository,
    tenantRepository,
    smsService,
    slugSuffixFactory: () => "abc123",
  });
}

describe("partner tenant onboarding migration", () => {
  test("allows SMS verification codes for partner tenant onboarding", () => {
    const sql = readAllMigrations();

    expect(sql).toContain("'partner_tenant_onboarding'::text");
  });
});

describe("PlatformPartnerTenantOnboardingService", () => {
  beforeEach(() => {
    for (const fn of Object.values(partnerRepository)) fn.mockClear();
    for (const fn of Object.values(tenantRepository)) fn.mockClear();
    for (const fn of Object.values(smsService)) fn.mockClear();
    partnerRepository.findInviteCodeByCode.mockImplementation(
      async () => ({ ...inviteCode, partner }),
    );
    partnerRepository.findActiveTenantBinding.mockImplementation(async () => null);
    tenantRepository.findBySlug.mockImplementation(async () => null);
    tenantRepository.findEmployeesByPhone.mockImplementation(async () => []);
    tenantRepository.create.mockImplementation(async () => tenant);
    tenantRepository.initializeDefaultData.mockImplementation(async () => initialization);
    smsService.findValidPending.mockImplementation(async () => smsCode);
  });

  test("sends a public onboarding verification code", async () => {
    const service = await createService();

    const result = await service.sendPublicTenantOnboardingCode({
      phone: "13900139000",
      requestIp: "127.0.0.1",
      requestDevice: "iphone-test",
    });

    expect(result).toEqual({ success: true, cooldown_seconds: 60 });
    expect(smsService.sendCode).toHaveBeenCalledWith({
      phone: "13900139000",
      scene: "partner_tenant_onboarding",
      requestIp: "127.0.0.1",
      requestDevice: "iphone-test",
    });
  });

  test("creates a new tenant with admin and binds it to the invite partner", async () => {
    const service = await createService();

    const result = await service.submitPublicTenantOnboarding({
      invite_code: " cp-411500-0001 ",
      company_name: "晴天装饰",
      admin_name: "王总",
      admin_phone: "13900139000",
      sms_code: "123456",
      region_code: "411502",
      region_name: "河南省信阳市浉河区",
      address: "信阳市浉河区北京路 1 号",
      location: {
        title: "北京路 1 号",
        province: "河南省",
        city: "信阳市",
        district: "浉河区",
        adcode: "411502",
        latitude: 32.123,
        longitude: 114.123,
      },
      source_id: "scene=partner-onboarding",
    });

    expect(smsService.findValidPending).toHaveBeenCalledWith({
      phone: "13900139000",
      scene: "partner_tenant_onboarding",
      code: "123456",
    });
    expect(smsService.markVerified).toHaveBeenCalledWith("sms-code-id");
    expect(tenantRepository.findEmployeesByPhone).toHaveBeenCalledWith("13900139000");
    expect(tenantRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      name: "晴天装饰",
      slug: "tenant-9000-abc123",
      status: "active",
      contact_name: "王总",
      contact_phone: "13900139000",
      address: "信阳市浉河区北京路 1 号",
      address_title: "北京路 1 号",
      address_poi_id: null,
      address_province: "河南省",
      address_city: "信阳市",
      address_district: "浉河区",
      address_adcode: "411502",
      address_latitude: 32.123,
      address_longitude: 114.123,
      address_source: "map_picker",
      address_confidence: 1,
      address_confirmed_at: expect.any(String),
      admin: {
        name: "王总",
        phone: "13900139000",
        department_code: "ADMIN",
        post_code: "SYSTEM_ADMIN",
      },
    }));
    expect(tenantRepository.initializeDefaultData).toHaveBeenCalledWith({
      tenantId: tenant.id,
      operatorEmployeeId: null,
      admin: {
        name: "王总",
        phone: "13900139000",
        department_code: "ADMIN",
        post_code: "SYSTEM_ADMIN",
      },
    });
    expect(partnerRepository.createTenantBinding).toHaveBeenCalledWith({
      tenant_id: tenant.id,
      partner_id: partner.id,
      invite_code_id: inviteCode.id,
      source_type: "invite_code",
      source_id: "scene=partner-onboarding",
      changed_by_employee_id: initialization.admin_employee_id,
      change_reason: "装企小程序扫码入驻自动绑定",
    });
    expect(partnerRepository.incrementInviteCodeCounts).toHaveBeenCalledWith({
      inviteCodeId: inviteCode.id,
      submitted_count: 1,
      approved_count: 1,
    });
    expect(result.invite_code.code).toBe(inviteCode.code);
    expect(result.partner.id).toBe(partner.id);
    expect(result.tenant).toEqual(tenant);
    expect(result.initialization).toEqual(initialization);
    expect(result.binding).toEqual(binding);
    expect(result.created).toBe(true);
    expect(result.auth).toBeNull();
  });

  test("rejects duplicate admin employee phone before creating tenant", async () => {
    tenantRepository.findEmployeesByPhone.mockImplementationOnce(async () => [
      {
        id: "employee-existing",
        tenant_id: "tenant-existing",
        name: "旧员工",
        phone: "13900139000",
        status: "active",
      },
    ]);
    const service = await createService();

    await expect(service.submitPublicTenantOnboarding({
      invite_code: inviteCode.code,
      company_name: "晴天装饰",
      admin_name: "王总",
      admin_phone: "13900139000",
      sms_code: "123456",
    })).rejects.toMatchObject({ code: "TENANT_ADMIN_PHONE_EXISTS" });

    expect(tenantRepository.create).not.toHaveBeenCalled();
    expect(partnerRepository.createTenantBinding).not.toHaveBeenCalled();
    expect(smsService.markVerified).not.toHaveBeenCalled();
  });

  test("requires a valid SMS code", async () => {
    smsService.findValidPending.mockImplementationOnce(async () => null);
    const service = await createService();

    await expect(service.submitPublicTenantOnboarding({
      invite_code: inviteCode.code,
      company_name: "晴天装饰",
      admin_name: "王总",
      admin_phone: "13900139000",
      sms_code: "000000",
    })).rejects.toMatchObject({ code: "SMS_CODE_INVALID" });

    expect(tenantRepository.create).not.toHaveBeenCalled();
  });
});
