import { beforeAll, describe, expect, mock, test } from "bun:test";
import { AppError } from "@/errors/app-error";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Repository: typeof import("./tenant-douyin-projects").TenantDouyinProjectsRepository;

beforeAll(async () => {
  ({ TenantDouyinProjectsRepository: Repository } = await import(
    "./tenant-douyin-projects"
  ));
});

type Call = { method: string; args: unknown[] };
type Result = { data: unknown; error: unknown; count?: number | null };

function clientWith(results: Result[]) {
  const calls: Call[] = [];
  let resultIndex = 0;
  class Query implements PromiseLike<Result> {
    constructor(private readonly result: Result) {}
    private chain(method: string, args: unknown[]) {
      calls.push({ method, args });
      return this;
    }
    select(...args: unknown[]) { return this.chain("select", args); }
    eq(...args: unknown[]) { return this.chain("eq", args); }
    in(...args: unknown[]) { return this.chain("in", args); }
    order(...args: unknown[]) { return this.chain("order", args); }
    range(...args: unknown[]) { return this.chain("range", args); }
    limit(...args: unknown[]) { return this.chain("limit", args); }
    upsert(...args: unknown[]) { return this.chain("upsert", args); }
    maybeSingle() {
      calls.push({ method: "maybeSingle", args: [] });
      return Promise.resolve(this.result);
    }
    single() {
      calls.push({ method: "single", args: [] });
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
      return new Query(results[resultIndex++] ?? { data: null, error: null });
    }),
    rpc: mock((functionName: string, args: unknown) => {
      calls.push({ method: "rpc", args: [functionName, args] });
      return Promise.resolve(
        results[resultIndex++] ?? { data: null, error: null },
      );
    }),
  };
  return { client, calls };
}

function rejectingQueryClient(failure: unknown) {
  class RejectingQuery implements PromiseLike<Result> {
    select() { return this; }
    eq() { return this; }
    order() { return this; }
    range() { return this; }
    limit() { return this; }
    maybeSingle() { return Promise.reject(failure); }
    then<TResult1 = Result, TResult2 = never>(
      onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.reject(failure).then(onfulfilled, onrejected);
    }
  }
  return {
    from: mock(() => new RejectingQuery()),
    rpc: mock(() => Promise.reject(failure)),
  };
}

async function expectSanitizedDbError(
  operation: () => Promise<unknown>,
  expectedMessage: string,
) {
  try {
    await operation();
    throw new TypeError("expected operation to reject");
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      message: expectedMessage,
      details: undefined,
    });
  }
}

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const profile = {
  public_title: "现代简约实景",
  public_description: "这是一段用于公开展示的项目说明，介绍空间规划和施工亮点。",
  public_image_urls: ["https://cdn.example.test/1.jpg"],
  style_tags: ["现代"],
  budget_band: "20-30 万",
  publication_status: "published" as const,
  updated_at: "2026-08-21T00:00:00.000Z",
};
const project = {
  id: PROJECT_ID,
  name: "示例花园装修项目",
  status: "constructing",
  updated_at: "2026-08-21T00:00:00.000Z",
  property: { community: "示例花园", layout: "三室两厅", area: 120 },
  public_profile: profile,
};
const publicationInput = {
  tenantId: TENANT_ID,
  projectId: PROJECT_ID,
  profile: {
    public_title: profile.public_title,
    public_description: profile.public_description,
    public_image_urls: profile.public_image_urls,
    style_tags: profile.style_tags,
    budget_band: profile.budget_band,
    publication_status: "published" as const,
  },
};

describe("TenantDouyinProjectsRepository", () => {
  test("lists a tenant page with necessary fields and an inner publication filter", async () => {
    const { client, calls } = clientWith([{
      data: [project],
      error: null,
      count: 21,
    }]);
    const repository = new Repository(client as never);

    await expect(repository.listProjects({
      tenantId: TENANT_ID,
      page: 2,
      pageSize: 20,
      publicationStatus: "published",
    })).resolves.toEqual({ rows: [project], total: 21 });

    expect(calls).toContainEqual({ method: "from", args: ["projects"] });
    expect(calls).toContainEqual({ method: "eq", args: ["tenant_id", TENANT_ID] });
    expect(calls).toContainEqual({
      method: "eq",
      args: ["public_profile.publication_status", "published"],
    });
    expect(calls).toContainEqual({ method: "range", args: [20, 39] });
    expect(calls).toContainEqual({
      method: "order",
      args: ["updated_at", { ascending: false }],
    });
    const select = String(calls.find((call) => call.method === "select")?.args[0]);
    expect(select).toContain("douyin_project_public_profiles!inner");
    expect(select).not.toMatch(/customer|phone|address|signed_amount|content/);
  });

  test("keeps projects without a profile when publication status is omitted", async () => {
    const { client, calls } = clientWith([{
      data: [{ ...project, public_profile: null }],
      error: null,
      count: 1,
    }]);
    const repository = new Repository(client as never);

    await repository.listProjects({ tenantId: TENANT_ID, page: 1, pageSize: 20 });

    const select = String(calls.find((call) => call.method === "select")?.args[0]);
    expect(select).not.toContain("douyin_project_public_profiles!inner");
    expect(calls).not.toContainEqual({
      method: "eq",
      args: ["public_profile.publication_status", "published"],
    });
  });

  test("looks up ownership and reads only the latest 100 tenant project image rows", async () => {
    const imageKey = `tenants/${TENANT_ID}/project-log/projects/${PROJECT_ID}/2026/08/21/33333333-3333-4333-8333-333333333333.jpg`;
    const { client, calls } = clientWith([
      { data: { id: PROJECT_ID, tenant_id: TENANT_ID }, error: null },
      { data: [{ images: [imageKey] }], error: null },
    ]);
    const repository = new Repository(client as never);

    await repository.findProject({ tenantId: TENANT_ID, projectId: PROJECT_ID });
    await repository.listAttachedImageRows({
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      limit: 999,
    });

    expect(calls.filter((call) => call.method === "eq"
      && call.args[0] === "tenant_id" && call.args[1] === TENANT_ID)).toHaveLength(2);
    expect(calls.filter((call) => call.method === "eq"
      && call.args[0] === "project_id" && call.args[1] === PROJECT_ID)).toHaveLength(1);
    expect(calls).toContainEqual({ method: "limit", args: [100] });
    expect(calls).toContainEqual({
      method: "order",
      args: ["created_at", { ascending: false }],
    });
    expect(calls.filter((call) => call.method === "select").map((call) => call.args[0]))
      .toEqual(["id,tenant_id", "images"]);
  });

  test("publishes through one atomic RPC with exact server-scoped arguments", async () => {
    const input = {
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      profile: {
        public_title: profile.public_title,
        public_description: profile.public_description,
        public_image_urls: profile.public_image_urls,
        style_tags: profile.style_tags,
        budget_band: profile.budget_band,
        publication_status: "published" as const,
      },
    };
    const savedProfile = {
      id: "44444444-4444-4444-8444-444444444444",
      tenant_id: TENANT_ID,
      project_id: PROJECT_ID,
      ...profile,
      created_at: "2026-08-21T00:30:00.000Z",
    };
    const { client, calls } = clientWith([{
      data: { data: savedProfile },
      error: null,
    }]);
    const repository = new Repository(client as never);
    await expect(repository.publishProfileAtomic(input)).resolves.toEqual({
      ok: true,
      data: savedProfile,
    });
    expect(calls).toEqual([{ method: "rpc", args: [
      "upsert_douyin_project_public_profile",
      {
        p_tenant_id: TENANT_ID,
        p_project_id: PROJECT_ID,
        p_public_title: profile.public_title,
        p_public_description: profile.public_description,
        p_public_image_urls: profile.public_image_urls,
        p_style_tags: profile.style_tags,
        p_budget_band: profile.budget_band,
        p_publication_status: profile.publication_status,
      },
    ] }]);

    const nullableBudget = clientWith([{
      data: { data: { ...savedProfile, budget_band: null } },
      error: null,
    }]);
    await new Repository(nullableBudget.client as never).publishProfileAtomic({
      ...input,
      profile: { ...input.profile, budget_band: null },
    });
    expect(nullableBudget.calls[0]).toMatchObject({
      method: "rpc",
      args: [expect.any(String), expect.objectContaining({ p_budget_band: null })],
    });
  });

  test("returns only strict known RPC business envelopes", async () => {
    const input = {
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      profile: {
        public_title: profile.public_title,
        public_description: profile.public_description,
        public_image_urls: profile.public_image_urls,
        style_tags: profile.style_tags,
        budget_band: null,
        publication_status: "draft" as const,
      },
    };
    const rpcError = {
      status_code: 404 as const,
      code: "DOUYIN_PROJECT_NOT_FOUND" as const,
      message: "项目不存在",
    };
    const repository = new Repository(clientWith([{
      data: { error: rpcError },
      error: null,
    }]).client as never);

    await expect(repository.publishProfileAtomic(input)).resolves.toEqual({
      ok: false,
      error: rpcError,
    });
  });

  test("wraps RPC transport failures and rejects unknown envelopes", async () => {
    const transportFailure = new Repository(clientWith([{
      data: null,
      error: { message: "database unavailable" },
    }]).client as never);
    await expectSanitizedDbError(
      () => transportFailure.publishProfileAtomic(publicationInput),
      "原子保存抖音项目公开资料失败",
    );

    for (const data of [
      null,
      { data: { tenant_id: TENANT_ID } },
      { error: { status_code: 418, code: "UNKNOWN", message: "bad" } },
      {
        error: {
          status_code: 404,
          code: "DOUYIN_PROJECT_NOT_FOUND",
          message: "项目不存在",
          extra: true,
        },
      },
      { data: {}, error: {} },
    ]) {
      const invalid = new Repository(clientWith([{ data, error: null }]).client as never);
      await expectSanitizedDbError(
        () => invalid.publishProfileAtomic(publicationInput),
        "解析抖音项目公开资料命令结果失败",
      );
    }
  });

  test("sanitizes resolved database errors and invalid result shapes", async () => {
    const rawError = { message: "database unavailable", hint: "private schema" };
    const operations = [
      {
        message: "查询租户抖音项目失败",
        invoke: (repository: InstanceType<typeof Repository>) =>
          repository.listProjects({ tenantId: TENANT_ID, page: 1, pageSize: 20 }),
      },
      {
        message: "查询租户项目失败",
        invoke: (repository: InstanceType<typeof Repository>) =>
          repository.findProject({ tenantId: TENANT_ID, projectId: PROJECT_ID }),
      },
      {
        message: "查询项目图片失败",
        invoke: (repository: InstanceType<typeof Repository>) =>
          repository.listAttachedImageRows({
            tenantId: TENANT_ID,
            projectId: PROJECT_ID,
            limit: 100,
          }),
      },
      {
        message: "原子保存抖音项目公开资料失败",
        invoke: (repository: InstanceType<typeof Repository>) =>
          repository.publishProfileAtomic(publicationInput),
      },
    ];
    for (const operation of operations) {
      const repository = new Repository(clientWith([{
        data: null,
        error: rawError,
      }]).client as never);
      await expectSanitizedDbError(
        () => operation.invoke(repository),
        operation.message,
      );
    }

    const invalidShapes = [
      {
        message: "查询租户抖音项目总数失败",
        invoke: (repository: InstanceType<typeof Repository>) =>
          repository.listProjects({ tenantId: TENANT_ID, page: 1, pageSize: 20 }),
        result: { data: [], error: null, count: null },
      },
      {
        message: "解析租户抖音项目失败",
        invoke: (repository: InstanceType<typeof Repository>) =>
          repository.listProjects({ tenantId: TENANT_ID, page: 1, pageSize: 20 }),
        result: { data: {}, error: null, count: 1 },
      },
      {
        message: "解析租户项目失败",
        invoke: (repository: InstanceType<typeof Repository>) =>
          repository.findProject({ tenantId: TENANT_ID, projectId: PROJECT_ID }),
        result: { data: { id: "bad", tenant_id: TENANT_ID }, error: null },
      },
      {
        message: "解析项目图片失败",
        invoke: (repository: InstanceType<typeof Repository>) =>
          repository.listAttachedImageRows({
            tenantId: TENANT_ID,
            projectId: PROJECT_ID,
            limit: 100,
          }),
        result: { data: {}, error: null },
      },
    ];
    for (const invalid of invalidShapes) {
      const repository = new Repository(clientWith([invalid.result]).client as never);
      await expectSanitizedDbError(
        () => invalid.invoke(repository),
        invalid.message,
      );
    }
  });

  test("sanitizes query and RPC rejections across every repository operation", async () => {
    const rawFailure = { message: "connection refused", cause: "secret" };
    const rejectedClient = rejectingQueryClient(rawFailure);
    const repository = new Repository(rejectedClient as never);

    await expectSanitizedDbError(
      () => repository.listProjects({ tenantId: TENANT_ID, page: 1, pageSize: 20 }),
      "查询租户抖音项目失败",
    );
    await expectSanitizedDbError(
      () => repository.findProject({ tenantId: TENANT_ID, projectId: PROJECT_ID }),
      "查询租户项目失败",
    );
    await expectSanitizedDbError(
      () => repository.listAttachedImageRows({
        tenantId: TENANT_ID,
        projectId: PROJECT_ID,
        limit: 100,
      }),
      "查询项目图片失败",
    );
    await expectSanitizedDbError(
      () => repository.publishProfileAtomic(publicationInput),
      "原子保存抖音项目公开资料失败",
    );
  });

  test("sanitizes synchronous database throws but preserves AppError", async () => {
    const rawFailure = { message: "sync client failure", cause: "secret" };
    const operations = [
      {
        message: "查询租户抖音项目失败",
        invoke: (repository: InstanceType<typeof Repository>) =>
          repository.listProjects({ tenantId: TENANT_ID, page: 1, pageSize: 20 }),
      },
      {
        message: "查询租户项目失败",
        invoke: (repository: InstanceType<typeof Repository>) =>
          repository.findProject({ tenantId: TENANT_ID, projectId: PROJECT_ID }),
      },
      {
        message: "查询项目图片失败",
        invoke: (repository: InstanceType<typeof Repository>) =>
          repository.listAttachedImageRows({
            tenantId: TENANT_ID,
            projectId: PROJECT_ID,
            limit: 100,
          }),
      },
    ];
    for (const operation of operations) {
      const repository = new Repository({
        from: mock(() => { throw rawFailure; }),
        rpc: mock(() => Promise.resolve({ data: null, error: null })),
      } as never);
      await expectSanitizedDbError(
        () => operation.invoke(repository),
        operation.message,
      );
    }

    const rpcRepository = new Repository({
      from: mock(() => { throw new TypeError("unexpected query"); }),
      rpc: mock(() => { throw rawFailure; }),
    } as never);
    await expectSanitizedDbError(
      () => rpcRepository.publishProfileAtomic(publicationInput),
      "原子保存抖音项目公开资料失败",
    );

    const businessError = new AppError(409, "业务冲突", "BUSINESS_CONFLICT");
    const appErrorClient = new Repository({
      from: mock(() => { throw businessError; }),
      rpc: mock(() => Promise.resolve({ data: null, error: null })),
    } as never);
    await expect(appErrorClient.listProjects({
      tenantId: TENANT_ID,
      page: 1,
      pageSize: 20,
    })).rejects.toBe(businessError);

    const rejectedAppErrorClient = new Repository(
      rejectingQueryClient(businessError) as never,
    );
    await expect(rejectedAppErrorClient.findProject({
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
    })).rejects.toBe(businessError);
  });
});
