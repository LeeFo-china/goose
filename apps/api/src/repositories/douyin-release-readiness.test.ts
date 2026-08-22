import { beforeAll, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Repository:
  typeof import("./douyin-release-readiness").DouyinReleaseReadinessRepository;

beforeAll(async () => {
  ({ DouyinReleaseReadinessRepository: Repository } = await import(
    "./douyin-release-readiness"
  ));
});

type Call = { readonly method: string; readonly args: readonly unknown[] };
type Result = {
  readonly data: unknown;
  readonly error: unknown;
  readonly count?: number | null;
};

const tenantId = "11111111-1111-4111-8111-111111111111";
const installationId = "22222222-2222-4222-8222-222222222222";
const pricingVersionId = "33333333-3333-4333-8333-333333333333";
const projectId = "44444444-4444-4444-8444-444444444444";

function clientWith(results: readonly Result[]) {
  const calls: Call[] = [];
  let resultIndex = 0;
  class Query implements PromiseLike<Result> {
    private readonly result = results[resultIndex++] ?? {
      data: null,
      error: null,
    };
    private chain(method: string, args: readonly unknown[]) {
      calls.push({ method, args });
      return this;
    }
    select(...args: unknown[]) { return this.chain("select", args); }
    eq(...args: unknown[]) { return this.chain("eq", args); }
    in(...args: unknown[]) { return this.chain("in", args); }
    lte(...args: unknown[]) { return this.chain("lte", args); }
    or(...args: unknown[]) { return this.chain("or", args); }
    order(...args: unknown[]) { return this.chain("order", args); }
    limit(...args: unknown[]) { return this.chain("limit", args); }
    maybeSingle() {
      calls.push({ method: "maybeSingle", args: [] });
      return Promise.resolve(this.result);
    }
    then<TResult1 = Result, TResult2 = never>(
      onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(this.result).then(onfulfilled, onrejected);
    }
  }
  const client = {
    from: mock((table: string) => {
      calls.push({ method: "from", args: [table] });
      return new Query();
    }),
  };
  return { client, calls };
}

const tenant = {
  id: tenantId,
  name: "固始晴天装饰工程有限公司",
  status: "active",
};
const installation = {
  id: installationId,
  authorization_status: "active",
  installation_kind: "merchant",
  runtime_config: {
    brand: {
      logo_url: "https://assets.example.com/logo.png",
    },
    privacy_policy_version: "privacy-2026-08",
  },
};
const profile = {
  status: "published",
  public_name: "固始晴天装饰",
  introduction: "固始晴天装饰专注本地住宅装修服务，提供设计、施工、材料协调和工地过程管理。公开案例均来自真实项目，预算测算仅用于前期沟通，最终方案以现场量房和业主确认范围为准。",
  public_phone: "0376-1234567",
};
const project = {
  id: projectId,
  status: "constructing",
  property: {
    area: 118,
    layout: "三室两厅",
  },
  public_profile: {
    public_title: "真实施工案例",
    public_description: "公开展示施工阶段、户型和预算区间，不包含客户身份与门牌。",
    public_image_urls: [
      "https://assets.example.com/1.jpg",
      "https://assets.example.com/2.jpg",
      "https://assets.example.com/3.jpg",
    ],
    style_tags: ["现代简约"],
    budget_band: "20-30万",
    publication_status: "published",
  },
};
const pricing = {
  id: pricingVersionId,
  tenant_id: tenantId,
  version_no: 3,
  disclaimer: "预算为初步估算，最终报价以现场量房和施工范围为准。",
};

describe("DouyinReleaseReadinessRepository", () => {
  test("loads bounded release readiness facts with one project and one log batch", async () => {
    const { client, calls } = clientWith([
      { data: tenant, error: null },
      { data: installation, error: null },
      { data: profile, error: null },
      { data: null, error: null, count: 2 },
      { data: [project], error: null },
      { data: [{ project_id: projectId }], error: null },
      { data: [pricing], error: null },
    ]);
    const repository = new Repository(client as never, {
      resolveSmsReady: mock(async () => true),
    });

    await expect(repository.loadFacts({
      tenantId,
      now: "2026-08-20T10:00:00.000Z",
      requiredHosts: ["douyin"],
    })).resolves.toMatchObject({
      tenant,
      installation: {
        id: installationId,
        authorizationStatus: "active",
        installationKind: "merchant",
      },
      profile: {
        publicName: "固始晴天装饰",
        logoUrl: "https://assets.example.com/logo.png",
      },
      activeServiceAreaCount: 2,
      projects: [{
        id: projectId,
        phase: "in_progress",
        imageCount: 3,
        publicLogCount: 1,
      }],
      activePricingVersion: {
        id: pricingVersionId,
        versionNo: 3,
      },
      smsReady: true,
      privacyVersion: "privacy-2026-08",
      requiredHosts: ["douyin"],
    });

    expect(calls.filter((call) => call.method === "from")).toEqual([
      { method: "from", args: ["tenants"] },
      { method: "from", args: ["douyin_miniapp_installations"] },
      { method: "from", args: ["tenant_service_provider_profiles"] },
      { method: "from", args: ["tenant_service_areas"] },
      { method: "from", args: ["projects"] },
      { method: "from", args: ["project_logs"] },
      { method: "from", args: ["douyin_budget_pricing_versions"] },
    ]);
    expect(calls).toContainEqual({ method: "eq", args: ["tenant_id", tenantId] });
    expect(calls).toContainEqual({ method: "limit", args: [100] });
    expect(calls).toContainEqual({ method: "in", args: ["project_id", [projectId]] });
    expect(calls).toContainEqual({ method: "limit", args: [2000] });
    const selectColumns = calls
      .filter((call) => call.method === "select")
      .map((call) => String(call.args[0]));
    expect(selectColumns.join("\n")).not.toMatch(
      /customer|phone_number|source_snapshot|form_data|access_token|refresh_token/i,
    );
  });

  test("does not query logs when there are no projects and rejects ambiguous pricing", async () => {
    const { client, calls } = clientWith([
      { data: tenant, error: null },
      { data: installation, error: null },
      { data: profile, error: null },
      { data: null, error: null, count: 1 },
      { data: [], error: null },
      { data: [pricing, pricing], error: null },
    ]);
    const repository = new Repository(client as never, {
      resolveSmsReady: mock(async () => false),
    });

    await expect(repository.loadFacts({
      tenantId,
      now: "2026-08-20T10:00:00.000Z",
      requiredHosts: [],
    })).rejects.toMatchObject({
      statusCode: 500,
      code: "DOUYIN_RELEASE_READINESS_RESPONSE_INVALID",
    });
    expect(calls.filter((call) => call.method === "from").map((call) => call.args[0]))
      .not.toContain("project_logs");
  });

  test("maps database transport errors without leaking raw details", async () => {
    const raw = "postgres: secret phone 13800138000";
    const { client } = clientWith([
      { data: null, error: { message: raw, details: raw } },
    ]);
    let caught: unknown;
    try {
      await new Repository(client as never, {
        resolveSmsReady: mock(async () => true),
      }).loadFacts({
        tenantId,
        now: "2026-08-20T10:00:00.000Z",
        requiredHosts: ["douyin"],
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      statusCode: 500,
      code: "DOUYIN_RELEASE_READINESS_REPOSITORY_ERROR",
    });
    expect(JSON.stringify(caught)).not.toContain(raw);
  });
});
