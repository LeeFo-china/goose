import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PlatformPartnerPortalService as PlatformPartnerPortalServiceClass } from "@/services/platform-partner-portal";
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
  return {
    findMemberByAuthUserId: async () => activeMember,
    findMemberById: async () => activeMember,
    findBindableMemberByPhone: async () => activeMember,
    claimMemberBinding: async () => ({
      status: "bound",
      memberId: activeMember.id,
    }),
    bindMemberAuthUser: async () => activeMember,
    findPartnerById: async () => activePartner,
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
    wechatSessionResolver: async () => ({
      openid: "wx-openid",
      unionid: "wx-unionid",
    }),
    authUserResolver: async () => ({
      userId: "00000000-0000-4000-8000-000000000401",
      isNewUser: false,
    }),
    oauthIdentityEnsurer: async () => undefined,
    tokenSigner: () => "signed-token",
    smsService: {
      sendCode: async () => undefined,
    },
    ...overrides,
  });
}

describe("platform partner portal migration", () => {
  test("creates partner members table and indexes", () => {
    const migrationsDir = join(import.meta.dir, "../../../../supabase/migrations");
    const migrationName = readdirSync(migrationsDir)
      .find((name) => name.endsWith("_create_platform_partner_members.sql"));

    expect(migrationName).toBeTruthy();
    const migrationPath = join(migrationsDir, migrationName!);
    expect(existsSync(migrationPath)).toBe(true);

    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.platform_partner_members");
    expect(sql).toContain("partner_id uuid NOT NULL REFERENCES public.platform_partners(id)");
    expect(sql).toContain("auth_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL");
    expect(sql).toContain("DROP CONSTRAINT IF EXISTS sms_verification_codes_scene_check");
    expect(sql).toContain("'bind_customer'::text");
    expect(sql).toContain("'bind_employee'::text");
    expect(sql).toContain("'admin_login'::text");
    expect(sql).toContain("'rebind_wechat'::text");
    expect(sql).toContain("'bind_platform_partner'::text");
    expect(sql).toContain("tr_platform_partner_members_updated_at");
    expect(sql).toContain("platform_partner_members_partner_phone_idx");
    expect(sql).toContain("platform_partner_members_auth_user_status_idx");
    expect(sql).toContain("platform_partner_members_partner_status_idx");
  });

  test("creates atomic partner member binding RPC and uniqueness indexes", () => {
    const migrationsDir = join(import.meta.dir, "../../../../supabase/migrations");
    const migrationPath = join(
      migrationsDir,
      "20260705191000_create_platform_partner_member_binding_rpc.sql",
    );

    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("claim_platform_partner_member_binding");
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).toContain("platform_partner_members_auth_user_active_unique_idx");
    expect(sql).toContain("platform_partner_members_phone_active_unique_idx");
    expect(sql).toContain("sms_invalid");
    expect(sql).toContain("member_already_bound");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.claim_platform_partner_member_binding");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.claim_platform_partner_member_binding");
    expect(sql).toContain("TO service_role");
    expect(sql).not.toContain("p_now");
  });
});

describe("PlatformPartnerPortalService", () => {
  test("login returns token for active bound partner member", async () => {
    const service = await createService();

    const result = await service.login({
      code: "wx-code",
      request: {} as never,
    });

    expect(result).toEqual({
      token: "signed-token",
      user_id: activeMember.auth_user_id,
      roles: ["platform_partner"],
      authMode: "platform_partner",
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
        level: {
          code: "city",
          name: "城市合伙人",
        },
      },
      level: {
        id: activePartner.level.id,
        code: "city",
        name: "城市合伙人",
        status: "active",
      },
    });
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

  test("bindPhone rejects member bound to another auth user", async () => {
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

  test("me rejects platform partner token without partner_id", async () => {
    const service = await createService();

    await expect(service.me({
      sub: "00000000-0000-4000-8000-000000000401",
      roles: ["platform_partner"],
    })).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  test("me returns member, partner, and level context", async () => {
    const service = await createService();

    const result = await service.me({
      sub: activeMember.auth_user_id!,
      roles: ["platform_partner"],
      partner_id: activePartner.id,
    });

    expect(result).toEqual({
      user_id: activeMember.auth_user_id,
      roles: ["platform_partner"],
      authMode: "platform_partner",
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
        level: {
          code: "city",
          name: "城市合伙人",
        },
      },
      level: {
        id: activePartner.level.id,
        code: "city",
        name: "城市合伙人",
        status: "active",
      },
    });
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
      roles: ["platform_partner"],
      partner_id: "00000000-0000-4000-8000-000000000999",
    })).rejects.toMatchObject({
      statusCode: 403,
      code: "PARTNER_AUTH_REQUIRED",
    });
  });
});
