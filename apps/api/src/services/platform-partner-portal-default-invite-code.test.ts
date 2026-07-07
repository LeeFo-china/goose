import { describe, expect, test } from "bun:test";
import type {
  PlatformPartnerInviteCodeCreateRecordInput,
  PlatformPartnerInviteCodeRecord,
} from "@/repositories/platform-partners";
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
  roles: ["platform_partner"],
  partner_id: activePartner.id,
};

const defaultInviteCode = {
  id: "00000000-0000-4000-8000-000000000501",
  partner_id: activePartner.id,
  code: "CP-411500-000000000201",
  region_code: "411500",
  campaign_code: "PIC-411500-000000000201",
  status: "active",
  scan_count: 0,
  submitted_count: 0,
  approved_count: 0,
  expires_at: null,
  created_by_employee_id: null,
  created_at: "2026-07-07T00:00:00.000Z",
  updated_at: "2026-07-07T00:00:00.000Z",
} satisfies PlatformPartnerInviteCodeRecord;

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
    unbindMemberAuthUser: async () => ({ status: "unbound", memberId: activeMember.id }),
    findPartnerById: async () => activePartner,
    listInviteCodes: async () => [],
    createInviteCode: async () => defaultInviteCode,
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

function emptyPage() {
  return {
    list: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  };
}

async function createService(
  overrides: Partial<ConstructorParameters<
    typeof import("@/services/platform-partner-portal").PlatformPartnerPortalService
  >[0]> = {},
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
    inviteCodeQrcodeGenerator: async () => ({
      buffer: Buffer.from("qr"),
      contentType: "image/png",
    }),
    ...overrides,
  });
}

describe("PlatformPartnerPortalService default invite code", () => {
  test("creates a default invite code and returns QR image when none is available", async () => {
    let createdInput: PlatformPartnerInviteCodeCreateRecordInput | null = null;
    const service = await createService({
      repository: createRepository({
        listInviteCodes: async () => [],
        createInviteCode: async (input) => {
          createdInput = input;
          return defaultInviteCode;
        },
      }),
    });

    const result = await service.getDefaultInviteCode(partnerUser);

    expect(createdInput).toMatchObject({
      partner_id: activePartner.id,
      code: defaultInviteCode.code,
      region_code: "411500",
      campaign_code: defaultInviteCode.campaign_code,
      expires_at: null,
      created_by_employee_id: null,
    });
    expect(result).toEqual({
      invite_code: defaultInviteCode.code,
      status: "active",
      region_code: "411500",
      expires_at: null,
      qr_code_content_type: "image/png",
      qr_code_image_base64: "data:image/png;base64,cXI=",
    });
  });

  test("reuses an existing available invite code without creating duplicates", async () => {
    let createCalls = 0;
    let qrcodeScene = "";
    const service = await createService({
      repository: createRepository({
        listInviteCodes: async () => [defaultInviteCode],
        createInviteCode: async () => {
          createCalls += 1;
          return defaultInviteCode;
        },
      }),
      inviteCodeQrcodeGenerator: async (input) => {
        qrcodeScene = input.scene;
        return { buffer: Buffer.from("qr"), contentType: "image/png" };
      },
    });

    const result = await service.getDefaultInviteCode(partnerUser);

    expect(createCalls).toBe(0);
    expect(qrcodeScene).toBe(defaultInviteCode.code);
    expect(result.invite_code).toBe(defaultInviteCode.code);
  });

  test("rejects platform partner tokens without partner_id", async () => {
    const service = await createService();

    await expect(service.getDefaultInviteCode({
      sub: activeMember.auth_user_id!,
      token_type: "platform_partner",
      roles: ["platform_partner"],
    })).rejects.toMatchObject({
      statusCode: 403,
      code: "PARTNER_AUTH_REQUIRED",
    });
  });
});
