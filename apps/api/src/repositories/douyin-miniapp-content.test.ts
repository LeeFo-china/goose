import { beforeAll, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Repository: typeof import("./douyin-miniapp-content").DouyinMiniappContentRepository;
beforeAll(async () => {
  ({ DouyinMiniappContentRepository: Repository } = await import("./douyin-miniapp-content"));
});

type Call = { method: string; args: unknown[] };
type Result = { data: unknown; error: unknown; count?: number | null };

function clientWith(results: Result[]) {
  const calls: Call[] = [];
  let resultIndex = 0;
  class Query implements PromiseLike<Result> {
    constructor(private readonly result: Result) {}
    private chain(method: string, args: unknown[]) { calls.push({ method, args }); return this; }
    select(...args: unknown[]) { return this.chain("select", args); }
    eq(...args: unknown[]) { return this.chain("eq", args); }
    neq(...args: unknown[]) { return this.chain("neq", args); }
    in(...args: unknown[]) { return this.chain("in", args); }
    or(...args: unknown[]) { return this.chain("or", args); }
    contains(...args: unknown[]) { return this.chain("contains", args); }
    order(...args: unknown[]) { return this.chain("order", args); }
    range(...args: unknown[]) { return this.chain("range", args); }
    limit(...args: unknown[]) { return this.chain("limit", args); }
    maybeSingle() { calls.push({ method: "maybeSingle", args: [] }); return Promise.resolve(this.result); }
    then<TResult1 = Result, TResult2 = never>(
      onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) { return Promise.resolve(this.result).then(onfulfilled, onrejected); }
  }
  const client = { from: mock((table: string) => {
    calls.push({ method: "from", args: [table] });
    return new Query(results[resultIndex++] ?? { data: null, error: null });
  }) };
  return { client, calls };
}

const project = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "现代简约案例",
  status: "constructing",
  budget: 260000,
  start_date: "2026-07-01",
  created_at: "2026-06-01T00:00:00.000Z",
  updated_at: "2026-07-20T00:00:00.000Z",
  style_tags: ["现代"],
  property: { community: "示例花园", layout: "三室两厅", area: 120,
    city: "郑州市", district: "金水区" },
};

describe("DouyinMiniappContentRepository privacy and pagination", () => {
  test("reads installation tenant status without turning suspension into a repository error", async () => {
    const suspendedInstallation = {
      id: "22222222-2222-4222-8222-222222222222",
      tenant_id: "33333333-3333-4333-8333-333333333333",
      authorizer_appid: "tt-authorizer-1",
      authorization_status: "active",
      template_version: "1.0.0",
      runtime_config: {},
      tenant: { id: "33333333-3333-4333-8333-333333333333", status: "suspended" },
    };
    const { client, calls } = clientWith([{ data: suspendedInstallation, error: null }]);
    const repository = new Repository(client as never);

    await expect(repository.findActiveInstallation({
      installationId: suspendedInstallation.id,
      tenantId: suspendedInstallation.tenant_id,
      appId: suspendedInstallation.authorizer_appid,
    })).resolves.toMatchObject({ tenant: { status: "suspended" } });

    const select = String(calls.find((call) => call.method === "select")?.args[0]);
    expect(select).toBe("id,tenant_id,authorizer_appid,authorization_status,template_version,"
      + "runtime_config,tenant:tenants(id,status)");
    expect(select).not.toMatch(/access_token|refresh_token|encrypted/i);
    expect(calls).toContainEqual({ method: "eq", args: ["id", suspendedInstallation.id] });
    expect(calls).toContainEqual({ method: "eq", args: ["tenant_id",
      suspendedInstallation.tenant_id] });
    expect(calls).toContainEqual({ method: "eq", args: ["authorizer_appid",
      suspendedInstallation.authorizer_appid] });
    expect(calls).toContainEqual({ method: "eq", args: ["authorization_status", "active"] });
  });

  test("bounds published company profile and active service-area reads", async () => {
    const company = {
      public_name: "示例装饰", introduction: "公开简介", public_phone: "13912349000",
      address_province: "河南省", address_city: "郑州市", address_district: "金水区",
      address: "公开门店地址", status: "published", published_at: "2026-07-01T00:00:00.000Z",
    };
    const area = { province: "河南省", city: "郑州市", district: "金水区", priority: 10 };
    const { client, calls } = clientWith([
      { data: company, error: null },
      { data: [area], error: null },
    ]);
    const repository = new Repository(client as never);
    const tenantId = "33333333-3333-4333-8333-333333333333";

    await repository.findPublishedCompany(tenantId);
    await repository.listServiceAreas(tenantId);

    expect(calls.filter((call) => call.method === "eq" && call.args[0] === "tenant_id"))
      .toHaveLength(2);
    expect(calls.filter((call) => call.method === "eq"
      && call.args[0] === "tenant_id" && call.args[1] === tenantId)).toHaveLength(2);
    expect(calls).toContainEqual({ method: "eq", args: ["status", "published"] });
    expect(calls).toContainEqual({ method: "eq", args: ["status", "active"] });
    expect(calls).toContainEqual({ method: "limit", args: [50] });
    const selects = calls.filter((call) => call.method === "select")
      .map((call) => String(call.args[0]));
    expect(selects[0]).toBe("public_name,introduction,public_phone,address_province,"
      + "address_city,address_district,address,status,published_at");
    expect(selects[1]).toBe("province,city,district,priority");
  });

  test("lists tenant-scoped public cases with exact filters and a bounded range", async () => {
    const { client, calls } = clientWith([{ data: [project], error: null, count: 21 }]);
    const repository = new Repository(client as never);

    const result = await repository.listCases({
      tenantId: "33333333-3333-4333-8333-333333333333",
      page: 2, pageSize: 20, style: "现代", layout: "三室两厅",
    });

    expect(result.total).toBe(21);
    const select = String(calls.find((call) => call.method === "select")?.args[0]);
    expect(select).toContain("property:properties!inner");
    expect(select).not.toMatch(/customer|customer_id|phone|wx_openid|signed_amount|\baddress\b|building_info|latitude|longitude|content/i);
    expect(calls).toContainEqual({ method: "eq", args: ["tenant_id",
      "33333333-3333-4333-8333-333333333333"] });
    expect(calls).toContainEqual({ method: "neq", args: ["visibility_status", "hidden"] });
    expect(calls).toContainEqual({ method: "contains", args: ["style_tags", ["现代"]] });
    expect(calls).toContainEqual({ method: "eq", args: ["property.layout", "三室两厅"] });
    expect(calls).toContainEqual({ method: "range", args: [20, 39] });
  });

  test("uses active construction statuses for sites and tenant/id guards for details", async () => {
    const { client, calls } = clientWith([
      { data: [project], error: null, count: 1 },
      { data: project, error: null },
      { data: project, error: null },
    ]);
    const repository = new Repository(client as never);
    const tenantId = "33333333-3333-4333-8333-333333333333";

    await repository.listSites({ tenantId, page: 1, pageSize: 6 });
    await repository.findCase({ tenantId, id: project.id });
    await repository.findSite({ tenantId, id: project.id });

    expect(calls).toContainEqual({ method: "in", args: ["status", ["started", "constructing"]] });
    expect(calls).toContainEqual({ method: "range", args: [0, 5] });
    expect(calls.filter((call) => call.method === "eq" && call.args[0] === "tenant_id"))
      .toHaveLength(3);
    expect(calls.filter((call) => call.method === "eq" && call.args[0] === "id"))
      .toHaveLength(2);
  });

  test("lists only bounded, tenant-scoped public progress fields without raw content", async () => {
    const log = { id: "22222222-2222-4222-8222-222222222222",
      stage_code: "water-electric", node_name: "水电施工", images: [],
      created_at: "2026-07-20T00:00:00.000Z" };
    const { client, calls } = clientWith([{ data: [log], error: null, count: 1 }]);
    const repository = new Repository(client as never);

    await repository.listSiteLogs({ tenantId: "33333333-3333-4333-8333-333333333333",
      projectId: project.id, page: 1, pageSize: 20 });

    const select = String(calls.find((call) => call.method === "select")?.args[0]);
    expect(select).toBe("id,stage_code,node_name,images,created_at");
    expect(select).not.toMatch(/content|employee|customer|address/i);
    expect(calls).toContainEqual({ method: "eq", args: ["tenant_id",
      "33333333-3333-4333-8333-333333333333"] });
    expect(calls).toContainEqual({ method: "range", args: [0, 19] });
  });

  test("loads project image candidates in one bounded tenant-scoped query", async () => {
    const imageLog = {
      project_id: project.id,
      images: ["tenants/33333333-3333-4333-8333-333333333333/project_log/cover.jpg"],
      created_at: "2026-07-20T00:00:00.000Z",
    };
    const { client, calls } = clientWith([{ data: [imageLog], error: null }]);
    const repository = new Repository(client as never);
    const tenantId = "33333333-3333-4333-8333-333333333333";

    await repository.listProjectImageLogs({ tenantId, projectIds: [project.id] });

    expect(calls).toContainEqual({ method: "from", args: ["project_logs"] });
    expect(calls).toContainEqual({ method: "eq", args: ["tenant_id", tenantId] });
    expect(calls).toContainEqual({ method: "in", args: ["project_id", [project.id]] });
    expect(calls).toContainEqual({ method: "order", args: ["created_at", {
      ascending: false,
    }] });
    expect(calls).toContainEqual({ method: "limit", args: [20] });
  });
});
