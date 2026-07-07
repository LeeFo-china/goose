import { describe, expect, test } from "bun:test";
import type { PlatformPartnerPortalService as PlatformPartnerPortalServiceClass } from "@/services/platform-partner-portal";
import { createTestPartnerInviteCode } from "@/services/platform-partner-portal-test-helpers";
import type {
  PageResult,
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
  roles: ["platform_partner"],
  partner_id: activePartner.id,
};

const suspendedPartner = {
  ...activePartner,
  status: "suspended",
} satisfies PlatformPartnerRecord;

const otherPartner = {
  ...activePartner,
  id: "00000000-0000-4000-8000-000000000999",
} satisfies PlatformPartnerRecord;

const emptyPage = <T>(page = 1, pageSize = 20): PageResult<T> => ({
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

async function createService(member: PlatformPartnerMemberRecord) {
  const { PlatformPartnerPortalService } = await import(
    "@/services/platform-partner-portal"
  );
  let readCalls = 0;
  const repository: PlatformPartnerPortalRepositoryPort = {
    findMemberByAuthUserId: async () => member,
    findMemberById: async () => member,
    findBindableMemberByPhone: async () => member,
    claimMemberBinding: async () => ({ status: "bound", memberId: member.id }),
    claimMemberUnbind: async () => ({ status: "unbound", memberId: member.id }),
    bindMemberAuthUser: async () => member,
    unbindMemberAuthUser: async () => ({ status: "unbound", memberId: member.id }),
    findPartnerById: async () => member.partner ?? null,
    listInviteCodes: async () => {
      readCalls += 1;
      return [];
    },
    createInviteCode: async (input) => createTestPartnerInviteCode(input),
    listTenantBindings: async (input) => {
      readCalls += 1;
      return emptyPage(input.page, input.pageSize);
    },
    listRevenueEvents: async (input) => {
      readCalls += 1;
      return emptyPage(input.page, input.pageSize);
    },
    listCommissionLedgers: async (input) => {
      readCalls += 1;
      return emptyPage(input.page, input.pageSize);
    },
    listSettlementBatches: async (input) => {
      readCalls += 1;
      return emptyPage(input.page, input.pageSize);
    },
    getMonthlySummary: async () => {
      readCalls += 1;
      return emptySummary();
    },
  };

  return {
    service: new PlatformPartnerPortalService({
      repository,
      wechatSessionResolver: async () => ({ openid: "wx-openid" }),
      authUserResolver: async () => ({
        userId: activeMember.auth_user_id!,
        isNewUser: false,
      }),
      oauthIdentityEnsurer: async () => undefined,
      tokenSigner: () => "signed-token",
      smsService: {
        sendCode: async () => ({ success: true as const, cooldown_seconds: 60 }),
      },
    }),
    getReadCalls: () => readCalls,
  };
}

function portalReadCalls(service: PlatformPartnerPortalServiceClass) {
  return [
    () => service.summary(partnerUser, {}),
    () => service.listInviteCodes(partnerUser),
    () => service.listTenants(partnerUser, { page: 1, pageSize: 20 }),
    () => service.listRevenueEvents(partnerUser, { page: 1, pageSize: 20 }),
    () => service.listCommissionLedger(partnerUser, { page: 1, pageSize: 20 }),
    () => service.listSettlements(partnerUser, { page: 1, pageSize: 20 }),
  ];
}

describe("PlatformPartnerPortalService dashboard authorization", () => {
  test("rejects stale tokens after the bound member is disabled", async () => {
    const { service, getReadCalls } = await createService({
      ...activeMember,
      status: "disabled",
    });

    for (const call of portalReadCalls(service)) {
      await expect(call()).rejects.toMatchObject({
        statusCode: 403,
        code: "PARTNER_ACCOUNT_DISABLED",
      });
    }
    expect(getReadCalls()).toBe(0);
  });

  test("rejects stale tokens after the partner is suspended", async () => {
    const { service, getReadCalls } = await createService({
      ...activeMember,
      partner: suspendedPartner,
    });

    for (const call of portalReadCalls(service)) {
      await expect(call()).rejects.toMatchObject({
        statusCode: 403,
        code: "PARTNER_ACCOUNT_DISABLED",
      });
    }
    expect(getReadCalls()).toBe(0);
  });

  test("rejects tokens whose partner no longer matches the bound member", async () => {
    const { service, getReadCalls } = await createService({
      ...activeMember,
      partner_id: otherPartner.id,
      partner: otherPartner,
    });

    for (const call of portalReadCalls(service)) {
      await expect(call()).rejects.toMatchObject({
        statusCode: 403,
        code: "PARTNER_AUTH_REQUIRED",
      });
    }
    expect(getReadCalls()).toBe(0);
  });
});
