import { beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type {
  PlatformPartnerInviteCodeRecord,
  PlatformPartnerLevelRecord,
  PlatformPartnerRecord,
  TenantPartnerBindingRecord,
} from "@/repositories/platform-partners";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const migrationDir = join(
  import.meta.dir,
  "../../../../supabase/migrations",
);

function readCityPartnerMigration() {
  const file = readdirSync(migrationDir)
    .filter((name) => name.endsWith("_create_city_partner_mvp.sql"))
    .sort()
    .at(-1);
  expect(file).toBeTruthy();
  return readFileSync(join(migrationDir, file as string), "utf8");
}

function readAllMigrations() {
  return readdirSync(migrationDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(migrationDir, name), "utf8"))
    .join("\n");
}

describe("city partner MVP migration", () => {
  test("creates partner, revenue, commission, and settlement tables", () => {
    const sql = readCityPartnerMigration();

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.platform_partner_levels");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.platform_partners");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.platform_partner_invite_codes");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.tenant_partner_bindings");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.platform_revenue_events");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.partner_commission_ledger");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.partner_settlement_batches");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.partner_settlement_items");
    expect(sql).toContain("lead_service_fee_default_rate_bps integer NOT NULL DEFAULT 250");
    expect(sql).toContain("settlement_cycle text NOT NULL DEFAULT 'monthly'");
    expect(sql).toContain("settlement_method text NOT NULL DEFAULT 'manual'");
    expect(sql).toContain("tenant_partner_bindings_one_active_idx");
    expect(sql).toContain("platform_revenue_events_source_unique_idx");
    expect(sql).toContain("partner_commission_ledger_settlement_batch_fk");
    expect(sql).toContain("'certified_partner'");
    expect(sql).toContain("'city_partner'");
    expect(sql).toContain("'city_operation_center'");
  });

  test("registers platform partner permissions for platform admins", () => {
    const sql = readAllMigrations();

    expect(sql).toContain("'platform.partner.read'");
    expect(sql).toContain("'platform.partner.manage'");
    expect(sql).toContain("'platform.partner.level.manage'");
    expect(sql).toContain("'platform.partner.binding.manage'");
    expect(sql).toContain("'platform.partner.revenue.read'");
    expect(sql).toContain("'platform.partner.revenue.manage'");
    expect(sql).toContain("'platform.partner.commission.read'");
    expect(sql).toContain("'platform.partner.commission.manage'");
    expect(sql).toContain("'platform.partner.settlement.manage'");
    expect(sql).toContain("WHERE roles.code = 'platform_admin'");
    expect(sql).toContain("roles.tenant_id IS NULL");
  });
});

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
  permissions: [
    { code: "platform.partner.manage", scope: "all" },
    { code: "platform.partner.binding.manage", scope: "all" },
  ],
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
  effective_at: "2026-07-04T10:00:00.000Z",
  expired_at: null,
  created_at: "2026-07-04T10:00:00.000Z",
  updated_at: "2026-07-04T10:00:00.000Z",
} satisfies PlatformPartnerLevelRecord;

const activePartner = {
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

const suspendedPartner = {
  ...activePartner,
  status: "suspended",
} satisfies PlatformPartnerRecord;

const existingBinding = {
  id: "00000000-0000-4000-8000-000000000402",
  tenant_id: "00000000-0000-4000-8000-000000000501",
  partner_id: activePartner.id,
  invite_code_id: null,
  source_type: "manual",
  source_id: null,
  status: "active",
  bound_at: "2026-07-04T10:00:00.000Z",
  unbound_at: null,
  changed_by_employee_id: "employee-platform",
  change_reason: "平台招商绑定",
  created_at: "2026-07-04T10:00:00.000Z",
  updated_at: "2026-07-04T10:00:00.000Z",
} satisfies TenantPartnerBindingRecord;

const otherPartnerBinding = {
  ...existingBinding,
  partner_id: "00000000-0000-4000-8000-000000000202",
} satisfies TenantPartnerBindingRecord;

const createdBinding = {
  ...existingBinding,
  id: "00000000-0000-4000-8000-000000000401",
} satisfies TenantPartnerBindingRecord;

const inviteCode = {
  id: "00000000-0000-4000-8000-000000000301",
  partner_id: activePartner.id,
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

const tenantEmployeeAuthContext = {
  ...tenantAuthContext,
  authUserId: "auth-tenant",
  employeeId: "employee-tenant-admin",
  tenantId: existingBinding.tenant_id,
  tenantName: "晴天装饰",
  tenantSlug: "qingtian",
  tenantStatus: "active",
} satisfies AuthContext;

const repository = {
  listPartners: mock(async () => ({
    list: [activePartner],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  })),
  findPartnerById: mock(async (): Promise<PlatformPartnerRecord | null> => activePartner),
  listLevels: mock(async () => [level]),
  createPartner: mock(async () => activePartner),
  updatePartner: mock(async () => activePartner),
  updatePartnerStatus: mock(async (): Promise<PlatformPartnerRecord> => suspendedPartner),
  createInviteCode: mock(async (): Promise<PlatformPartnerInviteCodeRecord> => inviteCode),
  listInviteCodes: mock(async () => []),
  findInviteCodeByCode: mock(
    async (): Promise<(PlatformPartnerInviteCodeRecord & {
      partner: PlatformPartnerRecord | null;
    }) | null> => ({
      ...inviteCode,
      partner: activePartner,
    }),
  ),
  findActiveTenantBinding: mock(async (): Promise<TenantPartnerBindingRecord | null> => null),
  createTenantBinding: mock(async (): Promise<TenantPartnerBindingRecord> => createdBinding),
  listTenantBindings: mock(async () => ({
    list: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  })),
};

async function createService() {
  const { PlatformPartnersService } = await import("./platform-partners");
  return new PlatformPartnersService({ repository });
}

describe("PlatformPartnersService", () => {
  beforeEach(() => {
    for (const fn of Object.values(repository)) fn.mockClear();
    repository.findPartnerById.mockImplementation(async () => activePartner);
    repository.findActiveTenantBinding.mockImplementation(async () => null);
  });

  test("rejects non-platform admins", async () => {
    const service = await createService();

    await expect(
      service.listPartners(tenantAuthContext, { page: 1, pageSize: 20 }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  test("creates invite code only for active partners", async () => {
    repository.findPartnerById.mockImplementationOnce(async () => suspendedPartner);
    const service = await createService();

    await expect(
      service.createInviteCode(platformAuthContext, activePartner.id, {
        region_code: "411500",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.createInviteCode).not.toHaveBeenCalled();
  });

  test("rejects tenant binding when tenant already has active binding", async () => {
    repository.findActiveTenantBinding.mockImplementationOnce(async () => existingBinding);
    const service = await createService();

    await expect(
      service.createTenantBinding(platformAuthContext, {
        tenant_id: "00000000-0000-4000-8000-000000000501",
        partner_id: activePartner.id,
        source_type: "manual",
        change_reason: "平台招商绑定",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.createTenantBinding).not.toHaveBeenCalled();
  });

  test("status change only calls status update repository method", async () => {
    const service = await createService();

    await service.updatePartnerStatus(platformAuthContext, activePartner.id, {
      status: "suspended",
      reason: "连续两个月未达标",
    });

    expect(repository.updatePartnerStatus).toHaveBeenCalledWith(
      activePartner.id,
      {
        status: "suspended",
        updated_by_employee_id: "employee-platform",
        change_reason: "连续两个月未达标",
      },
    );
    expect(repository.updatePartner).not.toHaveBeenCalled();
    expect(repository.createTenantBinding).not.toHaveBeenCalled();
  });

  test("resolves active invite code for mini-program onboarding", async () => {
    const service = await createService();

    const result = await service.resolveInviteCode({ code: " cp-411500-0001 " });

    expect(repository.findInviteCodeByCode).toHaveBeenCalledWith("CP-411500-0001");
    expect(result).toEqual({
      invite_code: {
        id: inviteCode.id,
        code: inviteCode.code,
        region_code: inviteCode.region_code,
        campaign_code: inviteCode.campaign_code,
        expires_at: inviteCode.expires_at,
      },
      partner: {
        id: activePartner.id,
        name: activePartner.name,
        status: activePartner.status,
        region_codes: activePartner.region_codes,
        level: {
          code: level.code,
          name: level.name,
        },
      },
      onboarding: {
        can_bind: true,
        binding_source_type: "invite_code",
      },
    });
  });

  test("binds current tenant by invite code without trusting tenant_id from client", async () => {
    const service = await createService();

    await service.bindTenantByInviteCode(tenantEmployeeAuthContext, {
      invite_code: inviteCode.code,
      source_id: "scene=partner-onboarding",
    });

    expect(repository.createTenantBinding).toHaveBeenCalledWith({
      tenant_id: existingBinding.tenant_id,
      partner_id: activePartner.id,
      invite_code_id: inviteCode.id,
      source_type: "invite_code",
      source_id: "scene=partner-onboarding",
      changed_by_employee_id: "employee-tenant-admin",
      change_reason: "装企小程序扫码入驻自动绑定",
    });
  });

  test("returns existing binding for repeated invite-code binding to same partner", async () => {
    repository.findActiveTenantBinding.mockImplementationOnce(async () => existingBinding);
    const service = await createService();

    const result = await service.bindTenantByInviteCode(tenantEmployeeAuthContext, {
      invite_code: inviteCode.code,
    });

    expect(result.created).toBe(false);
    expect(result.idempotent).toBe(true);
    expect(result.binding).toEqual(existingBinding);
    expect(repository.createTenantBinding).not.toHaveBeenCalled();
  });

  test("rejects invite-code binding when tenant is already bound to another partner", async () => {
    repository.findActiveTenantBinding.mockImplementationOnce(async () => otherPartnerBinding);
    const service = await createService();

    await expect(
      service.bindTenantByInviteCode(tenantEmployeeAuthContext, {
        invite_code: inviteCode.code,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "TENANT_PARTNER_BINDING_EXISTS",
    });
    expect(repository.createTenantBinding).not.toHaveBeenCalled();
  });
});
