import { describe, expect, test } from "bun:test";
import type {
  PlatformPartnerMemberRecord,
  PlatformPartnerPortalRepositoryPort,
  PlatformPartnerRecord,
} from "@/repositories/platform-partner-portal";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const activePartner = {
  id: "00000000-0000-4000-8000-000000000201",
  name: "信阳城市合伙人",
  status: "active",
  region_codes: ["411500"],
  level: {
    id: "00000000-0000-4000-8000-000000000101",
    code: "city",
    name: "城市合伙人",
    status: "active",
  },
} satisfies PlatformPartnerRecord;

const activeMember = {
  id: "00000000-0000-4000-8000-000000000301",
  partner_id: activePartner.id,
  auth_user_id: "00000000-0000-4000-8000-000000000401",
  name: "张三",
  phone: "13800138000",
  role: "owner",
  status: "active",
  partner: activePartner,
} satisfies PlatformPartnerMemberRecord;

function createRepository(
  overrides: Partial<PlatformPartnerPortalRepositoryPort> = {},
): PlatformPartnerPortalRepositoryPort {
  const emptyPage = { list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } };
  return {
    findMemberByAuthUserId: async () => activeMember,
    findMemberById: async () => activeMember,
    findBindableMemberByPhone: async () => activeMember,
    claimMemberBinding: async () => ({ status: "bound", memberId: activeMember.id }),
    claimMemberUnbind: async () => ({ status: "unbound", memberId: activeMember.id }),
    bindMemberAuthUser: async () => activeMember,
    unbindMemberAuthUser: async () => ({ status: "unbound", memberId: activeMember.id }),
    findPartnerById: async () => activePartner,
    listInviteCodes: async () => [],
    createInviteCode: async () => {
      throw new Error("not used");
    },
    listTenantBindings: async () => emptyPage,
    listRevenueEvents: async () => emptyPage,
    listCommissionLedgers: async () => emptyPage,
    listSettlementBatches: async () => emptyPage,
    getMonthlySummary: async () => ({
      tenant_count: 0,
      revenue_event_count: 0,
      revenue_amount_fen: 0,
      paid_amount_fen: 0,
      commission_amount_fen: 0,
      available_commission_amount_fen: 0,
      settled_commission_amount_fen: 0,
      settlement_batch_count: 0,
      settlement_total_amount_fen: 0,
      paid_settlement_amount_fen: 0,
    }),
    ...overrides,
  };
}

async function createService(
  repository: PlatformPartnerPortalRepositoryPort,
) {
  const { PlatformPartnerPortalService } = await import(
    "@/services/platform-partner-portal"
  );

  return new PlatformPartnerPortalService({
    repository,
    wechatSessionResolver: async () => ({ openid: "wx-openid", unionid: "wx-unionid" }),
    authUserResolver: async () => ({ userId: activeMember.auth_user_id!, isNewUser: false }),
    oauthIdentityEnsurer: async () => undefined,
    tokenSigner: () => "signed-token",
    smsService: {
      sendCode: async () => ({ success: true as const, cooldown_seconds: 60 }),
    },
  });
}

describe("PlatformPartnerPortalService.authenticateSelectedMember", () => {
  test("binds exactly the selected member", async () => {
    const selectedMember = {
      ...activeMember,
      id: "00000000-0000-4000-8000-000000000777",
      auth_user_id: null,
      status: "pending_bind",
    } satisfies PlatformPartnerMemberRecord;
    const calls: unknown[] = [];
    const service = await createService(createRepository({
      findMemberById: async (memberId) => {
        calls.push(["findById", memberId]);
        return memberId === selectedMember.id ? selectedMember : null;
      },
      findBindableMemberByPhone: async () => {
        calls.push(["fallbackByPhone"]);
        return activeMember;
      },
      bindMemberAuthUser: async (memberId, authUserId) => {
        calls.push(["bind", memberId, authUserId]);
        return {
          ...selectedMember,
          auth_user_id: authUserId,
          status: "active",
        };
      },
    }));

    const result = await service.authenticateSelectedMember({
      memberId: selectedMember.id,
      phone: selectedMember.phone,
      userId: activeMember.auth_user_id!,
      openid: "wx-openid",
      unionid: "wx-unionid",
    });

    expect(result.member.id).toBe(selectedMember.id);
    expect(result.member.status).toBe("active");
    expect(calls).toEqual([
      ["findById", selectedMember.id],
      ["findById", selectedMember.id],
      ["bind", selectedMember.id, activeMember.auth_user_id],
    ]);
  });

  test("rejects stale selected member without phone fallback", async () => {
    const service = await createService(createRepository({
      findMemberById: async () => null,
      findBindableMemberByPhone: async () => activeMember,
    }));

    await expect(service.authenticateSelectedMember({
      memberId: "00000000-0000-4000-8000-000000000777",
      phone: "13800138000",
      userId: activeMember.auth_user_id!,
      openid: "wx-openid",
    })).rejects.toMatchObject({
      code: "IDENTITY_OPTION_UNAVAILABLE",
    });
  });
});
