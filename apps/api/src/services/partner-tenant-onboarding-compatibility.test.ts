import { beforeEach, describe, expect, mock, test } from "bun:test";
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

const NOW = new Date("2026-07-14T10:00:00.000Z");
const BEFORE_CUTOFF = new Date("2026-07-14T09:59:59.000Z");
const CUTOFF = "2026-07-14T10:00:00.000Z";

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
  level_id: level.id,
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
  slug: "tenant-9000-abc123",
  status: "active",
  address: null,
  address_title: null,
  address_poi_id: null,
  address_province: null,
  address_city: null,
  address_district: null,
  address_adcode: null,
  address_latitude: null,
  address_longitude: null,
  address_source: "manual",
  address_confidence: null,
  address_confirmed_at: "2026-07-14T10:00:00.000Z",
  contact_name: "王总",
  contact_phone: "13900139000",
  unified_social_credit_code: null,
  created_at: "2026-07-14T10:00:00.000Z",
  updated_at: "2026-07-14T10:00:00.000Z",
} satisfies PlatformTenantRecord;

const initialization = {
  template_code: "default_decoration_company",
  template_version: "2026.08.30",
  departments_count: 42,
  posts_count: 48,
  roles_count: 11,
  admin_employee_id: "00000000-0000-4000-8000-000000000601",
  admin_role_id: "00000000-0000-4000-8000-000000000701",
} as const satisfies PlatformTenantInitializationResult;

const binding = {
  id: "00000000-0000-4000-8000-000000000401",
  tenant_id: tenant.id,
  partner_id: partner.id,
  invite_code_id: inviteCode.id,
  source_type: "invite_code",
  source_id: null,
  status: "active",
  bound_at: "2026-07-14T10:00:00.000Z",
  unbound_at: null,
  changed_by_employee_id: initialization.admin_employee_id,
  change_reason: "装企小程序扫码入驻自动绑定",
  created_at: "2026-07-14T10:00:00.000Z",
  updated_at: "2026-07-14T10:00:00.000Z",
} satisfies TenantPartnerBindingRecord;

const smsCode = {
  id: "sms-code-id",
  phone: "13900139000",
  scene: "partner_tenant_onboarding",
  code: "123456",
  status: "pending",
  expired_at: "2026-07-14T10:05:00.000Z",
  verified_at: null,
  created_at: "2026-07-14T10:00:00.000Z",
  request_ip: "127.0.0.1",
  request_device: "iphone-test",
} satisfies SmsVerificationCodeRow;

const partnerRepository = {
  findInviteCodeByCode: mock(async () => ({ ...inviteCode, partner })),
  findActiveTenantBinding: mock(async () => null as TenantPartnerBindingRecord | null),
  createTenantBinding: mock(async () => binding),
  incrementInviteCodeCounts: mock(async () => undefined),
};

const tenantRepository = {
  findBySlug: mock(async () => null as PlatformTenantRecord | null),
  findEmployeesByPhone: mock(async () => []),
  createWithDefaultTemplate: mock(async () => ({ tenant, initialization })),
};

const smsService = {
  sendCode: mock(async () => ({ success: true as const, cooldown_seconds: 60 })),
  findValidPending: mock(async (): Promise<SmsVerificationCodeRow | null> => smsCode),
  markVerified: mock(async () => undefined),
};

const submitInput = {
  invite_code: "CP-411500-0001",
  company_name: "晴天装饰",
  admin_name: "王总",
  admin_phone: "13900139000",
  sms_code: "123456",
};

async function createService(input: {
  legacyCutoffAt?: string | null;
  clock?: () => Date;
} = {}) {
  const {
    PlatformPartnerTenantOnboardingService,
  } = await import("./platform-partner-tenant-onboarding");

  return new PlatformPartnerTenantOnboardingService({
    partnerRepository,
    tenantRepository,
    smsService,
    slugSuffixFactory: () => "abc123",
    legacyCutoffAt: input.legacyCutoffAt,
    clock: input.clock ?? (() => NOW),
  });
}

describe("legacy partner tenant onboarding compatibility", () => {
  beforeEach(() => {
    for (const fn of Object.values(partnerRepository)) fn.mockClear();
    for (const fn of Object.values(tenantRepository)) fn.mockClear();
    for (const fn of Object.values(smsService)) fn.mockClear();
  });

  test("keeps the legacy success envelope before a cutoff is scheduled", async () => {
    const service = await createService({ legacyCutoffAt: null });

    const result = await service.submitPublicTenantOnboarding(submitInput);

    expect(result).toMatchObject({
      tenant: { id: tenant.id, status: "active" },
      initialization,
      binding: { id: binding.id },
      created: true,
      auth: null,
    });
    expect(result).not.toHaveProperty("application");
    expect(result).not.toHaveProperty("status", "submitted");
    expect(tenantRepository.createWithDefaultTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        admin: expect.objectContaining({
          department_code: "EXEC_OFFICE",
          post_code: "SYSTEM_ADMIN",
        }),
      }),
      { operatorEmployeeId: null },
    );
    expect("create" in tenantRepository).toBe(false);
    expect("initializeDefaultData" in tenantRepository).toBe(false);
  });

  test("keeps the legacy response during the scheduled compatibility window", async () => {
    const service = await createService({
      legacyCutoffAt: CUTOFF,
      clock: () => BEFORE_CUTOFF,
    });

    const result = await service.submitPublicTenantOnboarding(submitInput);

    expect(result).toMatchObject({
      tenant: { id: tenant.id, status: "active" },
      created: true,
      auth: null,
    });
    expect(tenantRepository.createWithDefaultTemplate).toHaveBeenCalledTimes(1);
  });

  test("rejects a scheduled cutoff more than 14 days after full mini-program availability", async () => {
    const {
      assertLegacyPartnerTenantOnboardingCutoffWindow,
    } = await import("./platform-partner-tenant-onboarding");

    expect(() => assertLegacyPartnerTenantOnboardingCutoffWindow({
      fullReleaseAt: new Date("2026-07-01T00:00:00.000Z"),
      cutoffAt: new Date("2026-07-15T00:00:00.000Z"),
    })).not.toThrow();

    expect(() => assertLegacyPartnerTenantOnboardingCutoffWindow({
      fullReleaseAt: new Date("2026-07-01T00:00:00.000Z"),
      cutoffAt: new Date("2026-07-15T00:00:01.000Z"),
    })).toThrow();
  });

  test("returns 410 before SMS send once the cutoff is due", async () => {
    const service = await createService({ legacyCutoffAt: CUTOFF });

    await expect(service.sendPublicTenantOnboardingCode({
      phone: "13900139000",
      requestIp: "127.0.0.1",
      requestDevice: "iphone-test",
    })).rejects.toMatchObject({
      statusCode: 410,
      code: "TENANT_ONBOARDING_CLIENT_UPGRADE_REQUIRED",
      message: "请升级小程序后重新申请",
    });

    expect(smsService.sendCode).not.toHaveBeenCalled();
  });

  test("returns 410 before SMS verification or tenant initialization once the cutoff is due", async () => {
    const service = await createService({ legacyCutoffAt: CUTOFF });

    await expect(service.submitPublicTenantOnboarding(submitInput)).rejects.toMatchObject({
      statusCode: 410,
      code: "TENANT_ONBOARDING_CLIENT_UPGRADE_REQUIRED",
      message: "请升级小程序后重新申请",
    });

    expect(smsService.findValidPending).not.toHaveBeenCalled();
    expect(tenantRepository.createWithDefaultTemplate).not.toHaveBeenCalled();
    expect(partnerRepository.createTenantBinding).not.toHaveBeenCalled();
  });

  test("fails startup validation for an invalid non-empty cutoff", async () => {
    const {
      PlatformPartnerTenantOnboardingService,
    } = await import("./platform-partner-tenant-onboarding");

    expect(() => new PlatformPartnerTenantOnboardingService({
      partnerRepository,
      tenantRepository,
      smsService,
      legacyCutoffAt: "not-a-date",
      clock: () => NOW,
    })).toThrow();
  });
});
