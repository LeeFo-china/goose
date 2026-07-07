import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  PlatformPartnerInviteCodeRecord,
  PlatformPartnerMemberRecord,
  PlatformPartnerRecord,
  TenantPartnerBindingRecord,
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
  permissions: [{ code: "platform.partner.read", scope: "all" }],
} satisfies AuthContext;

const tenantAuthContext = {
  ...platformAuthContext,
  isPlatformAdmin: false,
  roleCodes: [],
  permissions: [],
} satisfies AuthContext;

const activePartner = {
  id: "00000000-0000-4000-8000-000000000201",
  name: "信阳城市合伙人",
  subject_type: "company",
  contact_name: "张三",
  phone: "13800138000",
  status: "active",
  level_id: "00000000-0000-4000-8000-000000000101",
  region_codes: ["411500"],
  contract_status: "signed",
  settlement_account_status: "verified",
  settlement_account: {},
  remark: null,
  created_by_employee_id: null,
  updated_by_employee_id: null,
  created_at: "2026-07-05T00:00:00.000Z",
  updated_at: "2026-07-05T00:00:00.000Z",
} satisfies PlatformPartnerRecord;

const partnerMember = {
  id: "00000000-0000-4000-8000-000000000301",
  partner_id: activePartner.id,
  auth_user_id: "00000000-0000-4000-8000-000000000401",
  name: "张三",
  phone: "13800138000",
  role: "owner",
  status: "active",
  remark: null,
  created_by_employee_id: null,
  updated_by_employee_id: null,
  created_at: "2026-07-05T00:00:00.000Z",
  updated_at: "2026-07-05T00:00:00.000Z",
} satisfies PlatformPartnerMemberRecord;

const inviteCode = {
  id: "00000000-0000-4000-8000-000000000601",
  partner_id: activePartner.id,
  code: "CP-411500-0001",
  region_code: "411500",
  campaign_code: null,
  status: "active",
  scan_count: 0,
  submitted_count: 0,
  approved_count: 0,
  expires_at: null,
  created_by_employee_id: null,
  created_at: "2026-07-05T00:00:00.000Z",
  updated_at: "2026-07-05T00:00:00.000Z",
} satisfies PlatformPartnerInviteCodeRecord;

const tenantBinding = {
  id: "00000000-0000-4000-8000-000000000701",
  tenant_id: "00000000-0000-4000-8000-000000000801",
  partner_id: activePartner.id,
  invite_code_id: inviteCode.id,
  source_type: "invite_code",
  source_id: null,
  status: "active",
  bound_at: "2026-07-05T00:00:00.000Z",
  unbound_at: null,
  changed_by_employee_id: null,
  change_reason: null,
  created_at: "2026-07-05T00:00:00.000Z",
  updated_at: "2026-07-05T00:00:00.000Z",
} satisfies TenantPartnerBindingRecord;

const repository = {
  listPartners: mock(async () => ({
    list: [activePartner],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  })),
  findPartnerById: mock(async (): Promise<PlatformPartnerRecord | null> => activePartner),
  listLevels: mock(async () => []),
  createPartner: mock(async () => activePartner),
  updatePartner: mock(async () => activePartner),
  updatePartnerStatus: mock(async () => activePartner),
  listPartnerMembers: mock(async () => ({
    list: [partnerMember],
    pagination: { page: 3, pageSize: 7, total: 51, totalPages: 8 },
  })),
  createPartnerMember: mock(async () => partnerMember),
  findPartnerMemberById: mock(async () => partnerMember),
  updatePartnerMemberStatus: mock(async () => partnerMember),
  createInviteCode: mock(async () => inviteCode),
  listInviteCodes: mock(async () => []),
  findInviteCodeByCode: mock(async () => ({ ...inviteCode, partner: activePartner })),
  incrementInviteCodeCounts: mock(async () => undefined),
  findActiveTenantBinding: mock(async (): Promise<TenantPartnerBindingRecord | null> => null),
  createTenantBinding: mock(async (): Promise<TenantPartnerBindingRecord> => tenantBinding),
  listTenantBindings: mock(async () => ({
    list: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  })),
};

describe("PlatformPartnersService member pagination", () => {
  beforeEach(() => {
    for (const fn of Object.values(repository)) fn.mockClear();
  });

  test("passes pagination to repository and returns paged member result", async () => {
    const { PlatformPartnersService } = await import("./platform-partners");
    const service = new PlatformPartnersService({ repository });

    const result = await service.listPartnerMembers(
      platformAuthContext,
      activePartner.id,
      { page: 3, pageSize: 7 },
    );

    expect(repository.findPartnerById).toHaveBeenCalledWith(activePartner.id);
    expect(repository.listPartnerMembers).toHaveBeenCalledWith({
      partnerId: activePartner.id,
      page: 3,
      pageSize: 7,
    });
    expect(result).toEqual({
      list: [partnerMember],
      pagination: { page: 3, pageSize: 7, total: 51, totalPages: 8 },
    });
  });

  test("rejects non-platform admins before loading partner members", async () => {
    const { PlatformPartnersService } = await import("./platform-partners");
    const service = new PlatformPartnersService({ repository });

    await expect(service.listPartnerMembers(
      tenantAuthContext,
      activePartner.id,
      { page: 1, pageSize: 20 },
    )).rejects.toMatchObject({ statusCode: 403 });

    expect(repository.findPartnerById).not.toHaveBeenCalled();
    expect(repository.listPartnerMembers).not.toHaveBeenCalled();
  });
});
