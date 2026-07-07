import { describe, expect, test } from "bun:test";
import type { PartnerAuthResponse, PlatformPartnerPortalService as PlatformPartnerPortalServiceClass } from "@/services/platform-partner-portal";
import { withPhoneLoginWithoutCodeFlag } from "@/services/platform-partner-portal-test-helpers";
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
  name: "信阳城市合伙人", status: "active", region_codes: ["411500"],
  level: { id: "00000000-0000-4000-8000-000000000101", code: "city", name: "城市合伙人", status: "active" },
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
  roles: ["platform_partner"],
  partner_id: activePartner.id,
};
const userWithoutPartner = {
  sub: activeMember.auth_user_id!,
  token_type: "platform_partner" as const,
  roles: ["platform_partner"],
};
const otherPartnerId = "00000000-0000-4000-8000-000000000999";
const emptyPage = (page = 1, pageSize = 20) => ({ list: [], pagination: { page, pageSize, total: 0, totalPages: 0 } });
const emptySummary = () => ({ tenant_count: 0, revenue_event_count: 0, revenue_amount_fen: 0, paid_amount_fen: 0, commission_amount_fen: 0, available_commission_amount_fen: 0, settled_commission_amount_fen: 0, settlement_batch_count: 0, settlement_total_amount_fen: 0, paid_settlement_amount_fen: 0 });
const expectedAuthContext = {
  user_id: activeMember.auth_user_id,
  roles: ["platform_partner"] as ["platform_partner"],
  mode: "platform_partner" as const,
  authMode: "platform_partner" as const,
  member: { id: activeMember.id, partner_id: activePartner.id, name: "张三", phone: "13800138000", role: "owner", status: "active" },
  partner: { id: activePartner.id, name: activePartner.name, status: "active", region_codes: ["411500"], level: { code: "city", name: "城市合伙人" } },
  level: { id: activePartner.level.id, code: "city", name: "城市合伙人", status: "active" },
} satisfies Omit<PartnerAuthResponse, "token">;

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
    tokenSigner: () => "signed-token",
    smsService: {
      sendCode: async () => ({ success: true as const, cooldown_seconds: 60 }),
    },
    ...overrides,
  });
}

describe("PlatformPartnerPortalService", () => {
  test("login returns token for active bound partner member", async () => {
    const service = await createService();

    const result = await service.login({
      code: "wx-code",
      request: {} as never,
    });

    expect(result).toEqual({ token: "signed-token", ...expectedAuthContext });
  });

  test("login rejects WeChat auth user without bound partner member", async () => {
    const service = await createService({
      repository: createRepository({
        findMemberByAuthUserId: async () => null,
      }),
    });

    await expect(service.login({ code: "wx-code", request: {} as never }))
      .rejects.toMatchObject({
        statusCode: 401,
        code: "PARTNER_WECHAT_NOT_BOUND",
      });
  });

  test("login rejects disabled bound partner member", async () => {
    const service = await createService({
      repository: createRepository({
        findMemberByAuthUserId: async () => ({
          ...activeMember,
          status: "disabled",
        }),
      }),
    });

    await expect(service.login({ code: "wx-code", request: {} as never }))
      .rejects.toMatchObject({
        statusCode: 403,
        code: "PARTNER_ACCOUNT_DISABLED",
      });
  });

  test("login signs token only after ensuring oauth identity", async () => {
    const calls: string[] = [];
    const service = await createService({
      oauthIdentityEnsurer: async () => {
        calls.push("ensure-oauth");
      },
      tokenSigner: () => {
        calls.push("sign-token");
        return "signed-token";
      },
    });

    await service.login({ code: "wx-code", request: {} as never });

    expect(calls).toEqual(["ensure-oauth", "sign-token"]);
  });

  test("login signs platform partner scoped token", async () => {
    let signedPayload: unknown = null;
    const service = await createService({
      tokenSigner: (payload) => {
        signedPayload = payload;
        return "signed-token";
      },
    });

    await service.login({ code: "wx-code", request: {} as never });

    expect(signedPayload).toMatchObject({
      token_type: "platform_partner",
      roles: ["platform_partner"],
      partner_id: activePartner.id,
    });
  });

  test("login uses active member when old disabled history exists", async () => {
    const service = await createService({
      repository: createRepository({
        findMemberByAuthUserId: async () => activeMember,
      }),
    });

    const result = await service.login({ code: "wx-code", request: {} as never });

    expect(result.partner.id).toBe(activePartner.id);
  });

  test("bindPhone rejects invalid SMS code", async () => {
    await withPhoneLoginWithoutCodeFlag(undefined, async () => {
      const service = await createService({
        repository: createRepository({
          claimMemberBinding: async () => ({ status: "sms_invalid" }),
        }),
      });

      await expect(service.bindPhone({
        code: "wx-code",
        phone: "13800138000",
        sms_code: "123456",
        request: {} as never,
      })).rejects.toMatchObject({
        statusCode: 401,
        code: "SMS_CODE_INVALID",
      });
    });
  });

  test("bindPhone rejects member bound to another auth user", async () => {
    await withPhoneLoginWithoutCodeFlag(undefined, async () => {
      const service = await createService({
        repository: createRepository({
          claimMemberBinding: async () => ({ status: "member_already_bound" }),
        }),
      });

      await expect(service.bindPhone({
        code: "wx-code",
        phone: "13800138000",
        sms_code: "123456",
        request: {} as never,
      })).rejects.toMatchObject({
        statusCode: 409,
        code: "PARTNER_MEMBER_ALREADY_BOUND",
      });
    });
  });

  test("bindPhone rejects unavailable partner before treating binding as successful", async () => {
    await withPhoneLoginWithoutCodeFlag(undefined, async () => {
      let findMemberByIdCalls = 0;
      const service = await createService({
        repository: createRepository({
          claimMemberBinding: async () => ({ status: "partner_unavailable" }),
          findMemberById: async () => {
            findMemberByIdCalls += 1;
            return activeMember;
          },
        }),
      });

      await expect(service.bindPhone({
        code: "wx-code",
        phone: "13800138000",
        sms_code: "123456",
        request: {} as never,
      })).rejects.toMatchObject({
        statusCode: 403,
        code: "PARTNER_ACCOUNT_DISABLED",
      });
      expect(findMemberByIdCalls).toBe(0);
    });
  });

  test("me rejects platform partner token without partner_id", async () => {
    const service = await createService();

    await expect(service.me({
      sub: "00000000-0000-4000-8000-000000000401",
      token_type: "platform_partner",
      roles: ["platform_partner"],
    })).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  test("me rejects non-platform-partner token even when partner claims are present", async () => {
    const service = await createService();

    await expect(service.me({
      sub: activeMember.auth_user_id!,
      token_type: "auth",
      roles: ["platform_partner"],
      partner_id: activePartner.id,
    })).rejects.toMatchObject({
      statusCode: 403,
      code: "PARTNER_AUTH_REQUIRED",
    });
  });

  test("me returns member, partner, and level context", async () => {
    const service = await createService();

    const result = await service.me(partnerUser);

    expect(result).toEqual(expectedAuthContext);
  });

  test("me rejects disabled bound member", async () => {
    const service = await createService({
      repository: createRepository({
        findMemberByAuthUserId: async () => ({
          ...activeMember,
          status: "disabled",
        }),
      }),
    });

    await expect(service.me({
      sub: activeMember.auth_user_id!,
      token_type: "platform_partner",
      roles: ["platform_partner"],
      partner_id: activePartner.id,
    })).rejects.toMatchObject({
      statusCode: 403,
      code: "PARTNER_ACCOUNT_DISABLED",
    });
  });

  test("me rejects token partner mismatch with bound member", async () => {
    const service = await createService();

    await expect(service.me({
      sub: activeMember.auth_user_id!,
      token_type: "platform_partner",
      roles: ["platform_partner"],
      partner_id: "00000000-0000-4000-8000-000000000999",
    })).rejects.toMatchObject({
      statusCode: 403,
      code: "PARTNER_AUTH_REQUIRED",
    });
  });

  test("listTenants scopes query to token partner and forwards pagination", async () => {
    let receivedInput: unknown = null;
    const service = await createService({
      repository: createRepository({
        listTenantBindings: async (input) => {
          receivedInput = input;
          return {
            list: [],
            pagination: { page: input.page, pageSize: input.pageSize, total: 0, totalPages: 0 },
          };
        },
      }),
    });

    await service.listTenants(
      {
        sub: activeMember.auth_user_id!,
        token_type: "platform_partner",
        roles: ["platform_partner"],
        partner_id: activePartner.id,
      },
      { page: 2, pageSize: 30, status: "active" },
    );

    expect(receivedInput).toEqual({
      partnerId: activePartner.id,
      page: 2,
      pageSize: 30,
      status: "active",
    });
  });

  test("dashboard methods reject platform partner tokens without partner_id", async () => {
    const service = await createService();
    const calls = [
      () => service.summary(userWithoutPartner, {}),
      () => service.listInviteCodes(userWithoutPartner),
      () => service.listTenants(userWithoutPartner, { page: 1, pageSize: 20 }),
      () => service.listRevenueEvents(userWithoutPartner, { page: 1, pageSize: 20 }),
      () => service.listCommissionLedger(userWithoutPartner, { page: 1, pageSize: 20 }),
      () => service.listSettlements(userWithoutPartner, { page: 1, pageSize: 20 }),
    ];

    for (const call of calls) {
      await expect(call()).rejects.toMatchObject({
        statusCode: 403,
        code: "PARTNER_AUTH_REQUIRED",
      });
    }
  });

  test("dashboard methods reject non-platform-partner tokens even with partner claims", async () => {
    const service = await createService();
    const nonPartnerTokenUser = {
      sub: activeMember.auth_user_id!,
      token_type: "auth" as const,
      roles: ["platform_partner"],
      partner_id: activePartner.id,
    };
    const calls = [
      () => service.summary(nonPartnerTokenUser, {}),
      () => service.listInviteCodes(nonPartnerTokenUser),
      () => service.listTenants(nonPartnerTokenUser, { page: 1, pageSize: 20 }),
      () => service.listRevenueEvents(nonPartnerTokenUser, { page: 1, pageSize: 20 }),
      () => service.listCommissionLedger(nonPartnerTokenUser, { page: 1, pageSize: 20 }),
      () => service.listSettlements(nonPartnerTokenUser, { page: 1, pageSize: 20 }),
    ];

    for (const call of calls) {
      await expect(call()).rejects.toMatchObject({
        statusCode: 403,
        code: "PARTNER_AUTH_REQUIRED",
      });
    }
  });

  test("dashboard methods always scope repository calls to token partner", async () => {
    const received: Array<[string, string | undefined]> = [];
    const service = await createService({
      repository: createRepository({
        getMonthlySummary: async (input) => {
          received.push(["summary", input.partnerId]);
          return emptySummary();
        },
        listInviteCodes: async (partnerId) => {
          received.push(["inviteCodes", partnerId]);
          return [];
        },
        listTenantBindings: async (input) => {
          received.push(["tenants", input.partnerId]);
          return emptyPage(input.page, input.pageSize);
        },
        listRevenueEvents: async (input) => {
          received.push(["revenueEvents", input.partnerId]);
          return emptyPage(input.page, input.pageSize);
        },
        listCommissionLedgers: async (input) => {
          received.push(["commissionLedger", input.partnerId]);
          return emptyPage(input.page, input.pageSize);
        },
        listSettlementBatches: async (input) => {
          received.push(["settlements", input.partnerId]);
          return emptyPage(input.page, input.pageSize);
        },
      }),
    });
    const maliciousQuery = { page: 1, pageSize: 20, partnerId: otherPartnerId } as unknown as { page: number; pageSize: number };

    await service.summary(partnerUser, {});
    await service.listInviteCodes(partnerUser);
    await service.listTenants(partnerUser, maliciousQuery);
    await service.listRevenueEvents(partnerUser, maliciousQuery);
    await service.listCommissionLedger(partnerUser, maliciousQuery);
    await service.listSettlements(partnerUser, maliciousQuery);

    expect(received).toEqual([
      ["summary", activePartner.id],
      ["inviteCodes", activePartner.id],
      ["tenants", activePartner.id],
      ["revenueEvents", activePartner.id],
      ["commissionLedger", activePartner.id],
      ["settlements", activePartner.id],
    ]);
  });

  test("listRevenueEvents converts month into timestamp range for repository", async () => {
    let receivedInput: unknown = null;
    const service = await createService({
      repository: createRepository({
        listRevenueEvents: async (input) => {
          receivedInput = input;
          return emptyPage(input.page, input.pageSize);
        },
      }),
    });

    await service.listRevenueEvents(partnerUser, {
      page: 3,
      pageSize: 40,
      month: "2026-11",
      status: "confirmed",
    });

    expect(receivedInput).toEqual({
      partnerId: activePartner.id,
      page: 3,
      pageSize: 40,
      status: "confirmed",
      revenue_type: undefined,
      startDate: "2026-11-01T00:00:00.000Z",
      endDate: "2026-12-01T00:00:00.000Z",
    });
    expect(receivedInput).not.toHaveProperty("month");
  });

  test("summary converts month into an inclusive-exclusive range", async () => {
    let receivedInput: unknown = null;
    const service = await createService({
      repository: createRepository({
        getMonthlySummary: async (input) => {
          receivedInput = input;
          return emptySummary();
        },
      }),
    });

    await service.summary(partnerUser, { month: "2026-02" });

    expect(receivedInput).toEqual({
      partnerId: activePartner.id,
      month: "2026-02",
      startDate: "2026-02-01T00:00:00.000Z",
      endDate: "2026-03-01T00:00:00.000Z",
    });
  });
});
