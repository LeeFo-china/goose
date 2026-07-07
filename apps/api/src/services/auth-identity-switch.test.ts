import { describe, expect, test } from "bun:test";
import type { JwtPayload } from "@/utils/jwt";
import type {
  AuthIdentityOptionsRepositoryPort,
  AuthIdentityPartnerMemberRecord,
} from "@/repositories/auth-identity-options";
import type { PlatformPartnerRecord } from "@/repositories/platform-partner-portal";
import type { SwitchIdentityInput } from "@/schema/auth-identity-switch";
import type { AuthIdentitySwitchServiceDependencies } from "@/services/auth-identity-switch";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const authUserId = "00000000-0000-4000-8000-000000000001";
const tenantId = "00000000-0000-4000-8000-000000000002";
const employeeId = "00000000-0000-4000-8000-000000000003";
const customerId = "00000000-0000-4000-8000-000000000004";
const partnerId = "00000000-0000-4000-8000-000000000005";
const partnerMemberId = "00000000-0000-4000-8000-000000000006";
const partnerLevelId = "00000000-0000-4000-8000-000000000007";

const user = {
  sub: authUserId,
  token_type: "auth",
  login_channel: "wechat",
  openid: "wx-openid",
  unionid: "wx-unionid",
  roles: ["employee"],
  tenant_id: tenantId,
  employee_id: employeeId,
} satisfies JwtPayload;

const activePartner = {
  id: partnerId,
  name: "信阳城市合伙人",
  status: "active",
  region_codes: ["411500"],
  level: {
    id: partnerLevelId,
    code: "city",
    name: "城市合伙人",
    status: "active",
  },
} satisfies PlatformPartnerRecord;

const activePartnerMember: AuthIdentityPartnerMemberRecord = {
  id: partnerMemberId,
  partner_id: partnerId,
  auth_user_id: authUserId,
  name: "张三",
  phone: "13800138000",
  role: "owner",
  status: "active",
  partner: activePartner,
};

const activeMemberships = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    user_id: authUserId,
    tenant_id: tenantId,
    identity_type: "employee",
    identity_id: employeeId,
    status: "active",
    is_default: true,
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    user_id: authUserId,
    tenant_id: tenantId,
    identity_type: "customer",
    identity_id: customerId,
    status: "active",
    is_default: false,
  },
] as const;

const activeEmployee = {
  id: employeeId,
  tenant_id: tenantId,
  user_id: authUserId,
  name: "李员工",
  phone: "13900139000",
  status: "active",
  tenant_department_id: "00000000-0000-4000-8000-000000000008",
  post_id: "00000000-0000-4000-8000-000000000009",
  avatar: null,
  tenant: {
    id: tenantId,
    name: "示例装企",
    slug: "demo-tenant",
    status: "active",
  },
  tenant_department: {
    id: "00000000-0000-4000-8000-000000000008",
    alias_name: "销售部",
    code: "sales",
  },
  post: {
    id: "00000000-0000-4000-8000-000000000009",
    name: "销售顾问",
    code: "consultant",
  },
} as const;

const activeCustomer = {
  id: customerId,
  tenant_id: tenantId,
  user_id: authUserId,
  name: "王客户",
  phone: "13700137000",
  status: "active",
  customer_origin: "manual",
  claimed_at: "2026-01-01T00:00:00.000Z",
  tenant: {
    id: tenantId,
    name: "示例装企",
    slug: "demo-tenant",
    status: "active",
  },
} as const;

function createRepository(
  overrides: Partial<AuthIdentityOptionsRepositoryPort> = {},
): AuthIdentityOptionsRepositoryPort {
  return {
    listPartnerMembersByAuthUserId: async () => [activePartnerMember],
    listBusinessMemberships: async () => [...activeMemberships],
    listEmployeesByIds: async () => [activeEmployee],
    listCustomersByIds: async () => [activeCustomer],
    ...overrides,
  };
}

async function createService(
  overrides: {
    repository?: AuthIdentityOptionsRepositoryPort;
    tokenSigner?: AuthIdentitySwitchServiceDependencies["tokenSigner"];
    visitorSessionSigner?: AuthIdentitySwitchServiceDependencies["visitorSessionSigner"];
  } = {},
) {
  const { AuthIdentitySwitchService } = await import("@/services/auth-identity-switch");
  return new AuthIdentitySwitchService({
    repository: overrides.repository ?? createRepository(),
    tokenSigner: overrides.tokenSigner ?? (() => "signed-auth-token"),
    visitorSessionSigner: overrides.visitorSessionSigner ?? (() => "signed-visitor-token"),
  });
}

describe("AuthIdentitySwitchService", () => {
  test("lists visitor, partner, employee, and customer identity options", async () => {
    const service = await createService();

    const result = await service.listOptions(user);

    expect(result.current_mode).toBe("tenant_employee");
    expect(result.identities.map((item) => item.mode)).toEqual([
      "platform_visitor",
      "platform_partner",
      "tenant_employee",
      "customer",
    ]);
    expect(result.identities).toContainEqual(
      expect.objectContaining({
        mode: "platform_partner",
        partner_member_id: partnerMemberId,
        partner_id: partnerId,
      }),
    );
    expect(result.identities).toContainEqual(
      expect.objectContaining({
        mode: "tenant_employee",
        tenant_id: tenantId,
        employee_id: employeeId,
      }),
    );
    expect(result.identities).toContainEqual(
      expect.objectContaining({
        mode: "customer",
        tenant_id: tenantId,
        customer_id: customerId,
      }),
    );
  });

  test("does not list employee identities that belong to another auth user", async () => {
    const service = await createService({
      repository: createRepository({
        listEmployeesByIds: async () => [{
          ...activeEmployee,
          user_id: "00000000-0000-4000-8000-000000009999",
        }],
      }),
    });

    const result = await service.listOptions(user);

    expect(result.identities.some((item) =>
      item.mode === "tenant_employee" && item.employee_id === employeeId
    )).toBe(false);
  });

  test("switching to platform visitor returns visitor auth response", async () => {
    const service = await createService({
      visitorSessionSigner: (input: Parameters<NonNullable<AuthIdentitySwitchServiceDependencies["visitorSessionSigner"]>>[0]) => {
        expect(input).toMatchObject({
          openid: "wx-openid",
          unionid: "wx-unionid",
        });
        return "visitor-token";
      },
    });

    const result = await service.switchIdentity(user, {
      target_mode: "platform_visitor",
    });

    expect(result).toMatchObject({
      mode: "platform_visitor",
      authMode: "platform_visitor",
      token: "visitor-token",
      user_id: null,
      roles: ["visitor"],
      is_new_user: false,
    });
    expect(result).toHaveProperty("visitor_id");
    expect((result as { visitor_id: string }).visitor_id).toStartWith("wechat_visitor_");
  });

  test("switching to platform partner returns partner auth and signs platform partner token", async () => {
    let signedPayload: unknown = null;
    const service = await createService({
      tokenSigner: (payload: Parameters<NonNullable<AuthIdentitySwitchServiceDependencies["tokenSigner"]>>[0]) => {
        signedPayload = payload;
        return "partner-token";
      },
    });

    const result = await service.switchIdentity(user, {
      target_mode: "platform_partner",
      partner_member_id: partnerMemberId,
    });

    expect(result).toMatchObject({
      mode: "platform_partner",
      authMode: "platform_partner",
      token: "partner-token",
      user_id: authUserId,
      roles: ["platform_partner"],
      member: {
        id: partnerMemberId,
        partner_id: partnerId,
      },
      partner: {
        id: partnerId,
        name: "信阳城市合伙人",
      },
      level: {
        id: partnerLevelId,
        code: "city",
      },
    });
    expect(signedPayload).toMatchObject({
      sub: authUserId,
      token_type: "platform_partner",
      login_channel: "wechat",
      roles: ["platform_partner"],
      partner_id: partnerId,
      openid: "wx-openid",
      unionid: "wx-unionid",
    });
  });

  test("switching to unavailable partner member rejects with option not found", async () => {
    const service = await createService();

    await expect(service.switchIdentity(user, {
      target_mode: "platform_partner",
      partner_member_id: "00000000-0000-4000-8000-000000000099",
    })).rejects.toMatchObject({
      statusCode: 404,
      code: "IDENTITY_OPTION_NOT_FOUND",
    });
  });

  test("rejects incomplete switch payload before option lookup", async () => {
    const calls: string[] = [];
    const service = await createService({
      repository: createRepository({
        listPartnerMembersByAuthUserId: async () => {
          calls.push("partners");
          return [activePartnerMember];
        },
      }),
    });

    await expect(service.switchIdentity(user, {
      target_mode: "platform_partner",
    } as SwitchIdentityInput)).rejects.toMatchObject({
      statusCode: 400,
      code: "IDENTITY_SWITCH_NOT_ALLOWED",
    });
    expect(calls).toEqual([]);
  });
});
