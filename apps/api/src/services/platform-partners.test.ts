import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  PlatformPartnerInviteCodeRecord,
  PlatformPartnerRecord,
  TenantPartnerBindingRecord,
} from "@/repositories/platform-partners";
import {
  activePartner,
  boundDisabledPartnerMember,
  createdBinding,
  disabledPartner,
  existingBinding,
  inviteCode,
  level,
  memberCreateInput,
  memberCreatePayload,
  otherPartnerBinding,
  partnerMember,
  pendingPartner,
  platformAuthContext,
  suspendedPartner,
  tenantAuthContext,
  tenantEmployeeAuthContext,
} from "./platform-partners-test-data";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const repository = {
  listPartners: mock(async () => ({
    list: [activePartner],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  })),
  findPartnerById: mock(async (): Promise<PlatformPartnerRecord | null> => activePartner),
  listLevels: mock(async () => [level]),
  createPartner: mock(async () => activePartner),
  updatePartner: mock(async () => activePartner),
  updatePartnerRegions: mock(
    async (): Promise<PlatformPartnerRecord | null> => ({
      ...activePartner,
      region_codes: ["411502"],
      region_version: 2,
    }),
  ),
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
  incrementInviteCodeCounts: mock(async () => undefined),
  findActiveTenantBinding: mock(async (): Promise<TenantPartnerBindingRecord | null> => null),
  createTenantBinding: mock(async (): Promise<TenantPartnerBindingRecord> => createdBinding),
  listTenantBindings: mock(async () => ({
    list: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  })),
  listPartnerMembers: mock(async () => ({
    list: [partnerMember],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  })),
  createPartnerMember: mock(async () => partnerMember),
  findPartnerMemberById: mock(async () => partnerMember),
  updatePartnerMemberStatus: mock(async () => boundDisabledPartnerMember),
};

const regionPolicy = {
  assertAssignableDistricts: mock(async (regionCodes: readonly string[]) =>
    Array.from(new Set(regionCodes.map((code) => code.trim()))).sort()
  ),
  assertPartnerInviteRegion: mock(async (
    _partnerRegionCodes: readonly string[],
    regionCode: string,
  ) => regionCode.trim()),
};

const audit = {
  recordBestEffort: mock(async () => null),
};

async function createService() {
  const { PlatformPartnersService } = await import("./platform-partners");
  return new PlatformPartnersService({ repository, regionPolicy, audit });
}

describe("PlatformPartnersService", () => {
  beforeEach(() => {
    for (const fn of Object.values(repository)) fn.mockClear();
    repository.findPartnerById.mockImplementation(async () => activePartner);
    repository.findActiveTenantBinding.mockImplementation(async () => null);
    repository.updatePartnerRegions.mockImplementation(async () => ({
      ...activePartner,
      region_codes: ["411502"],
      region_version: 2,
    }));
    regionPolicy.assertAssignableDistricts.mockClear();
    regionPolicy.assertAssignableDistricts.mockImplementation(
      async (regionCodes) =>
        Array.from(new Set(regionCodes.map((code) => code.trim()))).sort(),
    );
    regionPolicy.assertPartnerInviteRegion.mockClear();
    regionPolicy.assertPartnerInviteRegion.mockImplementation(
      async (_partnerRegionCodes, regionCode) => regionCode.trim(),
    );
    audit.recordBestEffort.mockClear();
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

  test("validates and normalizes districts before creating a partner", async () => {
    const service = await createService();

    await service.createPartner(platformAuthContext, {
      name: "浉河区合伙人",
      subject_type: "company",
      contact_name: "王五",
      phone: "13700137000",
      level_id: level.id,
      region_codes: ["411503", "411502", "411503"],
      contract_status: "pending",
      settlement_account_status: "pending",
      settlement_account: {},
    });

    expect(regionPolicy.assertAssignableDistricts).toHaveBeenCalledWith([
      "411503",
      "411502",
      "411503",
    ]);
    expect(repository.createPartner).toHaveBeenCalledWith(
      expect.objectContaining({
        region_codes: ["411502", "411503"],
        status: "pending",
      }),
    );
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

  test("revalidates districts before activating a partner", async () => {
    repository.findPartnerById.mockImplementationOnce(async () => ({
      ...pendingPartner,
      region_codes: ["411502"],
    }));
    const service = await createService();

    await service.updatePartnerStatus(platformAuthContext, activePartner.id, {
      status: "active",
      reason: "运营资料核验完成",
    });

    expect(regionPolicy.assertAssignableDistricts).toHaveBeenCalledWith(
      ["411502"],
      { excludePartnerId: activePartner.id },
    );
  });

  test("validates invite code district against partner coverage", async () => {
    repository.findPartnerById.mockImplementationOnce(async () => ({
      ...activePartner,
      region_codes: ["411502"],
    }));
    const service = await createService();

    await service.createInviteCode(platformAuthContext, activePartner.id, {
      region_code: "411502",
    });

    expect(regionPolicy.assertPartnerInviteRegion).toHaveBeenCalledWith(
      ["411502"],
      "411502",
    );
    expect(repository.createInviteCode).toHaveBeenCalledWith(
      expect.objectContaining({ region_code: "411502" }),
    );
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

  for (const [status, partner] of [["active", activePartner], ["pending", pendingPartner]] as const) {
    test(`creates partner member for ${status} partner without auth user`, async () => {
      repository.findPartnerById.mockImplementationOnce(async () => partner);
      const service = await createService();
      await service.createPartnerMember(platformAuthContext, activePartner.id, memberCreateInput);
      expect(repository.createPartnerMember).toHaveBeenCalledWith(memberCreatePayload);
    });
  }

  test("requires partner manage permission when creating partner members", async () => {
    const service = await createService();
    await expect(
      service.createPartnerMember(
        { ...platformAuthContext, permissions: [] },
        activePartner.id,
        memberCreateInput,
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(repository.createPartnerMember).not.toHaveBeenCalled();
  });

  for (const [status, partner] of [["suspended", suspendedPartner], ["terminated", disabledPartner]] as const) {
    test(`rejects member creation for ${status} partners`, async () => {
      repository.findPartnerById.mockImplementationOnce(async () => partner);
      const service = await createService();
      await expect(service.createPartnerMember(platformAuthContext, activePartner.id, memberCreateInput))
        .rejects.toMatchObject({ statusCode: 400 });
      expect(repository.createPartnerMember).not.toHaveBeenCalled();
    });
  }

  test("updates member status with reason without touching auth user binding", async () => {
    const service = await createService();
    await service.updatePartnerMemberStatus(platformAuthContext, partnerMember.id, { status: "disabled", reason: "离职停用" });
    expect(repository.findPartnerMemberById).toHaveBeenCalledWith(partnerMember.id);
    expect(repository.updatePartnerMemberStatus).toHaveBeenCalledWith(partnerMember.id, {
      status: "disabled", updated_by_employee_id: "employee-platform", remark: "离职停用",
    });
    expect(repository.updatePartner).not.toHaveBeenCalled();
  });

  test("requires partner manage permission when updating member status", async () => {
    const service = await createService();
    await expect(service.updatePartnerMemberStatus({ ...platformAuthContext, permissions: [] }, partnerMember.id, {
      status: "disabled", reason: "离职停用",
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(repository.findPartnerMemberById).not.toHaveBeenCalled();
    expect(repository.updatePartnerMemberStatus).not.toHaveBeenCalled();
  });
});
