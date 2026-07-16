import { describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const MEMBER_ID = "00000000-0000-4000-8000-000000000301";
const AUTH_USER_ID = "00000000-0000-4000-8000-000000000401";
const OTHER_AUTH_USER_ID = "00000000-0000-4000-8000-000000000999";
let fromHandler: (tableName: string) => unknown = () =>
  createTable({ data: null, error: null }, []);

mock.module("@/utils/supabase/index", () => ({
  SupabaseDB: {
    getAdminClient: () => ({
      from: fromHandler,
    }),
  },
}));

const repositoryModule = import("@/repositories/platform-partner-portal");

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
};

function partnerMember(overrides: Record<string, unknown> = {}) {
  return {
    id: MEMBER_ID,
    partner_id: activePartner.id,
    auth_user_id: null,
    name: "张三",
    phone: "13800138000",
    role: "owner",
    status: "active",
    partner: activePartner,
    ...overrides,
  };
}

function createTable(result: { data: unknown; error: unknown }, calls: unknown[][]) {
  return {
    update(payload: unknown) {
      calls.push(["update", payload]);
      return this;
    },
    select(columns: unknown) {
      calls.push(["select", columns]);
      return this;
    },
    eq(column: string, value: unknown) {
      calls.push(["eq", column, value]);
      return this;
    },
    or(filter: string) {
      calls.push(["or", filter]);
      return this;
    },
    maybeSingle: mock(async () => result),
    single: mock(async () => result),
  };
}

describe("PlatformPartnerPortalRepository.bindMemberAuthUser", () => {
  test("guards partner member binding update by current auth user", async () => {
    const calls: unknown[][] = [];
    const table = createTable({
      data: partnerMember({ auth_user_id: AUTH_USER_ID }),
      error: null,
    }, calls);

    fromHandler = (tableName: string) => {
      calls.push(["from", tableName]);
      return table;
    };

    const { platformPartnerPortalRepository } = await repositoryModule;

    await expect(platformPartnerPortalRepository.bindMemberAuthUser(
      MEMBER_ID,
      AUTH_USER_ID,
    )).resolves.toMatchObject({ auth_user_id: AUTH_USER_ID });

    expect(calls).toContainEqual(["eq", "id", MEMBER_ID]);
    expect(calls).toContainEqual([
      "or",
      `auth_user_id.is.null,auth_user_id.eq.${AUTH_USER_ID}`,
    ]);
  });

  test("maps a conditional update miss to partner member already bound", async () => {
    const calls: unknown[][] = [];
    const tables = [
      createTable({ data: null, error: null }, calls),
      createTable({
        data: partnerMember({ auth_user_id: OTHER_AUTH_USER_ID }),
        error: null,
      }, calls),
    ];

    fromHandler = (tableName: string) => {
      calls.push(["from", tableName]);
      return tables.shift() ?? createTable({
        data: null,
        error: { message: "unexpected table call" },
      }, calls);
    };

    const { platformPartnerPortalRepository } = await repositoryModule;

    await expect(platformPartnerPortalRepository.bindMemberAuthUser(
      MEMBER_ID,
      AUTH_USER_ID,
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "PARTNER_MEMBER_ALREADY_BOUND",
    });
  });
});
