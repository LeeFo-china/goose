import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { DatabaseResult, SiteContentDatabaseClient, SiteContentQuery } from "./site-content";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let SiteContentRepository: typeof import("./site-content").SiteContentRepository;

beforeAll(async () => {
  ({ SiteContentRepository } = await import("./site-content"));
});

type Call = { method: string; args: unknown[] };

function createClient(results: DatabaseResult[]) {
  const calls: Call[] = [];
  let resultIndex = 0;
  class TestQuery implements SiteContentQuery {
    private chain(method: string, args: unknown[]) { calls.push({ method, args }); return this; }
    select(...args: [string, { count?: "exact" }?]) { return this.chain("select", args); }
    insert(...args: [unknown]) { return this.chain("insert", args); }
    update(...args: [unknown]) { return this.chain("update", args); }
    delete() { return this.chain("delete", []); }
    eq(...args: [string, unknown]) { return this.chain("eq", args); }
    neq(...args: [string, unknown]) { return this.chain("neq", args); }
    is(...args: [string, null]) { return this.chain("is", args); }
    gt(...args: [string, string]) { return this.chain("gt", args); }
    in(...args: [string, readonly string[]]) { return this.chain("in", args); }
    or(...args: [string]) { return this.chain("or", args); }
    order(...args: [string, { ascending: boolean }]) { return this.chain("order", args); }
    range(...args: [number, number]) { return this.chain("range", args); }
    limit(...args: [number]) { return this.chain("limit", args); }
    single() { calls.push({ method: "single", args: [] }); return Promise.resolve(results[resultIndex++] ?? { data: null, error: null }); }
    maybeSingle() { calls.push({ method: "maybeSingle", args: [] }); return Promise.resolve(results[resultIndex++] ?? { data: null, error: null }); }
    then<TResult1 = DatabaseResult, TResult2 = never>(
      onfulfilled?: ((value: DatabaseResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve(results[resultIndex++] ?? { data: null, error: null }).then(onfulfilled, onrejected);
    }
  }
  const client: SiteContentDatabaseClient = {
    from: mock((table: string) => {
      calls.push({ method: "from", args: [table] });
      return new TestQuery();
    }),
    rpc: mock((name: string, args: unknown) => {
      calls.push({ method: "rpc", args: [name, args] });
      return Promise.resolve(results[resultIndex++] ?? { data: null, error: null });
    }),
  };
  return { client, calls };
}

describe("SiteContentRepository query boundaries", () => {
  test("public article list selects published rows, orders and ranges", async () => {
    const { client, calls } = createClient([{ data: [], error: null, count: 0 }]);
    const repository = new SiteContentRepository(client);

    await repository.listPublic("article", { page: 2, pageSize: 20 });

    expect(calls).toContainEqual({ method: "eq", args: ["content_type", "article"] });
    expect(calls).toContainEqual({ method: "eq", args: ["status", "published"] });
    expect(calls).toContainEqual({ method: "order", args: ["published_at", { ascending: false }] });
    expect(calls).toContainEqual({ method: "range", args: [20, 39] });
    const select = calls.find((call) => call.method === "select");
    expect(String(select?.args[0])).not.toContain("created_by");
    expect(String(select?.args[0])).not.toContain("content_blocks");
    expect(String(select?.args[0])).not.toContain("seo_title");
    expect(String(select?.args[0])).not.toContain("canonical_url");
    expect(String(select?.args[0])).not.toContain("published_version_id");
    expect(String(select?.args[0])).not.toContain("created_at");
    expect(String(select?.args[0])).not.toContain("updated_at");
  });

  test("public detail filters type, slug and published status", async () => {
    const { client, calls } = createClient([{ data: null, error: null }]);
    const repository = new SiteContentRepository(client);

    await repository.findPublic("case", "hangzhou-home");

    expect(calls).toContainEqual({ method: "eq", args: ["content_type", "case"] });
    expect(calls).toContainEqual({ method: "eq", args: ["slug", "hangzhou-home"] });
    expect(calls).toContainEqual({ method: "eq", args: ["status", "published"] });
  });

  test("admin and version histories are always paginated", async () => {
    const { client, calls } = createClient([
      { data: [], error: null, count: 0 },
      { data: [], error: null, count: 0 },
    ]);
    const repository = new SiteContentRepository(client);

    await repository.listAdmin({ page: 1, pageSize: 20 });
    await repository.listVersions("11111111-1111-4111-8111-111111111111", { page: 3, pageSize: 10 });

    expect(calls.filter((call) => call.method === "range").map((call) => call.args)).toEqual([
      [0, 19],
      [20, 29],
    ]);
  });

  test("guards slug updates atomically against concurrently published rows", async () => {
    const { client, calls } = createClient([{ data: null, error: null }]);
    const repository = new SiteContentRepository(client);

    await expect(repository.updateEntry(
      "11111111-1111-4111-8111-111111111111",
      { slug: "renamed-article" },
    )).rejects.toMatchObject({ code: "SITE_CONTENT_PUBLISHED_SLUG_IMMUTABLE" });
    expect(calls).toContainEqual({ method: "neq", args: ["status", "published"] });
  });

  test("loads trusted active public assets in one batch", async () => {
    const { client, calls } = createClient([{ data: [], error: null }]);
    const repository = new SiteContentRepository(client);
    const ids = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ];

    await repository.findPublicAssets(ids);

    expect(calls.filter((call) => call.method === "from")).toEqual([
      { method: "from", args: ["platform_file_objects"] },
    ]);
    expect(calls).toContainEqual({ method: "in", args: ["id", ids] });
    expect(calls).toContainEqual({ method: "eq", args: ["status", "active"] });
    expect(calls).toContainEqual({ method: "eq", args: ["visibility", "public"] });
  });

  test("stores only SHA256 preview token hashes and consumes once before expiry", async () => {
    const token = "plain-token-that-must-never-be-stored";
    const { client, calls } = createClient([
      { data: { id: "token-id" }, error: null },
      { data: { entry_id: "entry-id", version_id: "version-id" }, error: null },
    ]);
    const repository = new SiteContentRepository(client);

    await repository.createPreviewToken({
      token,
      entryId: "entry-id",
      versionId: "version-id",
      createdBy: "actor-id",
      expiresAt: "2026-07-12T10:10:00.000Z",
    });
    await repository.consumePreviewToken(token, "2026-07-12T10:00:00.000Z");

    const insert = calls.find((call) => call.method === "insert");
    expect(JSON.stringify(insert?.args)).not.toContain(token);
    expect(JSON.stringify(insert?.args)).toMatch(/[0-9a-f]{64}/);
    expect(calls).toContainEqual({ method: "is", args: ["consumed_at", null] });
    expect(calls).toContainEqual({ method: "gt", args: ["expires_at", "2026-07-12T10:00:00.000Z"] });
    expect(calls).toContainEqual({ method: "update", args: [{ consumed_at: "2026-07-12T10:00:00.000Z" }] });
  });

  test("retries a unique version collision from the latest database version", async () => {
    const { client, calls } = createClient([
      { data: { version_no: 1 }, error: null },
      { data: null, error: { code: "23505" } },
      { data: { version_no: 2 }, error: null },
      { data: { id: "version-3", version_no: 3 }, error: null },
    ]);
    const repository = new SiteContentRepository(client);

    const created = await repository.createVersion("entry-id", {
      title: "并发版本",
      blocks: [],
      metadata: { category: "行业", author: "运营", displayPublishedAt: "2026-07-12T08:00:00+08:00" },
    }, "actor-id");

    expect(created).toMatchObject({ version_no: 3 });
    expect(calls.filter((call) => call.method === "insert").map((call) =>
      (call.args[0] as { version_no: number }).version_no)).toEqual([2, 3]);
  });

  test("wraps representative read, RPC and token database failures", async () => {
    const { client } = createClient([
      { data: null, error: { message: "read failed" } },
      { data: null, error: { message: "rpc failed" } },
      { data: null, error: { message: "consume failed" } },
    ]);
    const repository = new SiteContentRepository(client);

    await expect(repository.findPublic("article", "first-article")).rejects.toMatchObject({ code: "DB_ERROR" });
    await expect(repository.publish("entry", "version", "actor")).rejects.toMatchObject({ code: "DB_ERROR" });
    await expect(repository.consumePreviewToken("token", "2026-07-12T10:00:00.000Z")).rejects.toMatchObject({ code: "DB_ERROR" });
  });

  test("publishes and rolls back only through database RPC", async () => {
    const { client, calls } = createClient([
      { data: { id: "entry-id" }, error: null },
      { data: { id: "entry-id" }, error: null },
    ]);
    const repository = new SiteContentRepository(client);

    await repository.publish("entry-id", "version-id", "actor-id");
    await repository.rollback("entry-id", "version-id", "actor-id");

    expect(calls.filter((call) => call.method === "rpc").map((call) => call.args[0])).toEqual([
      "publish_site_content",
      "rollback_site_content",
    ]);
  });
});
