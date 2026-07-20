import { beforeAll, describe, expect, mock, test } from "bun:test";
import type {
  DouyinMiniappReleaseDatabaseClient,
  DouyinMiniappReleaseDatabaseResult,
  DouyinMiniappReleaseQuery,
} from "./douyin-miniapp-releases";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Repository: typeof import("./douyin-miniapp-releases").DouyinMiniappReleasesRepository;
beforeAll(async () => {
  ({ DouyinMiniappReleasesRepository: Repository } = await import(
    "./douyin-miniapp-releases"
  ));
});

type Call = { readonly method: string; readonly args: readonly unknown[] };

function createClient(results: DouyinMiniappReleaseDatabaseResult[]) {
  const calls: Call[] = [];
  let resultIndex = 0;
  class Query implements DouyinMiniappReleaseQuery {
    private chain(method: string, args: readonly unknown[]) {
      calls.push({ method, args });
      return this;
    }
    select(columns: string, options?: unknown) { return this.chain("select", [columns, options]); }
    update(value: unknown) { return this.chain("update", [value]); }
    eq(column: string, value: unknown) { return this.chain("eq", [column, value]); }
    order(column: string, options: unknown) { return this.chain("order", [column, options]); }
    range(from: number, to: number) { return this.chain("range", [from, to]); }
    maybeSingle() {
      calls.push({ method: "maybeSingle", args: [] });
      return Promise.resolve(results[resultIndex++] ?? { data: null, error: null });
    }
    then<TResult1 = DouyinMiniappReleaseDatabaseResult, TResult2 = never>(
      onfulfilled?: (
        (value: DouyinMiniappReleaseDatabaseResult) => TResult1 | PromiseLike<TResult1>
      ) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      calls.push({ method: "then", args: [] });
      return Promise.resolve(results[resultIndex++] ?? { data: null, error: null })
        .then(onfulfilled, onrejected);
    }
  }
  const client: DouyinMiniappReleaseDatabaseClient = {
    from: mock((table: string) => {
      calls.push({ method: "from", args: [table] });
      return new Query();
    }),
    rpc: mock(() => Promise.resolve(results[resultIndex++] ?? { data: null, error: null })),
  };
  return { client, calls };
}

const releaseRow = {
  id: "11111111-1111-4111-8111-111111111111",
  installation_id: "22222222-2222-4222-8222-222222222222",
  template_id: "9133504853504535288",
  template_version: "1.2.3-beta.1",
  description: "装修行业模板首发",
  channel: "default" as const,
  ext_json: {
    extEnable: true as const,
    extAppid: "tt-authorizer-1",
    ext: { deployment_key: "merchant-demo" },
  },
  status: "created" as const,
  douyin_log_id: null,
  test_qr_url: null,
  audit_host_names: [],
  audit_note: null,
  audit_result: null,
  submitted_at: null,
  audited_at: null,
  released_at: null,
  platform_operator_id: "33333333-3333-4333-8333-333333333333",
  created_at: "2026-07-20T01:00:00.000Z",
  updated_at: "2026-07-20T01:00:00.000Z",
};

describe("DouyinMiniappReleasesRepository reads", () => {
  test("lists one installation with exact projection, count, and bounded range", async () => {
    const { client, calls } = createClient([{ data: [releaseRow], error: null, count: 121 }]);
    await expect(new Repository(client).listByInstallation({
      installationId: releaseRow.installation_id,
      page: 2,
      pageSize: 100,
    })).resolves.toEqual({ list: [releaseRow], total: 121 });
    expect(calls).toContainEqual({ method: "eq", args: [
      "installation_id", releaseRow.installation_id,
    ] });
    expect(calls.filter((call) => call.method === "order")).toEqual([
      { method: "order", args: ["created_at", { ascending: false }] },
      { method: "order", args: ["id", { ascending: false }] },
    ]);
    expect(calls).toContainEqual({ method: "range", args: [100, 199] });
    const select = calls.find((call) => call.method === "select")!;
    expect(select.args[1]).toEqual({ count: "exact" });
    expect(String(select.args[0])).not.toMatch(/\*|token|secret|phone|openid/i);
  });

  test("finds one release by id with the same strict safe projection", async () => {
    const { client, calls } = createClient([{ data: releaseRow, error: null }]);
    await expect(new Repository(client).findById(releaseRow.id)).resolves.toEqual(releaseRow);
    expect(calls).toContainEqual({ method: "eq", args: ["id", releaseRow.id] });
    expect(calls).toContainEqual({ method: "maybeSingle", args: [] });
  });

  test("rejects invalid pagination before it can create an unbounded range", async () => {
    for (const pagination of [{ page: 0, pageSize: 20 }, { page: 1, pageSize: 101 }]) {
      const { client, calls } = createClient([]);
      await expect(new Repository(client).listByInstallation({
        installationId: releaseRow.installation_id,
        ...pagination,
      })).rejects.toMatchObject({ code: "DOUYIN_MINIAPP_RELEASE_REPOSITORY_INPUT_INVALID" });
      expect(calls).toHaveLength(0);
    }
  });

  test("fails closed on malformed rows and database details", async () => {
    const malformed = createClient([{ data: { ...releaseRow, extra: "unsafe" }, error: null }]);
    await expect(new Repository(malformed.client).findById(releaseRow.id)).rejects.toMatchObject({
      code: "DOUYIN_MINIAPP_RELEASE_REPOSITORY_RESPONSE_INVALID",
    });
    const sensitive = "postgres detail access_token=secret";
    const failed = createClient([{ data: null, error: { message: sensitive, details: sensitive } }]);
    let caught: unknown;
    try {
      await new Repository(failed.client).findById(releaseRow.id);
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "DOUYIN_MINIAPP_RELEASE_REPOSITORY_ERROR" });
    expect(JSON.stringify(caught)).not.toContain(sensitive);
  });
});
