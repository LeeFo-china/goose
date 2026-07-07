import { describe, expect, test } from "bun:test";
import type {
  PlatformPartnerMemberRecord,
  PlatformPartnerPortalRepositoryPort,
  PlatformPartnerRecord,
} from "@/repositories/platform-partner-portal";
import {
  PartnerAuthBindPhoneSchema,
  PartnerAuthUnbindWechatSchema,
} from "@/schema/platform-partner-portal";
import type { PartnerAuthResponse } from "@/services/platform-partner-portal";
import { withPhoneLoginWithoutCodeFlag } from "@/services/platform-partner-portal-test-helpers";

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

const expectedAuthContext = {
  user_id: activeMember.auth_user_id,
  roles: ["platform_partner"] as ["platform_partner"],
  mode: "platform_partner" as const,
  authMode: "platform_partner" as const,
  member: {
    id: activeMember.id,
    partner_id: activePartner.id,
    name: "张三",
    phone: "13800138000",
    role: "owner",
    status: "active",
  },
  partner: {
    id: activePartner.id,
    name: activePartner.name,
    status: "active",
    region_codes: ["411500"],
    level: { code: "city", name: "城市合伙人" },
  },
  level: {
    id: activePartner.level.id,
    code: "city",
    name: "城市合伙人",
    status: "active",
  },
} satisfies Omit<PartnerAuthResponse, "token">;

function createRepository(
  overrides: Partial<PlatformPartnerPortalRepositoryPort> = {},
): PlatformPartnerPortalRepositoryPort {
  const emptyPage = () => ({
    list: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  });

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
    listTenantBindings: async () => emptyPage(),
    listRevenueEvents: async () => emptyPage(),
    listCommissionLedgers: async () => emptyPage(),
    listSettlementBatches: async () => emptyPage(),
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
  repository: PlatformPartnerPortalRepositoryPort = createRepository(),
) {
  const { PlatformPartnerPortalService } = await import(
    "@/services/platform-partner-portal"
  );

  return new PlatformPartnerPortalService({
    repository,
    wechatSessionResolver: async () => ({
      openid: "wx-openid",
      unionid: "wx-unionid",
    }),
    authUserResolver: async () => ({
      userId: activeMember.auth_user_id!,
      isNewUser: false,
    }),
    oauthIdentityEnsurer: async () => undefined,
    tokenSigner: () => "signed-token",
    smsService: {
      sendCode: async () => ({ success: true as const, cooldown_seconds: 60 }),
    },
  });
}

describe("PlatformPartnerPortalService system-test phone login bypass", () => {
  test("bind phone schema accepts omitted SMS code", () => {
    expect(PartnerAuthBindPhoneSchema.safeParse({
      code: "wx-code",
      phone: "13800138000",
    }).success).toBe(true);

    expect(PartnerAuthBindPhoneSchema.safeParse({
      code: "wx-code",
      phone: "13800138000",
      sms_code: "",
    }).success).toBe(true);
  });

  test("unbind schema accepts omitted SMS code for system-test bypass", () => {
    expect(PartnerAuthUnbindWechatSchema.safeParse({
      confirm: true,
    }).success).toBe(true);

    expect(PartnerAuthUnbindWechatSchema.safeParse({
      sms_code: "",
      confirm: true,
    }).success).toBe(true);
  });

  test("requires SMS code when bypass is disabled", async () => {
    await withPhoneLoginWithoutCodeFlag(undefined, async () => {
      const service = await createService();

      await expect(service.bindPhone({
        code: "wx-code",
        phone: "13800138000",
        request: {} as never,
      })).rejects.toMatchObject({
        statusCode: 400,
        code: "SMS_CODE_REQUIRED",
      });
    });
  });

  test("skips SMS claim and binds pending member when bypass is enabled", async () => {
    await withPhoneLoginWithoutCodeFlag("true", async () => {
      let claimCalls = 0;
      let bindCalls = 0;
      const pendingMember = {
        ...activeMember,
        auth_user_id: null,
        status: "pending_bind" as const,
      };
      const service = await createService(createRepository({
        findBindableMemberByPhone: async () => pendingMember,
        claimMemberBinding: async () => {
          claimCalls += 1;
          return { status: "sms_invalid" };
        },
        bindMemberAuthUser: async (memberId, authUserId) => {
          bindCalls += 1;
          expect(memberId).toBe(activeMember.id);
          expect(authUserId).toBe(activeMember.auth_user_id);
          return activeMember;
        },
      }));

      const result = await service.bindPhone({
        code: "wx-code",
        phone: "13800138000",
        sms_code: "",
        request: {} as never,
      });

      expect(result).toEqual({ token: "signed-token", ...expectedAuthContext });
      expect(claimCalls).toBe(0);
      expect(bindCalls).toBe(1);
    });
  });

  test("still rejects member bound to another auth user when bypass is enabled", async () => {
    await withPhoneLoginWithoutCodeFlag("true", async () => {
      let bindCalls = 0;
      const service = await createService(createRepository({
        findBindableMemberByPhone: async () => ({
          ...activeMember,
          auth_user_id: "00000000-0000-4000-8000-000000000999",
        }),
        bindMemberAuthUser: async () => {
          bindCalls += 1;
          return activeMember;
        },
      }));

      await expect(service.bindPhone({
        code: "wx-code",
        phone: "13800138000",
        request: {} as never,
      })).rejects.toMatchObject({
        statusCode: 409,
        code: "PARTNER_MEMBER_ALREADY_BOUND",
      });
      expect(bindCalls).toBe(0);
    });
  });

  test("skips SMS claim and unbinds current member when bypass is enabled", async () => {
    await withPhoneLoginWithoutCodeFlag("true", async () => {
      let claimCalls = 0;
      let unbindCalls = 0;
      const service = await createService(createRepository({
        claimMemberUnbind: async () => {
          claimCalls += 1;
          return { status: "sms_invalid", memberId: activeMember.id };
        },
        unbindMemberAuthUser: async (input) => {
          unbindCalls += 1;
          expect(input).toEqual({
            memberId: activeMember.id,
            authUserId: activeMember.auth_user_id,
            partnerId: activePartner.id,
          });
          return { status: "unbound", memberId: activeMember.id };
        },
      }));

      const result = await service.unbindWechat({
        token_type: "platform_partner",
        sub: activeMember.auth_user_id!,
        partner_id: activePartner.id,
        openid: "wx-openid",
        unionid: "wx-unionid",
        roles: ["platform_partner"],
      }, {
        sms_code: "",
        confirm: true,
      });

      expect(result.success).toBe(true);
      expect(result.auth.mode).toBe("platform_visitor");
      expect(claimCalls).toBe(0);
      expect(unbindCalls).toBe(1);
    });
  });
});
