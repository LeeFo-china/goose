import { describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const repositoryModule = import("./phone-identity-candidates");

type QueryCall = {
  method: string;
  args: unknown[];
};

function createQuery(data: unknown[] = []) {
  const calls: QueryCall[] = [];
  const query = {
    calls,
    select: mock((...args: unknown[]) => {
      calls.push({ method: "select", args });
      return query;
    }),
    eq: mock((...args: unknown[]) => {
      calls.push({ method: "eq", args });
      return query;
    }),
    in: mock((...args: unknown[]) => {
      calls.push({ method: "in", args });
      return query;
    }),
    order: mock((...args: unknown[]) => {
      calls.push({ method: "order", args });
      return query;
    }),
    range: mock((...args: unknown[]) => {
      calls.push({ method: "range", args });
      return query;
    }),
    then: (
      resolve: (value: { data: unknown[]; error: unknown }) => unknown,
      _reject?: (reason?: unknown) => unknown,
    ) => Promise.resolve(resolve({ data, error: null })),
  };
  return query;
}

function createClient(query: ReturnType<typeof createQuery>) {
  const from = mock((_table: string) => query);
  return { from };
}

describe("PhoneIdentityCandidateRepository", () => {
  test("lists customer candidates by phone with selected fields and an upper bound", async () => {
    const { PhoneIdentityCandidateRepository } = await repositoryModule;
    const query = createQuery();
    const client = createClient(query);
    const repository = new PhoneIdentityCandidateRepository(client);

    await repository.listCustomersByPhone("13800138000");

    expect(client.from).toHaveBeenCalledWith("customers");
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining("tenant:tenants"));
    expect(query.eq).toHaveBeenCalledWith("phone", "13800138000");
    expect(query.order).toHaveBeenCalledWith("tenant_id", { ascending: true });
    expect(query.order).toHaveBeenCalledWith("id", { ascending: true });
    expect(query.range).toHaveBeenCalledWith(0, 100);
  });

  test("lists employee candidates by phone with department and post fields", async () => {
    const { PhoneIdentityCandidateRepository } = await repositoryModule;
    const query = createQuery();
    const client = createClient(query);
    const repository = new PhoneIdentityCandidateRepository(client);

    await repository.listEmployeesByPhone("13800138000");

    expect(client.from).toHaveBeenCalledWith("employees");
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining("tenant_department"));
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining("post:posts"));
    expect(query.eq).toHaveBeenCalledWith("phone", "13800138000");
    expect(query.order).toHaveBeenCalledWith("tenant_id", { ascending: true });
    expect(query.order).toHaveBeenCalledWith("id", { ascending: true });
    expect(query.range).toHaveBeenCalledWith(0, 100);
  });

  test("lists partner members by phone using the bounded uniqueness window", async () => {
    const { PhoneIdentityCandidateRepository } = await repositoryModule;
    const query = createQuery();
    const client = createClient(query);
    const repository = new PhoneIdentityCandidateRepository(client);

    await repository.listPartnerMembersByPhone("13800138000");

    expect(client.from).toHaveBeenCalledWith("platform_partner_members");
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining("partner:platform_partners"));
    expect(query.eq).toHaveBeenCalledWith("phone", "13800138000");
    expect(query.range).toHaveBeenCalledWith(0, 1);
  });

  test("builds active membership keys for the current auth user", async () => {
    const { PhoneIdentityCandidateRepository } = await repositoryModule;
    const query = createQuery([
      {
        identity_type: "customer",
        tenant_id: "tenant-1",
        identity_id: "customer-1",
      },
      {
        identity_type: "employee",
        tenant_id: null,
        identity_id: "employee-1",
      },
    ]);
    const client = createClient(query);
    const repository = new PhoneIdentityCandidateRepository(client);

    const keys = await repository.listActiveMembershipKeys("auth-user-1");

    expect(client.from).toHaveBeenCalledWith("user_business_memberships");
    expect(query.eq).toHaveBeenCalledWith("user_id", "auth-user-1");
    expect(query.eq).toHaveBeenCalledWith("status", "active");
    expect(query.in).toHaveBeenCalledWith("identity_type", ["customer", "employee"]);
    expect(keys).toEqual(new Set([
      "customer:tenant-1:customer-1",
      "employee::employee-1",
    ]));
  });

  test("returns active WeChat OAuth user IDs without querying empty input", async () => {
    const { PhoneIdentityCandidateRepository } = await repositoryModule;
    const emptyQuery = createQuery();
    const emptyClient = createClient(emptyQuery);
    const emptyRepository = new PhoneIdentityCandidateRepository(emptyClient);
    await expect(emptyRepository.listActiveWechatOauthUserIds([]))
      .resolves.toEqual(new Set());
    expect(emptyClient.from).not.toHaveBeenCalled();

    const query = createQuery([
      { user_id: "user-1" },
      { user_id: "user-2" },
    ]);
    const client = createClient(query);
    const repository = new PhoneIdentityCandidateRepository(client);
    const ids = await repository.listActiveWechatOauthUserIds(["user-1", "user-1", "user-2"]);

    expect(client.from).toHaveBeenCalledWith("user_oauth_identities");
    expect(query.select).toHaveBeenCalledWith("user_id");
    expect(query.in).toHaveBeenCalledWith("user_id", ["user-1", "user-2"]);
    expect(query.eq).toHaveBeenCalledWith("platform", "wechat_mini");
    expect(query.eq).toHaveBeenCalledWith("status", "active");
    expect(query.range).toHaveBeenCalledWith(0, 1);
    expect(ids).toEqual(new Set(["user-1", "user-2"]));
  });
});
