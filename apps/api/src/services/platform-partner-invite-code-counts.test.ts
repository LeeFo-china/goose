import { beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type {
  PlatformPartnerInviteCodeRecord,
  PlatformPartnerLevelRecord,
  PlatformPartnerMemberRecord,
  PlatformPartnerRecord,
  TenantPartnerBindingRecord,
} from "@/repositories/platform-partners";
import type { AuthContext } from "@/services/authorization";

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

describe("partner invite code counters", () => {
  test("adds an atomic invite-code counter increment function", () => {
    const sql = readAllMigrations();

    expect(sql).toContain("increment_platform_partner_invite_code_counts");
    expect(sql).toContain("p_scan_count integer DEFAULT 0");
    expect(sql).toContain("p_submitted_count integer DEFAULT 0");
    expect(sql).toContain("p_approved_count integer DEFAULT 0");
  });
});

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

const binding = {
  id: "00000000-0000-4000-8000-000000000401",
  tenant_id: "00000000-0000-4000-8000-000000000501",
  partner_id: partner.id,
  invite_code_id: inviteCode.id,
  source_type: "invite_code",
  source_id: "scene=partner-onboarding",
  status: "active",
  bound_at: "2026-07-04T10:00:00.000Z",
  unbound_at: null,
  changed_by_employee_id: "employee-tenant-admin",
  change_reason: "装企小程序扫码入驻自动绑定",
  created_at: "2026-07-04T10:00:00.000Z",
  updated_at: "2026-07-04T10:00:00.000Z",
} satisfies TenantPartnerBindingRecord;

const member = {
  id: "00000000-0000-4000-8000-000000000601",
  partner_id: partner.id,
  auth_user_id: null,
  name: "李四",
  phone: "13900139000",
  role: "owner",
  status: "pending_bind",
  remark: null,
  created_by_employee_id: "employee-platform",
  updated_by_employee_id: "employee-platform",
  created_at: "2026-07-05T10:00:00.000Z",
  updated_at: "2026-07-05T10:00:00.000Z",
} satisfies PlatformPartnerMemberRecord;

const tenantAuthContext = {
  authUserId: "auth-tenant",
  employeeId: "employee-tenant-admin",
  tenantId: binding.tenant_id,
  tenantName: "晴天装饰",
  tenantSlug: "qingtian",
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "租户管理员",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: [],
  roles: [],
  permissions: [],
} satisfies AuthContext;

const emptyPage = {
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};

const repository = {
  listPartners: mock(async () => emptyPage),
  findPartnerById: mock(async () => partner),
  listLevels: mock(async () => [level]),
  createPartner: mock(async () => partner),
  updatePartner: mock(async () => partner),
  updatePartnerStatus: mock(async () => partner),
  listPartnerMembers: mock(async () => ({ ...emptyPage, list: [member] })),
  createPartnerMember: mock(async () => member),
  findPartnerMemberById: mock(async () => member),
  updatePartnerMemberStatus: mock(async () => member),
  createInviteCode: mock(async () => inviteCode),
  listInviteCodes: mock(async () => [inviteCode]),
  findInviteCodeByCode: mock(async () => ({ ...inviteCode, partner })),
  incrementInviteCodeCounts: mock(async () => undefined),
  findActiveTenantBinding: mock(
    async (): Promise<TenantPartnerBindingRecord | null> => null,
  ),
  createTenantBinding: mock(async () => binding),
  listTenantBindings: mock(async () => emptyPage),
};

async function createService() {
  const { PlatformPartnersService } = await import("./platform-partners");
  return new PlatformPartnersService({ repository });
}

describe("PlatformPartnersService invite code counters", () => {
  beforeEach(() => {
    for (const fn of Object.values(repository)) fn.mockClear();
    repository.findInviteCodeByCode.mockImplementation(
      async () => ({ ...inviteCode, partner }),
    );
    repository.findActiveTenantBinding.mockImplementation(async () => null);
  });

  test("increments scan count when public onboarding resolves an invite code", async () => {
    const service = await createService();

    await service.resolveInviteCode({ code: " cp-411500-0001 " });

    expect(repository.incrementInviteCodeCounts).toHaveBeenCalledWith({
      inviteCodeId: inviteCode.id,
      scan_count: 1,
    });
  });

  test("increments submission and approval counts after a new tenant binding", async () => {
    const service = await createService();

    await service.bindTenantByInviteCode(tenantAuthContext, {
      invite_code: inviteCode.code,
      source_id: "scene=partner-onboarding",
    });

    expect(repository.incrementInviteCodeCounts).toHaveBeenCalledWith({
      inviteCodeId: inviteCode.id,
      submitted_count: 1,
      approved_count: 1,
    });
  });

  test("does not increment counts for idempotent repeated binding", async () => {
    repository.findActiveTenantBinding.mockImplementationOnce(async () => binding);
    const service = await createService();

    await service.bindTenantByInviteCode(tenantAuthContext, {
      invite_code: inviteCode.code,
    });

    expect(repository.createTenantBinding).not.toHaveBeenCalled();
    expect(repository.incrementInviteCodeCounts).not.toHaveBeenCalled();
  });
});
