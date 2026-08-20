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
const EXPECTED_PROJECT_SELECT = "id,status,start_date,updated_at,"
  + "property:properties!inner(community,layout,area,city,district),"
  + "public_profile:douyin_project_public_profiles!inner(public_title,"
  + "public_description,public_image_urls,style_tags,budget_band,"
  + "publication_status,updated_at)";

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
  status: "constructing",
  start_date: "2026-07-01",
  updated_at: "2026-07-20T00:00:00.000Z",
  property: { community: "示例花园", layout: "三室两厅", area: 120,
    city: "郑州市", district: "金水区" },
  public_profile: {
    public_title: "现代简约案例",
    public_description: "公开项目介绍",
    public_image_urls: ["https://assets.example.com/selected-cover.jpg"],
    style_tags: ["现代"],
    budget_band: "20-30万",
    publication_status: "published" as const,
    updated_at: "2026-07-21T00:00:00.000Z",
  },
};
const contentProject = {
  ...project,
  name: project.public_profile.public_title,
  budget: null,
  style_tags: project.public_profile.style_tags,
};

describe("DouyinMiniappContentRepository privacy and pagination", () => {
  test("reads installation tenant status without turning suspension into a repository error", async () => {
    const suspendedInstallation = {
      id: "22222222-2222-4222-8222-222222222222",
      tenant_id: "33333333-3333-4333-8333-333333333333",
      authorizer_appid: "tt-authorizer-1",
      authorization_status: "active",
      installation_kind: "merchant",
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
    expect(select).toBe("id,tenant_id,authorizer_appid,authorization_status,installation_kind,template_version,"
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

  test("lists the published project feed with an exact count and bounded range", async () => {
    const { client, calls } = clientWith([{ data: [project], error: null, count: 21 }]);
    const repository = new Repository(client as never);
    const tenantId = "33333333-3333-4333-8333-333333333333";

    const result = await repository.listProjects({
      tenantId, phase: "in_progress", page: 2, pageSize: 20,
    });

    expect(result).toMatchObject({ count: 21, rows: [{
      public_profile: {
        public_image_urls: ["https://assets.example.com/selected-cover.jpg"],
      },
    }] });
    const selectCall = calls.find((call) => call.method === "select");
    expect(selectCall?.args[1]).toEqual({ count: "exact" });
    const select = String(selectCall?.args[0]);
    expect(select).toBe(EXPECTED_PROJECT_SELECT);
    expect(select).not.toMatch(/customer|customer_id|phone|wx_openid|signed_amount|\baddress\b|building_info|latitude|longitude|content/i);
    expect(calls).toContainEqual({ method: "eq", args: ["tenant_id", tenantId] });
    expect(calls).toContainEqual({ method: "eq",
      args: ["public_profile.publication_status", "published"] });
    expect(calls).toContainEqual({ method: "in",
      args: ["status", ["started", "constructing"]] });
    expect(calls).toContainEqual({ method: "order",
      args: ["updated_at", { ascending: false }] });
    expect(calls).toContainEqual({ method: "order",
      args: ["id", { ascending: false }] });
    expect(calls).toContainEqual({ method: "range", args: [20, 39] });
    expect(calls.filter((call) => call.method === "from"))
      .toEqual([{ method: "from", args: ["projects"] }]);
  });

  test("limits the unfiltered feed to statuses with a public phase", async () => {
    const { client, calls } = clientWith([{ data: [project], error: null, count: 1 }]);
    const repository = new Repository(client as never);

    await repository.listProjects({
      tenantId: "33333333-3333-4333-8333-333333333333",
      page: 1, pageSize: 20,
    });

    expect(calls).toContainEqual({ method: "in",
      args: ["status", ["started", "constructing", "acceptance"]] });
  });

  test("uses the acceptance status for completed projects", async () => {
    const completed = { ...project, status: "acceptance" };
    const { client, calls } = clientWith([{ data: [completed], error: null, count: 1 }]);
    const repository = new Repository(client as never);

    await repository.listProjects({
      tenantId: "33333333-3333-4333-8333-333333333333",
      phase: "completed", page: 1, pageSize: 20,
    });

    expect(calls).toContainEqual({ method: "eq", args: ["status", "acceptance"] });
    expect(calls).not.toContainEqual({ method: "in",
      args: ["status", ["started", "constructing"]] });
  });

  test.each([
    ["null", null],
    ["undefined", undefined],
    ["negative", -1],
    ["fractional", 1.5],
  ] as const)("rejects an exact project count when it is %s", async (_label, count) => {
    const { client } = clientWith([{ data: [project], error: null, count }]);
    const repository = new Repository(client as never);

    await expect(repository.listProjects({
      tenantId: "33333333-3333-4333-8333-333333333333",
      page: 1, pageSize: 20,
    })).rejects.toMatchObject({ code: "DOUYIN_CONTENT_RESPONSE_INVALID" });
  });

  test("rejects array profiles, non-string image urls and extra profile fields", async () => {
    const { client } = clientWith([
      { data: [{ ...project, public_profile: [project.public_profile] }],
        error: null, count: 1 },
      { data: [{ ...project, public_profile: {
        ...project.public_profile, public_image_urls: [123],
      } }], error: null, count: 1 },
      { data: [{ ...project, public_profile: {
        ...project.public_profile, raw_content: "internal project log",
      } }], error: null, count: 1 },
    ]);
    const repository = new Repository(client as never);
    const input = { tenantId: "33333333-3333-4333-8333-333333333333",
      page: 1, pageSize: 20 };

    await expect(repository.listProjects(input))
      .rejects.toMatchObject({ code: "DOUYIN_CONTENT_RESPONSE_INVALID" });
    await expect(repository.listProjects(input))
      .rejects.toMatchObject({ code: "DOUYIN_CONTENT_RESPONSE_INVALID" });
    await expect(repository.listProjects(input))
      .rejects.toMatchObject({ code: "DOUYIN_CONTENT_RESPONSE_INVALID" });
  });

  test("finds only a tenant-scoped published project by id", async () => {
    const tenantId = "33333333-3333-4333-8333-333333333333";
    const { client, calls } = clientWith([{ data: project, error: null }]);
    const repository = new Repository(client as never);

    await expect(repository.findProject({ tenantId, id: project.id }))
      .resolves.toMatchObject({ id: project.id });

    expect(calls).toContainEqual({ method: "from", args: ["projects"] });
    expect(calls).toContainEqual({ method: "eq", args: ["tenant_id", tenantId] });
    expect(calls).toContainEqual({ method: "eq", args: ["id", project.id] });
    expect(calls).toContainEqual({ method: "eq",
      args: ["public_profile.publication_status", "published"] });
    expect(calls).toContainEqual({ method: "maybeSingle", args: [] });
  });

  test("applies legacy-compatible filters in the canonical server-side query", async () => {
    const { client, calls } = clientWith([{ data: [project], error: null, count: 1 }]);
    const repository = new Repository(client as never);
    const tenantId = "33333333-3333-4333-8333-333333333333";

    await repository.listProjects({ tenantId, page: 1, pageSize: 6,
      style: "现代", layout: "三室两厅" });

    expect(calls).toContainEqual({ method: "contains",
      args: ["public_profile.style_tags", ["现代"]] });
    expect(calls).toContainEqual({ method: "eq", args: ["property.layout", "三室两厅"] });
    expect(calls).toContainEqual({ method: "in",
      args: ["status", ["started", "constructing", "acceptance"]] });
    expect(calls).toContainEqual({ method: "range", args: [0, 5] });
    expect(calls.filter((call) => call.method === "from" && call.args[0] === "projects"))
      .toHaveLength(1);
  });

  test("delegates legacy lists to canonical listProjects with exact contracts", async () => {
    const { client } = clientWith([]);
    const repository = new Repository(client as never);
    const tenantId = "33333333-3333-4333-8333-333333333333";
    const listProjects = mock(async (_input: {
      tenantId: string;
      phase?: "in_progress" | "completed";
      page: number;
      pageSize: number;
      style?: string;
      layout?: string;
    }) => ({ rows: [contentProject], count: 7 }));
    repository.listProjects = listProjects as never;

    const cases = await repository.listCases({ tenantId, page: 2, pageSize: 20,
      style: "现代", layout: "三室两厅" });
    const sites = await repository.listSites({ tenantId, page: 3, pageSize: 6 });

    expect(listProjects.mock.calls).toEqual([
      [{ tenantId, page: 2, pageSize: 20, style: "现代", layout: "三室两厅" }],
      [{ tenantId, page: 3, pageSize: 6, phase: "in_progress" }],
    ]);
    expect(cases).toEqual({ rows: [contentProject], total: 7 });
    expect(sites).toEqual({ rows: [contentProject], total: 7 });
    expect(client.from).not.toHaveBeenCalled();
  });

  test("delegates legacy details to canonical findProject with exact contracts", async () => {
    const { client } = clientWith([]);
    const repository = new Repository(client as never);
    const tenantId = "33333333-3333-4333-8333-333333333333";
    const findProject = mock(async (_input: { tenantId: string; id: string }) => contentProject);
    repository.findProject = findProject as never;

    const foundCase = await repository.findCase({ tenantId, id: project.id });
    const foundSite = await repository.findSite({ tenantId, id: project.id });

    expect(findProject.mock.calls).toEqual([
      [{ tenantId, id: project.id }],
      [{ tenantId, id: project.id }],
    ]);
    expect(foundCase).toBe(contentProject);
    expect(foundSite).toBe(contentProject);
    expect(client.from).not.toHaveBeenCalled();
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
