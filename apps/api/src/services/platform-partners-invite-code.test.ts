import { describe, expect, test } from "bun:test";
import type {
  PlatformPartnerInviteCodeCreateRecordInput,
  PlatformPartnerInviteCodeRecord,
  PlatformPartnerRecord,
} from "@/repositories/platform-partners";
import type { AuthContext } from "@/services/authorization";
import {
  PlatformPartnersService,
  type PlatformPartnersRepositoryPort,
} from "@/services/platform-partners";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const activePartner = {
  id: "00000000-0000-4000-8000-000000000201",
  name: "信阳城市合伙人",
  subject_type: "company",
  contact_name: "李经理",
  phone: "13800138000",
  status: "active",
  level_id: "00000000-0000-4000-8000-000000000101",
  region_codes: ["411500"],
  contract_status: "signed",
  settlement_account_status: "verified",
  settlement_account: {},
  created_by_employee_id: "employee-platform",
  updated_by_employee_id: "employee-platform",
  created_at: "2026-07-05T10:00:00.000Z",
  updated_at: "2026-07-05T10:00:00.000Z",
  remark: null,
} satisfies PlatformPartnerRecord;

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

const inviteCode = {
  id: "00000000-0000-4000-8000-000000000301",
  partner_id: activePartner.id,
  code: "CP-411500-ABC123",
  region_code: "411500",
  campaign_code: "PIC-411500-ABC123",
  status: "active",
  scan_count: 0,
  submitted_count: 0,
  approved_count: 0,
  expires_at: null,
  created_by_employee_id: platformAuthContext.employeeId,
  created_at: "2026-07-05T10:00:00.000Z",
  updated_at: "2026-07-05T10:00:00.000Z",
} satisfies PlatformPartnerInviteCodeRecord;

function createRepository(
  capture: (payload: PlatformPartnerInviteCodeCreateRecordInput) => void,
): PlatformPartnersRepositoryPort {
  const emptyPage = {
    list: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  };
  return {
    listPartners: async () => emptyPage,
    findPartnerById: async () => activePartner,
    listLevels: async () => [],
    createPartner: async () => activePartner,
    updatePartner: async () => activePartner,
    updatePartnerStatus: async () => activePartner,
    listPartnerMembers: async () => emptyPage,
    createPartnerMember: async () => {
      throw new Error("unused");
    },
    findPartnerMemberById: async () => null,
    updatePartnerMemberStatus: async () => {
      throw new Error("unused");
    },
    createInviteCode: async (payload) => {
      capture(payload);
      return inviteCode;
    },
    listInviteCodes: async () => [],
    findInviteCodeByCode: async () => ({ ...inviteCode, partner: activePartner }),
    findActiveTenantBinding: async () => null,
    createTenantBinding: async () => {
      throw new Error("unused");
    },
    listTenantBindings: async () => emptyPage,
  };
}

describe("PlatformPartnersService invite code generation", () => {
  test("generates campaign code on the server", async () => {
    const payloads: PlatformPartnerInviteCodeCreateRecordInput[] = [];
    const service = new PlatformPartnersService({
      repository: createRepository((payload) => payloads.push(payload)),
    });

    await service.createInviteCode(platformAuthContext, activePartner.id, {
      region_code: "411500",
    });

    const payload = payloads[0];
    expect(payload).toBeTruthy();
    if (!payload) throw new Error("missing invite code payload");
    expect(payload.partner_id).toBe(activePartner.id);
    expect(payload.code).toMatch(/^CP-411500-[A-Z0-9]+$/);
    expect(payload.campaign_code).toMatch(/^PIC-411500-[A-Z0-9]+$/);
  });
});
