import { describe, expect, test } from "bun:test";
import type { PlatformPartnerPortalService as PlatformPartnerPortalServiceClass } from "@/services/platform-partner-portal";
import { PartnerAuthUnbindWechatSchema } from "@/schema/platform-partner-portal";
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

const partnerUser = {
  sub: activeMember.auth_user_id!,
  token_type: "platform_partner" as const,
  login_channel: "wechat" as const,
  openid: "wx-openid",
  unionid: "wx-unionid",
  roles: ["platform_partner"],
  partner_id: activePartner.id,
};

const emptyPage = (page = 1, pageSize = 20) => ({
  list: [],
  pagination: { page, pageSize, total: 0, totalPages: 0 },
});
const emptySummary = () => ({
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
});

function createRepository(
  overrides: Partial<PlatformPartnerPortalRepositoryPort> = {},
): PlatformPartnerPortalRepositoryPort {
  return {
    findMemberByAuthUserId: async () => activeMember,
    findMemberById: async () => activeMember,
    findBindableMemberByPhone: async () => activeMember,
    claimMemberBinding: async () => ({ status: "bound", memberId: activeMember.id }),
    claimMemberUnbind: async () => ({ status: "unbound", memberId: activeMember.id }),
    bindMemberAuthUser: async () => activeMember,
    findPartnerById: async () => activePartner,
    listInviteCodes: async () => [],
    listTenantBindings: async () => emptyPage(),
    listRevenueEvents: async () => emptyPage(),
    listCommissionLedgers: async () => emptyPage(),
    listSettlementBatches: async () => emptyPage(),
    getMonthlySummary: async () => emptySummary(),
    ...overrides,
  };
}

async function createService(
  overrides: Partial<ConstructorParameters<typeof PlatformPartnerPortalServiceClass>[0]> = {},
) {
  const { PlatformPartnerPortalService } = await import(
    "@/services/platform-partner-portal"
  );

  return new PlatformPartnerPortalService({
    repository: createRepository(),
    wechatSessionResolver: async () => ({ openid: "wx-openid", unionid: "wx-unionid" }),
    authUserResolver: async () => ({ userId: activeMember.auth_user_id!, isNewUser: false }),
    oauthIdentityEnsurer: async () => undefined,
    tokenSigner: () => "partner-token",
    visitorSessionSigner: () => "visitor-token",
    smsService: {
      sendCode: async () => ({ success: true as const, cooldown_seconds: 60 }),
    },
    ...overrides,
  });
}

describe("PartnerAuthUnbindWechatSchema", () => {
  test("requires a trimmed 6 digit sms code and explicit confirmation", () => {
    expect(PartnerAuthUnbindWechatSchema.parse({
      sms_code: " 123456 ",
      confirm: true,
    })).toEqual({ sms_code: "123456", confirm: true });

    expect(() => PartnerAuthUnbindWechatSchema.parse({
      sms_code: "12345",
      confirm: true,
    })).toThrow();
    expect(() => PartnerAuthUnbindWechatSchema.parse({
      sms_code: "123456",
      confirm: false,
    })).toThrow();
  });
});

describe("PlatformPartnerPortalService unbind", () => {
  test("sendUnbindCode sends an unbind SMS to the current member phone", async () => {
    const sends: Array<{ phone: string; scene: string; requestIp: string | null }> = [];
    const service = await createService({
      smsService: {
        sendCode: async (input) => {
          sends.push(input);
          return { success: true as const, cooldown_seconds: 60 };
        },
      },
    });

    const result = await service.sendUnbindCode(partnerUser, "127.0.0.1");

    expect(result).toEqual({ success: true });
    expect(sends).toEqual([{
      phone: activeMember.phone,
      scene: "unbind_platform_partner",
      requestIp: "127.0.0.1",
    }]);
  });

  test("unbindWechat claims member unbind and returns a visitor session", async () => {
    let claimInput: unknown;
    const service = await createService({
      repository: createRepository({
        claimMemberUnbind: async (input) => {
          claimInput = input;
          return { status: "unbound", memberId: activeMember.id };
        },
      }),
    });

    const result = await service.unbindWechat(partnerUser, {
      sms_code: " 123456 ",
      confirm: true,
    });

    expect(claimInput).toEqual({
      memberId: activeMember.id,
      authUserId: activeMember.auth_user_id,
      partnerId: activePartner.id,
      code: "123456",
    });
    expect(result).toEqual({
      success: true,
      message: "微信绑定已解除",
      auth: {
        mode: "platform_visitor",
        authMode: "platform_visitor",
        token: "visitor-token",
        user_id: null,
        visitor_id: "wechat_visitor_49040d2358621a1517a880a25df59d90",
        roles: ["visitor"],
        is_new_user: false,
      },
    });
  });

  test("unbindWechat rejects invalid SMS code", async () => {
    const service = await createService({
      repository: createRepository({
        claimMemberUnbind: async () => ({ status: "sms_invalid", memberId: activeMember.id }),
      }),
    });

    await expect(service.unbindWechat(partnerUser, {
      sms_code: "123456",
      confirm: true,
    })).rejects.toMatchObject({
      statusCode: 401,
      code: "SMS_CODE_INVALID",
    });
  });

  test("unbindWechat rejects when the binding changed before unbind", async () => {
    const service = await createService({
      repository: createRepository({
        claimMemberUnbind: async () => ({ status: "member_not_bound", memberId: activeMember.id }),
      }),
    });

    await expect(service.unbindWechat(partnerUser, {
      sms_code: "123456",
      confirm: true,
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "PARTNER_MEMBER_NOT_BOUND",
    });
  });

  test("unbindWechat rejects disabled partner account", async () => {
    const service = await createService({
      repository: createRepository({
        claimMemberUnbind: async () => ({ status: "partner_unavailable", memberId: activeMember.id }),
      }),
    });

    await expect(service.unbindWechat(partnerUser, {
      sms_code: "123456",
      confirm: true,
    })).rejects.toMatchObject({
      statusCode: 403,
      code: "PARTNER_ACCOUNT_DISABLED",
    });
  });
});
